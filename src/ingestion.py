import argparse
import logging
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pandas as pd
from sqlalchemy import delete
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from src.db_connector import PROJECT_ROOT, dataset_import, get_engine, raw_sales_data
from src.schema_migrations import ensure_schema

REQUIRED_COLUMNS = (
    "order_id", "order_date", "customer_id", "product_category",
    "sales", "quantity", "discount", "profit",
)
TEXT_COLUMNS = ("order_id", "customer_id", "product_category")
LOGGER = logging.getLogger(__name__)


def validate_chunk(frame: pd.DataFrame) -> pd.DataFrame:
    historical = "Order_ID" in frame.columns
    dimensions = ("product", "region", "sales_channel")
    if historical:
        frame = frame.rename(columns={
            "Order_ID": "order_id", "Order_Date": "order_date", "Category": "product_category",
            "Quantity": "quantity", "Sales_Amount_INR": "sales", "Profit_INR": "profit",
            "Discount_Percent": "discount", "Product": "product", "Region": "region",
            "Sales_Channel": "sales_channel",
        }).copy()
        frame["customer_id"] = None
        if "discount" in frame:
            discount = pd.to_numeric(frame["discount"], errors="raise")
            if discount.isna().any() or not discount.between(0, 100).all():
                raise ValueError("Historical discount must be between 0 and 100")
            frame["discount"] = discount / 100
    missing = sorted(set(REQUIRED_COLUMNS) - set(frame.columns))
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    clean = frame.loc[:, REQUIRED_COLUMNS].copy()
    for column in TEXT_COLUMNS:
        if historical and column == "customer_id":
            continue
        values = clean[column].astype("string").str.strip()
        if values.isna().any() or values.eq("").any() or values.str.len().gt(255).any():
            raise ValueError(f"Invalid required text field: {column}")
        clean[column] = values
    clean["order_date"] = pd.to_datetime(clean["order_date"], format="%Y-%m-%d", errors="raise")
    if clean["order_date"].isna().any():
        raise ValueError("order_date cannot be null")
    for column in ("sales", "quantity", "discount", "profit"):
        values = pd.to_numeric(clean[column], errors="raise")
        if not values.dropna().map(math.isfinite).all():
            raise ValueError(f"Non-finite numeric field: {column}")
        if column in ("sales", "quantity") and values.isna().any():
            raise ValueError(f"Required numeric field cannot be null: {column}")
        clean[column] = values
    if clean["quantity"].mod(1).ne(0).any():
        raise ValueError("quantity must contain integers")
    clean["currency"] = "INR" if historical else "USD"
    for column in dimensions:
        if column in frame:
            values = frame[column].astype("string").str.strip()
            if values.isna().any() or values.eq("").any() or values.str.len().gt(255).any():
                raise ValueError(f"Invalid dimension: {column}")
            clean[column] = values
    return clean


def ingest_csv(csv_path: Path, engine: Engine) -> int:
    csv_path.stat()
    options = {"dtype": {column: "string" for column in (*TEXT_COLUMNS, "Order_ID")},
               "chunksize": 50_000}
    source = pd.read_csv(csv_path, **options)
    chunks = [source] if isinstance(source, pd.DataFrame) else source
    ensure_schema(engine)
    row_count = 0
    first_date = last_date = None
    currency = None
    try:
        with engine.begin() as connection:
            connection.execute(delete(raw_sales_data))
            for frame in chunks:
                valid = validate_chunk(frame)
                valid.to_sql("raw_sales_data", connection, if_exists="append", index=False)
                row_count += len(valid)
                if not valid.empty:
                    chunk_currency = valid["currency"].iloc[0]
                    if currency is not None and currency != chunk_currency:
                        raise ValueError("Mixed source currencies are not supported")
                    currency = chunk_currency
                    minimum = valid["order_date"].min().date()
                    maximum = valid["order_date"].max().date()
                    first_date = min(first_date, minimum) if first_date else minimum
                    last_date = max(last_date, maximum) if last_date else maximum
            if row_count == 0:
                raise ValueError("CSV has no data rows")
            connection.execute(delete(dataset_import))
            connection.execute(dataset_import.insert().values(
                id=1, revision=uuid4().hex, source=csv_path.name, currency=currency,
                row_count=row_count, start_date=first_date, end_date=last_date,
                imported_at=datetime.now(timezone.utc),
            ))
    finally:
        if isinstance(source, pd.io.parsers.TextFileReader):
            source.close()
    LOGGER.info("Imported %d rows into raw_sales_data", row_count)
    return row_count


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Replace raw_sales_data from a sales CSV.")
    parser.add_argument(
        "--csv", type=Path, default=PROJECT_ROOT / "data" / "raw" / "sales_data_huge.csv"
    )
    arguments = parser.parse_args(argv)
    engine = get_engine()
    try:
        count = ingest_csv(arguments.csv, engine)
        print(f"Imported {count} rows into raw_sales_data.")
        return 0
    except (OSError, ValueError, SQLAlchemyError, pd.errors.ParserError):
        print("Import failed. Check CSV access, required columns, dates, and numeric values.",
              file=sys.stderr)
        return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())