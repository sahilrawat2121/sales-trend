from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest
from sqlalchemy import create_engine, inspect, select

from src.db_connector import get_engine, raw_sales_data
from src.ingestion import ingest_csv, main, validate_chunk


@pytest.fixture
def engine():
    database = create_engine("sqlite://")
    yield database
    database.dispose()


@pytest.fixture
def frame():
    return pd.DataFrame({
        "order_id": ["001", "001"],
        "order_date": ["2025-01-03", "2025-02-04"],
        "customer_id": ["010", "011"],
        "product_category": ["Technology", "Furniture"],
        "sales": [250.0, -40.0],
        "quantity": [2, 1],
        "discount": [0.1, None],
        "profit": [50.0, None],
    })


def import_frame(engine, frame):
    with patch.object(Path, "stat"), patch("src.ingestion.pd.read_csv") as read:
        read.return_value = iter(frame) if isinstance(frame, list) else frame
        count = ingest_csv(Path("sample.csv"), engine)
        return count, read.call_args.kwargs


def test_schema_rows_and_replace(engine, frame):
    assert import_frame(engine, frame)[0] == 2
    assert import_frame(engine, frame.iloc[:1])[0] == 1
    with engine.connect() as connection:
        rows = connection.execute(select(raw_sales_data)).mappings().all()
    assert len(rows) == 1
    assert rows[0]["order_id"] == "001"
    assert float(rows[0]["sales"]) == 250
    assert rows[0]["order_date"].year == 2025
    assert "ix_raw_sales_data_order_date" in {
        index["name"] for index in inspect(engine).get_indexes("raw_sales_data")
    }


def test_returns_and_optional_nulls_preserved(engine, frame):
    import_frame(engine, frame)
    with engine.connect() as connection:
        row = connection.execute(select(raw_sales_data).where(raw_sales_data.c.id == 2)).one()
    assert row.sales == -40
    assert row.discount is None
    assert row.profit is None


@pytest.mark.parametrize("column,value", [
    ("order_date", "not-a-date"), ("order_date", None),
    ("sales", "bad"), ("sales", float("inf")), ("sales", None),
    ("quantity", 1.5), ("quantity", None),
    ("discount", "bad"), ("profit", float("inf")),
    ("order_id", " "), ("customer_id", None), ("product_category", ""),
])
def test_invalid_rows_do_not_replace_existing_data(engine, frame, column, value):
    import_frame(engine, frame.iloc[:1])
    invalid = frame.copy().astype(object)
    invalid.loc[0, column] = value
    with pytest.raises(ValueError):
        import_frame(engine, invalid)
    with engine.connect() as connection:
        assert len(connection.execute(select(raw_sales_data)).all()) == 1


def test_missing_columns(engine, frame):
    with pytest.raises(ValueError, match="Missing required columns"):
        import_frame(engine, frame.drop(columns="sales"))


def test_empty_csv_rejected(engine, frame):
    with pytest.raises(ValueError, match="no data rows"):
        import_frame(engine, frame.iloc[:0])


def test_chunking_and_rollback(engine, frame):
    count, options = import_frame(engine, [frame, frame])
    assert count == 4
    assert options["chunksize"] == 50_000
    with pytest.raises(ValueError):
        import_frame(engine, [frame, frame.drop(columns="sales")])
    with engine.connect() as connection:
        assert len(connection.execute(select(raw_sales_data)).all()) == 4


def test_missing_file(engine):
    with patch.object(Path, "stat", side_effect=FileNotFoundError), pytest.raises(FileNotFoundError):
        ingest_csv(Path("missing.csv"), engine)


def test_engine_uses_sqlite_only():
    database = get_engine("sqlite://")
    assert database.dialect.name == "sqlite"
    database.dispose()
    with pytest.raises(ValueError, match="SQLite"):
        get_engine("postgresql://localhost/sales")


def test_default_engine_creates_data_directory():
    with patch("src.db_connector.DATA_DIR") as folder, patch(
        "src.db_connector.create_engine"
    ) as create:
        get_engine()
    folder.mkdir.assert_called_once_with(parents=True, exist_ok=True)
    create.assert_called_once()


def test_cli_success(engine, frame, capsys):
    with patch("src.ingestion.get_engine", return_value=engine), patch(
        "src.ingestion.ingest_csv", return_value=len(frame)
    ):
        assert main([]) == 0
    assert "Imported 2 rows" in capsys.readouterr().out


def test_cli_error_is_safe(engine, capsys):
    with patch("src.ingestion.get_engine", return_value=engine), patch(
        "src.ingestion.ingest_csv", side_effect=FileNotFoundError("private path")
    ):
        assert main([]) == 1
    assert "private path" not in capsys.readouterr().err


def test_historical_header_maps_inr_dimensions_and_missing_customer():
    historical = pd.DataFrame({
        "Order_ID": ["ORD001"], "Order_Date": ["2025-01-01"],
        "Product": ["Laptop"], "Category": ["Computers"], "Region": ["West"],
        "Sales_Channel": ["Online"], "Quantity": [2], "Discount_Percent": [10],
        "Sales_Amount_INR": [9000], "Profit_INR": [1200],
    })
    result = validate_chunk(historical)
    assert result.loc[0, "order_id"] == "ORD001"
    assert result.loc[0, "discount"] == pytest.approx(0.1)
    assert result.loc[0, "sales"] == 9000
    assert result.loc[0, "region"] == "West"
    assert result.loc[0, "sales_channel"] == "Online"
    assert result.loc[0, "currency"] == "INR"
    assert pd.isna(result.loc[0, "customer_id"])


@pytest.mark.parametrize("discount", [-1, 101])
def test_historical_discount_bounds(discount):
    historical = pd.DataFrame({
        "Order_ID": ["ORD001"], "Order_Date": ["2025-01-01"],
        "Category": ["Computers"], "Quantity": [2], "Discount_Percent": [discount],
        "Sales_Amount_INR": [9000], "Profit_INR": [1200],
    })
    with pytest.raises(ValueError, match="discount"):
        validate_chunk(historical)