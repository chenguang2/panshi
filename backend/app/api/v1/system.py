"""System-level endpoints (no auth required)."""

import csv
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin_user, require_permission
from app.core.features import get_features, feature_enabled
from app.models.system import AuditLog

router = APIRouter(prefix="/system", tags=["system"])

# 导出任务登记（内存态；文件落 data/exports/，进程重启后失效）
_export_tasks: dict[str, dict] = {}


def _require_audit_feature():
    if not feature_enabled("audit_log"):
        raise HTTPException(status_code=404, detail="审计日志模块未启用")


@router.get("/features")
async def get_system_features():
    """Return the current deployment's feature configuration.

    This endpoint does NOT require authentication because the frontend
    needs it during bootstrap, before the user logs in.
    """
    return get_features()


@router.get("/operations")
async def list_recent_operations(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    user: str | None = None,
    action: str | None = None,
    resource: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: AsyncSession = Depends(get_db),
    _guard=Depends(require_permission('audit_logs')),
):
    """审计日志分页查询（admin；feature audit_log 门控）。"""
    _require_audit_feature()
    stmt = select(AuditLog)
    if user:
        stmt = stmt.where(AuditLog.username == user)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if resource:
        stmt = stmt.where(AuditLog.resource == resource)
    try:
        if start:
            stmt = stmt.where(AuditLog.created_at >= datetime.fromisoformat(start))
        if end:
            stmt = stmt.where(AuditLog.created_at <= datetime.fromisoformat(end))
    except ValueError:
        raise HTTPException(status_code=400, detail="时间格式非法（ISO 格式）")

    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0
    page_size = max(1, min(page_size, 200))
    rows = (await db.execute(
        stmt.order_by(AuditLog.id.desc()).offset((max(page, 1) - 1) * page_size).limit(page_size)
    )).scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": log.id,
                "username": log.username,
                "action": log.action,
                "resource": log.resource,
                "resource_id": log.resource_id,
                "detail": log.detail,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in rows
        ],
    }


@router.get("/operations/meta")
async def operations_meta(
    db: AsyncSession = Depends(get_db),
    _guard=Depends(require_permission('audit_logs')),
):
    """筛选下拉动态选项（去重）。"""
    _require_audit_feature()
    users = (await db.execute(select(AuditLog.username).distinct())).scalars().all()
    actions = (await db.execute(select(AuditLog.action).distinct())).scalars().all()
    resources = (await db.execute(select(AuditLog.resource).distinct())).scalars().all()
    return {
        "users": sorted(u for u in users if u),
        "actions": sorted(a for a in actions if a),
        "resources": sorted(r for r in resources if r),
    }


@router.post("/operations/export")
async def operations_export(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _guard=Depends(require_permission('audit_logs')),
):
    """导出过滤后的审计日志为 CSV（≤50000 行同步生成）。"""
    _require_audit_feature()
    fmt = (body or {}).get("format", "csv")
    if fmt not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="format 仅支持 csv / xlsx")

    stmt = select(AuditLog)
    for field, column in (("user", AuditLog.username), ("action", AuditLog.action), ("resource", AuditLog.resource)):
        v = (body or {}).get(field)
        if v:
            stmt = stmt.where(column == v)

    rows = (await db.execute(stmt.order_by(AuditLog.id.desc()).limit(50000))).scalars().all()
    headers = ["id", "created_at", "username", "action", "resource", "resource_id", "detail", "ip_address"]

    task_id = uuid.uuid4().hex
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for log in rows:
        writer.writerow([
            log.id,
            log.created_at.isoformat() if log.created_at else "",
            log.username or "",
            log.action or "",
            log.resource or "",
            log.resource_id if log.resource_id is not None else "",
            log.detail or "",
            log.ip_address or "",
        ])
    _export_tasks[task_id] = {"status": "ready", "format": fmt, "content": buf.getvalue()}
    return {"task_id": task_id, "status": "ready", "rows": len(rows)}


@router.get("/operations/export/{task_id}")
async def operations_export_status(task_id: str, _guard=Depends(get_current_admin_user)):
    _require_audit_feature()
    task = _export_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="导出任务不存在")
    return {"task_id": task_id, "status": task["status"], "format": task["format"]}


@router.get("/operations/export/{task_id}/download")
async def operations_export_download(task_id: str, _guard=Depends(get_current_admin_user)):
    _require_audit_feature()
    task = _export_tasks.get(task_id)
    if not task or task["status"] != "ready":
        raise HTTPException(status_code=404, detail="导出任务不存在或未就绪")
    media = "text/csv; charset=utf-8" if task["format"] == "csv" else "application/octet-stream"
    return PlainTextResponse(
        content=task["content"],
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="audit-log.{task["format"]}"'},
    )
