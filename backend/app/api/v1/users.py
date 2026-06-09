from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.core.database import get_db
from app.core.security import decode_access_token, hash_password
from app.models.user import User, UserPermission, UserCluster
from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserListResponse, PasswordResetRequest, ClusterAssignRequest
from app.schemas.auth import PermissionRequest
from app.services import edge_sync

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


async def get_current_admin_user(
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

        if user.role != "admin":
            raise HTTPException(status_code=403, detail="需要管理员权限")

        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="未认证")


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

        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="未认证")


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    return UserResponse.model_validate(current_user)


@router.get("", response_model=UserListResponse)
async def list_users(
    keyword: Optional[str] = None,
    role: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    query = select(User)

    if keyword:
        query = query.where(User.username.contains(keyword))
    if role:
        query = query.where(User.role == role)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    items = []
    for u in users:
        user_data = UserResponse.model_validate(u)
        items.append(user_data)

    if users:
        user_ids = [u.id for u in users]
        perm_query = select(UserPermission).where(
            UserPermission.user_id.in_(user_ids),
            UserPermission.enabled == 1
        )
        perm_result = await db.execute(perm_query)
        for p in perm_result.scalars().all():
            for item in items:
                if item.id == p.user_id:
                    item.permissions.append(p.resource_type)
                    break

            cluster_query = select(UserCluster).where(
            UserCluster.user_id.in_(user_ids)
        )
        cluster_result = await db.execute(cluster_query)
        for uc in cluster_result.scalars().all():
            for item in items:
                if item.id == uc.user_id:
                    item.cluster_ids.append(uc.cluster_id)
                    break

    return UserListResponse(total=total, items=items)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    existing = await db.execute(select(User).where(User.username == user.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")

    db_user = User(
        username=user.username,
        password_hash=hash_password(user.password),
        role=user.role,
        status=user.status
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return UserResponse.model_validate(db_user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    user = await edge_sync.get_or_404(db, User, id=user_id, detail="用户不存在")
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    user = await edge_sync.get_or_404(db, User, id=user_id, detail="用户不存在")

    if user_update.role is not None:
        user.role = user_update.role
    if user_update.status is not None:
        user.status = user_update.status

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    user = await edge_sync.get_or_404(db, User, id=user_id, detail="用户不存在")

    if user.role == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="不能删除管理员用户")

    await db.delete(user)
    await db.commit()
    return {"message": "用户已删除"}


@router.put("/{user_id}/password")
async def reset_password(
    user_id: int,
    request: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    user = await edge_sync.get_or_404(db, User, id=user_id, detail="用户不存在")

    user.password_hash = hash_password(request.new_password)
    await db.commit()
    return {"message": "密码重置成功"}


@router.get("/{user_id}/clusters")
async def get_user_clusters(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    result = await db.execute(select(UserCluster).where(UserCluster.user_id == user_id))
    clusters = result.scalars().all()
    return {"cluster_ids": [c.cluster_id for c in clusters]}


@router.put("/{user_id}/clusters")
async def assign_clusters(
    user_id: int,
    request: ClusterAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    await edge_sync.get_or_404(db, User, id=user_id, detail="用户不存在")

    await db.execute(UserCluster.__table__.delete().where(UserCluster.user_id == user_id))

    for cluster_id in request.cluster_ids:
        db.add(UserCluster(user_id=user_id, cluster_id=cluster_id))

    await db.commit()
    return {"message": "Clusters assigned"}


@router.get("/{user_id}/permissions")
async def get_user_permissions(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    result = await db.execute(select(UserPermission).where(UserPermission.user_id == user_id, UserPermission.enabled == 1))
    perms = [p.resource_type for p in result.scalars().all()]
    return {"user_id": user_id, "permissions": perms}


@router.put("/{user_id}/permissions")
async def update_user_permissions(
    user_id: int,
    request: PermissionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    await edge_sync.get_or_404(db, User, id=user_id, detail="用户不存在")

    await db.execute(UserPermission.__table__.delete().where(UserPermission.user_id == user_id))

    for perm in request.permissions:
        db.add(UserPermission(user_id=user_id, resource_type=perm, enabled=1))

    await db.commit()
    return {"message": "Permissions updated", "permissions": request.permissions}