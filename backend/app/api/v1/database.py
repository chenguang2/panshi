"""Database management API — connection CRUD, status, test, switch, migration.

Design (see openspec/changes/support-postgres-database/design.md D6):
- All endpoints admin + database_management permission guarded.
- Passwords always masked in responses.
- Connection config stored in db_config.json (outside the DB).
"""

import asyncio
import json
import logging
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from starlette.requests import ClientDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core import db_config, maintenance
from app.core.database import get_db, build_sync_engine_for, AsyncSessionLocal
from app.core.db_config import ConnectionConfig, DbConfig, encrypt_password
from app.services.audit import log_audit
from app.core.deps import require_permission as require_db_admin
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
from app.services.db_migration_service import MigrationCancelled, MigrationProgressEvent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/database", tags=["database"])


def _get_config() -> DbConfig:
    return db_config.load_config()


def _save(cfg: DbConfig) -> None:
    db_config.save_config(cfg)


def _cleanup_old_backups(backup_dir: Path, keep: int = 10) -> None:
    """Keep only the most recent `keep` backup files, delete older ones."""
    try:
        backups = sorted(backup_dir.glob("migration_*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in backups[keep:]:
            old.unlink(missing_ok=True)
            logger.info("Cleaned up old backup: %s", old.name)
    except Exception as e:
        logger.warning("Failed to clean up old backups: %s", e)


@router.get("/status")
async def get_status(current_user: User = Depends(require_db_admin('database_management'))):
    cfg = _get_config()
    active = cfg.get_active()
    return {
        "active": active.public_dict() if active else None,
        "connections_count": len(cfg.connections),
        "version": cfg.version,
    }


@router.get("/connections")
async def list_connections(current_user: User = Depends(require_db_admin('database_management'))):
    cfg = _get_config()
    return [c.public_dict() for c in cfg.connections]


@router.post("/connections")
async def create_connection(
    body: ConnectionCreate,
    current_user: User = Depends(require_db_admin('database_management')),
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
    current_user: User = Depends(require_db_admin('database_management')),
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
    current_user: User = Depends(require_db_admin('database_management')),
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
    current_user: User = Depends(require_db_admin('database_management')),
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
    current_user: User = Depends(require_db_admin('database_management')),
):
    from app.services import db_switch_service
    result = await db_switch_service.perform_switch(body.connection_id, db)
    log_audit(db, user=current_user, action="switch_database", resource="database", detail=f"切换数据库连接 {body.connection_id}")
    return result


@router.post("/migrate")
async def migrate_database(
    body: MigrateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin('database_management')),
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
    backup_path = ""
    try:
        # Auto-backup before clear migration
        if body.confirmed_clear:
            from pathlib import Path
            from datetime import datetime
            backup_dir = Path("./data/backups")
            backup_dir.mkdir(parents=True, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = str(backup_dir / f"migration_{body.source_id}_to_{body.target_id}_{ts}.zip")
            db_archive_service.export_archive(source, backup_path)
            # Retention: keep most recent 10 backups
            _cleanup_old_backups(backup_dir)

        table_details = db_migration_service.migrate_direct(
            source, target,
            include_logs=body.include_logs,
            mode=body.mode,
            confirmed_clear=body.confirmed_clear,
        )
    finally:
        maintenance.set_migration_in_progress(False)

    tables_count = len(table_details)
    await db_migration_service.record_migration_log(
        db,
        direction=_direction_label(source, target),
        source_connection=body.source_id,
        target_connection=body.target_id,
        mode=body.mode,
        status="success",
        include_logs=body.include_logs,
        tables_count=tables_count,
        backup_path=backup_path,
    )
    log_audit(db, user=current_user, action="migrate_database", resource="database", detail=f"迁移 {body.source_id} → {body.target_id}（{tables_count} 张表）")
    return {
        "message": f"迁移完成，共迁移 {tables_count} 张表",
        "tables_migrated": tables_count,
        "tables": table_details,
        "backup_path": backup_path,
    }


@router.post("/migrate-stream")
async def migrate_database_stream(
    body: MigrateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin('database_management')),
):
    """SSE streaming migration endpoint with real-time progress."""
    cfg = _get_config()
    source = cfg.get_connection(body.source_id)
    target = cfg.get_connection(body.target_id)
    if not source or not target:
        raise HTTPException(status_code=404, detail="源或目标连接不存在")
    if body.mode != "repeat" and body.mode != "replace":
        raise HTTPException(status_code=400, detail="不支持该迁移模式，仅支持替换模式")
    try:
        db_migration_service.validate_migration_direction(body.source_id, body.target_id, cfg.active)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not body.confirmed_clear and not db_migration_service.target_is_empty(target):
        raise HTTPException(status_code=400, detail="目标数据库非空，需要勾选「我了解将清空目标库」确认后替换")

    # Cooperative cancellation event
    cancel_event = threading.Event()
    timeout = body.timeout or 300

    async def event_generator():
        """SSE generator for streaming migration progress."""
        # Thread-safe queue to bridge callbacks from worker thread to async generator
        import queue
        event_queue: queue.Queue = queue.Queue()

        def on_progress(done, total, table_name="", copied_rows=0, total_rows=0, skipped=False):
            """Table-level progress callback (called from worker thread)."""
            event_queue.put_nowait({
                "type": "table_progress",
                "table_index": done,
                "total_tables": total,
                "table_name": table_name,
                "copied_rows": copied_rows,
                "total_rows": total_rows,
                "skipped": skipped,
            })

        def on_backup_progress(done, total):
            """Backup progress callback (called from worker thread)."""
            event_queue.put_nowait({
                "type": "backup_progress",
                "done": done,
                "total": total,
            })

        def _send_event(data):
            """Send one SSE event to client."""
            return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

        async def _drain_queue():
            """Yield all queued events, yield nothing if empty."""
            while not event_queue.empty():
                ev = event_queue.get_nowait()
                yield _send_event(ev)

        maintenance.set_migration_in_progress(True)
        backup_path = ""
        loop = asyncio.get_event_loop()
        try:
            # Auto-backup before clear migration
            if body.confirmed_clear:
                backup_dir = Path("./data/backups")
                backup_dir.mkdir(parents=True, exist_ok=True)
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_path = str(backup_dir / f"migration_{body.source_id}_to_{body.target_id}_{ts}.zip")

                # Run backup in thread — poll queue for progress
                def run_backup():
                    db_archive_service.export_archive(source, backup_path, progress_cb=on_backup_progress)

                backup_task = loop.run_in_executor(None, run_backup)
                backup_deadline = asyncio.get_event_loop().time() + timeout

                try:
                    while not backup_task.done():
                        if asyncio.get_event_loop().time() > backup_deadline:
                            cancel_event.set()
                            yield _send_event({"type": "error", "message": "备份超时"})
                            return
                        while not event_queue.empty():
                            ev = event_queue.get_nowait()
                            yield _send_event(ev)
                        await asyncio.sleep(0.2)
                    # Final drain
                    while not event_queue.empty():
                        ev = event_queue.get_nowait()
                        yield _send_event(ev)
                    backup_task.result()  # Raise if backup failed
                except Exception as e:
                    yield _send_event({"type": "error", "message": f"备份失败: {e}"})
                    return

                _cleanup_old_backups(backup_dir)
                # Drain any remaining backup progress events
                async for chunk in _drain_queue():
                    yield chunk
                # Send backup complete event
                yield _send_event({"type": "backup_complete", "path": backup_path})

            # Run migration in thread — poll queue for progress while thread runs
            def run_migration():
                return db_migration_service.migrate_direct(
                    source, target,
                    include_logs=body.include_logs,
                    mode=body.mode,
                    confirmed_clear=body.confirmed_clear,
                    cancel_event=cancel_event,
                    progress_cb=on_progress,
                )

            migration_task = loop.run_in_executor(None, run_migration)
            deadline = asyncio.get_event_loop().time() + timeout

            try:
                # Poll the event queue while the migration thread runs
                while not migration_task.done():
                    # Check timeout
                    if asyncio.get_event_loop().time() > deadline:
                        cancel_event.set()
                        yield _send_event({"type": "error", "message": "迁移超时"})
                        return
                    # Drain queued progress events
                    while not event_queue.empty():
                        ev = event_queue.get_nowait()
                        yield _send_event(ev)
                    # Brief sleep to yield control back to the event loop
                    await asyncio.sleep(0.2)

                # Final drain after thread finishes
                while not event_queue.empty():
                    ev = event_queue.get_nowait()
                    yield _send_event(ev)

                # Get result (may raise)
                table_details = migration_task.result()
            except MigrationCancelled:
                yield _send_event({"type": "error", "message": "迁移已取消"})
                return
            except Exception as e:
                yield _send_event({"type": "error", "message": f"迁移失败: {e}"})
                return

            # Send final success event
            tables_count = len(table_details)
            success_msg = f"迁移完成，共迁移 {tables_count} 张表"
            yield _send_event({
                "type": "complete",
                "message": success_msg,
                "tables_migrated": tables_count,
                "tables": table_details,
                "backup_path": backup_path,
            })

            # Write migration log and audit log in generator
            async with AsyncSessionLocal() as log_db:
                await db_migration_service.record_migration_log(
                    log_db,
                    direction=_direction_label(source, target),
                    source_connection=body.source_id,
                    target_connection=body.target_id,
                    mode=body.mode,
                    status="success",
                    include_logs=body.include_logs,
                    tables_count=tables_count,
                    backup_path=backup_path,
                )
                log_audit(log_db, user=current_user, action="migrate_database", resource="database", detail=f"迁移 {body.source_id} → {body.target_id}（{tables_count} 张表）")

        except ClientDisconnect:
            # Client disconnected, set cancel event to stop migration thread
            cancel_event.set()
            logger.info("Migration SSE client disconnected, cancelling migration")
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'迁移失败: {e}'})}\n\n"
        finally:
            maintenance.set_migration_in_progress(False)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/export")
async def export_archive(
    body: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin('database_management')),
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
    log_audit(db, user=current_user, action="export_database", resource="database", detail=f"导出数据库 {body.source_id} → {path}")
    return {"message": "导出完成", "archive_path": path}


@router.post("/import")
async def import_archive(
    body: ImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin('database_management')),
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
    log_audit(db, user=current_user, action="import_database", resource="database", detail=f"导入归档 {body.archive_path} → {body.target_id}")
    return {"message": "归档导入完成"}


@router.get("/history")
async def migration_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin('database_management')),
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
