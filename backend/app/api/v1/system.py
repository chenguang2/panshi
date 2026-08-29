"""System-level endpoints (no auth required)."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin_user
from app.core.features import get_features
from app.models.system import AuditLog

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/features")
async def get_system_features():
    """Return the current deployment's feature configuration.

    This endpoint does NOT require authentication because the frontend
    needs it during bootstrap, before the user logs in.
    """
    return get_features()


@router.get("/operations")
async def list_recent_operations(
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin_user),
):
    """最近操作审计日志（仅管理员）。"""
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 500))
    )
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "username": log.username,
            "action": log.action,
            "resource": log.resource,
            "resource_id": log.resource_id,
            "detail": log.detail,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]
