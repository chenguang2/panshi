from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.core.database import get_db
from app.models.cluster import Route, Upstream, Cluster
from app.models.user import User
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class RecentRouteItem(BaseModel):
    id: int
    name: str
    uri: str
    status: int
    cluster_name: str

    class Config:
        from_attributes = True


class RecentRoutesResponse(BaseModel):
    items: List[RecentRouteItem]


class DashboardStatsResponse(BaseModel):
    clusters: int
    upstreams: int
    routes: int
    users: int


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    cluster_count_result = await db.execute(select(func.count()).select_from(Cluster))
    cluster_count = cluster_count_result.scalar() or 0

    upstream_count_result = await db.execute(select(func.count()).select_from(Upstream))
    upstream_count = upstream_count_result.scalar() or 0

    route_count_result = await db.execute(select(func.count()).select_from(Route))
    route_count = route_count_result.scalar() or 0

    user_count_result = await db.execute(select(func.count()).select_from(User))
    user_count = user_count_result.scalar() or 0

    return DashboardStatsResponse(
        clusters=cluster_count,
        upstreams=upstream_count,
        routes=route_count,
        users=user_count
    )


@router.get("/recent-routes", response_model=RecentRoutesResponse)
async def get_recent_routes(limit: int = 10, db: AsyncSession = Depends(get_db)):
    query = (
        select(Route, Cluster.display_name)
        .join(Cluster, Route.cluster_id == Cluster.id)
        .order_by(desc(Route.created_at))
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()

    items = [
        RecentRouteItem(
            id=route.id,
            name=route.name,
            uri=route.uri,
            status=route.status,
            cluster_name=display_name or Cluster.name
        )
        for route, display_name in rows
    ]

    return RecentRoutesResponse(items=items)
