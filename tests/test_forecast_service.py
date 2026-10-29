from datetime import datetime
from unittest.mock import patch

import pandas as pd
import pytest
from sqlalchemy import create_engine, func, select

from src.db_connector import metadata, raw_sales_data, sales_forecasts
from src.forecast_service import DatasetChangedError, export_metrics, generate_forecast
from src.sales_repository import Scope


@pytest.fixture
def engine():
    database = create_engine("sqlite://")
    metadata.create_all(database)
    rows = [{"order_id": f"O{index}", "order_date": month.to_pydatetime(),
             "product_category": "Office", "region": "West", "sales_channel": "Online",
             "currency": "INR", "sales": 100 + index, "quantity": 1}
            for index, month in enumerate(pd.date_range("2023-01-01", periods=33, freq="MS"))]
    rows[-1]["order_date"] = datetime(2025, 9, 26)
    with database.begin() as connection:
        connection.execute(raw_sales_data.insert(), rows)
    yield database
    database.dispose()


def fake_forecast(rows, horizon):
    dates = pd.period_range(pd.Period(rows[-1]["month"], freq="M") + 1, periods=horizon, freq="M")
    return {"status": "ready", "metrics": {"rmse": 10}, "forecast": [
        {"forecast_date": str(month) + "-01", "predicted_sales": 100,
         "lower_bound_95": 80, "upper_bound_95": 120} for month in dates
    ], "training_cutoff": rows[-1]["month"]}


def test_partial_month_cutoff_persistence_cache_and_invalidation(engine):
    with patch("src.forecast_service.forecast_series", side_effect=fake_forecast) as fit, patch(
        "src.forecast_service.export_metrics"
    ):
        first = generate_forecast(engine, Scope(), None, 6)
        cached = generate_forecast(engine, Scope(), None, 6)
        assert first["partial_month_excluded"] is True
        assert first["training_cutoff"] == "2025-08"
        assert first["forecast"][0]["forecast_date"] == "2025-09-01"
        assert cached["cache_hit"] is True
        assert fit.call_count == 1
        with engine.begin() as connection:
            connection.execute(raw_sales_data.update().where(raw_sales_data.c.id == 1).values(sales=999))
        updated = generate_forecast(engine, Scope(), None, 6)
        assert updated["run_id"] != first["run_id"]
        assert fit.call_count == 2
    with engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(sales_forecasts)) == 12


def test_explicit_cutoff_and_scope(engine):
    with patch("src.forecast_service.forecast_series", side_effect=fake_forecast), patch(
        "src.forecast_service.export_metrics"
    ):
        result = generate_forecast(engine, Scope(region="West"), "2025-07", 3)
    assert result["training_cutoff"] == "2025-07"
    assert result["partial_month_excluded"] is False
    assert result["scope"]["region"] == "West"
    assert len(result["forecast"]) == 3


def test_invalid_cutoff_horizon_and_no_data(engine):
    with pytest.raises(ValueError):
        generate_forecast(engine, Scope(), "2026-01", 3)
    with pytest.raises(ValueError):
        generate_forecast(engine, Scope(), None, 5)
    assert generate_forecast(engine, Scope(region="Unknown"), None, 3)["status"] == "no_data"


def test_unavailable_model_is_not_cached(engine):
    with patch("src.forecast_service.forecast_series", return_value={"status": "model_unavailable"}):
        assert generate_forecast(engine, Scope(), None, 3)["status"] == "model_unavailable"


def test_metrics_export_is_atomic_and_handles_failure():
    with patch("src.forecast_service.Path") as path:
        export_metrics({"run_id": "one", "metrics": {"rmse": 1}})
        assert path.return_value.__truediv__.return_value.write_text.called
    with patch("src.forecast_service.Path", side_effect=OSError):
        assert export_metrics({}) is False


def test_dataset_change_during_fit_rejects_stale_result(engine):
    def replace_during_fit(rows, horizon):
        with engine.begin() as connection:
            connection.execute(raw_sales_data.update().where(raw_sales_data.c.id == 1).values(sales=999))
        return fake_forecast(rows, horizon)

    with patch("src.forecast_service.forecast_series", side_effect=replace_during_fit), pytest.raises(DatasetChangedError):
        generate_forecast(engine, Scope(), None, 3)
    with engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(sales_forecasts)) == 0