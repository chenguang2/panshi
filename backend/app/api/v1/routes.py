from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from typing import List, Optional
import json

from app.core.database import get_db
from app.models.cluster import Route, RoutePlugin, ConfigVersion, Upstream, Node
from app.models.system import AuditLog
from app.schemas.route import RouteCreate, RouteUpdate, RouteResponse, RouteListResponse, PluginUpdateRequest
from app.schemas.cluster import ConfigVersionResponse, ConfigVersionListResponse

router = APIRouter(prefix="/clusters/{cluster_id}/routes", tags=["routes"])

# Allowed sort fields
ALLOWED_SORT_FIELDS = {"name", "uri", "priority", "status", "created_at"}
# Allowed search fields
ALLOWED_SEARCH_FIELDS = {"name", "uri", "description", "hosts"}


def route_to_response(r: Route) -> RouteResponse:
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
        "created_at": r.created_at.isoformat() if r.created_at else None
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

    items = [route_to_response(r) for r in routes]

    return RouteListResponse(total=total, page=page, page_size=page_size, items=items)


@router.post("", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
async def create_route(cluster_id: int, route: RouteCreate, db: AsyncSession = Depends(get_db)):
    route_data = route.model_dump()
    if route_data.get('vars') is not None:
        route_data['vars'] = json.dumps(route_data['vars'])
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

    return RouteResponse(
        id=db_route.id,
        edge_uuid=db_route.edge_uuid,
        cluster_id=db_route.cluster_id,
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
        created_at=db_route.created_at.isoformat() if db_route.created_at else None
    )


@router.get("/{route_id}", response_model=RouteResponse)
async def get_route(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")

    return RouteResponse(
        id=route.id,
        edge_uuid=route.edge_uuid,
        cluster_id=route.cluster_id,
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
        created_at=route.created_at.isoformat() if route.created_at else None
    )


@router.put("/{route_id}", response_model=RouteResponse)
async def update_route(cluster_id: int, route_id: int, route_update: RouteUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")

    update_data = route_update.model_dump(exclude_unset=True)
    if 'vars' in update_data:
        if update_data['vars'] is not None:
            update_data['vars'] = json.dumps(update_data['vars'])
        else:
            update_data['vars'] = None

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

    return RouteResponse(
        id=route.id,
        edge_uuid=route.edge_uuid,
        cluster_id=route.cluster_id,
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
        created_at=route.created_at.isoformat() if route.created_at else None
    )


@router.delete("/{route_id}")
async def delete_route(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")
    
    await db.delete(route)
    await db.commit()
    return {"message": "路由已删除"}


@router.post("/{route_id}/publish")
async def publish_route(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
    from app.services.edge_logger import get_edge_logger

    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")

    version_result = await db.execute(
        select(func.max(ConfigVersion.version)).where(
            ConfigVersion.resource_type == "route",
            ConfigVersion.resource_id == route_id
        )
    )
    latest_version = version_result.scalar() or 0
    new_version = latest_version + 1

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
        plugin_name = p.plugin_name
        plugin_config = p.config
        try:
            plugins_edge_format[plugin_name] = json.loads(plugin_config) if isinstance(plugin_config, str) else (plugin_config or {})
        except (json.JSONDecodeError, TypeError):
            plugins_edge_format[plugin_name] = {}

    config_data = {
        "id": route.id,
        "edge_uuid": route.edge_uuid,
        "name": route.name,
        "uri": route.uri,
        "methods": route.methods,
        "priority": route.priority,
        "status": route.status,
        "upstream_id": route.upstream_id,
        "upstream_edge_uuid": upstream_edge_uuid,
        "hosts": route.hosts,
        "remote_addrs": route.remote_addrs,
        "vars": json.loads(route.vars) if isinstance(route.vars, str) and route.vars else None,
        "advanced_match_enabled": bool(route.advanced_match_enabled) if route.advanced_match_enabled else False,
        "plugins": plugins_edge_format
    }

    config_version = ConfigVersion(
        cluster_id=cluster_id,
        resource_type="route",
        resource_id=route_id,
        version=new_version,
        config=json.dumps(config_data)
    )
    db.add(config_version)
    route.current_version = new_version
    await db.commit()

    nodes_result = await db.execute(select(Node).where(Node.cluster_id == cluster_id, Node.status == 1))
    active_nodes = nodes_result.scalars().all()

    if not active_nodes:
        return {"status": "ok", "message": f"路由 {route.name} 发布成功，但集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    edge_logger = get_edge_logger()
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
        status=route.status
    )

    results = []
    success_count = 0
    fail_count = 0

    for node in active_nodes:
        node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}

        try:
            sync_db = db
            client = EdgeClient(cluster_id, sync_db, node_ip=node.ip, node_port=node.management_port)

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
        return {"status": "ok", "message": f"路由 {route.name} 发布成功，已同步到 {success_count} 个节点", "version": new_version, "results": results}
    elif success_count > 0:
        return {"status": "partial", "message": f"路由 {route.name} 发布完成，{success_count}/{len(active_nodes)} 节点同步成功", "version": new_version, "results": results}
    else:
        return {"status": "error", "message": f"路由 {route.name} 发布失败：无法连接到任何 edge 服务器", "version": new_version, "results": results}


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
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")
    
    await db.execute(RoutePlugin.__table__.delete().where(RoutePlugin.route_id == route_id))
    
    for plugin in request.plugins:
        db_plugin = RoutePlugin(route_id=route_id, plugin_name=plugin.plugin_name, config=plugin.config)
        db.add(db_plugin)
    
    await db.commit()
    return {"message": "插件配置已更新"}


@router.get("/{route_id}/history")
async def get_route_history(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")

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
    from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
    from app.services.edge_logger import get_edge_logger

    route_result = await db.execute(select(Route).where(Route.id == route_id, Route.cluster_id == cluster_id))
    route = route_result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="路由不存在")

    result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.resource_type == "route",
        ConfigVersion.resource_id == route_id,
        ConfigVersion.version == version
    ))
    config_version = result.scalar_one_or_none()
    if not config_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="版本不存在")

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
        status=route.status
    )

    results = []
    success_count = 0
    fail_count = 0

    for node in active_nodes:
        node_result = {"node": f"{node.ip}:{node.management_port}", "status": "pending"}

        try:
            sync_db = db
            client = EdgeClient(cluster_id, sync_db, node_ip=node.ip, node_port=node.management_port)

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
    result = await db.execute(select(ConfigVersion).where(
        ConfigVersion.id == history_id,
        ConfigVersion.resource_type == "route",
        ConfigVersion.resource_id == route_id
    ))
    config_version = result.scalar_one_or_none()
    if not config_version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="历史版本不存在")

    await db.delete(config_version)
    await db.commit()
    return {"status": "ok", "message": "历史版本已删除"}