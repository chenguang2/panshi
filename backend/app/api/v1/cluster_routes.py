from fastapi import APIRouter, Body, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from typing import List, Optional
import json

from app.core.database import get_db
from app.models.cluster import Cluster, Route, RoutePlugin, ConfigVersion, Upstream, Node
from app.models.system import AuditLog
from app.schemas.route import RouteCreate, RouteUpdate, RouteResponse, RouteListResponse, PluginUpdateRequest
from app.schemas.cluster import ConfigVersionResponse, ConfigVersionListResponse, DeleteClusterRequest, PublishRequest
from app.services import edge_sync
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services.edge_logger import get_edge_logger

router = APIRouter(prefix="/clusters/{cluster_id}/routes", tags=["routes"])

# Allowed sort fields
ALLOWED_SORT_FIELDS = {"name", "uri", "priority", "status", "created_at"}
# Allowed search fields
ALLOWED_SEARCH_FIELDS = {"name", "uri", "description", "hosts"}


def route_to_response(r: Route, current_version: int | None = None, published_at: str | None = None,
                       plugins: list | None = None) -> RouteResponse:
    """Convert Route model to RouteResponse"""
    route_dict = {
        "id": r.id,
        "edge_uuid": r.edge_uuid,
        "cluster_id": r.cluster_id,
        "name": r.name,
        "uri": r.uri,
        "methods": r.methods,
        "priority": r.priority,
        "status": r.status,
        "description": r.description,
        "upstream_id": r.upstream_id,
        "hosts": r.hosts,
        "remote_addrs": r.remote_addrs,
        "vars": json.loads(r.vars) if r.vars else None,
        "advanced_match_enabled": bool(r.advanced_match_enabled) if r.advanced_match_enabled else False,
        "plugin_config_ids": json.loads(r.plugin_config_ids) if r.plugin_config_ids else None,
        "current_version": current_version or r.current_version,
        "published_at": published_at,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "plugins": plugins or [],
    }
    return RouteResponse.model_validate(route_dict)


@router.get("", response_model=RouteListResponse)
async def list_routes(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    sort_by: Optional[str] = Query(None, description=f"Sort field. Allowed: {', '.join(ALLOWED_SORT_FIELDS)}"),
    sort_order: Optional[str] = Query("asc", pattern="^(asc|desc)$", description="Sort order: asc or desc"),
    search: Optional[str] = Query(None, description="Search keyword"),
    search_field: Optional[str] = Query(None, description=f"Search field. Allowed: {', '.join(ALLOWED_SEARCH_FIELDS)} or omit for all")
):
    # Base query
    query = select(Route).where(Route.cluster_id == cluster_id)

    # Search filter
    if search:
        search_pattern = f"%{search}%"
        if search_field and search_field in ALLOWED_SEARCH_FIELDS:
            # Column-specific search
            search_col = getattr(Route, search_field)
            query = query.where(search_col.ilike(search_pattern))
        else:
            # Global search across all text fields
            conditions = [
                getattr(Route, field).ilike(search_pattern)
                for field in ALLOWED_SEARCH_FIELDS
                if hasattr(Route, field)
            ]
            query = query.where(or_(*conditions))

    # Sorting
    if sort_by and sort_by in ALLOWED_SORT_FIELDS:
        sort_column = getattr(Route, sort_by)
        if sort_order == "desc":
            sort_column = sort_column.desc()
        query = query.order_by(sort_column)

    # Get total count before pagination
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    # Execute query
    result = await db.execute(query)
    routes = result.scalars().all()

    # 批量查询最新发布时间
    route_ids = [r.id for r in routes]
    pub_result = await db.execute(
        select(
            ConfigVersion.resource_id,
            func.max(ConfigVersion.created_at).label("latest_ts")
        ).where(
            ConfigVersion.resource_type == "route",
            ConfigVersion.resource_id.in_(route_ids) if route_ids else False
        ).group_by(ConfigVersion.resource_id)
    )
    pub_map = {r.resource_id: r.latest_ts for r in pub_result.all()} if route_ids else {}

    # 批量查询插件
    plugin_rows = await db.execute(
        select(RoutePlugin).where(RoutePlugin.route_id.in_(route_ids) if route_ids else False)
    )
    plugin_map: dict[int, list] = {}
    for rp in plugin_rows.scalars().all():
        if rp.route_id not in plugin_map:
            plugin_map[rp.route_id] = []
        plugin_map[rp.route_id].append({"plugin_name": rp.plugin_name})

    items = [
        route_to_response(r, published_at=pub_map.get(r.id).isoformat() + 'Z' if pub_map.get(r.id) else None,
                          plugins=plugin_map.get(r.id, []))
        for r in routes
    ]

    return RouteListResponse(total=total, page=page, page_size=page_size, items=items)


