"""Ansible 主机清单管理 API（管理员限定，feature: ansible_inventory）。

- GET  /ansible/inventory          查看清单（结构化 + 原文 + unmanaged_ips）
- PUT  /ansible/inventory          保存（raw_text 或 hosts+vars 二选一载荷）
- POST /ansible/inventory/render   表格草稿 → YAML 文本（双模式切换）
- POST /ansible/inventory/parse    原文 → 结构化 + 错误列表（双模式切换）

保存护栏顺序：载荷校验 → 运行中任务 409 → 解析/结构校验 → 备份+原子写回。
"""

import logging
from typing import Any, Optional

import yaml
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.cluster import Node
from app.models.node_task import NodeTask
from app.models.user import User
from app.services import inventory_service
from app.services.ansible_service import _inventory_lock

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ansible", tags=["ansible-inventory"])


async def require_admin(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Admin guard (same pattern as database.py require_db_admin)."""
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


def _read_raw_text() -> str:
    """Read the inventory file; missing file → empty string (D3)."""
    try:
        return inventory_service._inventory_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


async def _platform_node_ips(db: AsyncSession) -> list[str]:
    result = await db.execute(select(Node.ip))
    return [row[0] for row in result.all()]


async def _assert_no_running_tasks(db: AsyncSession) -> None:
    result = await db.execute(select(NodeTask).where(NodeTask.status == "running"))
    running = result.scalars().all()
    if running:
        names = "、".join(f"#{t.id} ({t.task_type})" for t in running[:10])
        raise HTTPException(
            status_code=409,
            detail=f"有节点任务正在运行（{names}），为避免固化注入中的临时凭据/端口，请稍后再试",
        )


class RenderRequest(BaseModel):
    hosts: list[dict[str, Any]]
    vars: dict[str, Any] = {}


class ParseRequest(BaseModel):
    raw_text: str


class PutPayload(BaseModel):
    raw_text: str | None = None
    hosts: list[dict[str, Any]] | None = None
    vars: dict[str, Any] | None = None


@router.get("/inventory")
async def get_inventory(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    with _inventory_lock:
        raw = _read_raw_text()
    parsed = inventory_service.parse_inventory(raw)

    inv_ips = [h["ip"] for h in parsed["hosts"]]
    node_ips = set(await _platform_node_ips(db))
    unmanaged = [ip for ip in inv_ips if ip not in node_ips]

    return {
        "raw_text": raw,
        "hosts": parsed["hosts"],
        "vars": parsed["vars"],
        "unknown_keys": parsed["unknown_keys"],
        "unmanaged_ips": unmanaged,
    }


@router.put("/inventory")
async def put_inventory(
    payload: PutPayload,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if payload.raw_text is None and payload.hosts is None:
        raise HTTPException(status_code=400, detail="载荷必须为 raw_text 或 hosts+vars 二选一")

    # 运行中任务互斥：防止把注入中的临时端口/凭据固化进文件（D1）
    await _assert_no_running_tasks(db)

    if payload.raw_text is not None:
        new_text = payload.raw_text
        parsed = inventory_service.parse_inventory(new_text)
        if parsed["errors"]:
            raise HTTPException(status_code=400, detail=parsed["errors"][0])
    else:
        new_text = inventory_service.render_inventory(payload.hosts or [], payload.vars or {})
        doc = yaml.safe_load(new_text) or {}
        platform_ips = await _platform_node_ips(db)
        errors = inventory_service.validate_structure(doc, platform_node_ips=platform_ips)
        if errors:
            raise HTTPException(status_code=400, detail="\n".join(errors))

    # save_inventory 内部持有 _inventory_lock（与运行时注入互斥），此处勿重复加锁
    inventory_service.save_inventory(new_text)
    logger.info("Inventory updated by admin user %s", current_user.username)
    return {"ok": True}


@router.post("/inventory/render")
async def render_inventory_endpoint(
    req: RenderRequest,
    current_user: User = Depends(require_admin),
) -> dict[str, str]:
    return {"text": inventory_service.render_inventory(req.hosts, req.vars)}


@router.post("/inventory/parse")
async def parse_inventory_endpoint(
    req: ParseRequest,
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    return inventory_service.parse_inventory(req.raw_text)
