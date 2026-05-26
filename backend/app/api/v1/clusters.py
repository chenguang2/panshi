from fastapi import APIRouter, Body, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import Optional, Any
import json

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.cluster import Cluster, Upstream, UpstreamTarget, Route, RoutePlugin, Node, ConfigVersion, PluginConfig, GlobalRule, PluginMetadata
from app.models.static_resource import StaticResource
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services.config_diff import EquivalenceRules
from app.models.user import User
from app.schemas.cluster import (
    ClusterCreate, ClusterUpdate, ClusterResponse, ClusterListResponse,
    UpstreamCreate, UpstreamUpdate, UpstreamResponse, UpstreamWithTargets, UpstreamTargetSchema,
    NodeCreate, NodeUpdate, NodeResponse, NodeListResponse, ConfigVersionResponse, ConfigVersionListResponse,
    PluginConfigCreate, PluginConfigUpdate, PluginConfigResponse, GlobalRuleCreate, GlobalRuleUpdate,
    GlobalRuleResponse, DeleteClusterRequest, PublishRequest,
)

router = APIRouter(prefix="/clusters", tags=["clusters"])


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not authorization:
        raise HTTPException(status_code=401, detail="未认证")

    try:
        if authorization.startswith("Bearer "):
            token = authorization[7:]
        else:
            token = authorization

        payload = decode_access_token(token)
        if payload is None:
            raise HTTPException(status_code=401, detail="未认证")

        user_id = int(payload.get("sub"))
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")

        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="未认证")


@router.get("/my", response_model=ClusterListResponse)
async def list_my_clusters(
    page: int = 1,
    page_size: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Cluster).where(Cluster.creator_id == current_user.id)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    clusters = result.scalars().all()

    items = []
    for c in clusters:
        cluster_resp = ClusterResponse.model_validate(c)
        node_result = await db.execute(select(func.count(), func.sum(Node.status == 1)).select_from(Node).where(Node.cluster_id == c.id))
        node_row = node_result.one_or_none()
        cluster_resp.node_count = node_row[0] or 0
        cluster_resp.healthy_node_count = node_row[1] or 0
        upstream_result = await db.execute(select(func.count()).select_from(Upstream).where(Upstream.cluster_id == c.id))
        cluster_resp.upstream_count = upstream_result.scalar() or 0
        route_result = await db.execute(select(func.count()).select_from(Route).where(Route.cluster_id == c.id))
        cluster_resp.route_count = route_result.scalar() or 0
        pc_result = await db.execute(select(func.count()).select_from(PluginConfig).where(PluginConfig.cluster_id == c.id))
        cluster_resp.plugin_config_count = pc_result.scalar() or 0
        gr_result = await db.execute(select(func.count()).select_from(GlobalRule).where(GlobalRule.cluster_id == c.id))
        cluster_resp.global_rule_count = gr_result.scalar() or 0
        sr_result = await db.execute(select(func.count()).select_from(StaticResource).where(StaticResource.cluster_id == c.id))
        cluster_resp.static_resource_count = sr_result.scalar() or 0
        items.append(cluster_resp)

    return ClusterListResponse(total=total, items=items)


@router.get("", response_model=ClusterListResponse)
async def list_clusters(
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db)
):
    query = select(Cluster)
    if keyword:
        query = query.where(Cluster.name.contains(keyword) | Cluster.display_name.contains(keyword))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    clusters = result.scalars().all()

    items = []
    for c in clusters:
        cluster_resp = ClusterResponse.model_validate(c)
        node_result = await db.execute(select(func.count(), func.sum(Node.status == 1)).select_from(Node).where(Node.cluster_id == c.id))
        node_row = node_result.one_or_none()
        cluster_resp.node_count = node_row[0] or 0
        cluster_resp.healthy_node_count = node_row[1] or 0
        upstream_result = await db.execute(select(func.count()).select_from(Upstream).where(Upstream.cluster_id == c.id))
        cluster_resp.upstream_count = upstream_result.scalar() or 0
        route_result = await db.execute(select(func.count()).select_from(Route).where(Route.cluster_id == c.id))
        cluster_resp.route_count = route_result.scalar() or 0
        pc_result = await db.execute(select(func.count()).select_from(PluginConfig).where(PluginConfig.cluster_id == c.id))
        cluster_resp.plugin_config_count = pc_result.scalar() or 0
        gr_result = await db.execute(select(func.count()).select_from(GlobalRule).where(GlobalRule.cluster_id == c.id))
        cluster_resp.global_rule_count = gr_result.scalar() or 0
        sr_result = await db.execute(select(func.count()).select_from(StaticResource).where(StaticResource.cluster_id == c.id))
        cluster_resp.static_resource_count = sr_result.scalar() or 0
        items.append(cluster_resp)

    return ClusterListResponse(total=total, items=items)


@router.post("", response_model=ClusterResponse, status_code=status.HTTP_201_CREATED)
async def create_cluster(
    cluster: ClusterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Cluster).where(Cluster.name == cluster.name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="集群名称已存在")

    db_cluster = Cluster(**cluster.model_dump(), creator_id=current_user.id)
    db.add(db_cluster)
    await db.commit()
    await db.refresh(db_cluster)
    return ClusterResponse.model_validate(db_cluster)


