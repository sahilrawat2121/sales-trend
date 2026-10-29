from sqlalchemy import MetaData, Table, func, inspect, select
from sqlalchemy.engine import Connection, Engine

from src.db_connector import metadata, raw_sales_data


def copy_rows(connection: Connection, original: Table, replacement: Table) -> None:
    shared = [column.name for column in original.columns if column.name in replacement.c]
    connection.execute(replacement.insert().from_select(
        shared, select(*(original.c[name] for name in shared))
    ))
    before = connection.scalar(select(func.count()).select_from(original))
    after = connection.scalar(select(func.count()).select_from(replacement))
    if before != after:
        raise ValueError("Schema migration row-count verification failed")


def ensure_schema(engine: Engine) -> None:
    with engine.connect() as connection:
        connection.exec_driver_sql("BEGIN IMMEDIATE")
        try:
            inspector = inspect(connection)
            if inspector.has_table("raw_sales_data"):
                columns = {item["name"]: item for item in inspector.get_columns("raw_sales_data")}
                outdated = set(raw_sales_data.c.keys()) - set(columns)
                if outdated or not columns["customer_id"]["nullable"]:
                    original = Table("raw_sales_data", MetaData(), autoload_with=connection)
                    replacement = raw_sales_data.to_metadata(MetaData(), name="raw_sales_migration")
                    replacement.indexes.clear()
                    replacement.create(connection)
                    copy_rows(connection, original, replacement)
                    original.drop(connection)
                    connection.exec_driver_sql("ALTER TABLE raw_sales_migration RENAME TO raw_sales_data")
                    for index in raw_sales_data.indexes:
                        index.create(connection)
            metadata.create_all(connection)
            connection.commit()
        except Exception:
            connection.rollback()
            raise