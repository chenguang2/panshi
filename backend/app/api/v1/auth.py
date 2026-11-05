import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.features import is_default_password_guard_enabled
from app.core.security import (
    SEED_DEFAULT_PASSWORD,
    verify_password,
    create_access_token,
    hash_password,
)
from app.core.audit_hook import audit_start
from app.services.audit import enrich_audit
from app.models.user import User, UserPermission
from app.schemas.auth import LoginRequest, LoginResponse, UserInfo, ChangePasswordRequest

router = APIRouter(prefix="/auth", tags=["auth"])

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 登录失败速率限制（M2a）：模块级内存计数器，键 = (username, client_ip)，
# 值 = (窗口内失败次数, 窗口起点 monotonic 时间)。仅统计失败尝试，成功登录
# 即清除该键；窗口过期自动清零。单进程内存实现，多 worker 部署各自独立计数。
# 模块级变量便于测试 monkeypatch / 直接操纵。
# ---------------------------------------------------------------------------
_LOGIN_FAILURE_WINDOW_SECONDS = 600  # 10 分钟固定窗口
_LOGIN_MAX_FAILURES = 5
_login_failures: dict[tuple[str, str], tuple[int, float]] = {}


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _prune_expired_failures(now: float) -> None:
    """清理窗口已过期的键，防止长期运行下计数器无限增长。"""
    expired = [
        key
        for key, (_count, start) in _login_failures.items()
        if now - start >= _LOGIN_FAILURE_WINDOW_SECONDS
    ]
    for key in expired:
        _login_failures.pop(key, None)


def _ensure_not_rate_limited(username: str, ip: str) -> None:
    """窗口内失败次数达到上限时直接拒绝（429），窗口过期则放行。"""
    now = time.monotonic()
    entry = _login_failures.get((username, ip))
    if (
        entry is not None
        and now - entry[1] < _LOGIN_FAILURE_WINDOW_SECONDS
        and entry[0] >= _LOGIN_MAX_FAILURES
    ):
        logger.warning("登录限流触发: username=%s ip=%s", username, ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录失败次数过多，请稍后再试",
        )


def _record_login_failure(username: str, ip: str) -> None:
    now = time.monotonic()
    entry = _login_failures.get((username, ip))
    if entry is None or now - entry[1] >= _LOGIN_FAILURE_WINDOW_SECONDS:
        _login_failures[(username, ip)] = (1, now)
    else:
        _login_failures[(username, ip)] = (entry[0] + 1, entry[1])
    _prune_expired_failures(now)


def _clear_login_failures(username: str, ip: str) -> None:
    _login_failures.pop((username, ip), None)


@router.post("/login", response_model=LoginResponse)
async def login(
    request: LoginRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    ip = _client_ip(http_request)
    _ensure_not_rate_limited(request.username, ip)

    result = await db.execute(select(User).where(User.username == request.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.password_hash):
        _record_login_failure(request.username, ip)
        logger.info("登录失败: username=%s ip=%s", request.username, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.status != 1:
        logger.info("登录拒绝（用户已禁用）: username=%s ip=%s", user.username, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户已禁用",
            headers={"WWW-Authenticate": "Bearer"},
        )

    _clear_login_failures(request.username, ip)
    logger.info("登录成功: username=%s ip=%s", user.username, ip)

    # 默认口令守卫（default-password-guard-switch D2/D3）：仅开关开启时复核
    # （关闭态零额外 bcrypt 成本）；命中则在响应置标记并在 token 嵌 pwd_chg claim，
    # 由 get_current_user 出口硬拦截。任何用户命中即标记，不限于种子 admin。
    must_change_password = False
    if is_default_password_guard_enabled() and verify_password(
        SEED_DEFAULT_PASSWORD, user.password_hash
    ):
        must_change_password = True
        logger.info("登录检测到默认口令: username=%s ip=%s", user.username, ip)

    # 附带 pwd_ver claim：密码重置/变更后存量 token 自动失效（M2b）
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "username": user.username,
            "role": user.role,
            **({"pwd_chg": 1} if must_change_password else {}),
        },
        password_hash=user.password_hash,
    )
    
    perm_result = await db.execute(select(UserPermission).where(UserPermission.user_id == user.id, UserPermission.enabled == 1))
    permissions = [p.resource_type for p in perm_result.scalars().all()]
    
    return LoginResponse(
        access_token=access_token,
        token_type="Bearer",
        user=UserInfo(id=user.id, username=user.username, role=user.role, status=user.status),
        permissions=permissions if user.role != 'admin' else [],
        must_change_password=must_change_password,
    )


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """自助修改密码（default-password-guard-switch D4）：旧口令验证 → 更新 →
    签发新 token（pwd_ver 自动吊销旧 token）→ 连同 user/permissions 返回，
    前端免二次登录刷新会话。通用能力，不依赖守卫开关。

    鉴权走标准 DI（get_current_user 自动注入 request）——守卫白名单按
    request.url.path 放行本端点，且未认证请求在 body 校验前即 401 短路
    （对齐 test_security_guard 的采样语义）。"""
    if not verify_password(body.old_password, current_user.password_hash):
        logger.info(
            "改密失败（旧密码不符）: username=%s ip=%s",
            current_user.username, _client_ip(http_request),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码不正确",
        )

    current_user.password_hash = hash_password(body.new_password)
    enrich_audit(http_request, resource_id=current_user.id, detail=f"用户 {current_user.username} 修改自己的密码")
    await db.commit()

    access_token = create_access_token(
        data={"sub": str(current_user.id), "username": current_user.username, "role": current_user.role},
        password_hash=current_user.password_hash,
    )
    perm_result = await db.execute(
        select(UserPermission).where(
            UserPermission.user_id == current_user.id, UserPermission.enabled == 1
        )
    )
    permissions = [p.resource_type for p in perm_result.scalars().all()]
    logger.info("改密成功: username=%s ip=%s", current_user.username, _client_ip(http_request))
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "user": UserInfo(id=current_user.id, username=current_user.username, role=current_user.role, status=current_user.status),
        "permissions": permissions if current_user.role != "admin" else [],
    }


@router.post("/logout")
async def logout():
    return {"message": "Logout successful"}


@router.get("/me/permissions")
async def get_my_permissions(
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    # 直调注入 http_request：默认口令守卫的白名单按 request.url.path 放行（本端点在白名单内），
    # 不传 request 会被自家 403 门拦住。
    user = await get_current_user(authorization, db, http_request)
    if user.role == 'admin':
        return {"permissions": []}
    result = await db.execute(select(UserPermission).where(UserPermission.user_id == user.id, UserPermission.enabled == 1))
    return {"permissions": [p.resource_type for p in result.scalars().all()]}