@router.get("/{cluster_id}", response_model=ClusterResponse)
async def get_cluster(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")
    return ClusterResponse.model_validate(cluster)


@router.put("/{cluster_id}", response_model=ClusterResponse)
async def update_cluster(cluster_id: int, cluster_update: ClusterUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")

    if cluster_update.name is not None:
        existing = await db.execute(select(Cluster).where(Cluster.name == cluster_update.name, Cluster.id != cluster_id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="集群名称已存在")

    for key, value in cluster_update.model_dump(exclude_unset=True).items():
        setattr(cluster, key, value)

    await db.commit()
    await db.refresh(cluster)
    return ClusterResponse.model_validate(cluster)


@router.get("/{cluster_id}/stats")
async def get_cluster_stats(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")

    async def count(model, **filters):
        q = select(func.count()).select_from(model)
        for k, v in filters.items():
            q = q.where(getattr(model, k) == v)
        r = await db.execute(q)
        return r.scalar() or 0

    return {
        "nodes": await count(Node, cluster_id=cluster_id),
        "upstreams": await count(Upstream, cluster_id=cluster_id),
        "routes": await count(Route, cluster_id=cluster_id),
        "plugin_configs": await count(PluginConfig, cluster_id=cluster_id),
        "global_rules": await count(GlobalRule, cluster_id=cluster_id),
        "plugin_metadata": await count(PluginMetadata, cluster_id=cluster_id),
        "config_versions": await count(ConfigVersion, cluster_id=cluster_id),
    }


@router.delete("/{cluster_id}")
async def delete_cluster(
    cluster_id: int,
    body: Optional[DeleteClusterRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError

    if body is None:
        body = DeleteClusterRequest()
    delete_db = body.delete_db
    delete_edge = body.delete_edge

    if not delete_db and not delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")

    results = []

    if delete_edge:
        upstreams = (await db.execute(select(Upstream).where(Upstream.cluster_id == cluster_id))).scalars().all()
        routes = (await db.execute(select(Route).where(Route.cluster_id == cluster_id))).scalars().all()
        plugin_configs = (await db.execute(select(PluginConfig).where(PluginConfig.cluster_id == cluster_id))).scalars().all()
        global_rules = (await db.execute(select(GlobalRule).where(GlobalRule.cluster_id == cluster_id))).scalars().all()
        plugin_metadatas = (await db.execute(select(PluginMetadata).where(PluginMetadata.cluster_id == cluster_id))).scalars().all()

        nodes_result = await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
        active_nodes = nodes_result.scalars().all()

        if active_nodes:
            for node in active_nodes:
                node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}
                try:
                    client = EdgeClient(cluster_id, db, node_ip=node.ip, node_port=node.management_port)
                    errs = []
                    for r in routes:
                        try: client.delete_route(r.edge_uuid)
                        except: errs.append(f"route:{r.edge_uuid}")
                    for u in upstreams:
                        try: client.delete_upstream(u.edge_uuid)
                        except: errs.append(f"upstream:{u.edge_uuid}")
                    for p in plugin_configs:
                        try: client.delete_plugin_config(p.edge_uuid)
                        except: errs.append(f"plugin_config:{p.edge_uuid}")
                    for g in global_rules:
                        try: client.delete_global_rule(g.edge_uuid)
                        except: errs.append(f"global_rule:{g.edge_uuid}")
                    for pm in plugin_metadatas:
                        try: client.delete_plugin_metadata(pm.plugin_name)
                        except: errs.append(f"plugin_metadata:{pm.plugin_name}")
                    if errs:
                        node_result["status"] = "failed"
                        node_result["error"] = f"部分失败: {', '.join(errs[:5])}"
                    else:
                        node_result["status"] = "success"
                except (EdgeConnectionError, EdgeAPIError) as e:
                    node_result["status"] = "failed"
                    node_result["error"] = str(e)
                results.append(node_result)

    if delete_db:
        await db.execute(ConfigVersion.__table__.delete().where(ConfigVersion.cluster_id == cluster_id))

        sub_routes = select(Route.id).where(Route.cluster_id == cluster_id)
        await db.execute(RoutePlugin.__table__.delete().where(RoutePlugin.route_id.in_(sub_routes)))
        sub_upstreams = select(Upstream.id).where(Upstream.cluster_id == cluster_id)
        await db.execute(UpstreamTarget.__table__.delete().where(UpstreamTarget.upstream_id.in_(sub_upstreams)))

        await db.execute(Route.__table__.delete().where(Route.cluster_id == cluster_id))
        await db.execute(Upstream.__table__.delete().where(Upstream.cluster_id == cluster_id))
        await db.execute(PluginConfig.__table__.delete().where(PluginConfig.cluster_id == cluster_id))
        await db.execute(GlobalRule.__table__.delete().where(GlobalRule.cluster_id == cluster_id))
        await db.execute(PluginMetadata.__table__.delete().where(PluginMetadata.cluster_id == cluster_id))
        await db.execute(Node.__table__.delete().where(Node.cluster_id == cluster_id))

        await db.delete(cluster)
        await db.commit()
        return {"message": "集群已删除", "results": results}

    return {"message": "Edge 节点数据已清理", "results": results}


@router.post("/{cluster_id}/test")
async def test_connection(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")
    
    return {"status": "ok", "message": "连接测试成功"}


@router.post("/{cluster_id}/sync")
async def sync_cluster(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")
    
    return {"status": "ok", "message": "同步成功"}


UPSTREAM_ALLOWED_SORT_FIELDS = {"name", "load_balance", "description", "created_at"}
UPSTREAM_ALLOWED_SEARCH_FIELDS = {"name", "description"}


@router.get("/{cluster_id}/upstreams", response_model=dict)
async def list_upstreams(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    search: Optional[str] = None,
    search_field: Optional[str] = None
):
    query = select(Upstream).where(Upstream.cluster_id == cluster_id)

    if search:
        search_pattern = f"%{search}%"
        if search_field and search_field in UPSTREAM_ALLOWED_SEARCH_FIELDS:
            search_col = getattr(Upstream, search_field)
            query = query.where(search_col.ilike(search_pattern))
        else:
            conditions = [
                getattr(Upstream, field).ilike(search_pattern)
                for field in UPSTREAM_ALLOWED_SEARCH_FIELDS
                if hasattr(Upstream, field)
            ]
            query = query.where(or_(*conditions))

    if sort_by and sort_by in UPSTREAM_ALLOWED_SORT_FIELDS:
        sort_column = getattr(Upstream, sort_by)
        if sort_order == "desc":
            sort_column = sort_column.desc()
        query = query.order_by(sort_column)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    upstreams = result.scalars().all()

    # 批量查询最新发布时间
    upstream_ids = [u.id for u in upstreams]
    pub_result = await db.execute(
        select(
            ConfigVersion.resource_id,
            func.max(ConfigVersion.created_at).label("latest_ts")
        ).where(
            ConfigVersion.resource_type == "upstream",
            ConfigVersion.resource_id.in_(upstream_ids) if upstream_ids else False
        ).group_by(ConfigVersion.resource_id)
    )
    pub_map = {r.resource_id: r.latest_ts for r in pub_result.all()} if upstream_ids else {}

    items = []
    for u in upstreams:
        targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == u.id))
        targets = targets_result.scalars().all()
        response = UpstreamWithTargets.model_validate(u)
        response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
        response.current_version = u.current_version
        ts = pub_map.get(u.id)
        response.published_at = ts.isoformat() + 'Z' if ts else None
        items.append(response)

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.post("/{cluster_id}/upstreams", response_model=UpstreamWithTargets, status_code=status.HTTP_201_CREATED)
async def create_upstream(cluster_id: int, upstream: UpstreamCreate, db: AsyncSession = Depends(get_db)):
    upstream_data = upstream.model_dump(exclude={"targets"})
    if upstream_data.get("checks"):
        upstream_data["checks"] = json.dumps(upstream_data["checks"])
    if upstream_data.get("timeout"):
        upstream_data["timeout"] = json.dumps(upstream_data["timeout"])
    if upstream_data.get("keepalive_pool"):
        upstream_data["keepalive_pool"] = json.dumps(upstream_data["keepalive_pool"])
    db_upstream = Upstream(cluster_id=cluster_id, **upstream_data)
    db.add(db_upstream)
    await db.commit()
    await db.refresh(db_upstream)

    if upstream.targets:
        for target_data in upstream.targets:
            if isinstance(target_data, UpstreamTargetSchema):
                db_target = UpstreamTarget(upstream_id=db_upstream.id, target=target_data.target, weight=target_data.weight)
            else:
                db_target = UpstreamTarget(upstream_id=db_upstream.id, **target_data)
            db.add(db_target)
        await db.commit()

    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == db_upstream.id))
    targets = targets_result.scalars().all()
    response = UpstreamWithTargets.model_validate(db_upstream)
    response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
    return response


@router.get("/{cluster_id}/upstreams/{upstream_id}", response_model=UpstreamWithTargets)
async def get_upstream(cluster_id: int, upstream_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")
    
    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
    targets = targets_result.scalars().all()
    
    response = UpstreamWithTargets.model_validate(upstream)
    response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
    return response


@router.put("/{cluster_id}/upstreams/{upstream_id}", response_model=UpstreamWithTargets)
async def update_upstream(cluster_id: int, upstream_id: int, upstream_update: UpstreamUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    update_data = upstream_update.model_dump(exclude_unset=True, exclude={"targets"})
    for key, value in update_data.items():
        if key in ("checks", "timeout", "keepalive_pool") and value:
            value = json.dumps(value)
        setattr(upstream, key, value)

    if upstream_update.targets is not None:
        targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
        existing_targets = targets_result.scalars().all()
        for t in existing_targets:
            await db.delete(t)

        for target_data in upstream_update.targets:
            db_target = UpstreamTarget(upstream_id=upstream_id, **target_data.model_dump())
            db.add(db_target)

    await db.commit()
    await db.refresh(upstream)

    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
    targets = targets_result.scalars().all()
    response = UpstreamWithTargets.model_validate(upstream)
    response.targets = [UpstreamTargetSchema.model_validate(t) for t in targets]
    return response


@router.delete("/{cluster_id}/upstreams/{upstream_id}")
async def delete_upstream(cluster_id: int, upstream_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db)):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError

    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    nodes_result = await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
    active_nodes = nodes_result.scalars().all()

    results = []

    if body.delete_db:
        # 先显式删除关联的 targets（SQLite 异步引擎可能未启用外键级联）
        await db.execute(UpstreamTarget.__table__.delete().where(UpstreamTarget.upstream_id == upstream_id))
        await db.execute(ConfigVersion.__table__.delete().where(ConfigVersion.resource_type == "upstream", ConfigVersion.resource_id == upstream_id))
        await db.delete(upstream)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        node_query = select(Node).where(Node.cluster_id == cluster_id, Node.status == 1)
        if body.node_ids:
            node_query = node_query.where(Node.id.in_(body.node_ids))
        nodes_result = await db.execute(node_query)
        active_nodes = nodes_result.scalars().all()
        if active_nodes:
            for node in active_nodes:
                node_result = {"node": f"{node.ip}:{node.management_port}", "scope": "edge", "status": "pending"}
                try:
                    client = EdgeClient(cluster_id, db, node_ip=node.ip, node_port=node.management_port)
                    response = client.delete_upstream(upstream.edge_uuid)
                    node_result["status"] = "success"
                    node_result["response"] = response
                except (EdgeConnectionError, EdgeAPIError) as e:
                    node_result["status"] = "failed"
                    node_result["error"] = str(e)
                results.append(node_result)
        else:
            results.append({"scope": "edge", "status": "skipped", "message": "集群中没有活跃的 Edge 节点"})

    return {"message": "上游服务已删除", "results": results}


# ─── PluginConfig CRUD ────────────────────────────────────────────────

@router.get("/{cluster_id}/plugin_configs", response_model=dict)
async def list_plugin_configs(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginConfig).where(PluginConfig.cluster_id == cluster_id).order_by(PluginConfig.id))
    configs = result.scalars().all()
    # 批量查询最新发布时间
    pc_ids = [c.id for c in configs]
    pub = await db.execute(
        select(ConfigVersion.resource_id, func.max(ConfigVersion.created_at).label("ts"))
        .where(ConfigVersion.resource_type == "plugin_config", ConfigVersion.resource_id.in_(pc_ids) if pc_ids else False)
        .group_by(ConfigVersion.resource_id)
    ) if pc_ids else None
    pub_map = {r.resource_id: r.ts for r in pub.all()} if pub else {}
    response = []
    for c in configs:
        r = PluginConfigResponse.model_validate(c)
        ts = pub_map.get(c.id)
        r.published_at = ts.isoformat() + 'Z' if ts else None
        response.append(r)
    return {"total": len(response), "items": response}


@router.post("/{cluster_id}/plugin_configs", response_model=PluginConfigResponse)
async def create_plugin_config(cluster_id: int, data: PluginConfigCreate, db: AsyncSession = Depends(get_db)):
    config_data = data.model_dump()
    if config_data.get("plugins") is not None:
        config_data["plugins"] = json.dumps(config_data["plugins"])
    db_config = PluginConfig(cluster_id=cluster_id, **config_data)
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    return PluginConfigResponse.model_validate(db_config)


@router.get("/{cluster_id}/plugin_configs/{config_id}", response_model=PluginConfigResponse)
async def get_plugin_config(cluster_id: int, config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件组不存在")
    return PluginConfigResponse.model_validate(config)


@router.put("/{cluster_id}/plugin_configs/{config_id}", response_model=PluginConfigResponse)
async def update_plugin_config(cluster_id: int, config_id: int, data: PluginConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件组不存在")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "plugins" and value is not None:
            value = json.dumps(value)
        setattr(config, key, value)
    await db.commit()
    await db.refresh(config)
    return PluginConfigResponse.model_validate(config)


@router.delete("/{cluster_id}/plugin_configs/{config_id}")
async def delete_plugin_config(cluster_id: int, config_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db)):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError

    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件组不存在")

    node_query = select(Node).where(Node.cluster_id == cluster_id, Node.status == 1)
    if body.node_ids:
        node_query = node_query.where(Node.id.in_(body.node_ids))
    nodes_result = await db.execute(node_query)
    active_nodes = nodes_result.scalars().all()

    results = []

    if body.delete_db:
        await db.execute(ConfigVersion.__table__.delete().where(ConfigVersion.resource_type == "plugin_config", ConfigVersion.resource_id == config_id))
        await db.delete(config)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        if active_nodes:
            for node in active_nodes:
                node_result = {"node": f"{node.ip}:{node.management_port}", "scope": "edge", "status": "pending"}
                try:
                    client = EdgeClient(cluster_id, db, node_ip=node.ip, node_port=node.management_port)
                    response = client.delete_plugin_config(config.edge_uuid)
                    node_result["status"] = "success"
                    node_result["response"] = response
                except (EdgeConnectionError, EdgeAPIError) as e:
                    node_result["status"] = "failed"
                    node_result["error"] = str(e)
                results.append(node_result)
        else:
            results.append({"scope": "edge", "status": "skipped", "message": "集群中没有活跃的 Edge 节点"})

    return {"message": "插件组已删除", "results": results}


@router.post("/{cluster_id}/plugin_configs/{config_id}/publish")
async def publish_plugin_config(cluster_id: int, config_id: int, req: Optional[PublishRequest] = None, db: AsyncSession = Depends(get_db)):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
    from app.services.edge_logger import get_edge_logger
    result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件组不存在")
    upstream_plugins = json.loads(config.plugins) if config.plugins else None
    # Version increment and save history
    version_result = await db.execute(
        select(func.max(ConfigVersion.version)).where(
            ConfigVersion.resource_type == "plugin_config",
            ConfigVersion.resource_id == config_id
        )
    )
    latest_version = version_result.scalar() or 0
    new_version = latest_version + 1
    event_data = {
        "id": config.id,
        "edge_uuid": config.edge_uuid,
        "name": config.name,
        "description": config.description,
        "plugins": upstream_plugins}
    config_version = ConfigVersion(
        cluster_id=cluster_id,
        resource_type="plugin_config",
        resource_id=config_id,
        version=new_version,
        config=json.dumps(event_data))
    db.add(config_version)
    config.current_version = new_version
    await db.commit()
    edge_data = {
        "desc": config.name,
        "plugins": upstream_plugins or {},
    }

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()

    # Determine target nodes
    if req and req.node_ids:
        nodes_result = await db.execute(select(Node).where(Node.id.in_(req.node_ids), Node.cluster_id == cluster_id))
    else:
        nodes_result = await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
    active_nodes = nodes_result.scalars().all()
    if not active_nodes:
        return {"status": "error", "message": "集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    edge_logger = get_edge_logger()
    results = []
    success_count = 0
    fail_count = 0
    for node in active_nodes:
        node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}
        try:
            client = EdgeClient(cluster_id, db, node_ip=node.ip, node_port=node.management_port)
            encrypted = client._encrypt(json.dumps(event_data).encode())
            response = client.create_plugin_config(config.edge_uuid, edge_data)

            edge_logger.log_plugin_config_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                config_id=config_id,
                config_name=config.name,
                method="PUT",
                path=f"/edge/admin/plugin_configs/{config.edge_uuid}",
                request_body=edge_data,
                encrypted_body=encrypted,
                response_status=201,
                response_body=response,
                status="SUCCESS"
            )

            node_result["status"] = "success"
            node_result["response"] = response
            success_count += 1
        except (EdgeConnectionError, EdgeAPIError) as e:
            edge_logger.log_plugin_config_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                config_id=config_id,
                config_name=config.name,
                method="PUT",
                path=f"/edge/admin/plugin_configs/{config.edge_uuid}",
                request_body=edge_data,
                encrypted_body=None,
                response_status=e.status_code if isinstance(e, EdgeAPIError) else None,
                response_body=e.response_body if isinstance(e, EdgeAPIError) else None,
                status="FAILED",
                error=str(e)
            )
            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1
        results.append(node_result)
    if success_count == len(active_nodes):
        return {"status": "ok", "message": f"插件组发布成功，已同步到 {success_count} 个节点", "version": new_version, "results": results}
    elif success_count > 0:
        return {"status": "partial", "message": f"插件组发布完成，{success_count}/{len(active_nodes)} 节点同步成功", "version": new_version, "results": results}
    else:
        return {"status": "error", "message": "插件组发布失败：无法连接到任何 edge 服务器", "version": new_version, "results": results}


@router.get("/{cluster_id}/plugin_configs/{config_id}/history", response_model=ConfigVersionListResponse)
async def get_plugin_config_history(cluster_id: int, config_id: int, db: AsyncSession = Depends(get_db)):
    query = select(ConfigVersion).where(
        ConfigVersion.resource_type == "plugin_config",
        ConfigVersion.resource_id == config_id
    ).order_by(ConfigVersion.version.desc())
    result = await db.execute(query)
    versions = result.scalars().all()
    pc_result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    pc = pc_result.scalar_one_or_none()
    return ConfigVersionListResponse(
        total=len(versions), items=versions, current_version=pc.current_version if pc else None)


@router.post("/{cluster_id}/plugin_configs/{config_id}/rollback/{version}")
async def rollback_plugin_config(cluster_id: int, config_id: int, version: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PluginConfig).where(PluginConfig.id == config_id, PluginConfig.cluster_id == cluster_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="插件组不存在")
    cv_result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.resource_type == "plugin_config",
        ConfigVersion.resource_id == config_id,
        ConfigVersion.version == version))
    cv = cv_result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本不存在")
    config_data = json.loads(cv.config)
    config.name = config_data.get("name", config.name)
    config.description = config_data.get("description")
    if config_data.get("plugins") is not None:
        config.plugins = json.dumps(config_data["plugins"])
    else:
        config.plugins = None
    config.current_version = version
    await db.commit()
    return {"status": "ok", "message": f"插件组已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/plugin_configs/{config_id}/history/{history_id}")
