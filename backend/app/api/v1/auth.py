from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.core.database import get_db
from app.core.security import verify_password, create_access_token, decode_access_token
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, UserInfo, ChangePasswordRequest

router = APIRouter(prefix="/auth", tags=["auth"])


async def get_current_user(
    token: str = None,
    db: AsyncSession = Depends(get_db)
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无法验证凭据",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无法验证凭据",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无法验证凭据",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user.status != 1:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户已禁用",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    from app.models.user import UserPermission
    result = await db.execute(select(User).where(User.username == request.username))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(request.password, user.password_hash):
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
    
    access_token = create_access_token(data={"sub": str(user.id), "username": user.username, "role": user.role})
    
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
    from app.models.user import User, UserPermission
    user = await get_current_user(authorization, db)
    if user.role == 'admin':
        return {"permissions": []}
    result = await db.execute(select(UserPermission).where(UserPermission.user_id == user.id, UserPermission.enabled == 1))
    return {"permissions": [p.resource_type for p in result.scalars().all()]}


