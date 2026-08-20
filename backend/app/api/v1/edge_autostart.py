"""Edge node autostart (systemd) management API.

Enables/disables/queries the Edge node's systemd self-start over SSH.
enable/disable connect as root (credentials passed per-request, not persisted);
status uses the inventory non-root connection.
"""

import getpass
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.cluster import Node
from app.services.ansible_service import (
    AnsibleRunnerService,
    build_edge_service_content,
    get_default_run_user,
    is_node_in_inventory,
)

router = APIRouter(prefix="/nodes", tags=["nodes-autostart"])

_ansible_service = AnsibleRunnerService()


class NodeAutostartRequest(BaseModel):
    """Request body for autostart operations."""

    action: str = Field(..., description="enable | disable | status")
    edge_path: str | None = Field(default=None, description="覆盖 Edge 目录")
    run_user: str | None = Field(default=None, description="覆盖 service 运行用户")
    root_user: str | None = Field(default=None, description="root 账号（enable/disable 必填）")
    root_password: str | None = Field(default=None, description="root 密码（enable/disable 必填，仅本次使用）")


async def _get_node(node_id: int, db: AsyncSession) -> Node:
    result = await db.execute(select(Node).where(Node.id == node_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    return node


@router.get("/autostart/defaults")
async def autostart_defaults():
    """Return global autostart default values (fallback run user)."""
    return {"default_run_user": getpass.getuser()}


@router.get("/{node_id}/autostart/defaults")
async def node_autostart_defaults(node_id: int, db: AsyncSession = Depends(get_db)):
    """Return the node's default run user = inventory ansible_ssh_user.

    edge.service 的 User= 应使用节点 inventory 中配置的 ansible_ssh_user
    （通常即 Edge 实际运行用户），而非后端进程用户。
    """
    node = await _get_node(node_id, db)
    return {"run_user": get_default_run_user(node.ip)}


@router.post("/{node_id}/autostart")
async def node_autostart(
    node_id: int,
    body: NodeAutostartRequest,
    db: AsyncSession = Depends(get_db),
):
    """Enable/disable/query the Edge node's systemd self-start (SSE stream, via SSH)."""
    if body.action not in ("enable", "disable", "status"):
        raise HTTPException(status_code=422, detail="action 必须为 enable/disable/status")

    node = await _get_node(node_id, db)

    if not is_node_in_inventory(node.ip):
        raise HTTPException(
            status_code=400,
            detail="节点未在 ansible inventory 中，无法下发自启动配置",
        )

    edge_path = body.edge_path or node.edge_path or ""
    if not edge_path:
        raise HTTPException(status_code=422, detail="节点 Edge 目录为空，无法配置自启动")

    inject_root = body.action in ("enable", "disable")
    if inject_root and not body.root_password:
        raise HTTPException(status_code=422, detail="启用/禁用自启动需要提供 root 密码")

    run_user = body.run_user or getpass.getuser()
    edge_service_content = build_edge_service_content(run_user, edge_path) if body.action == "enable" else ""

    async def event_stream():
        # 与 useInstallStream 的 SSE 格式兼容
        yield f"data: {json.dumps({'line': '正在连接远程主机并执行 systemctl...', 'percent': 0})}\n\n"
        import asyncio
        import queue as _queue

        q: "_queue.Queue" = _queue.Queue()
        sentinel = object()

        def _on_line(ev: dict) -> None:
            line = ev.get("stdout") or ev.get("stderr") or ""
            if line:
                q.put(line)

        result = await _ansible_service.edge_autostart(
            ip=node.ip,
            action=body.action,
            edge_service_content=edge_service_content if body.action == "enable" else None,
            ssh_user=(body.root_user or "root") if inject_root else None,
            ssh_pass=body.root_password if inject_root else None,
            on_line=_on_line,
        )

        rc = result.get("rc", -1)
        status = result.get("status", "failed")
        command = result.get("command", "")
        # 输出命令到 SSE，供前端命令 tab 展示（手工执行）
        if command:
            q.put(f"手工执行命令: {command}")
        for line in (result.get("stdout") or "").splitlines():
            if line.strip():
                q.put(line)
        q.put(sentinel)

        percent = 0
        while True:
            try:
                item = q.get(timeout=30)
            except Exception:
                break
            if item is sentinel:
                break
            percent = min(percent + 1, 99)
            yield f"data: {json.dumps({'line': item, 'percent': percent})}\n\n"

        yield f"data: {json.dumps({'rc': rc, 'status': status, 'command': command, 'percent': 100})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