async def delete_plugin_config_history(cluster_id: int, config_id: int, history_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.id == history_id,
        ConfigVersion.resource_type == "plugin_config",
        ConfigVersion.resource_id == config_id))
    cv = result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="历史版本不存在")
    await db.delete(cv)
    await db.commit()
    return {"message": "历史版本已删除"}


# ─── GlobalRule CRUD ────────────────────────────────


@router.get("/{cluster_id}/global_rules", response_model=dict)
async def list_global_rules(cluster_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlobalRule).where(GlobalRule.cluster_id == cluster_id).order_by(GlobalRule.id))
    rules = result.scalars().all()
    # 批量查询最新发布时间
    gr_ids = [g.id for g in rules]
    pub = await db.execute(
        select(ConfigVersion.resource_id, func.max(ConfigVersion.created_at).label("ts"))
        .where(ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id.in_(gr_ids) if gr_ids else False)
        .group_by(ConfigVersion.resource_id)
    ) if gr_ids else None
    pub_map = {r.resource_id: r.ts for r in pub.all()} if pub else {}
    response = []
    for g in rules:
        r = GlobalRuleResponse.model_validate(g)
        ts = pub_map.get(g.id)
        r.published_at = ts.isoformat() + 'Z' if ts else None
        response.append(r)
    return {"total": len(response), "items": response}


