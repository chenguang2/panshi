from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.config import MAX_PAGE_SIZE
from app.models.cluster import Cluster, PluginConfig, ConfigVersion
from app.models.user import User, UserCluster
from app.schemas.cluster import PluginConfigResponse
from app.api.v1.clusters import get_current_user

router = APIRouter(prefix="/plugin_configs", tags=["plugin_configs"])


@router.get("", response_model=dict)
async def list_all_plugin_configs(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    search: Optional[str] = Query(None),
    cluster_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
):
    query = select(PluginConfig)

    if cluster_id is not None:
        query = query.where(PluginConfig.cluster_id == cluster_id)

    if current_user.role != "admin":
        uc_result = await db.execute(
            select(UserCluster.cluster_id).where(UserCluster.user_id == current_user.id)
        )
        allowed_ids = [r[0] for r in uc_result.all()]
        if not allowed_ids:
            return {"total": 0, "page": page, "page_size": page_size, "items": []}
        query = query.where(PluginConfig.cluster_id.in_(allowed_ids))

    if search:
        pattern = f"%{search}%"
        query = query.where(PluginConfig.name.ilike(pattern))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(PluginConfig.id)

    result = await db.execute(query)
    configs = result.scalars().all()

    cluster_ids = {c.cluster_id for c in configs}
    cluster_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name, Cluster.name).where(Cluster.id.in_(cluster_ids))
        )
        cluster_map = {r[0]: r[1] or r[2] for r in c_result.all()}

    pc_ids = [c.id for c in configs]
    pub_map = {}
    if pc_ids:
        pub_result = await db.execute(
            select(ConfigVersion.resource_id, func.max(ConfigVersion.created_at).label("ts"))
            .where(ConfigVersion.resource_type == "plugin_config", ConfigVersion.resource_id.in_(pc_ids))
            .group_by(ConfigVersion.resource_id)
        )
        pub_map = {r.resource_id: r.ts for r in pub_result.all()}

    items = []
    for c in configs:
        r = PluginConfigResponse.model_validate(c)
        ts = pub_map.get(c.id)
        r.published_at = ts.isoformat() + "Z" if ts else None
        item = r.model_dump()
        item["cluster_name"] = cluster_map.get(c.cluster_id, "")
        items.append(item)

    return {"total": total, "page": page, "page_size": page_size, "items": items}
