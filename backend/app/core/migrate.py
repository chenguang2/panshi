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
    ("ps_node", "openresty_path", "VARCHAR(255)"),
    ("ps_node", "ssh_port", "INTEGER"),
    ("ps_cluster", "current_version", "INTEGER"),
    ("ps_import_log", "stream_proxy_count", "INTEGER DEFAULT 0"),
    ("ps_stream_proxy", "ref_node_id", "INTEGER"),
    ("ps_stream_proxy", "hash_on", "VARCHAR(20)"),
    ("ps_stream_proxy", "key", "VARCHAR(100)"),
    ("ps_stream_proxy", "checks", "TEXT"),
    ("ps_stream_proxy", "retries", "INTEGER"),
    ("ps_stream_proxy", "retry_timeout", "INTEGER"),
    ("ps_stream_proxy", "proxy_type", "VARCHAR(10) DEFAULT 'normal'"),
    ("ps_stream_proxy", "dns_config", "TEXT"),
    ("ps_ssl_certificate", "gm", "INTEGER DEFAULT 0"),
    ("ps_ssl_certificate", "sign_cert", "TEXT"),
    ("ps_ssl_certificate", "sign_key", "TEXT"),
    ("ps_ssl_certificate", "create_method", "VARCHAR(32) DEFAULT 'upload'"),
    ("ps_ssl_certificate", "algorithm", "VARCHAR(16)"),
    ("ps_ssl_certificate", "generate_log", "TEXT"),
    ("ps_ssl_certificate", "is_ca", "INTEGER DEFAULT 0"),
    ("ps_ssl_certificate", "ca_cert_id", "INTEGER"),
    ("ps_ssl_certificate", "client_ca", "TEXT"),
    ("ps_ssl_certificate", "client_depth", "INTEGER DEFAULT 1"),
    ("ps_ssl_certificate", "skip_mtls_uri_regex", "TEXT"),
    ("ps_ssl_certificate", "organization", "VARCHAR(200)"),
    ("ps_ssl_certificate", "organizational_unit", "VARCHAR(200)"),
    ("ps_route", "enable_websocket", "INTEGER DEFAULT 0"),
    ("install_task_node", "log_file", "VARCHAR(255)"),
    ("install_task_node", "log_line_count", "INTEGER DEFAULT 0"),
    ("install_task_node", "stdout_tail", "TEXT"),
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


def _rename_column(engine: Engine, table: str, old_name: str, new_name: str) -> bool:
    """Rename a column, preserving data, if the old column exists and the new one does not."""
    inspector = inspect(engine)
    try:
        columns = [c["name"] for c in inspector.get_columns(table)]
    except Exception:
        return False
    if old_name not in columns or new_name in columns:
        return False
    with engine.connect() as conn:
        try:
            conn.execute(text(f'ALTER TABLE "{table}" RENAME COLUMN "{old_name}" TO "{new_name}"'))
            conn.commit()
            logger.info("Renamed column %s.%s -> %s", table, old_name, new_name)
            return True
        except Exception as e:
            conn.rollback()
            logger.warning("Could not rename column %s.%s: %s", table, old_name, e)
            return False


def _merge_legacy_column(engine: Engine, table: str, old_name: str, new_name: str) -> bool:
    """When BOTH old and new columns exist, backfill the new column from the
    old one (only where the new column is empty) and drop the legacy column.

    This heals databases that ran an earlier migration ordering bug where
    ``COLUMN_MIGRATIONS`` added the empty ``new_name`` column first, causing
    the rename to be skipped while data stayed in ``old_name``.
    """
    inspector = inspect(engine)
    try:
        columns = [c["name"] for c in inspector.get_columns(table)]
    except Exception:
        return False
    if old_name not in columns or new_name not in columns:
        return False
    with engine.connect() as conn:
        try:
            conn.execute(
                text(
                    f'UPDATE "{table}" SET "{new_name}" = "{old_name}" '
                    f'WHERE ("{new_name}" IS NULL OR "{new_name}" = \'\') '
                    f'AND "{old_name}" IS NOT NULL'
                )
            )
            conn.execute(text(f'ALTER TABLE "{table}" DROP COLUMN "{old_name}"'))
            conn.commit()
            logger.info(
                "Merged legacy column %s.%s into %s (backfill + drop)",
                table, old_name, new_name,
            )
            return True
        except Exception as e:
            conn.rollback()
            logger.warning("Could not merge column %s.%s: %s", table, old_name, e)
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

    # Migrate legacy ps_node.edge_install_path -> openresty_path (data preserved).
    # Must run BEFORE COLUMN_MIGRATIONS adds the new column, otherwise the
    # rename is skipped because openresty_path already exists.
    if _merge_legacy_column(engine, "ps_node", "edge_install_path", "openresty_path"):
        migrated_any = True
    if _rename_column(engine, "ps_node", "edge_install_path", "openresty_path"):
        migrated_any = True

    for table, column, col_type in COLUMN_MIGRATIONS:
        if _add_column(engine, table, column, col_type):
            migrated_any = True

    # Migrate NULL group_name to empty string
    _migrate_null_group_name(engine)

    # Normalize legacy stream_proxy scheme values (tcp_udp etc.) to tcp
    _normalize_stream_schemes(engine)

    # Ensure index on ps_cluster(group_name) for JOIN performance
    _ensure_index(engine, "ps_cluster", "idx_cluster_group_name", ["group_name"])

    # Unique (task_id, node_id) on install_task_node (dedup first)
    _ensure_unique_index(engine, "install_task_node", "uq_install_task_node_task_node", ["task_id", "node_id"])

    # Ensure ForeignKey on ps_ssl_certificate.cluster_id (existing tables may lack it)
    _ensure_ssl_foreign_key(engine)

    # Backfill algorithm column for existing certificates
    _backfill_cert_algorithm(engine)

    if not migrated_any:
        logger.info("All schema constraints check passed")