@router.post("/{cluster_id}/global_rules", response_model=GlobalRuleResponse)
async def create_global_rule(cluster_id: int, data: GlobalRuleCreate, db: AsyncSession = Depends(get_db)):
    rule_data = data.model_dump()
    if rule_data.get("plugins") is not None:
        rule_data["plugins"] = json.dumps(rule_data["plugins"])
    db_rule = GlobalRule(cluster_id=cluster_id, **rule_data)
    db.add(db_rule)
    await db.commit()
    await db.refresh(db_rule)
    return GlobalRuleResponse.model_validate(db_rule)


@router.get("/{cluster_id}/global_rules/{rule_id}", response_model=GlobalRuleResponse)
async def get_global_rule(cluster_id: int, rule_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="全局规则不存在")
    return GlobalRuleResponse.model_validate(rule)


@router.put("/{cluster_id}/global_rules/{rule_id}", response_model=GlobalRuleResponse)
async def update_global_rule(cluster_id: int, rule_id: int, data: GlobalRuleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="全局规则不存在")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "plugins" and value is not None:
            value = json.dumps(value)
        setattr(rule, key, value)
    await db.commit()
    await db.refresh(rule)
    return GlobalRuleResponse.model_validate(rule)


@router.delete("/{cluster_id}/global_rules/{rule_id}")
async def delete_global_rule(cluster_id: int, rule_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db)):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError

    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="全局规则不存在")

    node_query = select(Node).where(Node.cluster_id == cluster_id, Node.status == 1)
    if body.node_ids:
        node_query = node_query.where(Node.id.in_(body.node_ids))
    nodes_result = await db.execute(node_query)
    active_nodes = nodes_result.scalars().all()

    results = []

    if body.delete_db:
        await db.execute(ConfigVersion.__table__.delete().where(ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id == rule_id))
        await db.delete(rule)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        if active_nodes:
            for node in active_nodes:
                node_result = {"node": f"{node.ip}:{node.management_port}", "scope": "edge", "status": "pending"}
                try:
                    client = EdgeClient(cluster_id, db, node_ip=node.ip, node_port=node.management_port)
                    response = client.delete_global_rule(rule.edge_uuid)
                    node_result["status"] = "success"
                    node_result["response"] = response
                except (EdgeConnectionError, EdgeAPIError) as e:
                    node_result["status"] = "failed"
                    node_result["error"] = str(e)
                results.append(node_result)
        else:
            results.append({"scope": "edge", "status": "skipped", "message": "集群中没有活跃的 Edge 节点"})

    return {"message": "全局规则已删除", "results": results}


