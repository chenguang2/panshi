from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_db
from app.models.cluster import Cluster, Route, RoutePlugin, ConfigVersion
from app.models.user import User, UserCluster
from app.schemas.route import RouteListResponse, RouteResponse
from app.api.v1.cluster_routes import route_to_response
from app.api.v1.clusters import get_current_user

router = APIRouter(prefix="/routes", tags=["routes"])

ALLOWED_SEARCH_FIELDS = {"name", "uri", "description", "hosts"}
ALLOWED_SORT_FIELDS = {"name", "uri", "priority", "status", "created_at"}


@router.get("", response_model=RouteListResponse)
async def list_all_routes(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    cluster_id: Optional[int] = Query(None),
    method: Optional[str] = Query(None, description="Filter by HTTP method"),
    publish_status: Optional[str] = Query(None, description="published or unpublished"),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("asc"),
    current_user: User = Depends(get_current_user),
):
    query = select(Route)

    # Cluster filter
    if cluster_id is not None:
        query = query.where(Route.cluster_id == cluster_id)

    # Method filter
    if method:
        query = query.where(Route.methods.ilike(f"%{method}%"))

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

    # Publish status filter
    if publish_status == "published":
        subq = select(ConfigVersion.resource_id).where(
            ConfigVersion.resource_type == "route"
        ).distinct().subquery()
        query = query.where(Route.id.in_(subq))
    elif publish_status == "unpublished":
        subq = select(ConfigVersion.resource_id).where(
            ConfigVersion.resource_type == "route"
        ).distinct().subquery()
        query = query.where(Route.id.notin_(subq))

    # Sort
    if sort_by and sort_by in ALLOWED_SORT_FIELDS:
        col = getattr(Route, sort_by)
        if sort_order == "desc":
            col = col.desc()
        query = query.order_by(col)
    else:
        query = query.order_by(Route.created_at.desc())

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
    cluster_map = {}
    if cluster_ids:
        c_result = await db.execute(
            select(Cluster.id, Cluster.display_name).where(Cluster.id.in_(cluster_ids))
        )
        cluster_map = {r[0]: r[1] for r in c_result.all()}

    # Batch publish time
    route_ids = [r.id for r in routes]
    pub_map = {}
    if route_ids:
        pub_result = await db.execute(
            select(
                ConfigVersion.resource_id,
                func.max(ConfigVersion.created_at).label("latest_ts")
            ).where(
                ConfigVersion.resource_type == "route",
                ConfigVersion.resource_id.in_(route_ids)
            ).group_by(ConfigVersion.resource_id)
        )
        pub_map = {r.resource_id: r.latest_ts for r in pub_result.all()}

    # Batch plugins
    plugin_map: dict[int, list] = {}
    if route_ids:
        plugin_rows = await db.execute(
            select(RoutePlugin).where(RoutePlugin.route_id.in_(route_ids))
        )
        for rp in plugin_rows.scalars().all():
            if rp.route_id not in plugin_map:
                plugin_map[rp.route_id] = []
            plugin_map[rp.route_id].append({"plugin_name": rp.plugin_name})

    items = []
    for r in routes:
        item = route_to_response(
            r,
            published_at=pub_map.get(r.id).isoformat() + "Z" if pub_map.get(r.id) else None,
            plugins=plugin_map.get(r.id, []),
        )
        item_dict = item.model_dump()
        item_dict["cluster_name"] = cluster_map.get(r.cluster_id, "")
        items.append(item_dict)

    return RouteListResponse(total=total, page=page, page_size=page_size, items=items)
