"""Ansible 主机清单管理 API（管理员限定，feature: ansible_inventory）。

- GET  /ansible/inventory          查看清单（结构化 + 原文 + unmanaged_ips）
- PUT  /ansible/inventory          保存（raw_text 或 hosts+vars 二选一载荷）
- POST /ansible/inventory/render   表格草稿 → YAML 文本（双模式切换）
- POST /ansible/inventory/parse    原文 → 结构化 + 错误列表（双模式切换）

保存护栏顺序：载荷校验 → 运行中任务 409 → 解析/结构校验（raw_text 与 hosts+vars
两种载荷同等执行，ansible-inventory-ux-review-fixes 批 1）→ 备份+原子写回。
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import yaml
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_permission
from app.services.audit import enrich_audit
from app.models.cluster import Node
from app.models.node_task import NodeTask
from app.models.user import User
from app.services import inventory_service
from app.services.ansible_service import _inventory_lock

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ansible", tags=["ansible-inventory"])


def _read_raw_text() -> tuple[str, bool]:
    """Read the inventory file; missing file → ("", False)."""
    path = inventory_service._inventory_path()
    try:
        return path.read_text(encoding="utf-8"), True
    except FileNotFoundError:
        return "", False


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
    current_user: User = Depends(require_permission('ansible_inventory')),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    with _inventory_lock:
        raw, file_exists = _read_raw_text()
    parsed = inventory_service.parse_inventory(raw)
    # 文件不存在（全新部署）→ 空结构且无错误；文件存在但解析失败 → errors 透出
    if not file_exists:
        parsed["errors"] = []

    inv_ips = [h["ip"] for h in parsed["hosts"]]
    node_ips = set(await _platform_node_ips(db))
    unmanaged = [ip for ip in inv_ips if ip not in node_ips]

    # 文件元数据（批 2）：naive UTC isoformat（与全站时间口径一致，#26）
    last_modified: Optional[str] = None
    if file_exists:
        mtime = inventory_service._inventory_path().stat().st_mtime
        last_modified = (
            datetime.fromtimestamp(mtime, tz=timezone.utc).replace(tzinfo=None).isoformat()
        )

    return {
        "raw_text": raw,
        "hosts": parsed["hosts"],
        "vars": parsed["vars"],
        "unknown_keys": parsed["unknown_keys"],
        "unmanaged_ips": unmanaged,
        "errors": parsed["errors"],
        "last_modified": last_modified,
    }


@router.put("/inventory")
async def put_inventory(
    payload: PutPayload,
    current_user: User = Depends(require_permission('ansible_inventory')),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
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
        # 源码模式与表格模式同等结构校验（ansible-inventory-ux-review-fixes 批 1）：
        # 主机键合法性。doc 经与 parse_inventory 同款行尾剥离后加载
        # （raw 可能含行尾制表符，直接 safe_load 会炸）。
        doc = yaml.safe_load(inventory_service.strip_trailing_whitespace(new_text)) or {}
        errors = inventory_service.validate_structure(doc)
        if errors:
            raise HTTPException(status_code=400, detail="\n".join(errors))
    else:
        hosts, norm_errors = inventory_service.normalize_hosts(payload.hosts or [])
        if norm_errors:
            raise HTTPException(status_code=400, detail="\n".join(norm_errors))
        new_text = inventory_service.render_inventory(hosts, payload.vars or {})
        doc = yaml.safe_load(new_text) or {}
        errors = inventory_service.validate_structure(doc)
        if errors:
            raise HTTPException(status_code=400, detail="\n".join(errors))

    # save_inventory 内部持有 _inventory_lock（与运行时注入互斥），此处勿重复加锁
    inventory_service.save_inventory(new_text)
    enrich_audit(request, detail="更新 Ansible 主机清单")
    await db.commit()
    logger.info("Inventory updated by admin user %s", current_user.username)
    return {"ok": True}


@router.post("/inventory/render")
async def render_inventory_endpoint(
    req: RenderRequest,
    current_user: User = Depends(require_permission('ansible_inventory')),
) -> dict[str, str]:
    return {"text": inventory_service.render_inventory(req.hosts, req.vars)}


@router.post("/inventory/parse")
async def parse_inventory_endpoint(
    req: ParseRequest,
    current_user: User = Depends(require_permission('ansible_inventory')),
) -> dict[str, Any]:
    return inventory_service.parse_inventory(req.raw_text)


@router.get("/inventory/backups")
async def list_inventory_backups(
    current_user: User = Depends(require_permission('ansible_inventory')),
) -> dict[str, Any]:
    """保存时自动生成的备份清单（时间倒序），供「恢复记录」抽屉。"""
    return {"backups": inventory_service.list_backups()}


@router.get("/inventory/backups/{name}/content")
async def read_inventory_backup_content(
    name: str,
    current_user: User = Depends(require_permission('ansible_inventory')),
) -> dict[str, Any]:
    """备份内容只读预览（源码形态）。"""
    try:
        text = inventory_service.read_backup(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="备份不存在或已被轮转清理")
    return {"raw_text": text}


@router.post("/inventory/backups/{name}/restore")
async def restore_inventory_backup(
    name: str,
    current_user: User = Depends(require_permission('ansible_inventory')),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
) -> dict[str, Any]:
    """一键恢复：以备份内容走与 PUT 完全相同的保存护栏（409 互斥 → 解析 → 结构校验）。

    save_inventory 内部先把当前文件备份一份（恢复可逆），再原子写回。
    """
    try:
        new_text = inventory_service.read_backup(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="备份不存在或已被轮转清理")

    # 护栏序列与 put_inventory 一致；恢复被拒时如实透出 409/400，不写盘
    await _assert_no_running_tasks(db)

    parsed = inventory_service.parse_inventory(new_text)
    if parsed["errors"]:
        raise HTTPException(status_code=400, detail=parsed["errors"][0])
    doc = yaml.safe_load(inventory_service.strip_trailing_whitespace(new_text)) or {}
    errors = inventory_service.validate_structure(doc)
    if errors:
        raise HTTPException(status_code=400, detail="\n".join(errors))

    inventory_service.save_inventory(new_text)
    enrich_audit(request, detail=f"恢复 Ansible 主机清单备份 {name}")
    await db.commit()
    logger.info("Inventory backup %s restored by admin user %s", name, current_user.username)
    return {"ok": True}
