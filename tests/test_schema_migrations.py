from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, inspect, select

from src.db_connector import raw_sales_data
from src.schema_migrations import ensure_schema


def legacy_engine():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE raw_sales_data (id INTEGER PRIMARY KEY, order_id VARCHAR(255) NOT NULL, "
            "order_date DATETIME NOT NULL, customer_id VARCHAR(255) NOT NULL, "
            "product_category VARCHAR(255) NOT NULL, sales NUMERIC NOT NULL, "
            "quantity INTEGER NOT NULL, discount NUMERIC, profit NUMERIC)"
        )
        connection.exec_driver_sql(
            "INSERT INTO raw_sales_data VALUES "
            "(1, '001', '2025-01-01', '010', 'Technology', 100, 1, 0, 20)"
        )
    return engine


def test_legacy_migration_preserves_rows_and_is_idempotent():
    engine = legacy_engine()
    ensure_schema(engine)
    ensure_schema(engine)
    columns = {item["name"]: item for item in inspect(engine).get_columns("raw_sales_data")}
    assert columns["customer_id"]["nullable"]
    assert "region" in columns
    with engine.connect() as connection:
        row = connection.execute(select(raw_sales_data)).mappings().one()
    assert row["order_id"] == "001"
    assert row["currency"] == "USD"
    assert row["region"] is None
    assert "ix_raw_sales_data_order_date" in {
        item["name"] for item in inspect(engine).get_indexes("raw_sales_data")
    }
    engine.dispose()


def test_migration_failure_preserves_original_table():
    engine = legacy_engine()
    with patch("src.schema_migrations.copy_rows", side_effect=ValueError("injected")), pytest.raises(ValueError):
        ensure_schema(engine)
    with engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT order_id FROM raw_sales_data").scalar() == "001"
    assert "region" not in {item["name"] for item in inspect(engine).get_columns("raw_sales_data")}
    engine.dispose()


def test_fresh_schema():
    engine = create_engine("sqlite://")
    ensure_schema(engine)
    assert {"raw_sales_data", "dataset_import", "forecast_runs", "sales_forecasts"} <= set(
        inspect(engine).get_table_names()
    )
    engine.dispose()