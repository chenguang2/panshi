from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.config import MAX_PAGE_SIZE
from app.models.cluster import Cluster, ConfigVersion
from app.models.static_resource import StaticResource
from app.models.user import User, UserCluster
from app.schemas.static_resource import StaticResourceResponse
from app.core.deps import require_permission

router = APIRouter(prefix="/static_resources", tags=["static_resources"])


@router.get("", response_model=dict)
async def list_all_static_resources(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    group_name: str = Query("__all__"),
    search: Optional[str] = Query(None),
    cluster_id: Optional[int] = Query(None),
    current_user: User = Depends(require_permission('static_resources')),
):
    query = select(StaticResource)

    if cluster_id is not None:
        query = query.where(StaticResource.cluster_id == cluster_id)

    if group_name == "__ung__":
        query = query.join(Cluster, StaticResource.cluster_id == Cluster.id).where(
            Cluster.group_name.is_(None) | (Cluster.group_name == "")
        )
    elif group_name != "__all__":
        query = query.join(Cluster, StaticResource.cluster_id == Cluster.id).where(
            Cluster.group_name == group_name
        )

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
    cluster_name_map = {}
    cluster_group_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name, Cluster.name, Cluster.group_name).where(Cluster.id.in_(cluster_ids))
        )
        for row in c_result.all():
            cluster_name_map[row[0]] = row[1] or row[2]
            cluster_group_map[row[0]] = row[3] or ""

    # static-resources-ux-close-loop 组 5：route_exists（孤儿路由=false）与发布三列读回
    from app.api.v1.cluster_static_resources import _route_exists_map, _parse_publish_detail

    exists_map = await _route_exists_map(db, resources)

    items = []
    for r in resources:
        resp = StaticResourceResponse.model_validate(r)
        d = resp.model_dump()
        d["cluster_name"] = cluster_name_map.get(r.cluster_id, "")
        d["cluster_group_name"] = cluster_group_map.get(r.cluster_id, "")
        d["route_exists"] = exists_map.get(r.route_id, False)
        d["last_publish_detail"] = _parse_publish_detail(r.last_publish_detail)
        if d.get("file_size"):
            d["file_size_kb"] = round(d["file_size"] / 1024, 1)
        items.append(d)

    return {"total": total, "page": page, "page_size": page_size, "items": items}