def _backfill_cert_algorithm(engine: Engine) -> None:
    """Detect and fill algorithm for SSL certificates missing it."""
    from app.services.cert_generator import detect_cert_algorithm, detect_openssl
    openssl_info = detect_openssl()
    if not openssl_info["path"]:
        return
    with engine.connect() as conn:
        try:
            inspector = inspect(engine)
            columns = [c["name"] for c in inspector.get_columns("ps_ssl_certificate")]
            if "algorithm" not in columns:
                return
            result = conn.execute(
                text("SELECT id, cert FROM ps_ssl_certificate WHERE algorithm IS NULL")
            )
            rows = result.fetchall()
            for row in rows:
                cert_id, cert_pem = row
                algo = detect_cert_algorithm(cert_pem)
                if algo:
                    conn.execute(
                        text("UPDATE ps_ssl_certificate SET algorithm = :algo WHERE id = :id"),
                        {"algo": algo, "id": cert_id},
                    )
            if rows:
                conn.commit()
                logger.info("Backfilled algorithm for %d SSL certificates", len(rows))
        except Exception as e:
            logger.warning("Could not backfill certificate algorithms: %s", e)


def _migrate_null_group_name(engine: Engine) -> None:
    with engine.connect() as conn:
        try:
            result = conn.execute(
                text("UPDATE ps_cluster SET group_name = '' WHERE group_name IS NULL")
            )
            if result.rowcount > 0:
                conn.commit()
                logger.info("Migrated %d NULL group_name to ''", result.rowcount)
        except Exception as e:
            logger.warning("Could not migrate group_name: %s", e)


def _normalize_stream_schemes(engine: Engine) -> bool:
    """Normalize legacy/invalid ps_stream_proxy.scheme values to 'tcp'.

    Historical 'tcp_udp' (removed in 3836f54) and any other non-(tcp|udp|tls)
    values are rewritten to 'tcp' so downstream reads never see invalid schemes.
    Returns True if any rows were changed.
    """
    from sqlalchemy import text as _text

    try:
        inspector = inspect(engine)
        columns = [c["name"] for c in inspector.get_columns("ps_stream_proxy")]
        if "scheme" not in columns:
            return False
        with engine.connect() as conn:
            result = conn.execute(
                _text(
                    "UPDATE ps_stream_proxy SET scheme = 'tcp' "
                    "WHERE scheme NOT IN ('tcp', 'udp', 'tls')"
                )
            )
            if result.rowcount > 0:
                conn.commit()
                logger.info("Normalized %d legacy stream_proxy schemes to 'tcp'", result.rowcount)
                return True
            return False
    except Exception as e:
        logger.warning("Could not normalize stream proxy schemes: %s", e)
        return False


def _ensure_ssl_foreign_key(engine: Engine) -> None:
    """Add ForeignKey on ps_ssl_certificate.cluster_id if missing (SQLite only)."""
    if not is_sqlite(str(engine.url)):
        return
    inspector = inspect(engine)
    try:
        fks = inspector.get_foreign_keys("ps_ssl_certificate")
        if any(fk["constrained_columns"] == ["cluster_id"] for fk in fks):
            return  # FK already exists
    except Exception:
        return
    # SQLite cannot ALTER TABLE ADD CONSTRAINT; recreate table if needed
    logger.warning("ps_ssl_certificate.cluster_id lacks ForeignKey - table must be recreated manually for CASCADE support")


def _ensure_index(engine: Engine, table: str, index_name: str, columns: list[str]) -> None:
    inspector = inspect(engine)
    try:
        existing = {idx["name"] for idx in inspector.get_indexes(table)}
    except Exception:
        return
    if index_name in existing:
        return
    cols = ", ".join(f'"{c}"' for c in columns)
    with engine.connect() as conn:
        try:
            conn.execute(text(f'CREATE INDEX IF NOT EXISTS "{index_name}" ON "{table}" ({cols})'))
            conn.commit()
            logger.info("Created index %s on %s(%s)", index_name, table, ", ".join(columns))
        except Exception as e:
            conn.rollback()
            logger.warning("Could not create index %s: %s", index_name, e)


def _ensure_unique_index(engine: Engine, table: str, index_name: str, columns: list[str]) -> None:
    """Create a UNIQUE index, clearing duplicate rows first (keeps latest by id)."""
    inspector = inspect(engine)
    try:
        existing = {idx["name"] for idx in inspector.get_indexes(table)}
    except Exception:
        return
    if index_name in existing:
        return
    with engine.connect() as conn:
        try:
            cols = ", ".join(f'"{c}"' for c in columns)
            conn.execute(
                text(
                    f'DELETE FROM "{table}" WHERE id NOT IN ('
                    f'SELECT MAX(id) FROM "{table}" GROUP BY {cols})'
                )
            )
            conn.execute(
                text(f'CREATE UNIQUE INDEX IF NOT EXISTS "{index_name}" ON "{table}" ({cols})')
            )
            conn.commit()
            logger.info("Created unique index %s on %s(%s)", index_name, table, ", ".join(columns))
        except Exception as e:
            conn.rollback()
            logger.warning("Could not create unique index %s: %s", index_name, e)
