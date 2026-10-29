from collections.abc import Iterator
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import inspect
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from src.db_connector import get_engine
from src.forecast_service import DatasetChangedError, generate_forecast
from src.sales_repository import Scope, sales_payload
from src.trend_analysis import build_analysis

app = FastAPI(title="Sales Trend API", version="0.2.0")
MONTH_PATTERN = r"^[12]\d{3}-(0[1-9]|1[0-2])$"


def database() -> Iterator[Engine]:
    engine = get_engine()
    try:
        yield engine
    finally:
        engine.dispose()


@app.get("/sales")
def sales(
    engine: Annotated[Engine, Depends(database)],
    category: Annotated[str | None, Query(max_length=255)] = None,
    region: Annotated[str | None, Query(max_length=255)] = None,
    sales_channel: Annotated[str | None, Query(max_length=255)] = None,
    start: Annotated[str | None, Query(pattern=MONTH_PATTERN)] = None,
    end: Annotated[str | None, Query(pattern=MONTH_PATTERN)] = None,
) -> dict:
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="Start month must not follow end month.")
    empty = {
        "summary": {"revenue": 0.0, "profit": 0.0, "orders": 0, "row_count": 0,
                    "average_order_value": 0.0},
        "monthly": [], "categories": [], "transactions": [],
        "analytics": build_analysis([], [], None, None),
        "filter_options": {"categories": [], "regions": [], "sales_channels": []},
        "metadata": {"start_date": None, "end_date": None, "currency": "INR", "row_count": 0,
                 "revision": "empty", "source": "No import"},
    }
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("BEGIN")
            if not inspect(connection).has_table("raw_sales_data"):
                return empty
            return sales_payload(connection, Scope(category, region, sales_channel), start, end)
    except (SQLAlchemyError, ValueError):
        raise HTTPException(status_code=503, detail="Sales data is temporarily unavailable.") from None


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str | None = Field(default=None, max_length=255)
    region: str | None = Field(default=None, max_length=255)
    sales_channel: str | None = Field(default=None, max_length=255)
    end: str | None = Field(default=None, pattern=MONTH_PATTERN)
    horizon: Literal[3, 6, 12] = 12


@app.post("/forecasts")
def forecast(request: ForecastRequest, engine: Annotated[Engine, Depends(database)]) -> dict:
    try:
        if not inspect(engine).has_table("raw_sales_data"):
            return {"status": "no_data"}
        return generate_forecast(engine, Scope(request.category, request.region, request.sales_channel),
                                 request.end, request.horizon)
    except DatasetChangedError:
        raise HTTPException(status_code=409, detail="Dataset changed. Generate the forecast again.") from None
    except ValueError:
        raise HTTPException(status_code=422, detail="Forecast cutoff is outside dataset coverage.") from None
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Forecast storage is temporarily unavailable.") from None