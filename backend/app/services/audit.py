"""操作审计辅助：写入 sys_audit_log 表（Phase 6 / M1）。

复用既有 AuditLog 模型（models/system.py）。审计行随主流程 flush/commit 落库，
不单独 commit（避免提交主事务外的未决变更）；写入失败绝不阻断主流程。
"""
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system import AuditLog

logger = logging.getLogger("app.audit")


def log_audit(
    db: AsyncSession,
    *,
    user=None,
    action: str,
    resource: str,
    resource_id=None,
    detail: str | None = None,
) -> None:
    """同步添加一条审计记录。

    - user: 当前用户（可为 None，自动记 system）
    - action: 操作名（create/update/delete/publish/rollback/switch/...）
    - resource / resource_id: 资源类型与主键
    - detail: 可读说明
    """
    try:
        db.add(
            AuditLog(
                user_id=user.id if user else None,
                username=user.username if user else "system",
                action=action,
                resource=resource,
                resource_id=resource_id,
                detail=detail,
            )
        )
    except Exception:
        logger.exception("audit log write failed (action=%s, resource=%s)", action, resource)