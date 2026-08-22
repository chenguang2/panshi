"""Direct streaming database migration (B1).

Design (see openspec/changes/support-postgres-database/design.md D3):
- Iterate business tables in dependency order (FK-safe).
- Copy rows via SQLAlchemy Core reflection so IDs are preserved verbatim and
  foreign-key networks stay intact across SQLite/PostgreSQL.
- Reset sequences after migration (PG setval; SQLite auto max+1).
"""

import logging
from collections.abc import Callable
from inspect import signature
from typing import Any

from sqlalchemy import ColumnDefault, MetaData, Table, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base, build_sync_engine_for, is_sqlite
from app.core.db_config import ConnectionConfig
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
        if mode == "replace":
            # 关键修复：replace + confirmed_clear 时连到 postgres 库把目标库删了重建，最彻底
            # 跳过 target_is_empty 检查（其内部 create_all 会重建残缺表）
            if confirmed_clear:
                # 不删库（可能无权限），改为在现有库彻底清表
                from sqlalchemy import inspect
                from sqlalchemy.exc import OperationalError
                try:
                    insp = inspect(dst_engine)
                    # 注意：不要用 SET session_replication_role = replica 禁用外键检查——
                    # 该参数仅 superuser 可设置，普通业务账号会报 InsufficientPrivilege；
                    # 且 DROP TABLE ... CASCADE 是 DDL 级联，本就不触发行级外键校验。
                    # SQLite 方言不支持 CASCADE 关键字（其 DDL 亦不受外键拦截），需按方言区分；
                    # SQLite 引擎全局开启 foreign_keys=ON，删表前需临时关闭（连接级、无需特权）
                    sqlite_target = is_sqlite(str(dst_engine.url))
                    cascade = "" if sqlite_target else " CASCADE"
                    with dst_engine.connect() as conn:
                        if sqlite_target:
                            conn.exec_driver_sql("PRAGMA foreign_keys = OFF")
                        tables = insp.get_table_names()
                        for table in tables:
                            conn.execute(text(f'DROP TABLE IF EXISTS "{table}"{cascade}'))
                        conn.commit()
                except OperationalError as e:
                    if "database" in str(e).lower() and "does not exist" in str(e).lower():
                        raise ValueError(f"目标数据库 {target_conn.database} 不存在，请先在 PostgreSQL 中手动创建该数据库") from e
                    raise
                Base.metadata.create_all(dst_engine)
            else:
                # 非 confirmed_clear：检查目标库是否为空，非空则报错
                if not target_is_empty(target_conn):
                    raise ValueError("目标数据库非空，需要勾选「我了解将清空目标库」确认后替换")
                # 空目标：正常 create_all
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
        synced = _sync_schema_with_models(dst_engine)
        if synced:
            logger.info("Schema sync: 补齐目标库缺失模型列 %d 个", synced)
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
    # 目标侧以物理反射为准：目标库可能是旧 schema（如 legacy SQLite 缺新列），
    # 按模型元数据拼 INSERT 会引用物理不存在的列导致 OperationalError；
    # 共有列过滤同时挡掉源库残留历史列
    dst_model = Base.metadata.tables.get(table)
    if inspect(dst_engine).has_table(table):
        dst_meta = MetaData()
        dst_table = Table(table, dst_meta, autoload_with=dst_engine)
    elif dst_model is not None:
        dst_table = dst_model  # 表尚未物化（create_all 将按模型建表），模型即物理
    else:
        logger.warning("迁移跳过 %s：目标库无此表且无模型定义", table)
        return
    phys_cols = set(dst_table.columns.keys())
    cols = [c for c in src_table.columns.keys() if c in phys_cols]
    # 反射插入不触发模型自动默认值，需对「源缺列但物理目标有列」显式注入 Python 默认值
    defaults, default_fns = _model_python_defaults(dst_model, phys_cols, cols)

    with src_engine.connect() as src_conn:
        rows = src_conn.execute(src_table.select()).mappings().all()

    copied = skipped = 0
    for i in range(0, len(rows), BATCH_SIZE):
        ok, bad = _insert_chunk(
            dst_engine,
            dst_table,
            cols,
            rows[i : i + BATCH_SIZE],
            table,
            defaults,
            default_fns,
        )
        copied += ok
        skipped += bad
    logger.info("Migrated table %s (%d rows, %d skipped)", table, copied, skipped)


