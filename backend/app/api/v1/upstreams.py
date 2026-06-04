from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_db
from app.models.cluster import Cluster, Upstream, UpstreamTarget, ConfigVersion
from app.models.user import User, UserCluster
from app.schemas.cluster import UpstreamWithTargets, UpstreamTargetSchema
from app.api.v1.clusters import get_current_user

router = APIRouter(prefix="/upstreams", tags=["upstreams"])

ALLOWED_SEARCH_FIELDS = {"name", "description"}


@router.get("", response_model=dict)
async def list_all_upstreams(
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    cluster_id: Optional[int] = None,
    load_balance: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    query = select(Upstream)

    # Cluster filter
    if cluster_id:
        query = query.where(Upstream.cluster_id == cluster_id)

    # Load balance filter
    if load_balance:
        query = query.where(Upstream.load_balance == load_balance)

    # Permission filter: non-admin users only see their clusters
    if current_user.role != "admin":
        uc_result = await db.execute(
            select(UserCluster.cluster_id).where(UserCluster.user_id == current_user.id)
        )
        allowed_ids = [r[0] for r in uc_result.all()]
        if not allowed_ids:
            return {"total": 0, "page": page, "page_size": page_size, "items": []}
        query = query.where(Upstream.cluster_id.in_(allowed_ids))

    # Search
    if search:
        pattern = f"%{search}%"
        conditions = [
            getattr(Upstream, field).ilike(pattern)
            for field in ALLOWED_SEARCH_FIELDS
            if hasattr(Upstream, field)
        ]
        query = query.where(or_(*conditions))

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Pagination
    offset_val = (page - 1) * page_size
    query = query.offset(offset_val).limit(page_size).order_by(Upstream.created_at.desc())

    result = await db.execute(query)
    upstreams = result.scalars().all()

    # Batch load cluster names
    cluster_ids = {u.cluster_id for u in upstreams}
    cluster_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name, Cluster.name).where(Cluster.id.in_(cluster_ids))
        )
        cluster_map = {r[0]: r[1] or r[2] for r in c_result.all()}

    # Batch load latest publish time
    upstream_ids = [u.id for u in upstreams]
    pub_map = {}
    if upstream_ids:
        pub_result = await db.execute(
            select(
                ConfigVersion.resource_id,
                func.max(ConfigVersion.created_at).label("latest_ts")
            ).where(
                ConfigVersion.resource_type == "upstream",
                ConfigVersion.resource_id.in_(upstream_ids)
            ).group_by(ConfigVersion.resource_id)
        )
        pub_map = {r.resource_id: r.latest_ts for r in pub_result.all()}

    items = []
    for u in upstreams:
        targets_result = await db.execute(
            select(UpstreamTarget).where(UpstreamTarget.upstream_id == u.id)
        )
        targets = targets_result.scalars().all()
        item = UpstreamWithTargets.model_validate(u)
        item.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
        item.current_version = u.current_version
        ts = pub_map.get(u.id)
        item.published_at = ts.isoformat() + "Z" if ts else None
        # Attach cluster info
        item_dict = item.model_dump()
        item_dict["cluster_name"] = cluster_map.get(u.cluster_id, "")
        items.append(item_dict)

    return {"total": total, "page": page, "page_size": page_size, "items": items}
