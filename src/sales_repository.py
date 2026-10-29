from calendar import monthrange
from dataclasses import dataclass

from sqlalchemy import and_, case, distinct, func, inspect, select
from sqlalchemy.engine import Connection

from src.db_connector import dataset_import, raw_sales_data
from src.trend_analysis import build_analysis


@dataclass(frozen=True)
class Scope:
    category: str | None = None
    region: str | None = None
    sales_channel: str | None = None


def predicates(scope: Scope) -> list:
    table = raw_sales_data
    return [column == value for column, value in (
        (table.c.product_category, scope.category), (table.c.region, scope.region),
        (table.c.sales_channel, scope.sales_channel),
    ) if value]


def measures() -> list:
    table = raw_sales_data
    positive = table.c.sales > 0
    return [
        func.coalesce(func.sum(table.c.sales), 0).label("revenue"),
        func.coalesce(func.sum(table.c.profit), 0).label("profit"),
        func.sum(case((positive, table.c.sales), else_=0)).label("gross_revenue"),
        func.sum(case((table.c.sales < 0, -table.c.sales), else_=0)).label("returns"),
        func.sum(case((and_(positive, table.c.quantity > 0), table.c.quantity), else_=0)).label("units"),
        func.sum(case((table.c.sales < 0, func.abs(table.c.quantity)), else_=0)).label("returned_units"),
        func.count(distinct(case((positive, table.c.order_id)))).label("sales_orders"),
        func.count(distinct(table.c.order_id)).label("orders"),
        func.count().label("row_count"),
        func.sum(case((and_(positive, table.c.quantity <= 0), 1), else_=0)).label("invalid_units"),
    ]


def monthly_rows(connection: Connection, scope: Scope, end: str | None = None,
                 by_category: bool = False) -> list[dict]:
    table = raw_sales_data
    month = func.strftime("%Y-%m", table.c.order_date)
    grouping = [month]
    columns = [month.label("month")]
    if by_category:
        grouping.append(table.c.product_category)
        columns.append(table.c.product_category.label("category"))
    conditions = predicates(scope)
    if end:
        conditions.append(month <= end)
    query = select(*columns, *measures()).where(*conditions).group_by(*grouping).order_by(*grouping)
    return [dict(row) for row in connection.execute(query).mappings()]


def coverage(connection: Connection) -> dict:
    table = raw_sales_data
    bounds = connection.execute(select(
        func.min(table.c.order_date), func.max(table.c.order_date), func.count()
    )).one()
    currencies = connection.execute(select(table.c.currency).distinct()).scalars().all()
    if len(currencies) > 1:
        raise ValueError("Mixed-currency warehouse is not supported")
    imported = None
    if inspect(connection).has_table("dataset_import"):
        imported = connection.execute(select(dataset_import)).mappings().first()
    return {
        "start_date": bounds[0].date().isoformat() if bounds[0] else None,
        "end_date": bounds[1].date().isoformat() if bounds[1] else None,
        "row_count": bounds[2], "currency": currencies[0] if currencies else "INR",
        "partial_last_month": bool(bounds[1] and bounds[1].day != monthrange(bounds[1].year, bounds[1].month)[1]),
        "revision": imported["revision"] if imported else "legacy",
        "source": imported["source"] if imported else "Legacy warehouse",
    }


def sales_payload(connection: Connection, scope: Scope,
                  start: str | None = None, end: str | None = None) -> dict:
    table = raw_sales_data
    info = coverage(connection)
    options = {}
    for key, column in (("categories", table.c.product_category),
                        ("regions", table.c.region), ("sales_channels", table.c.sales_channel)):
        options[key] = connection.execute(
            select(column).where(column.is_not(None)).distinct().order_by(column)
        ).scalars().all()
    first_month = info["start_date"][:7] if info["start_date"] else None
    last_month = info["end_date"][:7] if info["end_date"] else None
    effective_end = min(end, last_month) if end and last_month else last_month
    analysis = build_analysis(
        monthly_rows(connection, scope, effective_end),
        monthly_rows(connection, scope, effective_end, by_category=True),
        first_month, effective_end, start,
    )
    conditions = predicates(scope)
    month = func.strftime("%Y-%m", table.c.order_date)
    if start:
        conditions.append(month >= start)
    if end:
        conditions.append(month <= end)
    totals = connection.execute(select(*measures()).where(*conditions)).mappings().one()
    observed = connection.execute(
        select(month.label("month"), func.sum(table.c.sales).label("revenue"))
        .where(*conditions).group_by(month).order_by(month)
    ).mappings().all()
    transactions = connection.execute(select(table).where(*conditions)
        .order_by(table.c.order_date.desc(), table.c.id.desc()).limit(10)).mappings().all()
    revenue = float(totals["revenue"])
    orders = totals["orders"]
    return {
        "summary": {"revenue": revenue, "profit": float(totals["profit"]), "orders": orders,
                    "row_count": totals["row_count"],
                    "average_order_value": revenue / orders if orders else 0.0},
        "categories": options["categories"], "filter_options": options, "metadata": info,
        "monthly": [{"month": row["month"], "revenue": float(row["revenue"])} for row in observed],
        "analytics": analysis,
        "transactions": [{
            "id": row["id"], "order_id": row["order_id"],
            "order_date": row["order_date"].strftime("%Y-%m-%d"),
            "product_category": row["product_category"], "sales": float(row["sales"]),
            "quantity": row["quantity"], "region": row["region"],
            "sales_channel": row["sales_channel"],
        } for row in transactions],
    }