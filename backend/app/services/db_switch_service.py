"""Database switch service — A1 config+manual-restart mechanism.

Design (see openspec/changes/support-postgres-database/design.md D2/D5, G5/G6/G9):
- G5: refuse switch while any install_task is running; fallback-mark racing
  running tasks as interrupted.
- D5: switch only validates + writes config + writes .restart.flag; the user
  restarts the backend manually.
- G9: config corruption / failed active connection rolls back to .bak at startup.
"""

import os
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import db_config
from app.core.database import build_sync_engine_for
from app.models.node_task import NodeTask

RESTART_FLAG_PATH = "./data/.restart.flag"
INTERRUPTED_STATUS = "interrupted"


class SwitchError(HTTPException):
    """Reusable error for switch failures (maps to HTTP 4xx)."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(status_code=status_code, detail=detail)


async def _find_running_tasks(db: AsyncSession):
    result = await db.execute(select(NodeTask).where(NodeTask.status == "running"))
    return result.scalars().all()


def _verify_reachable(conn) -> None:
    try:
        engine = build_sync_engine_for(conn)
        with engine.connect() as c:
            c.execute(__import__("sqlalchemy").text("SELECT 1"))
        engine.dispose()
    except Exception as e:
        raise SwitchError(status.HTTP_400_BAD_REQUEST, f"目标连接不可达: {e}")


async def perform_switch(target_conn_id: str, db: AsyncSession) -> dict:
    """Validate and persist a database switch. Does NOT restart the process."""
    cfg = db_config.load_config()
    target = cfg.get_connection(target_conn_id)
    if not target:
        raise SwitchError(status.HTTP_404_NOT_FOUND, "连接不存在")
    if target_conn_id == cfg.active:
        raise SwitchError(status.HTTP_400_BAD_REQUEST, "该数据库已是当前使用的数据库")

    running = await _find_running_tasks(db)
    if running:
        task_list = "、".join(f"#{t.id} ({t.task_type})" for t in running[:10])
        raise SwitchError(
            status.HTTP_400_BAD_REQUEST,
            f"有任务正在运行（{task_list}），请等待完成或取消后再切换",
        )

    _verify_reachable(target)

    # Persist switch state (G9: keep .bak for rollback)
    db_config.backup_current_config()
    cfg.active = target_conn_id
    db_config.save_config(cfg)
    _write_restart_flag()

    # Defense-in-depth (G5): mark any task that entered running between check
    # and switch as interrupted so it never stays running forever.
    racing = await _find_running_tasks(db)
    for task in racing:
        task.status = INTERRUPTED_STATUS
    if racing:
        await db.commit()

    return {
        "message": f"已切换到「{target.name}」，请手动重启后端服务后生效",
        "connection_id": target_conn_id,
    }


def _write_restart_flag() -> None:
    os.makedirs(os.path.dirname(RESTART_FLAG_PATH) or ".", exist_ok=True)
    with open(RESTART_FLAG_PATH, "w") as f:
        f.write("1")


def restart_flag_exists() -> bool:
    return os.path.exists(RESTART_FLAG_PATH)


def clear_restart_flag() -> None:
    if os.path.exists(RESTART_FLAG_PATH):
        os.remove(RESTART_FLAG_PATH)


def check_and_rollback_startup() -> Optional[dict]:
    """On startup, if active connection fails and a switch flag exists, roll
    back to the .bak config so the service can start. Returns rollback info."""
    if not restart_flag_exists():
        return None
    cfg = db_config.load_config()
    active = cfg.get_active()
    if active is None:
        return None
    try:
        _verify_reachable(active)
        # reachable — switch succeeded; clear flag
        clear_restart_flag()
        return None
    except SwitchError:
        pass
    # active unreachable — roll back to .bak
    bak = db_config.load_config(path=db_config.CONFIG_BAK_PATH)
    db_config.save_config(bak)
    clear_restart_flag()
    return {"rolled_back": True, "previous_active": bak.active}
