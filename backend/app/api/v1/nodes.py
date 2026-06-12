from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_db
from app.models.cluster import Node, Cluster
from app.models.user import User, UserCluster
from app.schemas.cluster import NodeResponse
from app.api.v1.clusters import get_current_user
from app.services import edge_sync

router = APIRouter(prefix="/nodes", tags=["nodes"])

ALLOWED_SEARCH_FIELDS = {"ip", "name"}


@router.get("", response_model=dict)
async def list_or_find_nodes(
    # Pagination
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    # Filters
    search: Optional[str] = Query(None),
    cluster_id: Optional[int] = Query(None),
    status: Optional[int] = Query(None),
    # Backward-compat lookup
    ip: Optional[str] = Query(None),
    management_port: Optional[int] = Query(None),
    # Auth
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ── Backward-compatible single-node lookup ──────────────────
    if ip is not None and management_port is not None:
        result = await db.execute(
            select(Node).where(Node.ip == ip, Node.management_port == management_port).limit(1)
        )
        node = result.scalar_one_or_none()
        if not node:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")

        cluster_result = await db.execute(
            select(Cluster.name, Cluster.display_name).where(Cluster.id == node.cluster_id)
        )
        cluster = cluster_result.first()
        cluster_name = cluster.display_name if cluster and cluster.display_name else (cluster.name if cluster else "")

        return {
            "id": node.id,
            "cluster_id": node.cluster_id,
            "cluster_name": cluster_name,
            "ip": node.ip,
            "service_port": node.service_port,
            "management_port": node.management_port,
            "edge_path": node.edge_path,
            "edge_install_path": node.edge_install_path,
            "status": node.status,
        }

    # ── Paginated node list ────────────────────────────────────
    query = select(Node)

    # Cluster filter
    if cluster_id:
        query = query.where(Node.cluster_id == cluster_id)

    # Status filter
    if status is not None:
        query = query.where(Node.status == status)

    # Permission filter: non-admin users only see their clusters
    if current_user.role != "admin":
        uc_result = await db.execute(
            select(UserCluster.cluster_id).where(UserCluster.user_id == current_user.id)
        )
        allowed_ids = [r[0] for r in uc_result.all()]
        if not allowed_ids:
            return {"total": 0, "page": page, "page_size": page_size, "items": []}
        query = query.where(Node.cluster_id.in_(allowed_ids))

    # Search
    if search:
        pattern = f"%{search}%"
        conditions = [
            getattr(Node, field).ilike(pattern)
            for field in ALLOWED_SEARCH_FIELDS
            if hasattr(Node, field)
        ]
        query = query.where(or_(*conditions))

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Pagination
    offset_val = (page - 1) * page_size
    query = query.offset(offset_val).limit(page_size).order_by(Node.created_at.desc())

    result = await db.execute(query)
    nodes = result.scalars().all()

    # Batch load cluster names
    cluster_ids = {n.cluster_id for n in nodes}
    cluster_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name, Cluster.name).where(Cluster.id.in_(cluster_ids))
        )
        cluster_map = {r[0]: r[1] or r[2] for r in c_result.all()}

    items = []
    for n in nodes:
        item = NodeResponse.model_validate(n)
        item_dict = item.model_dump()
        item_dict["cluster_name"] = cluster_map.get(n.cluster_id, "")
        items.append(item_dict)

    return {"total": total, "page": page, "page_size": page_size, "items": items}
