from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import StaticPool

from src.api import app, database
from src.db_connector import metadata, raw_sales_data
from src.forecast_service import DatasetChangedError


@pytest.fixture
def client():
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    app.dependency_overrides[database] = lambda: engine
    with TestClient(app) as session:
        yield session, engine
    app.dependency_overrides.clear()
    engine.dispose()


def test_empty_database(client):
    session, _ = client
    response = session.get("/sales")
    assert response.status_code == 200
    assert response.json()["summary"]["row_count"] == 0
    assert response.json()["monthly"] == []


def test_summary_filter_and_transaction_shape(client):
    session, engine = client
    metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(raw_sales_data.insert(), [
              {"order_id": "001", "order_date": datetime(2025, 1, 1), "customer_id": "010",
               "product_category": "Technology", "sales": 100, "quantity": 1,
               "discount": 0, "profit": 20},
              {"order_id": "001", "order_date": datetime(2025, 1, 2), "customer_id": "010",
               "product_category": "Furniture", "sales": -10, "quantity": 1,
               "discount": 0, "profit": None},
              {"order_id": "002", "order_date": datetime(2025, 2, 1), "customer_id": "011",
               "product_category": "Technology", "sales": 200, "quantity": 2,
               "discount": 0, "profit": 40},
        ])
    payload = session.get("/sales").json()
    assert payload["summary"] == {
        "revenue": 290.0, "profit": 60.0, "orders": 2, "row_count": 3,
        "average_order_value": 145.0,
    }
    assert payload["monthly"] == [
        {"month": "2025-01", "revenue": 90.0}, {"month": "2025-02", "revenue": 200.0}
    ]
    assert payload["transactions"][0]["order_id"] == "002"
    assert payload["transactions"][0]["order_date"] == "2025-02-01"
    assert payload["categories"] == ["Furniture", "Technology"]
    filtered = session.get("/sales", params={"category": "Furniture"}).json()
    assert filtered["summary"]["revenue"] == -10
    assert filtered["summary"]["row_count"] == 1
    assert len(filtered["categories"]) == 2
    assert session.get("/sales", params={"category": "Unknown"}).json()["summary"]["orders"] == 0


def test_database_failure_does_not_expose_details(client):
    session, _ = client
    with patch("src.api.inspect", side_effect=SQLAlchemyError("private database details")):
        response = session.get("/sales")
    assert response.status_code == 503
    assert "private" not in response.text


def test_category_length_validation(client):
    session, _ = client
    assert session.get("/sales", params={"category": "x" * 256}).status_code == 422


def test_database_dependency_disposes_engine():
    with patch("src.api.get_engine") as factory:
        iterator = database()
        assert next(iterator) == factory.return_value
        with pytest.raises(StopIteration):
            next(iterator)
        factory.return_value.dispose.assert_called_once()


@pytest.fixture
def historical_client(client):
    session, engine = client
    metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(raw_sales_data.insert(), [
            {"order_id": "A", "order_date": datetime(2025, 1, 1),
             "product_category": "Computers", "sales": 100, "quantity": 2,
             "region": "West", "sales_channel": "Online", "currency": "INR"},
            {"order_id": "B", "order_date": datetime(2025, 3, 31),
             "product_category": "Computers", "sales": 120, "quantity": 3,
             "region": "East", "sales_channel": "Online", "currency": "INR"},
            {"order_id": "B", "order_date": datetime(2025, 3, 31),
             "product_category": "Office", "sales": -20, "quantity": -1,
             "region": "East", "sales_channel": "Retail Store", "currency": "INR"},
        ])
    return session


def test_historical_filters_zero_months_and_returns(historical_client):
    payload = historical_client.get("/sales").json()
    assert payload["metadata"]["currency"] == "INR"
    assert payload["filter_options"]["regions"] == ["East", "West"]
    assert payload["analytics"]["monthly"][1]["revenue"] == 0
    assert payload["analytics"]["latest"]["returns"] == 20
    assert payload["analytics"]["latest"]["units"] == 3
    assert payload["analytics"]["latest"]["returned_units"] == 1
    assert payload["summary"]["orders"] == 2
    selected = historical_client.get("/sales", params={
        "region": "East", "sales_channel": "Online", "start": "2025-03", "end": "2025-03"
    }).json()
    assert selected["summary"]["revenue"] == 120
    assert len(selected["analytics"]["monthly"]) == 1
    assert selected["analytics"]["latest"]["mom"]["reason"] == "zero_baseline"
    assert len(selected["filter_options"]["regions"]) == 2


@pytest.mark.parametrize("params", [
    {"start": "2025-13"}, {"end": "bad"}, {"start": "2025-03", "end": "2025-01"},
    {"region": "x" * 256}, {"sales_channel": "x" * 256},
])
def test_invalid_analytics_filters(client, params):
    assert client[0].get("/sales", params=params).status_code == 422


def test_empty_filtered_period_and_empty_scope(historical_client):
    for params in [{"start": "2026-01"}, {"region": "Unknown"}]:
        payload = historical_client.get("/sales", params=params).json()
        assert payload["summary"]["row_count"] == 0
        assert payload["transactions"] == []
    empty_month = historical_client.get("/sales", params={"start": "2025-02", "end": "2025-02"}).json()
    assert empty_month["analytics"]["latest"]["revenue"] == 0


def test_forecast_endpoint_validation_and_explicit_scope(client):
    session, engine = client
    metadata.create_all(engine)
    with patch("src.api.generate_forecast", return_value={"status": "ready"}) as generate:
        response = session.post("/forecasts", json={
            "category": "Office", "region": "West", "sales_channel": "Online",
            "end": "2025-08", "horizon": 6,
        })
    assert response.status_code == 200
    assert generate.call_args.args[1].region == "West"
    assert generate.call_args.args[2:] == ("2025-08", 6)
    for body in [{"horizon": 5}, {"end": "2025-13"}, {"region": "x" * 256}]:
        assert session.post("/forecasts", json=body).status_code == 422


def test_forecast_missing_data_and_safe_errors(client):
    session, engine = client
    assert session.post("/forecasts", json={}).json()["status"] == "no_data"
    metadata.create_all(engine)
    for failure, status in [(ValueError("Outside coverage"), 422),
                            (DatasetChangedError("changed"), 409),
                            (SQLAlchemyError("private"), 503)]:
        with patch("src.api.generate_forecast", side_effect=failure):
            response = session.post("/forecasts", json={})
        assert response.status_code == status
        assert "private" not in response.text