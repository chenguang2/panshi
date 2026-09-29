import time

from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import verify_password, create_access_token
from app.models.user import User, UserPermission
from app.schemas.auth import LoginRequest, LoginResponse, UserInfo, ChangePasswordRequest

router = APIRouter(prefix="/auth", tags=["auth"])


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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.status != 1:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户已禁用",
            headers={"WWW-Authenticate": "Bearer"},
        )

    _clear_login_failures(request.username, ip)

    # 附带 pwd_ver claim：密码重置/变更后存量 token 自动失效（M2b）
    access_token = create_access_token(
        data={"sub": str(user.id), "username": user.username, "role": user.role},
        password_hash=user.password_hash,
    )
    
    perm_result = await db.execute(select(UserPermission).where(UserPermission.user_id == user.id, UserPermission.enabled == 1))
    permissions = [p.resource_type for p in perm_result.scalars().all()]
    
    return LoginResponse(
        access_token=access_token,
        token_type="Bearer",
        user=UserInfo(id=user.id, username=user.username, role=user.role, status=user.status),
        permissions=permissions if user.role != 'admin' else []
    )


@router.post("/logout")
async def logout():
    return {"message": "Logout successful"}


@router.get("/me/permissions")
async def get_my_permissions(
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None)
):
    user = await get_current_user(authorization, db)
    if user.role == 'admin':
        return {"permissions": []}
    result = await db.execute(select(UserPermission).where(UserPermission.user_id == user.id, UserPermission.enabled == 1))
    return {"permissions": [p.resource_type for p in result.scalars().all()]}