@router.post("", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
async def create_route(cluster_id: int, route: RouteCreate, db: AsyncSession = Depends(get_db)):
    route_data = route.model_dump()
    if route_data.get('vars') is not None:
        route_data['vars'] = json.dumps(route_data['vars'])
    if route_data.get('plugin_config_ids') is not None:
        route_data['plugin_config_ids'] = json.dumps(route_data['plugin_config_ids'])
    db_route = Route(cluster_id=cluster_id, **route_data)
    db.add(db_route)
    await db.commit()
    await db.refresh(db_route)

    audit = AuditLog(
        user_id=None,
        username="system",
        action="create_route",
        resource="route",
        resource_id=db_route.id,
        detail=f"Created route {db_route.name}"
    )
    db.add(audit)
    await db.commit()

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()

    return RouteResponse(
        id=db_route.id,
        edge_uuid=db_route.edge_uuid,
        cluster_id=db_route.cluster_id,
        cluster_name=cluster.name if cluster else str(cluster_id),
        name=db_route.name,
        uri=db_route.uri,
        methods=db_route.methods,
        priority=db_route.priority,
        status=db_route.status,
        description=db_route.description,
        upstream_id=db_route.upstream_id,
        hosts=db_route.hosts,
        remote_addrs=db_route.remote_addrs,
        vars=json.loads(db_route.vars) if db_route.vars else None,
        advanced_match_enabled=bool(db_route.advanced_match_enabled) if db_route.advanced_match_enabled else False,
        plugin_config_ids=json.loads(db_route.plugin_config_ids) if db_route.plugin_config_ids else None,
        created_at=db_route.created_at.isoformat() if db_route.created_at else None
    )


@router.get("/{route_id}", response_model=RouteResponse)
async def get_route(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    route = await edge_sync.get_or_404(db, Route, id=route_id, cluster_id=cluster_id, detail="路由不存在")

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()

    return RouteResponse(
        id=route.id,
        edge_uuid=route.edge_uuid,
        cluster_id=route.cluster_id,
        cluster_name=cluster.name if cluster else str(cluster_id),
        name=route.name,
        uri=route.uri,
        methods=route.methods,
        priority=route.priority,
        status=route.status,
        description=route.description,
        upstream_id=route.upstream_id,
        hosts=route.hosts,
        remote_addrs=route.remote_addrs,
        vars=json.loads(route.vars) if route.vars else None,
        advanced_match_enabled=bool(route.advanced_match_enabled) if route.advanced_match_enabled else False,
        plugin_config_ids=json.loads(route.plugin_config_ids) if route.plugin_config_ids else None,
        created_at=route.created_at.isoformat() if route.created_at else None
    )


@router.put("/{route_id}", response_model=RouteResponse)
async def update_route(cluster_id: int, route_id: int, route_update: RouteUpdate, db: AsyncSession = Depends(get_db)):
    route = await edge_sync.get_or_404(db, Route, id=route_id, cluster_id=cluster_id, detail="路由不存在")

    update_data = route_update.model_dump(exclude_unset=True)
    if 'vars' in update_data:
        if update_data['vars'] is not None:
            update_data['vars'] = json.dumps(update_data['vars'])
        else:
            update_data['vars'] = None

    if 'plugin_config_ids' in update_data:
        if update_data['plugin_config_ids'] is not None:
            update_data['plugin_config_ids'] = json.dumps(update_data['plugin_config_ids'])
        else:
            update_data['plugin_config_ids'] = None

    for key, value in update_data.items():
        setattr(route, key, value)
    
    await db.commit()
    await db.refresh(route)

    audit = AuditLog(
        user_id=None,
        username="system",
        action="update_route",
        resource="route",
        resource_id=route.id,
        detail=f"Updated route {route.name}"
    )
    db.add(audit)
    await db.commit()

    cluster_result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
    cluster = cluster_result.scalar_one_or_none()

    return RouteResponse(
        id=route.id,
        edge_uuid=route.edge_uuid,
        cluster_id=route.cluster_id,
        cluster_name=cluster.name if cluster else str(cluster_id),
        name=route.name,
        uri=route.uri,
        methods=route.methods,
        priority=route.priority,
        status=route.status,
        description=route.description,
        upstream_id=route.upstream_id,
        hosts=route.hosts,
        remote_addrs=route.remote_addrs,
        vars=json.loads(route.vars) if route.vars else None,
        advanced_match_enabled=bool(route.advanced_match_enabled) if route.advanced_match_enabled else False,
        plugin_config_ids=json.loads(route.plugin_config_ids) if route.plugin_config_ids else None,
        created_at=route.created_at.isoformat() if route.created_at else None
    )


@router.delete("/{route_id}")
async def delete_route(cluster_id: int, route_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db)):

    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    route = await edge_sync.get_or_404(db, Route, id=route_id, cluster_id=cluster_id, detail="路由不存在")

    node_query = select(Node).where(Node.cluster_id == cluster_id, Node.status == 1)
    if body.node_ids:
        node_query = node_query.where(Node.id.in_(body.node_ids))
    nodes_result = await db.execute(node_query)
    active_nodes = nodes_result.scalars().all()

    results = []

    if body.delete_db:
        await db.execute(ConfigVersion.__table__.delete().where(ConfigVersion.resource_type == "route", ConfigVersion.resource_id == route_id))
        await db.execute(RoutePlugin.__table__.delete().where(RoutePlugin.route_id == route_id))
        await db.delete(route)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        if active_nodes:
            for node in active_nodes:
                node_result = {"node": f"{node.ip}:{node.management_port}", "scope": "edge", "status": "pending"}
                try:
                    client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)
                    response = client.delete_route(route.edge_uuid)
                    node_result["status"] = "success"
                    node_result["response"] = response
                except (EdgeConnectionError, EdgeAPIError) as e:
                    node_result["status"] = "failed"
                    node_result["error"] = str(e)
                results.append(node_result)
        else:
            results.append({"scope": "edge", "status": "skipped", "message": "集群中没有活跃的 Edge 节点"})

    return {"message": "路由已删除", "results": results}