def _model_python_defaults(
    dst_model: Table | None, phys_cols: set[str], cols: list[str]
) -> tuple[dict[str, Any], dict[str, Callable[[], Any]]]:
    """收集模型列的 Python 端默认值（仅限源库缺失、物理目标存在的列）。

    返回 (标量默认值, 零参可调用默认值)；可调用项由调用方逐行求值，
    保证 uuid4/timestamp 类默认值每行独立（与模型元数据插入语义一致）。
    """
    scalars: dict[str, Any] = {}
    callables: dict[str, Callable[[], Any]] = {}
    if dst_model is None:
        return scalars, callables
    for col in dst_model.columns:
        d = col.default
        if d is None or col.name not in phys_cols or col.name in cols:
            continue
        if not isinstance(d, ColumnDefault):
            continue
        if d.is_scalar:
            scalars[col.name] = d.arg
        elif d.is_callable:
            fn = d.arg
            try:
                requires_ctx = bool(signature(fn).parameters)
            except (TypeError, ValueError):
                requires_ctx = False
            callables[col.name] = (lambda ctx_fn=fn: ctx_fn(None)) if requires_ctx else fn
    return scalars, callables


def _row_values(
    cols: list[str],
    row,
    defaults: dict[str, Any],
    default_fns: dict[str, Callable[[], Any]],
) -> dict[str, Any]:
    base = {c: row[c] for c in cols}
    base.update(defaults)
    base.update({k: fn() for k, fn in default_fns.items()})
    return base


def _insert_chunk(
    dst_engine,
    dst_table,
    cols,
    chunk,
    table,
    defaults=None,
    default_fns=None,
) -> tuple[int, int]:
    """整批原子插入；遇约束冲突改为逐行插入并跳过脏行（源库可能有历史孤儿数据）。"""
    defaults = defaults or {}
    default_fns = default_fns or {}
    values = [_row_values(cols, row, defaults, default_fns) for row in chunk]
    try:
        with dst_engine.begin() as conn:
            conn.execute(dst_table.insert(), values)
        return len(values), 0
    except IntegrityError:
        pass
    copied = skipped = 0
    for row in chunk:
        try:
            with dst_engine.begin() as conn:
                conn.execute(
                    dst_table.insert().values(_row_values(cols, row, defaults, default_fns))
                )
            copied += 1
        except IntegrityError:
            skipped += 1
            logger.warning("迁移跳过 %s.id=%s：目标库约束冲突（源库脏数据）", table, row.get("id"))
    return copied, skipped


def _sql_literal(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return "NULL"


def _sync_schema_with_models(dst_engine) -> int:
    """按模型元数据补齐目标库缺失的列，返回新增列数。

    背景：Base.metadata.create_all 只创建缺失的表、不会给已存在的表加列；
    反向回迁到旧 schema 库（如 legacy SQLite）时物理列集落后于当前模型，
    迁移虽成功但应用启动后 ORM 查询会因「no such column」崩溃。
    此处在数据复制完成后对目标库逐表比对模型，ALTER TABLE ADD COLUMN 补齐。
    """
    insp = inspect(dst_engine)
    added = 0
    for table in tables_for_migration(True):
        model = Base.metadata.tables.get(table)
        if model is None or not insp.has_table(table):
            continue
        phys = {c["name"] for c in insp.get_columns(table)}
        for col in model.columns:
            if col.name in phys:
                continue
            ddl_type = col.type.compile(dst_engine.dialect)
            clause = f'ALTER TABLE "{table}" ADD COLUMN "{col.name}" {ddl_type}'
            d = col.default
            if isinstance(d, ColumnDefault) and d.is_scalar and d.arg is not None:
                clause += f" DEFAULT {_sql_literal(d.arg)} NOT NULL"
            elif not col.nullable:
                logger.warning(
                    "Schema sync: %s.%s 无默认值且 NOT NULL，按可空补齐", table, col.name
                )
            try:
                with dst_engine.begin() as conn:
                    conn.execute(text(clause))
                added += 1
                logger.info("Schema sync: %s.%s 已补齐 (%s)", table, col.name, ddl_type)
            except Exception as e:
                logger.warning("Schema sync: 无法补齐 %s.%s: %s", table, col.name, e)
    return added


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
