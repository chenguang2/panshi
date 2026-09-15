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
import time
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
from app.services.audit import enrich_audit, log_audit
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


async def _write_failed_migration_log(
    source, target, body, user, error_message: str, duration_seconds: float | None = None, started_at=None
) -> None:
    """迁移失败/超时/断连时写入 status=failed 迁移记录与审计日志（任务 2.5）。

    SSE generator 生命周期超出请求依赖注入，与成功路径一致使用独立
    AsyncSessionLocal。写日志自身失败只记日志，不影响主流程收尾。
    """
    try:
        async with AsyncSessionLocal() as log_db:
            await db_migration_service.record_migration_log(
                log_db,
                direction=_direction_label(source, target),
                source_connection=body.source_id,
                target_connection=body.target_id,
                mode=body.mode,
                status="failed",
                include_logs=body.include_logs,
                tables_count=0,
                error_message=error_message,
                duration_seconds=duration_seconds,
                started_at=started_at,
            )
            log_audit(log_db, user=user, action="migrate_database", resource="database",
                      detail=f"迁移失败 {body.source_id} → {body.target_id}：{error_message}")
    except Exception as e:
        logger.exception("写入失败迁移记录时出错: %s", e)


# 迁移收尾后台任务的强引用集合：asyncio 只持调度弱引用，不存强引用会被 GC 中途回收
_migration_bg_tasks: set = set()


def _spawn_migration_bg_task(coro) -> asyncio.Task:
    """Spawn a fire-and-forget task that survives SSE client cancellation.

    Starlette StreamingResponse 在客户端断开时通过 anyio cancel scope 取消
    stream_response 任务，CancelledError（BaseException）会直接击穿生成器的
    except ClientDisconnect / except Exception。任何与 SSE 生命周期绑定（而非
    随请求结束）的清理都必须放进本函数创建的独立任务中。
    """
    task = asyncio.create_task(coro)
    _migration_bg_tasks.add(task)
    task.add_done_callback(_migration_bg_tasks.discard)
    return task


@router.get("/status")
async def get_status(current_user: User = Depends(require_db_admin('database_management'))):
    cfg = _get_config()
    active = cfg.get_active()
    return {
        "active": active.public_dict() if active else None,
        "connections_count": len(cfg.connections),
        "version": cfg.version,
    }


@router.get("/running-tasks")
async def get_running_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin('database_management')),
):
    """聚合返回迁移锁状态 + 进行中的节点任务列表。"""
    from app.models.node_task import NodeTask
    from app.models.cluster import Cluster

    state = maintenance.get_migration_state()

    result = await db.execute(
        select(NodeTask).where(NodeTask.status.in_(["running", "pending", "interrupted"]))
    )
    node_tasks = result.scalars().all()

    # Batch-fetch cluster names
    cluster_ids = {t.cluster_id for t in node_tasks}
    cluster_map = {}
    if cluster_ids:
        clusters_result = await db.execute(
            select(Cluster.id, Cluster.name).where(Cluster.id.in_(cluster_ids))
        )
        cluster_map = {row[0]: row[1] for row in clusters_result.all()}

    tasks = []
    for t in node_tasks:
        tasks.append({
            "id": t.id,
            "cluster_id": t.cluster_id,
            "cluster_name": cluster_map.get(t.cluster_id, f"集群#{t.cluster_id}"),
            "task_type": t.task_type,
            "status": t.status,
            "total_nodes": t.total_nodes,
            "success_nodes": t.success_nodes,
            "failed_nodes": t.failed_nodes,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "started_at": t.started_at.isoformat() if t.started_at else None,
        })

    progress = state.progress
    return {
        "migration": {
            "in_progress": state.in_progress,
            "source_id": state.source_id,
            "target_id": state.target_id,
            "started_at": state.started_at.isoformat() if state.started_at else None,
            "progress": {
                "phase": progress.phase,
                "backup_done": progress.backup_done,
                "backup_total": progress.backup_total,
                "table_index": progress.table_index,
                "total_tables": progress.total_tables,
                "current_table": progress.current_table,
                "copied_rows": progress.copied_rows,
                "total_rows": progress.total_rows,
                "skipped": progress.skipped,
            } if state.in_progress else None,
        },
        "tasks": tasks,
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
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin('database_management')),
):
    from app.services import db_switch_service
    enrich_audit(request, resource_id=body.connection_id, detail=f"切换数据库连接 {body.connection_id}")
    result = await db_switch_service.perform_switch(body.connection_id, db)
    return result


