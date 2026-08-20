"""Edge node autostart (systemd) management API.

Allows enabling/disabling/querying the Edge node's systemd self-start via a
dedicated ansible tag ``edge_autostart``. enable/disable connect as root
(credentials passed per-request, not persisted); status uses the normal
non-root connection.
"""

import getpass

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.cluster import Node
from app.services.ansible_service import (
    AnsibleRunnerService,
    _inventory_inject_ssh,
    _inventory_restore_ssh,
    _run_ansible_stream,
    build_edge_service_content,
    get_default_run_user,
    is_node_in_inventory,
    resolve_ssh_port,
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
    """Enable/disable/query the Edge node's systemd self-start (SSE stream)."""
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

    if inject_root:
        _inventory_inject_ssh(node.ip, body.root_user or "root", body.root_password or "")
    try:
        extravars = {"autostart_action": body.action}
        if body.action == "enable":
            extravars["edge_service_content"] = edge_service_content
        return StreamingResponse(
            _run_ansible_stream(
                _ansible_service,
                ip=node.ip,
                tag="edge_autostart",
                extravars=extravars,
                ssh_port=resolve_ssh_port(node),
            ),
            media_type="text/event-stream",
        )
    finally:
        if inject_root:
            _inventory_restore_ssh(node.ip)
