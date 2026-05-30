"""Schema migration utilities.

Aligns the actual database schema with SQLAlchemy model definitions.
Needed because Base.metadata.create_all does not alter existing tables.
"""

import logging
import re
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.core.database import is_sqlite

logger = logging.getLogger(__name__)

TABLE_CONSTRAINTS = [
    ("ps_upstream", "edge_uuid", ("cluster_id", "edge_uuid")),
    ("ps_route", "edge_uuid", ("cluster_id", "edge_uuid")),
    ("ps_plugin_config", "edge_uuid", ("cluster_id", "edge_uuid")),
    ("ps_global_rule", "edge_uuid", ("cluster_id", "edge_uuid")),
    ("ps_plugin_metadata", "plugin_name", ("cluster_id", "plugin_name")),
]


def _detect_bad_constraint(engine: Engine, table: str, bad_col: str) -> bool:
    """Check if table has a single-column UNIQUE on bad_col instead of compound."""
    inspector = inspect(engine)
    try:
        indexes = inspector.get_indexes(table)
    except Exception:
        return False
    for idx in indexes:
        cols = idx.get("column_names", [])
        if idx.get("unique") and cols == [bad_col]:
            return True
    return False


def _get_table_ddl(conn, table: str) -> str:
    row = conn.execute(
        text("SELECT sql FROM sqlite_master WHERE type='table' AND name=:name"),
        {"name": table},
    ).fetchone()
    return row[0] if row else ""


def _fix_sqlite_table(engine: Engine, table: str, bad_col: str, compound_cols: tuple) -> None:
    """Recreate table with compound UNIQUE for SQLite."""
    with engine.connect() as conn:
        ddl = _get_table_ddl(conn, table)
        if not ddl:
            return

        old_ddl = ddl

        compound_col = compound_cols[1]
        compound = f'UNIQUE("{compound_cols[0]}", "{compound_cols[1]}")'

        if compound in ddl:
            return

        ddl = re.sub(
            rf',\s*\n\s*UNIQUE\s*\(\s*{bad_col}\s*\)', "", ddl
        )
        ddl = re.sub(
            rf'\n\s*UNIQUE\s*\(\s*{bad_col}\s*\),?', "", ddl
        )
        ddl = re.sub(
            rf'\b{bad_col}\s+\w+(?:\(\d+\))?\s+UNIQUE\s+NOT\s+NULL',
            f'{bad_col} TEXT NOT NULL', ddl
        )

        if compound not in ddl:
            ddl = ddl.rstrip().rstrip(")")
            ddl += f",\n    {compound}\n)"

        if ddl == old_ddl:
            return

        new_table = table + "_new"
        inner = ddl.split("(", 1)[1].rsplit(")", 1)[0]
        conn.execute(text(f'CREATE TABLE IF NOT EXISTS "{new_table}" (\n{inner}\n)'))
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        try:
            c = conn.execute(text(f'PRAGMA table_info("{table}")'))
            cols = [r[1] for r in c.fetchall()]
            col_list = ", ".join(f'"{c}"' for c in cols)
            conn.execute(
                text(f'INSERT INTO "{new_table}" ({col_list}) SELECT {col_list} FROM "{table}"')
            )
            conn.execute(text(f'DROP TABLE "{table}"'))
            conn.execute(text(f'ALTER TABLE "{new_table}" RENAME TO "{table}"'))
            conn.commit()
            logger.info(
                "Migrated %s: replaced single-column UNIQUE(%s) "
                "with compound UNIQUE(%s, %s)",
                table, bad_col, compound_cols[0], compound_cols[1],
            )
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.execute(text("PRAGMA foreign_keys=ON"))


def _fix_postgresql_table(engine: Engine, table: str, bad_col: str, compound_cols: tuple) -> None:
    """Drop old constraint and add compound one for PostgreSQL."""
    constraint_name = f"{table}_{bad_col}_key"
    with engine.connect() as conn:
        conn.execute(
            text(f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "{constraint_name}"')
        )
        conn.execute(
            text(
                f'ALTER TABLE "{table}" '
                f'ADD CONSTRAINT "uq_{table}_{compound_cols[1]}" '
                f'UNIQUE ("{compound_cols[0]}", "{compound_cols[1]}")'
            )
        )
        conn.commit()
        logger.info(
            "Migrated %s: dropped %s, added compound UNIQUE",
            table, constraint_name,
        )


COLUMN_MIGRATIONS = [
    ("ps_node", "status_detail", "TEXT"),
]


def _add_column(engine: Engine, table: str, column: str, col_type: str) -> bool:
    """Add a column to table if it does not already exist."""
    inspector = inspect(engine)
    try:
        columns = [c["name"] for c in inspector.get_columns(table)]
    except Exception:
        return False
    if column in columns:
        return False
    with engine.connect() as conn:
        try:
            conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {column} {col_type}'))
            conn.commit()
            logger.info("Added column %s.%s (%s)", table, column, col_type)
            return True
        except Exception as e:
            conn.rollback()
            logger.warning("Could not add column %s.%s: %s", table, column, e)
            return False


def run_migrations(engine: Engine) -> None:
    """Run all schema migrations after Base.metadata.create_all."""
    migrated_any = False
    for table, bad_col, compound_cols in TABLE_CONSTRAINTS:
        if _detect_bad_constraint(engine, table, bad_col):
            logger.warning(
                "Detected wrong UNIQUE constraint on %s.%s - running migration...",
                table, bad_col,
            )
            if is_sqlite(str(engine.url)):
                _fix_sqlite_table(engine, table, bad_col, compound_cols)
            else:
                _fix_postgresql_table(engine, table, bad_col, compound_cols)
            migrated_any = True

    for table, column, col_type in COLUMN_MIGRATIONS:
        if _add_column(engine, table, column, col_type):
            migrated_any = True

    if not migrated_any:
        logger.info("All schema constraints check passed")
