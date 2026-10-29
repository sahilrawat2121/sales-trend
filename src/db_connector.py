from pathlib import Path

from sqlalchemy import (
    JSON,
    Column,
    Date,
    DateTime,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    create_engine,
)
from sqlalchemy.engine import Engine, make_url

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
metadata = MetaData()
raw_sales_data = Table(
    "raw_sales_data",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("order_id", String(255), nullable=False),
    Column("order_date", DateTime, nullable=False, index=True),
    Column("customer_id", String(255)),
    Column("product_category", String(255), nullable=False),
    Column("product", String(255)),
    Column("region", String(255), index=True),
    Column("sales_channel", String(255), index=True),
    Column("currency", String(3), nullable=False, server_default="USD"),
    Column("sales", Numeric(18, 2), nullable=False),
    Column("quantity", Integer, nullable=False),
    Column("discount", Numeric(10, 4)),
    Column("profit", Numeric(18, 2)),
)
dataset_import = Table(
    "dataset_import", metadata,
    Column("id", Integer, primary_key=True),
    Column("revision", String(64), nullable=False),
    Column("source", String(255), nullable=False),
    Column("currency", String(3), nullable=False),
    Column("row_count", Integer, nullable=False),
    Column("start_date", Date, nullable=False),
    Column("end_date", Date, nullable=False),
    Column("imported_at", DateTime, nullable=False),
)
forecast_runs = Table(
    "forecast_runs", metadata,
    Column("id", String(64), primary_key=True),
    Column("revision", String(64), nullable=False),
    Column("created_at", DateTime, nullable=False),
    Column("result", JSON, nullable=False),
)
sales_forecasts = Table(
    "sales_forecasts", metadata,
    Column("id", Integer, primary_key=True),
    Column("run_id", String(64), nullable=False, index=True),
    Column("forecast_date", Date, nullable=False),
    Column("predicted_sales", Numeric(20, 4), nullable=False),
    Column("lower_bound_95", Numeric(20, 4), nullable=False),
    Column("upper_bound_95", Numeric(20, 4), nullable=False),
)


def get_engine(database_url: str | None = None) -> Engine:
    if database_url is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        database_url = f"sqlite:///{(DATA_DIR / 'sales_warehouse.db').as_posix()}"
    if make_url(database_url).get_backend_name() != "sqlite":
        raise ValueError("Only local SQLite databases are supported.")
    return create_engine(database_url)