@router.post("/{route_id}/publish")
async def publish_route(cluster_id: int, route_id: int, req: Optional[PublishRequest] = None, db: AsyncSession = Depends(get_db)):

    route = await edge_sync.get_or_404(db, Route, id=route_id, cluster_id=cluster_id, detail="路由不存在")

    plugins_result = await db.execute(select(RoutePlugin).where(RoutePlugin.route_id == route_id))
    plugins = plugins_result.scalars().all()

    upstream_edge_uuid = None
    if route.upstream_id:
        upstream_result = await db.execute(select(Upstream).where(Upstream.id == route.upstream_id))
        upstream = upstream_result.scalar_one_or_none()
        if upstream:
            upstream_edge_uuid = upstream.edge_uuid

    plugins_edge_format = {}
    for p in plugins:
        try:
            plugins_edge_format[p.plugin_name] = json.loads(p.config) if isinstance(p.config, str) else (p.config or {})
        except (json.JSONDecodeError, TypeError):
            plugins_edge_format[p.plugin_name] = {}

    config_data = {
        "id": route.id, "edge_uuid": route.edge_uuid, "name": route.name,
        "uri": route.uri, "methods": route.methods, "priority": route.priority,
        "status": route.status, "upstream_id": route.upstream_id,
        "upstream_edge_uuid": upstream_edge_uuid, "hosts": route.hosts,
        "remote_addrs": route.remote_addrs,
        "vars": json.loads(route.vars) if isinstance(route.vars, str) and route.vars else None,
        "advanced_match_enabled": bool(route.advanced_match_enabled) if route.advanced_match_enabled else False,
        "plugins": plugins_edge_format,
        "plugin_config_ids": json.loads(route.plugin_config_ids) if route.plugin_config_ids else None}
    new_version = await edge_sync.create_config_version(db, "route", route_id, cluster_id, config_data, route)

    if req and req.node_ids:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db, req.node_ids)
    else:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db)

    if not active_nodes:
        return {"status": "ok", "message": f"路由 {route.name} 发布成功，但集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    edge_data = EdgeClient.convert_route_to_edge_format(
        edge_uuid=route.edge_uuid, name=route.name, uri=route.uri,
        methods=route.methods, hosts=route.hosts,
        upstream_edge_uuid=upstream_edge_uuid, priority=route.priority or 0,
        vars_json=route.vars if isinstance(route.vars, str) else None,
        plugins=plugins, status=route.status,
        plugin_config_ids=json.loads(route.plugin_config_ids) if route.plugin_config_ids else None)

    edge_logger = get_edge_logger()

    def log_publish(node_result, response, error, encrypted):
        if error:
            edge_logger.log_route_operation(
                cluster_id=cluster_id, cluster_name=str(cluster_id),
                route_id=route_id, route_name=route.name,
                method="PUT", path=f"/edge/admin/routes/{route.edge_uuid}",
                request_body=edge_data, encrypted_body=None,
                response_status=error.status_code if isinstance(error, EdgeAPIError) else None,
                response_body=error.response_body if isinstance(error, EdgeAPIError) else None,
                status="FAILED", error=str(error))
        else:
            edge_logger.log_route_operation(
                cluster_id=cluster_id, cluster_name=str(cluster_id),
                route_id=route_id, route_name=route.name,
                method="PUT", path=f"/edge/admin/routes/{route.edge_uuid}",
                request_body=edge_data, encrypted_body=encrypted,
                response_status=201, response_body=response, status="SUCCESS")

    results, success_count, fail_count = await edge_sync.publish_to_nodes(
        cluster_id, active_nodes, edge_data,
        publish_fn=lambda client: client.update_route(route.edge_uuid, edge_data),
        log_fn=log_publish)

    return edge_sync.build_publish_response(results, success_count, fail_count, len(active_nodes), f"路由 {route.name} ", new_version)