@router.post("/{cluster_id}/global_rules/{rule_id}/publish")
async def publish_global_rule(cluster_id: int, rule_id: int, req: Optional[PublishRequest] = None, db: AsyncSession = Depends(get_db)):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
    from app.services.edge_logger import get_edge_logger
    result = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="全局规则不存在")
    rule_plugins = json.loads(rule.plugins) if rule.plugins else None
    version_result = await db.execute(
        select(func.max(ConfigVersion.version)).where(
            ConfigVersion.resource_type == "global_rule",
            ConfigVersion.resource_id == rule_id))
    latest_version = version_result.scalar() or 0
    new_version = latest_version + 1
    event_data = {"id": rule.id, "edge_uuid": rule.edge_uuid, "name": rule.name, "description": rule.description, "plugins": rule_plugins}
    config_version = ConfigVersion(
        cluster_id=cluster_id, resource_type="global_rule", resource_id=rule_id,
        version=new_version, config=json.dumps(event_data))
    db.add(config_version)
    rule.current_version = new_version
    await db.commit()
    edge_data = {"desc": rule.name, "plugins": rule_plugins or {}}

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()

    if req and req.node_ids:
        nodes_result = await db.execute(select(Node).where(Node.id.in_(req.node_ids), Node.cluster_id == cluster_id))
    else:
        nodes_result = await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
    active_nodes = nodes_result.scalars().all()
    if not active_nodes:
        return {"status": "error", "message": "集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    edge_logger = get_edge_logger()
    results, success_count, fail_count = [], 0, 0
    for node in active_nodes:
        node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}
        try:
            client = EdgeClient(cluster_id, db, node_ip=node.ip, node_port=node.management_port)

            import base64
            import json as json_module
            encrypted = client._encrypt(json_module.dumps(edge_data).encode())
            response = client.create_global_rule(rule.edge_uuid, edge_data)

            edge_logger.log_global_rule_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                rule_id=rule_id,
                rule_name=rule.name,
                method="PUT",
                path=f"/edge/admin/global_rules/{rule.edge_uuid}",
                request_body=edge_data,
                encrypted_body=encrypted,
                response_status=201,
                response_body=response,
                status="SUCCESS"
            )

            node_result["status"] = "success"
            node_result["response"] = response
            success_count += 1
        except (EdgeConnectionError, EdgeAPIError) as e:
            edge_logger.log_global_rule_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                rule_id=rule_id,
                rule_name=rule.name,
                method="PUT",
                path=f"/edge/admin/global_rules/{rule.edge_uuid}",
                request_body=edge_data,
                encrypted_body=None,
                response_status=e.status_code if isinstance(e, EdgeAPIError) else None,
                response_body=e.response_body if isinstance(e, EdgeAPIError) else None,
                status="FAILED",
                error=str(e)
            )
            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1
        results.append(node_result)
    if success_count == len(active_nodes):
        return {"status": "ok", "message": f"全局规则发布成功，已同步到 {success_count} 个节点", "version": new_version, "results": results}
    elif success_count > 0:
        return {"status": "partial", "message": f"全局规则发布完成，{success_count}/{len(active_nodes)} 节点同步成功", "version": new_version, "results": results}
    else:
        return {"status": "error", "message": "全局规则发布失败：无法连接到任何 edge 服务器", "version": new_version, "results": results}


@router.get("/{cluster_id}/global_rules/{rule_id}/history", response_model=ConfigVersionListResponse)
async def get_global_rule_history(cluster_id: int, rule_id: int, db: AsyncSession = Depends(get_db)):
    query = select(ConfigVersion).where(
        ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id == rule_id
    ).order_by(ConfigVersion.version.desc())
    result = await db.execute(query)
    versions = result.scalars().all()
    gr = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = gr.scalar_one_or_none()
    return ConfigVersionListResponse(total=len(versions), items=versions, current_version=rule.current_version if rule else None)


@router.post("/{cluster_id}/global_rules/{rule_id}/rollback/{version}")
async def rollback_global_rule(cluster_id: int, rule_id: int, version: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GlobalRule).where(GlobalRule.id == rule_id, GlobalRule.cluster_id == cluster_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="全局规则不存在")
    cv_result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id == rule_id, ConfigVersion.version == version))
    cv = cv_result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本不存在")
    config_data = json.loads(cv.config)
    rule.name = config_data.get("name", rule.name)
    rule.description = config_data.get("description")
    if config_data.get("plugins") is not None:
        rule.plugins = json.dumps(config_data["plugins"])
    else:
        rule.plugins = None
    rule.current_version = version
    await db.commit()
    return {"status": "ok", "message": f"全局规则已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/global_rules/{rule_id}/history/{history_id}")
async def delete_global_rule_history(cluster_id: int, rule_id: int, history_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.id == history_id, ConfigVersion.resource_type == "global_rule", ConfigVersion.resource_id == rule_id))
    cv = result.scalar_one_or_none()
    if not cv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="历史版本不存在")
    await db.delete(cv)
    await db.commit()
    return {"message": "历史版本已删除"}


NODE_ALLOWED_SORT_FIELDS = {"name", "ip", "service_port", "management_port", "status", "created_at"}
NODE_ALLOWED_SEARCH_FIELDS = {"name", "ip"}


@router.get("/{cluster_id}/nodes", response_model=dict)
async def list_nodes(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    search: Optional[str] = None,
    search_field: Optional[str] = None
):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")

    query = select(Node).where(Node.cluster_id == cluster_id)

    if search:
        search_pattern = f"%{search}%"
        if search_field and search_field in NODE_ALLOWED_SEARCH_FIELDS:
            search_col = getattr(Node, search_field)
            query = query.where(search_col.ilike(search_pattern))
        else:
            conditions = [
                getattr(Node, field).ilike(search_pattern)
                for field in NODE_ALLOWED_SEARCH_FIELDS
                if hasattr(Node, field)
            ]
            query = query.where(or_(*conditions))

    if sort_by and sort_by in NODE_ALLOWED_SORT_FIELDS:
        sort_column = getattr(Node, sort_by)
        if sort_order == "desc":
            sort_column = sort_column.desc()
        query = query.order_by(sort_column)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    nodes = result.scalars().all()
    return {"total": total, "page": page, "page_size": page_size, "items": [NodeResponse.model_validate(n) for n in nodes]}


@router.post("/{cluster_id}/nodes", response_model=NodeResponse, status_code=status.HTTP_201_CREATED)
async def create_node(cluster_id: int, node: NodeCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="集群不存在")

    db_node = Node(cluster_id=cluster_id, **node.model_dump(exclude={"cluster_id"}))
    db.add(db_node)
    await db.commit()
    await db.refresh(db_node)
    return NodeResponse.model_validate(db_node)


@router.put("/{cluster_id}/nodes/{node_id}", response_model=NodeResponse)
async def update_node(cluster_id: int, node_id: int, node_update: NodeUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")

    for key, value in node_update.model_dump(exclude_unset=True).items():
        setattr(node, key, value)

    await db.commit()
    await db.refresh(node)
    return NodeResponse.model_validate(node)


@router.delete("/{cluster_id}/nodes/{node_id}")
async def delete_node(cluster_id: int, node_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db)):
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")

    results = []

    if body.delete_db:
        await db.delete(node)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        # 节点本身是 Edge 运行时，没有对应的 Edge API 删除操作
        results.append({"scope": "edge", "status": "skipped", "message": "节点是 Edge 运行时，无对应的 Edge API 删除操作"})

    return {"message": "节点已删除", "results": results}


@router.post("/{cluster_id}/nodes/{node_id}/start")
async def start_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")
    return {"status": "ok", "message": "节点已启动"}


@router.post("/{cluster_id}/nodes/{node_id}/stop")
async def stop_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")
    return {"status": "ok", "message": "节点已停止"}