# 注：原同步 POST /migrate 端点已于 2026-09-16 下线。它在事件循环主线程上直接执行
# migrate_direct，一次迁移期间整个后端无响应（连健康检查/登录都被堵死，信号也处理不了）。
# 前端早已只用 /migrate-stream（SSE），该端点的校验逻辑是本端点的子集，无独有功能。


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
            maintenance.update_migration_progress(
                phase="migrating",
                table_index=done,
                total_tables=total,
                current_table=table_name,
                copied_rows=copied_rows,
                total_rows=total_rows,
                skipped=skipped,
            )
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
            maintenance.update_migration_progress(
                phase="backup",
                backup_done=done,
                backup_total=total,
            )
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

        maintenance.set_migration_in_progress(True, source_id=body.source_id, target_id=body.target_id)
        backup_path = ""
        t0 = time.monotonic()
        started_at = datetime.utcnow()
        loop = asyncio.get_event_loop()
        migration_finished = threading.Event()
        migration_result: dict = {}
        # 迁移线程是否已启动（同步置位，生成器退出后其值即为最终值，无竞态）
        migration_thread_started = False
        # 生成器结束信号：无论正常返回、报错还是被客户端断连取消，finally 都会置位
        generator_done = asyncio.Event()

        async def _finalize_migration():
            """迁移收尾：等线程结束 → 清锁 → 写历史/审计日志。

            以独立 asyncio 任务运行，不随 SSE 客户端断连被取消 —— 这是客户端
            刷新页面后锁卡死、历史记录丢失问题的修复（CancelledError 会击穿
            生成器的 except 链，收尾逻辑不能放在生成器体内）。
            """
            try:
                await generator_done.wait()
                if migration_thread_started:
                    # 有界等待：线程 finally 必然置位 migration_finished；
                    # 若线程卡死（如 PG socket 挂起）则 grace 后放弃并记录失败
                    grace = float(timeout) + 300
                    finished = await loop.run_in_executor(
                        None, lambda: migration_finished.wait(grace)
                    )
                    if not finished:
                        cancel_event.set()
                        migration_result.setdefault("error", "迁移线程超时未结束")
                maintenance.set_migration_in_progress(False)
                duration = round(time.monotonic() - t0, 1)
                terminal_error = migration_result.get("terminal_error")
                if terminal_error:
                    # 生成器终态裁决（超时等）优先于线程结果
                    await _write_failed_migration_log(source, target, body, current_user, terminal_error, duration_seconds=duration, started_at=started_at)
                elif migration_result.get("success"):
                    tables_count = len(migration_result.get("tables", []) or [])
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
                            duration_seconds=duration,
                            started_at=started_at,
                        )
                        log_audit(log_db, user=current_user, action="migrate_database", resource="database", detail=f"迁移 {body.source_id} → {body.target_id}（{tables_count} 张表）")
                else:
                    error_message = migration_result.get("error") or "迁移中断（SSE 会话结束）"
                    await _write_failed_migration_log(source, target, body, current_user, error_message, duration_seconds=duration, started_at=started_at)
            except Exception as fin_err:
                logger.error("Migration finalizer failed: %s", fin_err)
                try:
                    maintenance.set_migration_in_progress(False)
                except Exception:
                    pass

        _spawn_migration_bg_task(_finalize_migration())
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
                            migration_result.setdefault("error", "备份超时")
                            yield _send_event({"type": "error", "message": "备份超时"})
                            maintenance.set_migration_in_progress(False)
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
                    migration_result.setdefault("error", f"备份失败: {e}")
                    yield _send_event({"type": "error", "message": f"备份失败: {e}"})
                    maintenance.set_migration_in_progress(False)
                    return

                _cleanup_old_backups(backup_dir)
                # Drain any remaining backup progress events
                async for chunk in _drain_queue():
                    yield chunk
                # Send backup complete event
                yield _send_event({"type": "backup_complete", "path": backup_path})

            # Run migration in thread — poll queue for progress while thread runs
            def run_migration():
                try:
                    result = db_migration_service.migrate_direct(
                        source, target,
                        include_logs=body.include_logs,
                        mode=body.mode,
                        confirmed_clear=body.confirmed_clear,
                        cancel_event=cancel_event,
                        progress_cb=on_progress,
                    )
                    migration_result["tables"] = result
                    migration_result["success"] = True
                    return result
                except MigrationCancelled:
                    migration_result["error"] = "迁移已取消"
                    migration_result["success"] = False
                    raise
                except Exception as e:
                    migration_result["error"] = str(e)
                    migration_result["success"] = False
                    raise
                finally:
                    migration_finished.set()

            migration_thread_started = True
            migration_task = loop.run_in_executor(None, run_migration)
            deadline = asyncio.get_event_loop().time() + timeout

            try:
                table_details = None
                # Poll the event queue while the migration thread runs
                while not migration_task.done():
                    # Check timeout
                    if asyncio.get_event_loop().time() > deadline:
                        cancel_event.set()
                        # terminal_error 是生成器级终态裁决，线程内的 MigrationCancelled
                        # 只写 error 键，不会覆盖它（超时必须以「超时」入账）
                        migration_result["terminal_error"] = "迁移超时"
                        yield _send_event({"type": "error", "message": "迁移超时"})
                        maintenance.set_migration_in_progress(False)
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
                table_details = None
            except Exception as e:
                yield _send_event({"type": "error", "message": f"迁移失败: {e}"})
                table_details = None

            # Send final success event (only if migration actually succeeded)
            if table_details is not None:
                tables_count = len(table_details)
                success_msg = f"迁移完成，共迁移 {tables_count} 张表"
                yield _send_event({
                    "type": "complete",
                    "message": success_msg,
                    "tables_migrated": tables_count,
                    "tables": table_details,
                    "backup_path": backup_path,
                })

        except ClientDisconnect:
            # Client disconnected but migration thread continues in background.
            # Do NOT cancel — refresh/navigation should not kill a running migration.
            # 注意：starlette 任务组取消注入的是 CancelledError（BaseException），
            # 此 handler 仅兜底 spec>=2.4 的 OSError→ClientDisconnect 路径。
            logger.info("Migration SSE client disconnected, migration continues in background")
        except Exception as e:
            migration_result.setdefault("error", f"迁移失败: {e}")
        finally:
            # 通知独立收尾任务：生成器流程已结束（正常/报错/被取消均会执行）。
            # 等线程、清锁、写日志全部由 _finalize_migration 负责。
            generator_done.set()

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
    request: Request = None,
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
    enrich_audit(request, detail=f"导出数据库 {body.source_id} → {path}")
    await db.commit()
    return {"message": "导出完成", "archive_path": path}


@router.post("/import")
async def import_archive(
    body: ImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_db_admin('database_management')),
    request: Request = None,
):
    cfg = _get_config()
    target = cfg.get_connection(body.target_id)
    if not target:
        raise HTTPException(status_code=404, detail="目标连接不存在")
    try:
        db_migration_service.validate_migration_direction("__archive__", body.target_id, cfg.active)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    t0 = time.monotonic()
    started_at = datetime.utcnow()
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
        duration_seconds=round(time.monotonic() - t0, 1),
        started_at=started_at,
    )
    enrich_audit(request, detail=f"导入归档 {body.archive_path} → {body.target_id}")
    await db.commit()
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
            "duration_seconds": log.duration_seconds,
            "started_at": log.started_at.isoformat() if log.started_at else None,
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