@router.post("/publish")
async def publish_all_routes(cluster_id: int, db: AsyncSession = Depends(get_db)):
    query = select(Route).where(Route.cluster_id == cluster_id, Route.status == 1)
    result = await db.execute(query)
    routes = result.scalars().all()
    
    return {"status": "ok", "message": f"{len(routes)} 条路由发布成功"}


@router.get("/{route_id}/plugins")
async def get_route_plugins(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RoutePlugin).where(RoutePlugin.route_id == route_id))
    plugins = result.scalars().all()
    return {"plugins": [{"plugin_name": p.plugin_name, "config": p.config} for p in plugins]}


@router.put("/{route_id}/plugins")
async def update_route_plugins(cluster_id: int, route_id: int, request: PluginUpdateRequest, db: AsyncSession = Depends(get_db)):
    await edge_sync.get_or_404(db, Route, id=route_id, cluster_id=cluster_id, detail="路由不存在")
    
    await db.execute(RoutePlugin.__table__.delete().where(RoutePlugin.route_id == route_id))
    
    for plugin in request.plugins:
        db_plugin = RoutePlugin(route_id=route_id, plugin_name=plugin.plugin_name, config=plugin.config)
        db.add(db_plugin)
    
    await db.commit()
    return {"message": "插件配置已更新"}


