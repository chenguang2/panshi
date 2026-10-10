from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
import uuid

from app.core.database import get_db
from app.models.cluster import Cluster, Upstream, UpstreamTarget
from app.models.user import User, UserCluster
from app.schemas.cluster import UpstreamWithTargets, UpstreamTargetSchema
from app.services import edge_sync
from app.core.deps import require_permission

router = APIRouter(prefix="/upstreams", tags=["upstreams"])

ALLOWED_SEARCH_FIELDS = {"name", "description"}


@router.get("", response_model=dict)
async def list_all_upstreams(
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    group_name: str = "__all__",
    search: Optional[str] = None,
    cluster_id: Optional[int] = None,
    load_balance: Optional[str] = None,
    current_user: User = Depends(require_permission('upstreams')),
):
    query = select(Upstream)

    # Cluster filter
    if cluster_id:
        query = query.where(Upstream.cluster_id == cluster_id)

    # Group filter
    if group_name == "__ung__":
        query = query.join(Cluster, Upstream.cluster_id == Cluster.id).where(
            Cluster.group_name.is_(None) | (Cluster.group_name == "")
        )
    elif group_name != "__all__":
        query = query.join(Cluster, Upstream.cluster_id == Cluster.id).where(
            Cluster.group_name == group_name
        )

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
    query = query.offset(offset_val).limit(page_size).order_by(Upstream.name)

    result = await db.execute(query)
    upstreams = result.scalars().all()

    # Batch load cluster names
    cluster_ids = {u.cluster_id for u in upstreams}
    cluster_name_map = {}
    cluster_group_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name, Cluster.name, Cluster.group_name).where(Cluster.id.in_(cluster_ids))
        )
        for r in c_result.all():
            cluster_name_map[r[0]] = r[1] or r[2]
            cluster_group_map[r[0]] = r[3] or ""

    # Batch load latest publish time + pending 推导（published_at 回查与 pending
    # 推导收敛在共享 helper，与集群子页端点口径单点一致）
    upstream_ids = [u.id for u in upstreams]
    pub_map = await edge_sync.load_publish_time_map(db, "upstream", upstream_ids)

    items = []
    # 批量查询 targets（消除 N+1）
    targets_map: dict[int, list[UpstreamTarget]] = {}
    if upstream_ids:
        targets_result = await db.execute(
            select(UpstreamTarget)
            .where(UpstreamTarget.upstream_id.in_(upstream_ids))
            .order_by(UpstreamTarget.id)
        )
        for t in targets_result.scalars().all():
            targets_map.setdefault(t.upstream_id, []).append(t)

    for u in upstreams:
        # edge_uuid may be None for legacy rows; generate fallback to satisfy schema
        upstream_data = {**u.__dict__}
        upstream_data["edge_uuid"] = u.edge_uuid or str(uuid.uuid4())
        item = UpstreamWithTargets.model_validate(upstream_data)
        item.targets = [UpstreamTargetSchema.model_validate(t) for t in targets_map.get(u.id, [])]
        item.current_version = u.current_version
        ts = pub_map.get(u.id)
        item.published_at = ts.isoformat() + "Z" if ts else None
        item.pending_publish = edge_sync.derive_pending_publish(
            current_version=u.current_version,
            updated_at=u.updated_at,
            published_at=ts,
            last_publish_status=u.last_publish_status,
        )
        # Attach cluster info
        item_dict = item.model_dump()
        item_dict["cluster_name"] = cluster_name_map.get(u.cluster_id, "")
        item_dict["cluster_group_name"] = cluster_group_map.get(u.cluster_id, "")
        items.append(item_dict)

    return {"total": total, "page": page, "page_size": page_size, "items": items}
