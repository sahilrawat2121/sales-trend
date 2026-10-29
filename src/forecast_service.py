import hashlib
import json
import logging
from dataclasses import asdict
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
from sqlalchemy import select
from sqlalchemy.engine import Engine

from src.db_connector import PROJECT_ROOT, forecast_runs, sales_forecasts
from src.forecasting import forecast_series
from src.sales_repository import Scope, coverage, monthly_rows
from src.trend_analysis import calculate_monthly_trends

LOGGER = logging.getLogger(__name__)


class DatasetChangedError(RuntimeError):
    pass


def export_metrics(result: dict) -> bool:
    try:
        folder = Path(PROJECT_ROOT / "outputs")
        folder.mkdir(parents=True, exist_ok=True)
        temporary = folder / "metrics.json.tmp"
        temporary.write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
        temporary.replace(folder / "metrics.json")
        return True
    except OSError:
        LOGGER.warning("Forecast was saved, but the optional metrics export failed.")
        return False


def input_identity(info: dict, rows: list[dict], scope: Scope, cutoff: str, horizon: int) -> str:
    identity = {"revision": info["revision"], "currency": info["currency"],
                "scope": asdict(scope), "cutoff": cutoff, "horizon": horizon,
                "model_version": "sarimax-v1", "coverage_end": info["end_date"],
                "series": [(row["month"], float(row["revenue"])) for row in rows]}
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()


def generate_forecast(engine: Engine, scope: Scope, end: str | None, horizon: int) -> dict:
    if horizon not in (3, 6, 12):
        raise ValueError("Forecast horizon must be 3, 6, or 12 months")
    with engine.connect() as connection:
        connection.exec_driver_sql("BEGIN")
        info = coverage(connection)
        if not info["start_date"]:
            return {"status": "no_data"}
        boundary = pd.Timestamp(info["end_date"])
        last_month = boundary.to_period("M")
        requested = pd.Period(end, freq="M") if end else last_month
        if requested > last_month or requested < pd.Period(info["start_date"], freq="M"):
            raise ValueError("Training cutoff must be inside dataset coverage")
        effective = min(requested, last_month if boundary.is_month_end else last_month - 1)
        first = pd.Timestamp(info["start_date"])
        beginning = first.to_period("M") + (0 if first.day == 1 else 1)
        rows = monthly_rows(connection, scope, str(effective))
        if not rows:
            return {"status": "no_data"}
        monthly = calculate_monthly_trends(rows, str(beginning), str(effective))
        run_id = input_identity(info, monthly, scope, str(effective), horizon)
        cached = connection.execute(select(forecast_runs.c.result).where(
            forecast_runs.c.id == run_id)).scalar_one_or_none()
        if cached:
            return {**cached, "cache_hit": True}
    result = {
        **forecast_series(monthly, horizon), "run_id": run_id, "currency": info["currency"],
        "dataset_revision": info["revision"], "scope": asdict(scope), "horizon": horizon,
        "requested_cutoff": str(requested), "partial_month_excluded": effective != requested,
        "training_cutoff": str(effective), "history": monthly, "cache_hit": False,
    }
    if result["status"] != "ready":
        return result
    with engine.connect() as connection:
        connection.exec_driver_sql("BEGIN IMMEDIATE")
        current = coverage(connection)
        current_rows = calculate_monthly_trends(monthly_rows(connection, scope, str(effective)),
                                                str(beginning), str(effective))
        if input_identity(current, current_rows, scope, str(effective), horizon) != run_id:
            connection.rollback()
            raise DatasetChangedError("Data changed while fitting; generate the forecast again.")
        existing = connection.execute(select(forecast_runs.c.result).where(
            forecast_runs.c.id == run_id)).scalar_one_or_none()
        if existing:
            connection.rollback()
            return {**existing, "cache_hit": True}
        connection.execute(forecast_runs.insert().values(
            id=run_id, revision=info["revision"], created_at=datetime.now(timezone.utc), result=result))
        connection.execute(sales_forecasts.insert(), [
            {**row, "run_id": run_id, "forecast_date": date.fromisoformat(row["forecast_date"])}
            for row in result["forecast"]
        ])
        connection.commit()
    export_metrics(result)
    return result