@router.get("/{route_id}/history")
async def get_route_history(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    route = await edge_sync.get_or_404(db, Route, id=route_id, cluster_id=cluster_id, detail="路由不存在")

    query = select(ConfigVersion).where(
        ConfigVersion.resource_type == "route",
        ConfigVersion.resource_id == route_id
    ).order_by(ConfigVersion.version.desc())

    result = await db.execute(query)
    versions = result.scalars().all()
    return ConfigVersionListResponse(
        total=len(versions),
        items=[ConfigVersionResponse.model_validate(v) for v in versions],
        current_version=route.current_version
    )


@router.post("/{route_id}/rollback/{version}")
async def rollback_route(cluster_id: int, route_id: int, version: int, db: AsyncSession = Depends(get_db)):

    route_result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = route_result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")

    config_version = await edge_sync.get_or_404(db, ConfigVersion, resource_type="route", resource_id=route_id, version=version, detail="版本不存在")

    config_data = json.loads(config_version.config)

    route.uri = config_data.get("uri", route.uri)
    route.methods = config_data.get("methods", route.methods)
    route.priority = config_data.get("priority", route.priority)
    route.status = config_data.get("status", route.status)
    route.upstream_id = config_data.get("upstream_id", route.upstream_id)
    route.hosts = config_data.get("hosts", route.hosts)
    route.remote_addrs = config_data.get("remote_addrs", route.remote_addrs)
    route.vars = json.dumps(config_data.get("vars")) if config_data.get("vars") else None
    route.advanced_match_enabled = 1 if config_data.get("advanced_match_enabled") else 0
    pids = config_data.get("plugin_config_ids")
    route.plugin_config_ids = json.dumps(pids) if pids else None
    route.current_version = version

    await db.execute(RoutePlugin.__table__.delete().where(RoutePlugin.route_id == route_id))
    plugins_data = config_data.get("plugins", {})
    if isinstance(plugins_data, dict):
        for plugin_name, plugin_config in plugins_data.items():
            plugin = RoutePlugin(
                route_id=route_id,
                plugin_name=plugin_name,
                config=json.dumps(plugin_config) if isinstance(plugin_config, dict) else str(plugin_config)
            )
            db.add(plugin)
    elif isinstance(plugins_data, list):
        for p in plugins_data:
            plugin = RoutePlugin(
                route_id=route_id,
                plugin_name=p.get("plugin_name"),
                config=p.get("config")
            )
            db.add(plugin)

    await db.commit()

    nodes_result = await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
    active_nodes = nodes_result.scalars().all()

    if not active_nodes:
        return {"status": "ok", "message": f"路由已切换到版本 v{version}，但集群中没有活跃的 edge 节点", "version": version, "results": []}

    edge_logger = get_edge_logger()
    upstream_edge_uuid = config_data.get("upstream_edge_uuid")
    if not upstream_edge_uuid and route.upstream_id:
        upstream_result = await db.execute(select(Upstream).where(Upstream.id == route.upstream_id))
        upstream = upstream_result.scalar_one_or_none()
        if upstream:
            upstream_edge_uuid = upstream.edge_uuid

    plugins_result = await db.execute(select(RoutePlugin).where(RoutePlugin.route_id == route_id))
    plugins = plugins_result.scalars().all()

    edge_data = EdgeClient.convert_route_to_edge_format(
        edge_uuid=route.edge_uuid,
        name=route.name,
        uri=route.uri,
        methods=route.methods,
        hosts=route.hosts,
        upstream_edge_uuid=upstream_edge_uuid,
        priority=route.priority or 0,
        vars_json=route.vars if isinstance(route.vars, str) else None,
        plugins=plugins,
        status=route.status,
        plugin_config_ids=json.loads(route.plugin_config_ids) if route.plugin_config_ids else None
    )

    results = []
    success_count = 0
    fail_count = 0

    for node in active_nodes:
        node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}

        try:
            client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)

            encrypted = client._encrypt(json.dumps(edge_data).encode())

            response = client.update_route(route.edge_uuid, edge_data)

            edge_logger.log_route_operation(
                cluster_id=cluster_id,
                cluster_name=str(cluster_id),
                route_id=route_id,
                route_name=route.name,
                method="PUT",
                path=f"/edge/admin/routes/{route.edge_uuid}",
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
            edge_logger.log_route_operation(
                cluster_id=cluster_id,
                cluster_name=str(cluster_id),
                route_id=route_id,
                route_name=route.name,
                method="PUT",
                path=f"/edge/admin/routes/{route.edge_uuid}",
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
            edge_logger.log_route_operation(
                cluster_id=cluster_id,
                cluster_name=str(cluster_id),
                route_id=route_id,
                route_name=route.name,
                method="PUT",
                path=f"/edge/admin/routes/{route.edge_uuid}",
                request_body=edge_data,
                encrypted_body=None,
                response_status=e.status_code,
                response_body=e.response_body,
                status="FAILED",
                error=e.message
            )
            node_result["status"] = "failed"
            node_result["error"] = e.message
            fail_count += 1

        results.append(node_result)

    if success_count == len(active_nodes):
        return {"status": "ok", "message": f"路由已切换到版本 v{version}，已同步到 {success_count} 个节点", "version": version, "results": results}
    elif success_count > 0:
        return {"status": "partial", "message": f"路由已切换到版本 v{version}，{success_count}/{len(active_nodes)} 节点同步成功", "version": version, "results": results}
    else:
        return {"status": "error", "message": f"路由已切换到版本 v{version}，但节点同步失败", "version": version, "results": results}


@router.delete("/{route_id}/history/{history_id}")
async def delete_route_history(cluster_id: int, route_id: int, history_id: int, db: AsyncSession = Depends(get_db)):
    config_version = await edge_sync.get_or_404(db, ConfigVersion, id=history_id, resource_type="route", resource_id=route_id, detail="历史版本不存在")

    await db.delete(config_version)
    await db.commit()
    return {"status": "ok", "message": "历史版本已删除"}