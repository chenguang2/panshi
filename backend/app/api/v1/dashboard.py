from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime

from app.core.database import get_db
from app.models.cluster import Route, Upstream, Cluster, PluginConfig, GlobalRule, PluginMetadata, Node
from app.models.static_resource import StaticResource
from app.models.user import User, UserCluster
from pydantic import BaseModel
from typing import List

from app.core.deps import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_user)])


async def _visible_cluster_ids(db: AsyncSession, user: User) -> list[int] | None:
    """当前用户可见的集群 id 集合；None = admin，不过滤。

    与 clusters.py list_clusters / nodes.py 列表段同款契约（非管理员仅见被
    分配集群 sys_user_cluster）。返回空列表合法 = 用户无任何分配，调用方
    必须短路返回空集（勿依赖 in_([]) 的方言行为）。
    """
    if user.role != "admin":
        result = await db.execute(
            select(UserCluster.cluster_id).where(UserCluster.user_id == user.id)
        )
        return [r[0] for r in result.all()]
    return None


class RecentRouteItem(BaseModel):
    id: int
    name: str
    uri: str
    status: int
    cluster_name: str
    created_at: datetime

    class Config:
        from_attributes = True


class RecentRoutesResponse(BaseModel):
    items: List[RecentRouteItem]


class DashboardStatsResponse(BaseModel):
    clusters: int
    nodes: int = 0
    nodes_online: int = 0
    nodes_untested: int = 0
    upstreams: int
    routes: int
    users: int
    plugin_configs: int = 0
    global_rules: int = 0
    static_resources: int = 0
    plugin_metadata: int = 0


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 非管理员仅见被分配集群（sys_user_cluster）——与 clusters.py / nodes.py 同款契约；
    # users 计数保持全局是有意行为：用户总数不随集群分配过滤（见下方注释）。
    visible_ids = await _visible_cluster_ids(db, current_user)

    user_count_result = await db.execute(select(func.count()).select_from(User))
    user_count = user_count_result.scalar() or 0

    # 零分配短路：直接返回全 0（对齐 nodes.py 空集先例，不查集群域库表；
    # SQLAlchemy in_([]) 行为跨方言不一，禁止依赖）。users 仍为全局值。
    if visible_ids is not None and not visible_ids:
        return DashboardStatsResponse(
            clusters=0, nodes=0, nodes_online=0, nodes_untested=0,
            upstreams=0, routes=0, users=user_count,
            plugin_configs=0, global_rules=0, static_resources=0, plugin_metadata=0,
        )

    async def _count_scoped(model, *extra_conds) -> int:
        """集群域计数：admin 全量；非管理员按分配集群过滤。

        Cluster 本身按 id 过滤，其余模型均含 cluster_id。
        """
        scope_col = model.id if model is Cluster else model.cluster_id
        query = select(func.count()).select_from(model)
        if visible_ids is not None:
            query = query.where(scope_col.in_(visible_ids))
        if extra_conds:
            query = query.where(*extra_conds)
        result = await db.execute(query)
        return result.scalar() or 0

    cluster_count = await _count_scoped(Cluster)

    node_count = await _count_scoped(Node)
    node_online_count = await _count_scoped(Node, Node.status == 1)
    node_untested_count = await _count_scoped(Node, Node.status == 1, Node.status_detail.is_(None))

    upstream_count = await _count_scoped(Upstream)
    route_count = await _count_scoped(Route)

    plugin_config_count = await _count_scoped(PluginConfig)
    global_rule_count = await _count_scoped(GlobalRule)
    static_resource_count = await _count_scoped(StaticResource)
    plugin_metadata_count = await _count_scoped(PluginMetadata)

    return DashboardStatsResponse(
        clusters=cluster_count,
        nodes=node_count,
        nodes_online=node_online_count,
        nodes_untested=node_untested_count,
        upstreams=upstream_count,
        routes=route_count,
        users=user_count,
        plugin_configs=plugin_config_count,
        global_rules=global_rule_count,
        static_resources=static_resource_count,
        plugin_metadata=plugin_metadata_count
    )


@router.get("/recent-routes", response_model=RecentRoutesResponse)
async def get_recent_routes(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    visible_ids = await _visible_cluster_ids(db, current_user)
    # 零分配短路（对齐 nodes.py 空集先例，不查库）
    if visible_ids is not None and not visible_ids:
        return RecentRoutesResponse(items=[])

    query = (
        select(Route, Cluster.name, Cluster.display_name)
        .join(Cluster, Route.cluster_id == Cluster.id)
        .order_by(desc(Route.created_at))
        .limit(limit)
    )
    # 非管理员仅见被分配集群的路由（与 stats 同一 helper）
    if visible_ids is not None:
        query = query.where(Route.cluster_id.in_(visible_ids))
    result = await db.execute(query)
    rows = result.all()

    items = [
        RecentRouteItem(
            id=route.id,
            name=route.name,
            uri=route.uri,
            status=route.status,
            cluster_name=display_name or cluster_name,
            created_at=route.created_at,
        )
        for route, cluster_name, display_name in rows
    ]

    return RecentRoutesResponse(items=items)
