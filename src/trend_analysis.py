import math
from collections import defaultdict

import pandas as pd

METRICS = (
    "revenue", "gross_revenue", "returns", "units", "returned_units",
    "sales_orders", "orders", "row_count", "invalid_units", "profit",
)


def comparison(current: float, previous: float | None) -> dict:
    reason = ("no_history" if previous is None else "zero_baseline" if previous == 0
              else "negative_baseline" if previous < 0 else None)
    delta = current - previous if previous is not None else None
    percent = delta / previous * 100 if reason is None else None
    return {
        "percent": percent, "delta": delta, "reason": reason,
        "direction": "unavailable" if percent is None else
        "growth" if percent > 0 else "decline" if percent < 0 else "flat",
    }


def calculate_monthly_trends(rows: list[dict], start: str | None, end: str | None) -> list[dict]:
    if start is None or end is None:
        return []
    by_month = {row["month"]: row for row in rows}
    result = []
    for period in pd.period_range(start, end, freq="M"):
        month = str(period)
        source = by_month.get(month, {})
        row = {"month": month, "had_transactions": bool(source)}
        for metric in METRICS:
            value = float(source.get(metric, 0) or 0)
            if not math.isfinite(value):
                raise ValueError("Monthly aggregates must be finite")
            row[metric] = value
        result.append(row)
    for position, row in enumerate(result):
        for key, metric, offset in (
            ("mom", "revenue", 1), ("yoy", "revenue", 12),
            ("units_mom", "units", 1), ("units_yoy", "units", 12),
            ("orders_mom", "sales_orders", 1), ("orders_yoy", "sales_orders", 12),
        ):
            previous = result[position - offset][metric] if position >= offset else None
            row[key] = comparison(row[metric], previous)
        for window in (3, 6):
            row[f"sma{window}"] = (
                sum(item["revenue"] for item in result[position - window + 1:position + 1]) / window
                if position + 1 >= window else None
            )
    return result


def seasonality(monthly: list[dict]) -> dict:
    years = defaultdict(dict)
    for row in monthly:
        year, month = map(int, row["month"].split("-"))
        years[year][month] = row["revenue"]
    eligible = {
        year: values for year, values in years.items()
        if len(values) == 12 and sum(values.values()) > 0
    }
    profile = []
    if len(eligible) >= 2:
        for month in range(1, 13):
            indices = [values[month] / (sum(values.values()) / 12)
                       for values in eligible.values()]
            profile.append({"month": month, "index": sum(indices) / len(indices)})
    maximum = max((row["index"] for row in profile), default=None)
    minimum = min((row["index"] for row in profile), default=None)
    return {
        "status": "available" if profile else "insufficient_history",
        "eligible_years": sorted(eligible),
        "profile": profile,
        "peak_months": [row["month"] for row in profile if math.isclose(row["index"], maximum)],
        "trough_months": [row["month"] for row in profile if math.isclose(row["index"], minimum)],
        "matrix": [{"year": year, "values": [values.get(month) for month in range(1, 13)]}
                   for year, values in sorted(years.items())],
    }


def build_analysis(
    rows: list[dict], category_rows: list[dict], start: str | None, end: str | None,
    visible_start: str | None = None,
) -> dict:
    monthly = calculate_monthly_trends(rows, start, end)
    visible = [row for row in monthly if visible_start is None or row["month"] >= visible_start]
    demand = []
    quarterly = []
    for category in sorted({row["category"] for row in category_rows}):
        category_months = calculate_monthly_trends(
            [row for row in category_rows if row["category"] == category], start, end
        )
        selected = [row for row in category_months
                    if visible_start is None or row["month"] >= visible_start]
        if not selected:
            continue
        totals = {metric: sum(row[metric] for row in selected) for metric in METRICS}
        demand.append({"category": category, **totals, "latest": selected[-1]})
        quarters = defaultdict(lambda: {"revenue": 0.0, "units": 0.0, "months": 0})
        for row in selected:
            quarter = str(pd.Period(row["month"], freq="M").asfreq("Q"))
            quarters[quarter]["revenue"] += row["revenue"]
            quarters[quarter]["units"] += row["units"]
            quarters[quarter]["months"] += 1
        quarterly.extend({"quarter": quarter, "category": category, **values}
                         for quarter, values in quarters.items())
    total_units = sum(row["units"] for row in demand)
    for row in demand:
        row["unit_share"] = row["units"] / total_units * 100 if total_units else None
    demand.sort(key=lambda row: (-row["units"], row["category"]))
    return {
        "monthly": visible, "latest": visible[-1] if visible else None,
        "seasonality": seasonality(visible), "demand": demand, "quarterly": quarterly,
    }