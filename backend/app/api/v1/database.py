"""Database management API — connection CRUD, status, test, switch, migration.

Design (see openspec/changes/support-postgres-database/design.md D6):
- All endpoints admin + database_management permission guarded.
- Passwords always masked in responses.
- Connection config stored in db_config.json (outside the DB).
"""

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core import db_config, maintenance
from app.core.database import get_db, build_sync_engine_for
from app.core.db_config import ConnectionConfig, DbConfig, encrypt_password
from app.core.security import decode_access_token
from app.models.user import User
from app.models.db_migration import DbMigrationLog
from app.schemas.database import (
    ConnectionCreate,
    ConnectionUpdate,
    ExportRequest,
    ImportRequest,
    MigrateRequest,
    SwitchRequest,
)
from app.services import db_archive_service, db_migration_service

router = APIRouter(prefix="/database", tags=["database"])


async def require_db_admin(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Admin + database_management permission guard."""
    if not authorization:
        raise HTTPException(status_code=401, detail="未认证")
    try:
        token = authorization[7:] if authorization.startswith("Bearer ") else authorization
        payload = decode_access_token(token)
        if payload is None or payload.get("sub") is None:
            raise HTTPException(status_code=401, detail="未认证")
        user_id = int(payload["sub"])
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="需要管理员权限")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="未认证")


def _get_config() -> DbConfig:
    return db_config.load_config()


def _save(cfg: DbConfig) -> None:
    db_config.save_config(cfg)


@router.get("/status")
async def get_status(current_user: User = Depends(require_db_admin)):
    cfg = _get_config()
    active = cfg.get_active()
    return {
        "active": active.public_dict() if active else None,
        "connections_count": len(cfg.connections),
        "version": cfg.version,
    }


@router.get("/connections")
async def list_connections(current_user: User = Depends(require_db_admin)):
    cfg = _get_config()
    return [c.public_dict() for c in cfg.connections]


@router.post("/connections")
async def create_connection(
    body: ConnectionCreate,
    current_user: User = Depends(require_db_admin),
):
    cfg = _get_config()
    conn_id = _new_id(cfg)
    conn = ConnectionConfig(
        id=conn_id,
        type=body.type,
        name=body.name,
        path=body.path,
        host=body.host,
        port=body.port or 5432,
        database=body.database,
        username=body.username,
        password_enc=encrypt_password(body.password) if body.password else None,
        ssl=body.ssl,
    )
    cfg.connections.append(conn)
    _save(cfg)
    return conn.public_dict()


@router.put("/connections/{conn_id}")
async def update_connection(
    conn_id: str,
    body: ConnectionUpdate,
    current_user: User = Depends(require_db_admin),
):
    cfg = _get_config()
    conn = cfg.get_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="连接不存在")
    if body.name is not None:
        conn.name = body.name
    if body.path is not None:
        conn.path = body.path
    if body.host is not None:
        conn.host = body.host
    if body.port is not None:
        conn.port = body.port
    if body.database is not None:
        conn.database = body.database
    if body.username is not None:
        conn.username = body.username
    if body.ssl is not None:
        conn.ssl = body.ssl
    if body.password is not None:
        conn.password_enc = encrypt_password(body.password)
    _save(cfg)
    return conn.public_dict()


@router.delete("/connections/{conn_id}")
async def delete_connection(
    conn_id: str,
    current_user: User = Depends(require_db_admin),
):
    cfg = _get_config()
    if conn_id == cfg.active:
        raise HTTPException(status_code=400, detail="不能删除当前激活的数据库，请先切换")
    conn = cfg.get_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="连接不存在")
    cfg.connections = [c for c in cfg.connections if c.id != conn_id]
    _save(cfg)
    return {"message": "连接已删除"}


@router.post("/connections/{conn_id}/test")
async def test_connection(
    conn_id: str,
    current_user: User = Depends(require_db_admin),
):
    cfg = _get_config()
    conn = cfg.get_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="连接不存在")
    try:
        ok, detail = await asyncio.wait_for(
            _do_test(conn), timeout=3.0
        )
    except asyncio.TimeoutError:
        return {"success": False, "detail": "连接超时"}
    return {"success": ok, "detail": detail}


async def _do_test(conn: ConnectionConfig):
    try:
        engine = build_sync_engine_for(conn)
        with engine.connect() as c:
            c.execute(__import__("sqlalchemy").text("SELECT 1"))
        engine.dispose()
        return True, "连接成功"
    except Exception as e:
        return False, str(e)


@router.post("/switch")
async def switch_database(
    body: SwitchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin),
):
    from app.services import db_switch_service
    result = await db_switch_service.perform_switch(body.connection_id, db)
    return result


@router.post("/migrate")
async def migrate_database(
    body: MigrateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin),
):
    cfg = _get_config()
    source = cfg.get_connection(body.source_id)
    target = cfg.get_connection(body.target_id)
    if not source or not target:
        raise HTTPException(status_code=404, detail="源或目标连接不存在")
    # 主规格（database-management）：迁移为单向快照语义，仅支持替换模式
    if body.mode != "replace":
        raise HTTPException(status_code=400, detail="不支持该迁移模式，仅支持替换模式")
    try:
        db_migration_service.validate_migration_direction(body.source_id, body.target_id, cfg.active)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # confirmed_clear=True 时跳过 target_is_empty（其内部 create_all 会创建残缺表）
    if not body.confirmed_clear and not db_migration_service.target_is_empty(target):
        raise HTTPException(status_code=400, detail="目标数据库非空，需要勾选「我了解将清空目标库」确认后替换")

    maintenance.set_migration_in_progress(True)
    try:
        done = db_migration_service.migrate_direct(
            source, target,
            include_logs=body.include_logs,
            mode=body.mode,
            confirmed_clear=body.confirmed_clear,
        )
    finally:
        maintenance.set_migration_in_progress(False)

    await db_migration_service.record_migration_log(
        db,
        direction=_direction_label(source, target),
        source_connection=body.source_id,
        target_connection=body.target_id,
        mode=body.mode,
        status="success",
        include_logs=body.include_logs,
        tables_count=done,
    )
    return {"message": f"迁移完成，共迁移 {done} 张表", "tables_migrated": done}


@router.post("/export")
async def export_archive(
    body: ExportRequest,
    current_user: User = Depends(require_db_admin),
):
    cfg = _get_config()
    source = cfg.get_connection(body.source_id)
    if not source:
        raise HTTPException(status_code=404, detail="连接不存在")
    path = _archive_output_path()
    try:
        db_archive_service.export_archive(source, path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败: {e}")
    return {"message": "导出完成", "archive_path": path}


@router.post("/import")
async def import_archive(
    body: ImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin),
):
    cfg = _get_config()
    target = cfg.get_connection(body.target_id)
    if not target:
        raise HTTPException(status_code=404, detail="目标连接不存在")
    try:
        db_migration_service.validate_migration_direction("__archive__", body.target_id, cfg.active)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        db_archive_service.import_archive(body.archive_path, target, confirmed_clear=body.confirmed_clear)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db_migration_service.record_migration_log(
        db,
        direction="archive_import",
        source_connection=body.archive_path,
        target_connection=body.target_id,
        mode="replace",
        status="success",
    )
    return {"message": "归档导入完成"}


@router.get("/history")
async def migration_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin),
):
    result = await db.execute(
        select(DbMigrationLog).order_by(DbMigrationLog.id.desc()).limit(100)
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "direction": log.direction,
            "source_connection": log.source_connection,
            "target_connection": log.target_connection,
            "mode": log.mode,
            "status": log.status,
            "tables_count": log.tables_count,
            "backup_path": log.backup_path,
            "error_message": log.error_message,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


def _direction_label(source, target) -> str:
    return f"{source.type}_to_{target.type}"


def _archive_output_path() -> str:
    import datetime
    import os

    base = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
        "data", "archives",
    )
    os.makedirs(base, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    return os.path.join(base, f"panshi-backup-{stamp}.zip")


def _new_id(cfg: DbConfig) -> str:
    import uuid
    while True:
        cid = "conn_" + uuid.uuid4().hex[:8]
        if cfg.get_connection(cid) is None:
            return cid