@router.get("/{cluster_id}/nodes/{node_id}/status")
async def get_node_status(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")
    return {"status": "ok", "node_status": node.status, "message": "状态查询成功"}


@router.post("/{cluster_id}/upstreams/{upstream_id}/publish")
async def publish_upstream(cluster_id: int, upstream_id: int, req: Optional[PublishRequest] = None, db: AsyncSession = Depends(get_db)):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
    from app.services.edge_logger import get_edge_logger

    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()

    version_result = await db.execute(
        select(func.max(ConfigVersion.version)).where(
            ConfigVersion.resource_type == "upstream",
            ConfigVersion.resource_id == upstream_id
        )
    )
    latest_version = version_result.scalar() or 0
    new_version = latest_version + 1

    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_id))
    targets = targets_result.scalars().all()

    config_data = {
        "id": upstream.id,
        "edge_uuid": upstream.edge_uuid,
        "name": upstream.name,
        "load_balance": upstream.load_balance,
        "hash_on": upstream.hash_on,
        "key": upstream.key,
        "targets": [{"target": t.target, "weight": t.weight} for t in targets],
        "checks": json.loads(upstream.checks) if upstream.checks else None,
        "retries": upstream.retries,
        "retry_timeout": upstream.retry_timeout,
        "timeout": json.loads(upstream.timeout) if upstream.timeout else None,
        "pass_host": upstream.pass_host,
        "upstream_host": upstream.upstream_host,
        "scheme": upstream.scheme,
        "keepalive_pool": json.loads(upstream.keepalive_pool) if upstream.keepalive_pool else None,
    }

    config_version = ConfigVersion(
        cluster_id=cluster_id,
        resource_type="upstream",
        resource_id=upstream_id,
        version=new_version,
        config=json.dumps(config_data)
    )
    db.add(config_version)
    upstream.current_version = new_version
    await db.commit()

    if req and req.node_ids:
        nodes_result = await db.execute(select(Node).where(Node.id.in_(req.node_ids), Node.cluster_id == cluster_id))
    else:
        nodes_result = await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
    active_nodes = nodes_result.scalars().all()

    if not active_nodes:
        return {"status": "error", "message": f"上游 {upstream.name} 发布成功，但集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    edge_logger = get_edge_logger()
    upstream_checks = json.loads(upstream.checks) if upstream.checks else None
    upstream_timeout = json.loads(upstream.timeout) if upstream.timeout else None
    upstream_keepalive = json.loads(upstream.keepalive_pool) if upstream.keepalive_pool else None
    edge_data = EdgeClient.convert_upstream_to_edge_format(
        upstream_id, upstream.name, upstream.load_balance,
        [{"target": t.target, "weight": t.weight} for t in targets],
        hash_on=upstream.hash_on,
        key=upstream.key,
        checks=upstream_checks,
        retries=upstream.retries,
        retry_timeout=upstream.retry_timeout,
        timeout=upstream_timeout,
        pass_host=upstream.pass_host,
        upstream_host=upstream.upstream_host,
        scheme=upstream.scheme,
        keepalive_pool=upstream_keepalive
    )

    results = []
    success_count = 0
    fail_count = 0

    for node in active_nodes:
        node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}

        try:
            sync_db = db
            client = EdgeClient(cluster_id, sync_db, node_ip=node.ip, node_port=node.management_port)

            import base64
            import json as json_module
            encrypted = client._encrypt(json_module.dumps(edge_data).encode())

            response = client.update_upstream(upstream.edge_uuid, edge_data)

            edge_logger.log_edge_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                upstream_id=upstream_id,
                upstream_name=upstream.name,
                method="PUT",
                path=f"/edge/admin/upstreams/{upstream.edge_uuid}",
                request_body=edge_data,
                encrypted_body=encrypted,
                response_status=201,
                response_body=response,
                status="SUCCESS"
            )

            node_result["status"] = "success"
            node_result["response"] = response
            success_count += 1

        except EdgeConnectionError as e:
            edge_logger.log_edge_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                upstream_id=upstream_id,
                upstream_name=upstream.name,
                method="POST",
                path="/edge/admin/upstreams",
                request_body=edge_data,
                encrypted_body=None,
                response_status=None,
                response_body=None,
                status="FAILED",
                error=str(e)
            )
            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1

        except EdgeAPIError as e:
            edge_logger.log_edge_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                upstream_id=upstream_id,
                upstream_name=upstream.name,
                method="PUT",
                path=f"/edge/admin/upstreams/{upstream_id}",
                request_body=edge_data,
                encrypted_body=None,
                response_status=e.status_code,
                response_body=e.response_body,
                status="FAILED",
                error=e.message
            )
            node_result["status"] = "failed"
            node_result["error"] = f"API error {e.status_code}: {e.message}"
            fail_count += 1

        except Exception as e:
            edge_logger.log_edge_operation(
                cluster_id=cluster_id,
                cluster_name=cluster.name if cluster else str(cluster_id),
                upstream_id=upstream_id,
                upstream_name=upstream.name,
                method="PUT",
                path=f"/edge/admin/upstreams/{upstream_id}",
                request_body=edge_data,
                encrypted_body=None,
                response_status=None,
                response_body=None,
                status="FAILED",
                error=str(e)
            )
            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1

        results.append(node_result)

    if fail_count == 0:
        return {
            "status": "ok",
            "message": f"上游 {upstream.name} 发布成功，已同步到 {success_count} 个节点",
            "version": new_version,
            "results": results
        }
    elif success_count == 0:
        return {
            "status": "error",
            "message": f"上游 {upstream.name} 发布失败：无法连接到任何 edge 节点",
            "version": new_version,
            "results": results
        }
    else:
        return {
            "status": "partial",
            "message": f"上游 {upstream.name} 发布完成，{success_count}/{success_count + fail_count} 节点同步成功",
            "version": new_version,
            "results": results
        }


@router.get("/{cluster_id}/upstreams/{upstream_id}/history", response_model=ConfigVersionListResponse)
async def get_upstream_history(cluster_id: int, upstream_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    query = select(ConfigVersion).where(
        ConfigVersion.resource_type == "upstream",
        ConfigVersion.resource_id == upstream_id
    ).order_by(ConfigVersion.version.desc())

    result = await db.execute(query)
    versions = result.scalars().all()
    return ConfigVersionListResponse(
        total=len(versions),
        items=[ConfigVersionResponse.model_validate(v) for v in versions],
        current_version=upstream.current_version
    )


@router.post("/{cluster_id}/upstreams/{upstream_id}/rollback/{version}")
async def rollback_upstream(cluster_id: int, upstream_id: int, version: int, db: AsyncSession = Depends(get_db)):
    upstream_result = await db.execute(select(Upstream).where(Upstream.id == upstream_id, Upstream.cluster_id == cluster_id))
    upstream = upstream_result.scalar_one_or_none()
    if not upstream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="上游服务不存在")

    result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.resource_type == "upstream",
        ConfigVersion.resource_id == upstream_id,
        ConfigVersion.version == version
    ))
    config_version = result.scalar_one_or_none()
    if not config_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本不存在")

    config_data = json.loads(config_version.config)

    upstream.load_balance = config_data.get("load_balance", upstream.load_balance)
    upstream.hash_on = config_data.get("hash_on")
    upstream.key = config_data.get("key")
    upstream.current_version = version

    await db.execute(UpstreamTarget.__table__.delete().where(UpstreamTarget.upstream_id == upstream_id))

    for t in config_data.get("targets", []):
        target = UpstreamTarget(
            upstream_id=upstream_id,
            target=t["target"],
            weight=t["weight"]
        )
        db.add(target)

    await db.commit()

    return {"status": "ok", "message": f"上游已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/upstreams/{upstream_id}/history/{history_id}")
