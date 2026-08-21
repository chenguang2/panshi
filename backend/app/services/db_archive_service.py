"""B2 archive export/import (see design D4, G10).

Archive layout:
  meta.json       export metadata (version, app_version, row counts)
  schema.json     per-table column definitions (inspector)
  ddl/<table>.sql raw CREATE TABLE DDL (best-effort, dialect-dependent)
  data/<table>.jsonl  one JSON object per row
"""

import json
import logging
import os
import zipfile
from datetime import datetime

from sqlalchemy import Boolean as SA_Boolean
from sqlalchemy import DateTime as SA_DateTime
from sqlalchemy import MetaData, Table, inspect, text

from app.core.database import Base, build_sync_engine_for
from app.core.db_migration import tables_for_migration
from app.services.db_migration_service import _clear_target, _reset_sequences, target_is_empty

logger = logging.getLogger(__name__)

ARCHIVE_VERSION = 1
APP_VERSION = "1.0.0"


def export_archive(source_conn, output_path: str) -> None:
    """Dump source_conn to a zip archive at output_path."""
    engine = build_sync_engine_for(source_conn)
    insp = inspect(engine)
    tables = tables_for_migration(True)
    meta = {
        "version": ARCHIVE_VERSION,
        "app_version": APP_VERSION,
        "exported_at": datetime.utcnow().isoformat(),
        "tables": {},
    }
    schema = {}
    ddl = {}
    data = {}

    with engine.connect() as conn:
        for table in tables:
            schema[table] = insp.get_columns(table)
            ddl[table] = _get_ddl(conn, table)
            rows = conn.execute(text(f"SELECT * FROM {table}")).mappings().all()
            data[table] = [dict(r) for r in rows]
            meta["tables"][table] = len(rows)

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("meta.json", json.dumps(meta, ensure_ascii=False))
        z.writestr("schema.json", json.dumps(schema, default=str, ensure_ascii=False))
        for table, d in ddl.items():
            z.writestr(f"ddl/{table}.sql", d or "")
        for table, rows in data.items():
            payload = "\n".join(json.dumps(r, ensure_ascii=False) for r in rows)
            z.writestr(f"data/{table}.jsonl", payload)
    engine.dispose()
    logger.info("Exported archive with %d tables", len(tables))


def _get_ddl(conn, table: str) -> str:
    row = conn.execute(
        text("SELECT sql FROM sqlite_master WHERE type='table' AND name=:n"),
        {"n": table},
    ).fetchone()
    return row[0] if row and row[0] else ""


def import_archive(archive_path: str, target_conn, confirmed_clear: bool = False) -> None:
    """Import rows from a B2 archive into target_conn (G10 semantics)."""
    if not os.path.exists(archive_path):
        raise ValueError("归档文件不存在")

    with zipfile.ZipFile(archive_path) as z:
        meta = json.loads(z.read("meta.json"))
        _validate_meta(meta)

        engine = build_sync_engine_for(target_conn)
        try:
            if not target_is_empty(target_conn):
                if not confirmed_clear:
                    raise ValueError("目标数据库非空，需要勾选「我了解将清空目标库」确认后替换")
                _clear_target(engine)
                # 防御：残留旧 schema 表（列不全）会导致后续 create_all 不重建、FK 建表失败
                Base.metadata.drop_all(engine)
            Base.metadata.create_all(engine)
            tables = tables_for_migration(True)
            for table in tables:
                member = f"data/{table}.jsonl"
                if member not in z.namelist():
                    continue
                rows = _read_jsonl(z.read(member))
                _insert_rows(engine, table, rows)
            _reset_sequences(engine, set(tables))
        finally:
            engine.dispose()


def _validate_meta(meta: dict) -> None:
    if meta.get("version", 0) > ARCHIVE_VERSION:
        raise ValueError("归档文件格式版本高于当前应用，无法导入")
    app_ver = meta.get("app_version", "")
    if app_ver and app_ver > APP_VERSION:
        raise ValueError("归档文件来自更新版本的应用，请先升级后再导入")


def _read_jsonl(content: bytes) -> list[dict]:
    out = []
    for line in content.decode("utf-8").split("\n"):
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


def _insert_rows(engine, table: str, rows: list[dict]) -> None:
    if not rows:
        return
    dst_meta = MetaData()
    dst_table = Table(table, dst_meta, autoload_with=engine)
    col_types = {c.name: c.type for c in dst_table.columns}
    with engine.begin() as conn:
        for row in rows:
            conn.execute(dst_table.insert().values(_coerce_row(row, col_types)))


def _coerce_row(row: dict, col_types: dict) -> dict:
    coerced = {}
    for name, val in row.items():
        col_type = col_types.get(name)
        if val is None:
            coerced[name] = None
        elif isinstance(col_type, SA_DateTime) and isinstance(val, str):
            coerced[name] = datetime.fromisoformat(val)
        elif isinstance(col_type, SA_Boolean):
            coerced[name] = bool(val)
        else:
            coerced[name] = val
    return coerced
