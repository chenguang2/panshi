from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.cluster import Cluster, GlobalRule, ConfigVersion
from app.models.user import User, UserCluster
from app.schemas.cluster import GlobalRuleResponse
from app.api.v1.clusters import get_current_user

router = APIRouter(prefix="/global_rules", tags=["global_rules"])


@router.get("", response_model=dict)
async def list_all_global_rules(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    cluster_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
):
    query = select(GlobalRule)

    if cluster_id is not None:
        query = query.where(GlobalRule.cluster_id == cluster_id)

    if current_user.role != "admin":
        uc_result = await db.execute(
            select(UserCluster.cluster_id).where(UserCluster.user_id == current_user.id)
        )
        allowed_ids = [r[0] for r in uc_result.all()]
        if not allowed_ids:
            return {"total": 0, "page": page, "page_size": page_size, "items": []}
        query = query.where(GlobalRule.cluster_id.in_(allowed_ids))

    if search:
        pattern = f"%{search}%"
        query = query.where(GlobalRule.name.ilike(pattern))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(GlobalRule.id)

    result = await db.execute(query)
    rules = result.scalars().all()

    cluster_ids = {r.cluster_id for r in rules}
    cluster_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name).where(Cluster.id.in_(cluster_ids))
        )
        cluster_map = {row[0]: row[1] for row in c_result.all()}

    gr_ids = [r.id for r in rules]
    pub_map = {}
    if gr_ids:
        pub_result = await db.execute(
            select(ConfigVersion.resource_id, func.max(ConfigVersion.created_at).label("ts"))
            .where(ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id.in_(gr_ids))
            .group_by(ConfigVersion.resource_id)
        )
        pub_map = {row.resource_id: row.ts for row in pub_result.all()}

    items = []
    for r in rules:
        item = GlobalRuleResponse.model_validate(r)
        ts = pub_map.get(r.id)
        item.published_at = ts.isoformat() + "Z" if ts else None
        d = item.model_dump()
        d["cluster_name"] = cluster_map.get(r.cluster_id, "")
        items.append(d)

    return {"total": total, "page": page, "page_size": page_size, "items": items}
