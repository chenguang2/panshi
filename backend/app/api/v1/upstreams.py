from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from fastapi import Query
import uuid

from app.core.database import get_db
from app.models.cluster import Cluster, Upstream, UpstreamTarget
from app.models.user import User, UserCluster
from app.schemas.cluster import UpstreamWithTargets, UpstreamTargetSchema
from app.services import edge_sync
from app.services.status_counts import publish_status_counts, latest_publish_subquery
from app.core.deps import require_permission

router = APIRouter(prefix="/upstreams", tags=["upstreams"])

ALLOWED_SEARCH_FIELDS = {"name", "description"}


def _apply_upstream_filters(
    query,
    *,
    group_name: str,
    search: Optional[str],
    cluster_id: Optional[int],
    load_balance: Optional[str],
    allowed_ids: Optional[list[int]],
):
    """上游列表与状态计数的**唯一**过滤实现（filter-architecture D4）。"""
    if cluster_id:
        query = query.where(Upstream.cluster_id == cluster_id)

    if group_name == "__ung__":
        query = query.join(Cluster, Upstream.cluster_id == Cluster.id).where(
            Cluster.group_name.is_(None) | (Cluster.group_name == "")
        )
    elif group_name != "__all__":
        query = query.join(Cluster, Upstream.cluster_id == Cluster.id).where(Cluster.group_name == group_name)

    if load_balance:
        query = query.where(Upstream.load_balance == load_balance)

    if allowed_ids is not None:
        query = query.where(Upstream.cluster_id.in_(allowed_ids))

    if search:
        pattern = f"%{search}%"
        conditions = [getattr(Upstream, field).ilike(pattern) for field in ALLOWED_SEARCH_FIELDS if hasattr(Upstream, field)]
        query = query.where(or_(*conditions))

    return query


async def _allowed_cluster_ids(db: AsyncSession, current_user: User) -> Optional[list[int]]:
    if current_user.role == "admin":
        return None
    result = await db.execute(select(UserCluster.cluster_id).where(UserCluster.user_id == current_user.id))
    return [r[0] for r in result.all()]


@router.get("", response_model=dict)
async def list_all_upstreams(
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    group_name: str = "__all__",
    search: Optional[str] = None,
    cluster_id: Optional[int] = None,
    load_balance: Optional[str] = None,
    publish_status: Optional[str] = Query(None, description="published / pending / unpublished"),
    current_user: User = Depends(require_permission('upstreams')),
):
    allowed_ids = await _allowed_cluster_ids(db, current_user)
    if allowed_ids == []:
        return {"total": 0, "page": page, "page_size": page_size, "items": []}
    query = _apply_upstream_filters(
        select(Upstream),
        group_name=group_name,
        search=search,
        cluster_id=cluster_id,
        load_balance=load_balance,
        allowed_ids=allowed_ids,
    )

    # Publish status filter — 互斥三分区（与 routes 列表/routes status-counts 同口径）：
    #   unpublished = 无 current_version；pending = 有版本且 updated_at > 最近发布时间；其余即 published。
    if publish_status:
        if publish_status not in ("published", "pending", "unpublished"):
            raise HTTPException(status_code=422, detail="publish_status 仅支持 published/pending/unpublished")
        latest_sq = latest_publish_subquery("upstream")
        query = query.outerjoin(latest_sq, Upstream.id == latest_sq.c.resource_id)
        is_pending = Upstream.updated_at > latest_sq.c.latest_ts
        if publish_status == "unpublished":
            query = query.where(Upstream.current_version.is_(None))
        elif publish_status == "pending":
            query = query.where(Upstream.current_version.isnot(None), is_pending)
        else:
            query = query.where(
                Upstream.current_version.isnot(None),
                or_(latest_sq.c.latest_ts.is_(None), Upstream.updated_at <= latest_sq.c.latest_ts),
            )

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


@router.get("/status-counts", response_model=dict)
async def upstream_status_counts(
    db: AsyncSession = Depends(get_db),
    group_name: str = "__all__",
    search: Optional[str] = None,
    cluster_id: Optional[int] = None,
    load_balance: Optional[str] = None,
    current_user: User = Depends(require_permission("upstreams")),
):
    """上游发布状态三分区的**权威计数**（filter-architecture D4 / 决策 D4）。

    与列表业务筛选同口径；不含 publish_status 本身。前端页头徽标与状态 chips 共用此值，
    取代 `page_size=500` 抽样（总数 > 500 时会失真）。
    """
    allowed_ids = await _allowed_cluster_ids(db, current_user)
    if allowed_ids == []:
        return {"total": 0, "published": 0, "pending": 0, "unpublished": 0}
    base = _apply_upstream_filters(
        select(Upstream),
        group_name=group_name,
        search=search,
        cluster_id=cluster_id,
        load_balance=load_balance,
        allowed_ids=allowed_ids,
    )
    counts = await publish_status_counts(db, model=Upstream, resource_type="upstream", base_filter=base)
    # 页头「N 目标」补充维度（filter-architecture 决策 G3-甲）：目标节点总数，与计数同筛选口径
    id_sub = base.with_only_columns(Upstream.id).subquery()
    target_rows = await db.execute(
        select(func.count())
        .select_from(UpstreamTarget)
        .where(UpstreamTarget.upstream_id.in_(select(id_sub.c.id)))
    )
    counts["target_count"] = int(target_rows.scalar() or 0)
    # 页头「N 集群」补充维度：涉及的不同集群数（与「N 目标」二选一由前端决定，两个都返回）
    cluster_rows = await db.execute(
        select(func.count(func.distinct(Upstream.cluster_id))).where(Upstream.id.in_(select(id_sub.c.id)))
    )
    counts["cluster_count"] = int(cluster_rows.scalar() or 0)
    return counts