async def delete_upstream_history(cluster_id: int, upstream_id: int, history_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.id == history_id,
        ConfigVersion.resource_type == "upstream",
        ConfigVersion.resource_id == upstream_id
    ))
    config_version = result.scalar_one_or_none()
    if not config_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="历史版本不存在")

    await db.delete(config_version)
    await db.commit()
    return {"status": "ok", "message": "历史版本已删除"}


@router.get("/{cluster_id}/nodes/{node_id}/diff")
async def diff_cluster_config(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    """对比数据库中某集群的配置与指定 Edge 节点上的运行配置"""
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")

    client = EdgeClient(cluster_id, db, node_ip=node.ip, node_port=node.management_port)

    # ---------- 1. 从 DB 查询 ----------
    async def _get_all(model, **filters):
        q = select(model).filter_by(**filters)
        r = await db.execute(q)
        return r.scalars().all()

    db_upstreams = await _get_all(Upstream, cluster_id=cluster_id)
    db_routes = await _get_all(Route, cluster_id=cluster_id)
    db_plugin_configs = await _get_all(PluginConfig, cluster_id=cluster_id)
    db_global_rules = await _get_all(GlobalRule, cluster_id=cluster_id)
    db_plugin_metadatas = await _get_all(PluginMetadata, cluster_id=cluster_id)

    # 查询路由级插件，按 route_id 分组
    db_route_plugins_all = await _get_all(RoutePlugin)
    db_route_plugins: dict[int, dict[str, Any]] = {}
    for rp in db_route_plugins_all:
        if rp.route_id not in db_route_plugins:
            db_route_plugins[rp.route_id] = {}
        db_route_plugins[rp.route_id][rp.plugin_name] = json.loads(rp.config) if rp.config else {}

    # 查询上游目标节点，按 upstream_id 分组
    db_upstream_targets_all = await _get_all(UpstreamTarget)
    db_upstream_targets: dict[int, dict[str, int]] = {}
    for t in db_upstream_targets_all:
        if t.upstream_id not in db_upstream_targets:
            db_upstream_targets[t.upstream_id] = {}
        db_upstream_targets[t.upstream_id][t.target] = t.weight

    # ---------- 2. 从 Edge 拉取 ----------
    def _edge_val(item: dict) -> dict:
        """Edge API 列表返回格式：{key, value: {实际数据}, ...}，提取 value"""
        v = item.get("value")
        return v if isinstance(v, dict) else item

    try:
        # list_upstreams 返回解析后的 [{key, value}, ...]
        edge_upstreams = {_edge_val(u).get("id", ""): _edge_val(u) for u in client.list_upstreams()}
        edge_routes = {_edge_val(r).get("id", ""): _edge_val(r) for r in client.list_routes()}
        edge_plugin_configs = {_edge_val(p).get("id", ""): _edge_val(p) for p in client.list_plugin_configs()}
        edge_global_rules = {_edge_val(g).get("id", ""): _edge_val(g) for g in client.list_global_rules()}
        edge_plugin_metadatas = {}
        for p in client.list_plugin_metadata():
            pd = _edge_val(p)
            pname = pd.get("name") or (p.get("key", "").rsplit("/", 1)[-1] if p.get("key") else "")
            if pname:
                edge_plugin_metadatas[pname] = pd
    except (EdgeConnectionError, EdgeAPIError) as e:
        raise HTTPException(status_code=502, detail=f"连接 Edge 节点失败: {e}")

    # ---------- 3. 对比函数 ----------
    _rules = EquivalenceRules()

    def _parse_json_safe(val: Any) -> Any:
        if isinstance(val, str) and val.strip().startswith(("{", "[")):
            try:
                return json.loads(val)
            except json.JSONDecodeError:
                return val
        return val

    def _compare_field(db_val, edge_val) -> dict | None:
        """对比单个字段，返回差异信息"""
        db_parsed = _parse_json_safe(db_val)
        edge_parsed = _parse_json_safe(edge_val)
        if json.dumps(db_parsed, sort_keys=True, default=str) != json.dumps(edge_parsed, sort_keys=True, default=str):
            return {"name": "value", "db": str(db_parsed), "edge": str(edge_parsed)}
        return None

    def _compare_upstream_targets(u_id: int, edge_nodes: Any) -> dict:
        db_targets = db_upstream_targets.get(u_id, {})
        edge_nodes_dict = {}
        if isinstance(edge_nodes, dict):
            edge_nodes_dict = edge_nodes
        elif isinstance(edge_nodes, list):
            for n in edge_nodes:
                host = n.get('host', '')
                port = n.get('port', '')
                key = f"{host}:{port}" if port else host
                edge_nodes_dict[key] = n.get('weight', 1)
        equal = json.dumps(db_targets, sort_keys=True, default=str) == json.dumps(edge_nodes_dict, sort_keys=True, default=str)
        return {"name": "targets", "db": json.dumps(db_targets, indent=1, ensure_ascii=False) if db_targets else "{}", "edge": json.dumps(edge_nodes_dict, indent=1, ensure_ascii=False) if edge_nodes_dict else "{}", "status": "equal" if equal else "diff"}

    def _compare_upstream(db_u, edge_data: dict | None):
        if not edge_data:
            return {"name": db_u.name, "id": db_u.edge_uuid, "status": "only_in_db", "fields": []}
        fields = []
        fields.append(_compare_upstream_targets(db_u.id, edge_data.get("nodes")))
        for key in ("load_balance", "scheme", "pass_host", "retries", "hash_on", "key"):
            db_raw = getattr(db_u, key, None)
            edge_key = _rules.get_field_alias("upstream", key)
            edge_v = edge_data.get(edge_key)
            if edge_v is None:
                fields.append({
                    "name": key,
                    "db": str(db_raw) if db_raw is not None and db_raw != _rules.get_field_default("upstream", key) else "(默认)",
                    "edge": "(未配置)",
                    "status": "diff" if (db_raw is not None and db_raw != _rules.get_field_default("upstream", key)) else "equal",
                })
                continue
            db_v = _rules.normalize_value("upstream", db_raw, key)
            if db_v is None:
                db_v = _rules.normalize_scalar("upstream", db_raw, key)
            equal = str(db_v) == str(edge_v)
            fields.append({
                "name": key,
                "db": str(db_v),
                "edge": str(edge_v),
                "status": "equal" if equal else "diff",
            })
        for jkey in ("checks", "timeout", "keepalive_pool"):
            db_v = getattr(db_u, jkey, None)
            edge_v = edge_data.get(jkey)
            if db_v or edge_v:
                result = _rules.compare_json_field(db_v, edge_v, _rules.get_json_rules("upstream", jkey))
                fields.append({
                    "name": jkey,
                    "db": result["db"] if result else (json.dumps(db_v, indent=1, ensure_ascii=False) if isinstance(db_v, dict) else str(db_v or "{}")),
                    "edge": result["edge"] if result else (json.dumps(edge_v, indent=1, ensure_ascii=False) if isinstance(edge_v, dict) else str(edge_v or "{}")),
                    "status": "equal" if not result else "diff",
                })
        return {"name": db_u.name, "id": db_u.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _compare_route(db_r, edge_data: dict | None):
        if not edge_data:
            return {"name": db_r.name, "id": db_r.edge_uuid, "status": "only_in_db", "fields": []}
        fields = []
        for key in ("uri", "methods", "hosts", "priority", "status"):
            db_v = getattr(db_r, key, None)
            edge_v = edge_data.get(key)
            if db_v is None or db_v == "":
                continue
            if _rules.is_list_field("route", key):
                matched, db_norm, edge_norm = _rules.normalize_list(db_v, edge_v)
                fields.append({
                    "name": key,
                    "db": str(db_v),
                    "edge": str(edge_v),
                    "status": "equal" if matched else "diff",
                })
            else:
                equal = str(db_v) == str(edge_v)
                fields.append({
                    "name": key,
                    "db": str(db_v),
                    "edge": str(edge_v),
                    "status": "equal" if equal else "diff",
                })
        # 高级匹配 vars
        db_vars = json.loads(db_r.vars) if db_r.vars else None
        edge_vars = edge_data.get("vars")
        if db_vars or edge_vars:
            equal = json.dumps(db_vars, sort_keys=True, default=str) == json.dumps(edge_vars, sort_keys=True, default=str)
            fields.append({
                "name": "vars",
                "db": json.dumps(db_vars, indent=1, ensure_ascii=False) if db_vars else "{}",
                "edge": json.dumps(edge_vars, indent=1, ensure_ascii=False) if edge_vars else "{}",
                "status": "equal" if equal else "diff",
            })
        # 插件组 plugin_config_ids
        db_pids = json.loads(db_r.plugin_config_ids) if db_r.plugin_config_ids else None
        edge_pids = edge_data.get("plugin_config_ids")
        if db_pids or edge_pids:
            equal = json.dumps(db_pids, sort_keys=True, default=str) == json.dumps(edge_pids, sort_keys=True, default=str)
            fields.append({
                "name": "plugin_config_ids",
                "db": json.dumps(db_pids, indent=1, ensure_ascii=False) if db_pids else "[]",
                "edge": json.dumps(edge_pids, indent=1, ensure_ascii=False) if edge_pids else "[]",
                "status": "equal" if equal else "diff",
            })
        # 路由级插件 RoutePlugin
        db_rp = db_route_plugins.get(db_r.id, {})
        edge_plugins = edge_data.get("plugins", {})
        if isinstance(edge_plugins, str):
            try:
                edge_plugins = json.loads(edge_plugins)
            except json.JSONDecodeError:
                pass
        if db_rp or edge_plugins:
            plugin_fields = _rules.compare_plugins(db_rp, edge_plugins, _rules.get_plugin_defaults("plugin_config"), ignore_edge_fields=_rules.get_ignore_plugin_fields("plugin_config"))
            fields.extend(plugin_fields)
        return {"name": db_r.name, "id": db_r.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _compare_plugin_config(db_p, edge_data: dict | None):
        if not edge_data:
            return {"name": db_p.name, "id": db_p.edge_uuid, "status": "only_in_db", "fields": []}
        db_plugins = json.loads(db_p.plugins) if db_p.plugins else {}
        edge_plugins = edge_data.get("plugins", {})
        if isinstance(edge_plugins, str):
            try:
                edge_plugins = json.loads(edge_plugins)
            except json.JSONDecodeError:
                pass
        fields = _rules.compare_plugins(db_plugins, edge_plugins, _rules.get_plugin_defaults("plugin_config"), ignore_edge_fields=_rules.get_ignore_plugin_fields("plugin_config"))
        return {"name": db_p.name, "id": db_p.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _compare_global_rule(db_g, edge_data: dict | None):
        if not edge_data:
            return {"name": db_g.name, "id": db_g.edge_uuid, "status": "only_in_db", "fields": []}
        db_plugins = json.loads(db_g.plugins) if db_g.plugins else {}
        edge_plugins = edge_data.get("plugins", {})
        if isinstance(edge_plugins, str):
            try:
                edge_plugins = json.loads(edge_plugins)
            except json.JSONDecodeError:
                pass
        fields = _rules.compare_plugins(db_plugins, edge_plugins, _rules.get_plugin_defaults("global_rule"), ignore_edge_fields=_rules.get_ignore_plugin_fields("global_rule"))
        return {"name": db_g.name, "id": db_g.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _compare_plugin_metadata(db_pm, edge_data: dict | None):
        if edge_data is None:
            return {"name": db_pm.plugin_name, "id": db_pm.plugin_name, "status": "only_in_db", "fields": []}
        fields = []
        db_config = json.loads(db_pm.config_data) if db_pm.config_data else {}
        edge_config = edge_data
        if isinstance(edge_config, str):
            try:
                edge_config = json.loads(edge_config)
            except json.JSONDecodeError:
                pass
        equal = json.dumps(db_config, sort_keys=True) == json.dumps(edge_config, sort_keys=True)
        fields.append({
            "name": "config",
            "db": json.dumps(db_config, indent=1, ensure_ascii=False),
            "edge": json.dumps(edge_config, indent=1, ensure_ascii=False),
            "status": "equal" if equal else "diff",
        })
        return {"name": db_pm.plugin_name, "id": db_pm.plugin_name, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _find_only_in_edge(edge_dict, db_items, id_attr="id"):
        """找出仅在 Edge 上存在、DB 中没有的项"""
        db_ids = {getattr(d, "edge_uuid", getattr(d, "plugin_name", "")) for d in db_items}
        result = []
        for eid, edata in edge_dict.items():
            if eid and eid not in db_ids:
                result.append({"name": edata.get("name", edata.get("uri", eid)), "id": eid, "status": "only_in_edge", "fields": []})
        return result

    # ---------- 4. 构建分组 ----------
    groups = []
    summary = {"total": 0, "match": 0, "mismatch": 0, "only_in_db": 0, "only_in_edge": 0}

    def _add_group(label: str, type_name: str, items: list):
        groups.append({"type": type_name, "label": label, "items": items or []})
        for it in items or []:
            s = it["status"]
            summary["total"] += 1
            if s in summary:
                summary[s] += 1

    # 上游
    upstream_items = [_compare_upstream(u, edge_upstreams.get(u.edge_uuid)) for u in db_upstreams]
    upstream_items += _find_only_in_edge(edge_upstreams, db_upstreams)
    _add_group("上游服务", "upstreams", upstream_items)

    # 路由
    route_items = [_compare_route(r, edge_routes.get(r.edge_uuid)) for r in db_routes]
    route_items += _find_only_in_edge(edge_routes, db_routes)
    _add_group("路由规则", "routes", route_items)

    # 插件组
    pc_items = [_compare_plugin_config(p, edge_plugin_configs.get(p.edge_uuid)) for p in db_plugin_configs]
    pc_items += _find_only_in_edge(edge_plugin_configs, db_plugin_configs)
    _add_group("插件组", "plugin_configs", pc_items)

    # 全局规则
    gr_items = [_compare_global_rule(g, edge_global_rules.get(g.edge_uuid)) for g in db_global_rules]
    gr_items += _find_only_in_edge(edge_global_rules, db_global_rules)
    _add_group("全局规则", "global_rules", gr_items)

    # 插件元数据
    pm_items = [_compare_plugin_metadata(p, edge_plugin_metadatas.get(p.plugin_name)) for p in db_plugin_metadatas]
    pm_items += _find_only_in_edge(edge_plugin_metadatas, db_plugin_metadatas, id_attr="name")
    _add_group("插件元数据", "plugin_metadata", pm_items)

    return {
        "node": f"{node.ip}:{node.management_port}",
        "summary": summary,
        "groups": groups,
    }