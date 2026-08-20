"""Direct streaming database migration (B1).

Design (see openspec/changes/support-postgres-database/design.md D3):
- Iterate business tables in dependency order (FK-safe).
- Copy rows via SQLAlchemy Core reflection so IDs are preserved verbatim and
  foreign-key networks stay intact across SQLite/PostgreSQL.
- Reset sequences after migration (PG setval; SQLite auto max+1).
"""

import logging

from sqlalchemy import MetaData, Table, inspect, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base, build_sync_engine_for, is_sqlite
from app.core.db_migration import CLEAR_ORDER, DEPENDENCY_ORDER, tables_for_migration
from app.models.db_migration import DbMigrationLog

logger = logging.getLogger(__name__)

BATCH_SIZE = 500


def target_is_empty(target_conn) -> bool:
    """True if no business table in the target has any rows (empty target)."""
    engine = build_sync_engine_for(target_conn)
    try:
        Base.metadata.create_all(engine)
        tables = tables_for_migration(True)
        with engine.connect() as conn:
            for table in tables:
                count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                if count:
                    return False
        return True
    finally:
        engine.dispose()


def validate_migration_direction(source_id: str, target_id: str, active_id: str) -> None:
    """Reject invalid migration directions (G8)."""
    if source_id == target_id:
        raise ValueError("源数据库与目标数据库不能相同")
    if target_id == active_id:
        raise ValueError("不能迁移到当前正在使用的数据库")


def migrate_direct(
    source_conn,
    target_conn,
    include_logs=True,
    progress_cb=None,
    mode: str = "replace",
    confirmed_clear: bool = False,
) -> int:
    """Stream-copy all business tables from source_conn to target_conn.

    Replace mode: an empty target imports directly; a non-empty target requires
    confirmed_clear=True and is cleared child-first before import (G1).
    Returns the number of tables migrated. Source is read-only.
    """
    src_engine = build_sync_engine_for(source_conn)
    dst_engine = build_sync_engine_for(target_conn)
    try:
        if mode == "replace" and not target_is_empty(target_conn):
            if not confirmed_clear:
                raise ValueError("目标数据库非空，需要勾选「我了解将清空目标库」确认后替换")
            _clear_target(dst_engine)
        Base.metadata.create_all(dst_engine)
        tables = set(tables_for_migration(include_logs))
        total = len(tables)
        done = 0
        for batch in DEPENDENCY_ORDER:
            for table in batch:
                if table not in tables:
                    continue
                _copy_table(src_engine, dst_engine, table)
                done += 1
                if progress_cb:
                    progress_cb(done, total)
        _reset_sequences(dst_engine, tables)
        return done
    finally:
        src_engine.dispose()
        dst_engine.dispose()


def _clear_target(dst_engine) -> None:
    """Delete all rows child-first (FK-safe teardown)."""
    with dst_engine.begin() as conn:
        for batch in CLEAR_ORDER:
            for table in batch:
                conn.execute(text(f"DELETE FROM {table}"))
        logger.info("Cleared target database")


def _copy_table(src_engine, dst_engine, table: str) -> None:
    src_meta = MetaData()
    src_table = Table(table, src_meta, autoload_with=src_engine)
    dst_meta = MetaData()
    dst_table = Table(table, dst_meta, autoload_with=dst_engine)
    cols = src_table.columns.keys()

    with src_engine.connect() as src_conn:
        rows = src_conn.execute(src_table.select()).mappings().all()

    with dst_engine.begin() as dst_conn:
        for i in range(0, len(rows), BATCH_SIZE):
            chunk = rows[i : i + BATCH_SIZE]
            for row in chunk:
                dst_conn.execute(dst_table.insert().values({c: row[c] for c in cols}))
    logger.info("Migrated table %s (%d rows)", table, len(rows))


async def record_migration_log(
    db: AsyncSession,
    direction: str,
    source_connection: str,
    target_connection: str,
    mode: str = "replace",
    status: str = "success",
    include_logs: bool = True,
    tables_count: int = 0,
    backup_path: str = "",
    error_message: str = "",
) -> None:
    """Persist a migration operation record to the active database."""
    db.add(
        DbMigrationLog(
            direction=direction,
            source_connection=source_connection,
            target_connection=target_connection,
            mode=mode,
            status=status,
            include_logs=1 if include_logs else 0,
            tables_count=tables_count,
            backup_path=backup_path or None,
            error_message=error_message or None,
        )
    )
    await db.commit()


def _reset_sequences(dst_engine, tables) -> None:
    if is_sqlite(str(dst_engine.url)):
        return
    insp = inspect(dst_engine)
    with dst_engine.begin() as conn:
        for table in tables:
            pk_cols = (insp.get_pk_constraint(table) or {}).get("constrained_columns") or []
            if len(pk_cols) != 1:
                continue
            pk_col = pk_cols[0]
            seq = conn.execute(
                text("SELECT pg_get_serial_sequence(:t, :c)"),
                {"t": table, "c": pk_col},
            ).scalar()
            if not seq:
                continue
            conn.execute(
                text(f"SELECT setval(:seq, COALESCE((SELECT MAX({pk_col}) FROM {table}), 1))"),
                {"seq": seq},
            )
