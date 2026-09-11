"""System-level endpoints (no auth required)."""

import csv
import io
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from openpyxl import Workbook
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin_user, require_permission
from app.core.features import get_features, feature_enabled
from app.models.system import AuditLog
from app.models.user import User
from app.services.audit import log_audit

router = APIRouter(prefix="/system", tags=["system"])

# 导出任务登记（内存态；文件落 data/exports/，进程重启后失效）
_export_tasks: dict[str, dict] = {}

# 审计归档留存目录（backend/data/archives/，运行时数据不入库）
_ARCHIVE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "data",
    "archives",
)

# 审计导出/归档共用的 CSV 列头
_EXPORT_HEADERS = [
    "id",
    "created_at",
    "username",
    "action",
    "resource",
    "resource_id",
    "detail",
    "ip_address",
]


def _require_audit_feature():
    if not feature_enabled("audit_log"):
        raise HTTPException(status_code=404, detail="审计日志模块未启用")


def _parse_before(body: dict) -> datetime:
    """归档截止日期解析：before（不含当日）。"""
    raw = (body or {}).get("before")
    if not raw or not isinstance(raw, str):
        raise HTTPException(status_code=400, detail="before 为必填日期（YYYY-MM-DD）")
    try:
        return datetime.strptime(raw, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="before 格式应为 YYYY-MM-DD")


def _iso_z(dt: datetime | None) -> str | None:
    """datetime → ISO 8601 + 'Z'（UTC 标记），确保前端正确解析时区。"""
    return dt.isoformat() + "Z" if dt else None


def _audit_csv(rows: list[AuditLog]) -> str:
    """审计记录序列化为 CSV（与 /operations/export 同列头）。"""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_EXPORT_HEADERS)
    for log in rows:
        writer.writerow(
            [
                log.id,
                log.created_at.isoformat() + "Z" if log.created_at else "",
                log.username or "",
                log.action or "",
                log.resource or "",
                log.resource_id if log.resource_id is not None else "",
                log.detail or "",
                log.ip_address or "",
            ]
        )
    return buf.getvalue()


def _audit_xlsx(rows: list[AuditLog]) -> bytes:
    """审计记录序列化为真 xlsx（openpyxl；列头与 CSV 一致）。"""
    wb = Workbook()
    ws = wb.active
    if ws is None:
        ws = wb.create_sheet()
    ws.append(_EXPORT_HEADERS)
    for log in rows:
        ws.append(
            [
                log.id,
                log.created_at.isoformat() + "Z" if log.created_at else "",
                log.username or "",
                log.action or "",
                log.resource or "",
                log.resource_id if log.resource_id is not None else "",
                log.detail or "",
                log.ip_address or "",
            ]
        )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


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
                "created_at": _iso_z(log.created_at),
            }
            for log in rows
        ],
    }


@router.get("/operations/meta")
async def operations_meta(
    db: AsyncSession = Depends(get_db),
    _guard=Depends(require_permission('audit_logs')),
):
    """筛选下拉动态选项（去重）+ 库内统计（总条数/最早记录，供归档决策参考）。"""
    _require_audit_feature()
    users = (await db.execute(select(AuditLog.username).distinct())).scalars().all()
    actions = (await db.execute(select(AuditLog.action).distinct())).scalars().all()
    resources = (await db.execute(select(AuditLog.resource).distinct())).scalars().all()
    total = (await db.execute(select(func.count(AuditLog.id)))).scalar() or 0
    oldest = (await db.execute(select(func.min(AuditLog.created_at)))).scalar()
    return {
        "users": sorted(u for u in users if u),
        "actions": sorted(a for a in actions if a),
        "resources": sorted(r for r in resources if r),
        "total": total,
        "oldest": _iso_z(oldest),
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

    task_id = uuid.uuid4().hex
    content: str | bytes = _audit_csv(rows) if fmt == "csv" else _audit_xlsx(rows)
    _export_tasks[task_id] = {"status": "ready", "format": fmt, "content": content}
    return {"task_id": task_id, "status": "ready", "rows": len(rows)}


@router.post("/operations/archive/preview")
async def archive_preview(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _guard=Depends(require_permission('audit_logs')),
):
    """归档预览（只读）：统计 before（不含当日）之前的记录数与时间范围。"""
    _require_audit_feature()
    before = _parse_before(body)
    cond = AuditLog.created_at < before
    count = (await db.execute(select(func.count(AuditLog.id)).where(cond))).scalar() or 0
    oldest = (await db.execute(select(func.min(AuditLog.created_at)).where(cond))).scalar()
    newest = (await db.execute(select(func.max(AuditLog.created_at)).where(cond))).scalar()
    return {
        "count": count,
        "oldest": _iso_z(oldest),
        "newest": _iso_z(newest),
    }


@router.post("/operations/archive")
async def archive_operations(
    body: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission('audit_logs')),
):
    """手动归档清理（B 方案）：先落 CSV 存档（服务端留存 + 可下载），再删除到期记录。

    清理动作本身写一条 tombstone 审计（与删除同事务），审计链可解释、不静默。
    """
    _require_audit_feature()
    before = _parse_before(body)
    rows = (
        (await db.execute(select(AuditLog).where(AuditLog.created_at < before).order_by(AuditLog.id)))
        .scalars()
        .all()
    )
    if not rows:
        return {"archived": 0}

    oldest, newest = rows[0].created_at, rows[-1].created_at
    content = _audit_csv(rows)

    os.makedirs(_ARCHIVE_DIR, exist_ok=True)
    filename = f"audit_archive_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    with open(os.path.join(_ARCHIVE_DIR, filename), "w", encoding="utf-8-sig", newline="") as f:
        f.write(content)

    task_id = uuid.uuid4().hex
    _export_tasks[task_id] = {"status": "ready", "format": "csv", "content": content}

    detail = (
        f"归档清理 {len(rows)} 条审计记录（{oldest.isoformat()} ~ {newest.isoformat()}），"
        f"截止 {before.strftime('%Y-%m-%d')}，存档 {filename}"
    )
    # 复用审计 Hook 骨架（若挂载）合并为单条 tombstone；与删除同事务提交
    skeleton = getattr(request.state, "audit", None)
    log_audit(
        db,
        user=current_user,
        action="archive",
        resource="audit_logs",
        detail=detail,
        audit_obj=skeleton,
    )

    for log in rows:
        await db.delete(log)
    await db.commit()

    return {"archived": len(rows), "task_id": task_id, "file": filename}


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
    content = task["content"]
    if task["format"] == "csv":
        if isinstance(content, str) and not content.startswith("﻿"):
            # BOM：Excel 依赖它识别 UTF-8（与前端 exportToCsv 同约定），否则双击打开中文乱码
            content = "﻿" + content
        return PlainTextResponse(
            content=content,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="audit-log.{task["format"]}"'},
        )
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="audit-log.{task["format"]}"'},
    )
