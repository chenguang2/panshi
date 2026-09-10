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
    audit_obj: AuditLog | None = None,
) -> AuditLog | None:
    """同步添加一条审计记录。

    - user: 当前用户（可为 None，自动记 system）
    - action: 操作名（create/update/delete/publish/rollback/switch/...）
    - resource / resource_id: 资源类型与主键
    - detail: 可读说明
    - audit_obj: 审计 Hook 预创建的骨架对象（request.state.audit）。
      提供时仅更新该对象字段并原样返回，**不再新建行**（同一事务仅落 1 条）；
      省略时保持旧行为新建 AuditLog。

    写入失败绝不阻断主流程。
    """
    try:
        if audit_obj is not None:
            audit_obj.user_id = user.id if user else audit_obj.user_id
            audit_obj.username = user.username if user else audit_obj.username
            if action:
                audit_obj.action = action
            if resource:
                audit_obj.resource = resource
            if resource_id is not None:
                audit_obj.resource_id = resource_id
            if detail:
                audit_obj.detail = detail
            return audit_obj
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
    return None

def enrich_audit(request, *, resource_id=None, detail=None) -> None:
    """业务 handler 便捷增强：把 resource_id/detail 写入审计骨架（flush 前）。

    - request 上无骨架（未注册 hook / 只读跳过）时安全空操作
    - 必须在 handler 的 db.commit() 之前调用，保证与业务同事务落库
    """
    if request is None:
        return
    state = getattr(request, "state", None)
    audit = getattr(state, "audit", None) if state is not None else None
    if audit is None:
        return
    if resource_id is not None:
        audit.resource_id = resource_id
    if detail:
        audit.detail = detail
