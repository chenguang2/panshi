import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, exists

from app.core.database import get_db
from app.config import MAX_PAGE_SIZE
from app.models.cluster import Cluster, Route, RoutePlugin, ConfigVersion, Upstream
from app.models.user import User, UserCluster
from app.schemas.route import RouteListResponse, RouteResponse
from app.api.v1.cluster_routes import route_to_response
from app.core.deps import require_permission
from app.services import edge_sync

router = APIRouter(prefix="/routes", tags=["routes"])

ALLOWED_SEARCH_FIELDS = {"name", "uri", "description", "hosts"}
ALLOWED_SORT_FIELDS = {"name", "uri", "priority", "status", "created_at"}


@router.get("", response_model=RouteListResponse)
async def list_all_routes(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    group_name: str = Query("__all__"),
    search: Optional[str] = Query(None),
    cluster_id: Optional[int] = Query(None),
    method: Optional[str] = Query(None, description="Filter by HTTP method"),
    upstream_id: Optional[int] = Query(None, description="Filter by upstream ID"),
    publish_status: Optional[str] = Query(None, description="published or unpublished"),
    plugin: Optional[str] = Query(None, description="Filter by plugin name"),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("asc"),
    current_user: User = Depends(require_permission('routes')),
):
    query = select(Route)

    # Cluster filter
    if cluster_id is not None:
        query = query.where(Route.cluster_id == cluster_id)

    # Group filter — JOIN Cluster table (no relationship defined, use explicit JOIN)
    if group_name == "__ung__":
        query = query.join(Cluster, Route.cluster_id == Cluster.id).where(
            Cluster.group_name.is_(None) | (Cluster.group_name == "")
        )
    elif group_name != "__all__":
        query = query.join(Cluster, Route.cluster_id == Cluster.id).where(
            Cluster.group_name == group_name
        )

    # Method filter
    if method:
        query = query.where(Route.methods.ilike(f"%{method}%"))

    # Upstream filter
    if upstream_id is not None:
        query = query.where(Route.upstream_id == upstream_id)

    # Permission filter
    if current_user.role != "admin":
        uc_result = await db.execute(
            select(UserCluster.cluster_id).where(UserCluster.user_id == current_user.id)
        )
        allowed_ids = [r[0] for r in uc_result.all()]
        if not allowed_ids:
            return RouteListResponse(total=0, page=page, page_size=page_size, items=[])
        query = query.where(Route.cluster_id.in_(allowed_ids))

    # Search
    if search:
        pattern = f"%{search}%"
        conditions = [
            getattr(Route, field).ilike(pattern)
            for field in ALLOWED_SEARCH_FIELDS
            if hasattr(Route, field)
        ]
        query = query.where(or_(*conditions))

    # Publish status filter — 互斥三分区（batch1 组4 4.5，评审裁决 A3）：
    #   published   = 有 current_version 且非 pending；
    #   pending     = 有 current_version 且存在未下发修改（updated_at > 最近发布时间，
    #                 语义与 edge_sync.derive_pending_publish 一致）；
    #   unpublished = 无 current_version（既有语义不变；历史版本删光的守卫行
    #                 有 current_version，按分区规则落入 published，不再误入 unpublished）。
    # 有意的行为变化：旧「published = 存在任意 ConfigVersion」作废。
    if publish_status:
        if publish_status not in ("published", "pending", "unpublished"):
            raise HTTPException(
                status_code=422,
                detail="publish_status 仅支持 published/pending/unpublished",
            )
        latest_pub_sq = (
            select(
                ConfigVersion.resource_id,
                func.max(ConfigVersion.created_at).label("latest_ts"),
            )
            .where(ConfigVersion.resource_type == "route")
            .group_by(ConfigVersion.resource_id)
            .subquery()
        )
        query = query.outerjoin(latest_pub_sq, Route.id == latest_pub_sq.c.resource_id)
        is_pending = Route.updated_at > latest_pub_sq.c.latest_ts
        if publish_status == "unpublished":
            query = query.where(Route.current_version.is_(None))
        elif publish_status == "pending":
            query = query.where(Route.current_version.isnot(None), is_pending)
        else:  # published
            query = query.where(
                Route.current_version.isnot(None),
                or_(
                    latest_pub_sq.c.latest_ts.is_(None),
                    Route.updated_at <= latest_pub_sq.c.latest_ts,
                ),
            )

    # Plugin filter (EXISTS subquery — only runs when plugin param is provided)
    if plugin:
        query = query.where(
            exists().where(
                RoutePlugin.route_id == Route.id,
                RoutePlugin.plugin_name == plugin
            )
        )

    # Sort
    if sort_by and sort_by in ALLOWED_SORT_FIELDS:
        col = getattr(Route, sort_by)
        if sort_order == "desc":
            col = col.desc()
        query = query.order_by(col)
    else:
        query = query.order_by(Route.name)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    routes = result.scalars().all()

    # Batch cluster names
    cluster_ids = {r.cluster_id for r in routes}
    cluster_name_map = {}
    cluster_group_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name, Cluster.name, Cluster.group_name).where(Cluster.id.in_(cluster_ids))
        )
        for r in c_result.all():
            cluster_name_map[r[0]] = r[1] or r[2]
            cluster_group_map[r[0]] = r[3] or ""

    upstream_ids = {r.upstream_id for r in routes if r.upstream_id}
    upstream_map = {}
    if upstream_ids:
        u_result = await db.execute(
            select(Upstream.id, Upstream.name).where(Upstream.id.in_(upstream_ids))
        )
        upstream_map = {r[0]: r[1] for r in u_result.all()}

    # Batch publish time + 待发布推导（4.1）：单点复用 edge_sync（与 Tab 列表同款）
    route_ids = [r.id for r in routes]
    pub_map = await edge_sync.load_publish_time_map(db, "route", route_ids)

    # Batch plugins
    plugin_map: dict[int, list] = {}
    if route_ids:
        plugin_rows = await db.execute(
            select(RoutePlugin).where(RoutePlugin.route_id.in_(route_ids))
        )
        for rp in plugin_rows.scalars().all():
            if rp.route_id not in plugin_map:
                plugin_map[rp.route_id] = []
            try:
                cfg = json.loads(rp.config) if rp.config else {}
            except (json.JSONDecodeError, TypeError):
                cfg = {}
            plugin_map[rp.route_id].append({"plugin_name": rp.plugin_name, "config": cfg})

    items = []
    for r in routes:
        item = route_to_response(
            r,
            published_at=pub_map.get(r.id).isoformat() + "Z" if pub_map.get(r.id) else None,
            plugins=plugin_map.get(r.id, []),
            pending_publish=edge_sync.derive_pending_publish(
                current_version=r.current_version,
                updated_at=r.updated_at,
                published_at=pub_map.get(r.id),
            ),
        )
        item_dict = item.model_dump()
        item_dict["cluster_name"] = cluster_name_map.get(r.cluster_id, "")
        item_dict["cluster_group_name"] = cluster_group_map.get(r.cluster_id, "")
        item_dict["upstream_name"] = upstream_map.get(r.upstream_id) if r.upstream_id else None
        items.append(item_dict)

    return RouteListResponse(total=total, page=page, page_size=page_size, items=items)


@router.post("/by-edge-uuids", response_model=RouteListResponse)
async def get_routes_by_edge_uuids(
    edge_uuids: list[str],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission('routes')),
):
    """批量查询路由信息（用于指标关联路由名）"""
    if not edge_uuids:
        return RouteListResponse(total=0, page=1, page_size=0, items=[])
    
    query = select(Route).where(Route.edge_uuid.in_(edge_uuids))
    result = await db.execute(query)
    routes = result.scalars().all()

    items = []
    for r in routes:
        item = route_to_response(r)
        item_dict = item.model_dump()
        item_dict["cluster_name"] = ""
        item_dict["cluster_group_name"] = ""
        item_dict["upstream_name"] = None
        items.append(item_dict)

    return RouteListResponse(total=len(routes), page=1, page_size=len(routes), items=items)

