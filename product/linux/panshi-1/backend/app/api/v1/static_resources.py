from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.cluster import Cluster, ConfigVersion
from app.models.static_resource import StaticResource
from app.models.user import User, UserCluster
from app.schemas.static_resource import StaticResourceResponse
from app.api.v1.clusters import get_current_user

router = APIRouter(prefix="/static_resources", tags=["static_resources"])


@router.get("", response_model=dict)
async def list_all_static_resources(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    cluster_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
):
    query = select(StaticResource)

    if cluster_id is not None:
        query = query.where(StaticResource.cluster_id == cluster_id)

    if current_user.role != "admin":
        uc_result = await db.execute(
            select(UserCluster.cluster_id).where(UserCluster.user_id == current_user.id)
        )
        allowed_ids = [r[0] for r in uc_result.all()]
        if not allowed_ids:
            return {"total": 0, "page": page, "page_size": page_size, "items": []}
        query = query.where(StaticResource.cluster_id.in_(allowed_ids))

    if search:
        pattern = f"%{search}%"
        query = query.where(StaticResource.name.ilike(pattern))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(StaticResource.id)

    result = await db.execute(query)
    resources = result.scalars().all()

    cluster_ids = {r.cluster_id for r in resources}
    cluster_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name, Cluster.name).where(Cluster.id.in_(cluster_ids))
        )
        cluster_map = {row[0]: row[1] or row[2] for row in c_result.all()}

    items = []
    for r in resources:
        resp = StaticResourceResponse.model_validate(r)
        d = resp.model_dump()
        d["cluster_name"] = cluster_map.get(r.cluster_id, "")
        if d.get("file_size"):
            d["file_size_kb"] = round(d["file_size"] / 1024, 1)
        items.append(d)

    return {"total": total, "page": page, "page_size": page_size, "items": items}
