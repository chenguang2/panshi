"""共享的 FastAPI 认证依赖。

统一原先散落在 clusters.py / users.py / ansible_inventory.py / database.py
中的重复认证实现；auth.py 保留其独立实现（含 user.status 校验，行为不同）。
"""
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not authorization:
        raise HTTPException(status_code=401, detail="未认证")

    try:
        if authorization.startswith("Bearer "):
            token = authorization[7:]
        else:
            token = authorization

        payload = decode_access_token(token)
        if payload is None:
            raise HTTPException(status_code=401, detail="未认证")

        user_id = int(payload.get("sub"))
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")

        # 统一状态校验（原 auth.py 独立实现的行为，Phase 1 合并至此）：
        # 被禁用的用户即使持有未过期 token 也立即失效
        if user.status != 1:
            raise HTTPException(status_code=401, detail="用户已禁用")

        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="未认证")


async def get_current_admin_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """管理员守卫：未认证 401，非 admin 角色 403。"""
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
        if user.status != 1:
            raise HTTPException(status_code=401, detail="用户已禁用")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="未认证")
