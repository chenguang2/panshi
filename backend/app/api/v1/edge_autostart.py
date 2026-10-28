"""Edge node autostart (systemd) management API.

Enables/disables/queries the Edge node's systemd self-start over SSH.
enable/disable connect as root (credentials passed per-request, not persisted);
status uses the inventory non-root connection.
"""

import getpass
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.cluster import Node
from app.models.autostart import NodeAutostart
from app.services.ansible_service import (
    AnsibleRunnerService,
    build_edge_service_content,
    describe_inventory_membership,
    get_default_run_user,
    is_node_in_inventory,
    sanitize_command_for_store,
)
from app.services.relay_registry import ssh_jump_for_ip

from app.core.deps import require_permission

router = APIRouter(prefix="/nodes", tags=["nodes-autostart"], dependencies=[Depends(require_permission('edge_autostart'))])
logger = logging.getLogger(__name__)

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


def _infer_status(rc: int, stdout: str, stderr: str = "") -> str:
    """Infer autostart status from a status action's rc/stdout(+stderr).

    注意 systemctl is-enabled 对未配置/无权限服务的报错走 stderr（rc≠0），
    必须合并 stderr 判断，否则存库状态与前端（解析 stdout+stderr 行）不一致：
    查询时显示"未配置"，刷新后却回退"未知"。
    """
    out = (stdout or "") + "\n" + (stderr or "")
    if "No such file or directory" in out:
        return "not_configured"
    if "enabled" in out:
        return "enabled"
    if "disabled" in out:
        return "disabled"
    if "permission denied" in out.lower() or "not been booted with systemd" in out.lower() or "权限不够" in out:
        return "permission_denied"
    return "unknown"


# 从命令实际输出可推导出的"真实态"；其余（permission_denied/unknown）为失败推导，
# 不得覆盖已持久化的真实态（见 fix-autostart-perm-status design D1）。
_REAL_STATES = ("enabled", "disabled", "not_configured")


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


@router.get("/autostart/records")
async def autostart_records(db: AsyncSession = Depends(get_db)):
    """Return every node's autostart record (LEFT-JOIN：无记录节点也有一行 status=None）。

    - 状态/操作字段来自 `ps_node_autostart`（读库展示）；
    - in_inventory：设计 D4 预检——纯内存清单文件检查（零外部 IO），供前端就地禁用
      不在 ansible 主机清单中的节点的三个操作（启用/禁用/查询一体拦截，与 POST 400 分支同口径）。
    - 无记录节点仅返回 in_inventory（前端按 status=None 显示「未查询」，预检不缺位）。
    """
    nodes_result = await db.execute(select(Node))
    all_nodes = nodes_result.scalars().all()
    records = (await db.execute(select(NodeAutostart))).scalars().all()
    record_by_node = {r.node_id: r for r in records}
    items = []
    for n in all_nodes:
        r = record_by_node.get(n.id)
        items.append({
            "node_id": n.id,
            "cluster_id": n.cluster_id,
            "status": r.status if r else None,
            "action": r.action if r else None,
            "command": r.command if r else None,
            "rc": r.rc if r else None,
            "updated_at": r.updated_at.isoformat() if r and r.updated_at else None,
            "in_inventory": is_node_in_inventory(n.ip),
        })
    return {"items": items}


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
        reason = describe_inventory_membership(node.ip)
        raise HTTPException(
            status_code=400,
            detail="节点未在 ansible inventory 中，无法下发自启动配置" + (f"。{reason}" if reason else ""),
        )

    edge_path = body.edge_path or node.edge_path or ""
    if not edge_path:
        raise HTTPException(status_code=422, detail="节点 Edge 目录为空，无法配置自启动")

    inject_root = body.action in ("enable", "disable") or (body.action == "status" and body.root_password)
    if body.action in ("enable", "disable") and not body.root_password:
        raise HTTPException(status_code=422, detail="启用/禁用自启动需要提供 root 密码")

    run_user = body.run_user or getpass.getuser()
    edge_service_content = build_edge_service_content(run_user, edge_path) if body.action == "enable" else ""

    async def event_stream():
        # 节点执行路径（SSH 腿）：与 ansible 注入同源，在连接前取一次。
        jump = ssh_jump_for_ip(node.ip)
        route_meta = {"route": "relay", "relay_via": jump} if jump else {"route": "direct"}
        # 与 useInstallStream 的 SSE 格式兼容
        yield f"data: {json.dumps({'line': '正在连接远程主机并执行 systemctl...', 'percent': 0, **route_meta})}\n\n"
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
        # rc≠0 时把 stderr（sshpass 合并诊断，含「密码认证也失败」标记）也送入日志流：
        # 前端终态失败归类按流日志匹配真实标记（design D6），stderr 不入流则归类失效
        if rc != 0:
            for line in (result.get("stderr") or "").splitlines():
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

        # 操作完成后写库（状态 + 脱敏命令审计，绝不存密码明文）。
        # 必须在最终 yield 之前执行：SSE 流结束时客户端断开会让 Starlette 在
        # yield 处 aclose() 生成器，yield 之后的代码永不执行（状态因此从未持久化，
        # 刷新页面后回到"未知"）。
        try:
            # 统一持久化规则（fix-autostart-perm-status）：状态只信命令实际输出，
            # 不信 action 期望值（disable 命令 || true 恒 rc=0）也不信 rc（is-enabled
            # 对 disabled 合法 rc=1）。未推导 out真实态时保留原值，失败仅记 action/rc。
            inferred = _infer_status(rc, result.get("stdout", ""), result.get("stderr", ""))
            existing = (await db.execute(
                select(NodeAutostart).where(NodeAutostart.node_id == node.id)
            )).scalar_one_or_none()
            if inferred in _REAL_STATES:
                stored_status = inferred
            elif existing and existing.status in _REAL_STATES:
                stored_status = existing.status
            else:
                stored_status = inferred
            if existing is None:
                db.add(NodeAutostart(
                    node_id=node.id, cluster_id=node.cluster_id,
                    status=stored_status, action=body.action,
                    command=sanitize_command_for_store(command) if command else None,
                    rc=rc,
                ))
            else:
                existing.status = stored_status
                existing.action = body.action
                existing.command = sanitize_command_for_store(command) if command else None
                existing.rc = rc
            await db.commit()
        except Exception:
            # 写库失败不影响操作结果返回，但必须留痕（历史上曾静默吞异常致排查困难）
            logger.exception("autostart 持久化失败 node_id=%s action=%s", node.id, body.action)

        yield f"data: {json.dumps({'rc': rc, 'status': status, 'command': command, 'percent': 100})}\n\n"

    await db.commit()  # 落审计骨架 + 释放写锁（#29：流内 SSH 期间不再持事务）
    return StreamingResponse(event_stream(), media_type="text/event-stream")
