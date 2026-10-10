from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.config import MAX_PAGE_SIZE
from app.models.cluster import Cluster, GlobalRule
from app.models.user import User, UserCluster
from app.schemas.cluster import GlobalRuleResponse
from app.services import edge_sync
from app.core.deps import require_permission

router = APIRouter(prefix="/global_rules", tags=["global_rules"])


@router.get("", response_model=dict)
async def list_all_global_rules(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    group_name: str = Query("__all__"),
    search: Optional[str] = Query(None),
    cluster_id: Optional[int] = Query(None),
    current_user: User = Depends(require_permission('global_rules')),
):
    query = select(GlobalRule)

    if cluster_id is not None:
        query = query.where(GlobalRule.cluster_id == cluster_id)

    if group_name == "__ung__":
        query = query.join(Cluster, GlobalRule.cluster_id == Cluster.id).where(
            Cluster.group_name.is_(None) | (Cluster.group_name == "")
        )
    elif group_name != "__all__":
        query = query.join(Cluster, GlobalRule.cluster_id == Cluster.id).where(
            Cluster.group_name == group_name
        )

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
    cluster_name_map = {}
    cluster_group_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name, Cluster.name, Cluster.group_name).where(Cluster.id.in_(cluster_ids))
        )
        for row in c_result.all():
            cluster_name_map[row[0]] = row[1] or row[2]
            cluster_group_map[row[0]] = row[3] or ""

    gr_ids = [r.id for r in rules]
    # 批量回查最新发布时间 + pending 推导（published_at 回查与 pending
    # 推导收敛在 edge_sync 共享单点，与集群子页端点同口径，禁止各自实现）
    pub_map = await edge_sync.load_publish_time_map(db, "global_rule", gr_ids)

    items = []
    for r in rules:
        item = GlobalRuleResponse.model_validate(r)
        ts = pub_map.get(r.id)
        item.published_at = ts.isoformat() + "Z" if ts else None
        item.pending_publish = edge_sync.derive_pending_publish(
            current_version=r.current_version,
            updated_at=r.updated_at,
            published_at=ts,
            last_publish_status=r.last_publish_status,
        )
        d = item.model_dump()
        d["cluster_name"] = cluster_name_map.get(r.cluster_id, "")
        d["cluster_group_name"] = cluster_group_map.get(r.cluster_id, "")
        items.append(d)

    return {"total": total, "page": page, "page_size": page_size, "items": items}
