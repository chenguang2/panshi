"""
Shared Edge node synchronization utilities.

Extracts the repeated `for node in active_nodes: EdgeClient(...)` pattern
that appeared 12+ times across clusters.py, routes.py, and plugin_metadata.py.
"""

import json
from typing import Any, Awaitable, Optional, Callable
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, inspect as sa_inspect

from app.models.cluster import Cluster, Node, ConfigVersion, Upstream, Route, PluginConfig, GlobalRule, PluginMetadata
from app.models.static_resource import StaticResource
from app.schemas.cluster import ConfigVersionListResponse, ConfigVersionResponse
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services.edge_logger import get_edge_logger


async def get_or_404(
    db: AsyncSession,
    model: type,
    *,
    detail: Optional[str] = None,
    **filters: Any,
) -> Any:
    """Query a single row by filters and return it, or raise 404.

    Usage:
        route = await get_or_404(db, Route, id=route_id, cluster_id=cluster_id)
        # raises HTTPException(404, "Route不存在") if not found

    The error message defaults to ``{ModelName}不存在`` but can be overridden
    via the ``detail`` parameter.
    """
    query = select(model)
    for field, value in filters.items():
        query = query.where(getattr(model, field) == value)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        name = detail or f"{model.__name__}不存在"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=name)
    return item


async def verify_node(
    db: AsyncSession,
    cluster_id: int,
    node_id: int,
) -> Node:
    """Return the node of a cluster or raise 404 ("节点不存在")."""
    return await get_or_404(db, Node, id=node_id, cluster_id=cluster_id, detail="节点不存在")


async def rollback_resource(
    db: AsyncSession,
    model: type,
    *,
    resource_type: str,
    resource_id: int,
    version: int,
    not_found_detail: str,
    cluster_id: Optional[int] = None,
    loader: Optional[Callable[[AsyncSession], Awaitable]] = None,
    restore_fn: Optional[Callable] = None,
) -> Any:
    """通用版本回滚骨架：加载资源+版本 → 解析 config → restore_fn 恢复 → 更新 current_version → commit。

    Phase 3 收敛：替换 8 个 cluster_* 路由中重复的 rollback 前置/后置样板。
    - ``loader``：自定义资源加载器（默认按 model + id[/cluster_id] 走 get_or_404）；
    - ``restore_fn(db, resource, config_data)``：资源特定字段恢复逻辑（可 async，可空）；
    - 返回 resource，调用方自行构造响应体以保留各端点既有响应形状。
    """
    if loader is not None:
        resource = await loader(db)
    else:
        filters: dict[str, Any] = {"id": resource_id}
        if cluster_id is not None:
            filters["cluster_id"] = cluster_id
        resource = await get_or_404(db, model, detail=not_found_detail, **filters)

    config_version = await get_or_404(
        db, ConfigVersion,
        resource_type=resource_type, resource_id=resource_id, version=version,
        detail="版本不存在",
    )
    config_data = json.loads(config_version.config)

    if restore_fn is not None:
        result = restore_fn(db, resource, config_data)
        if result is not None and hasattr(result, "__await__"):
            await result

    resource.current_version = version
    await db.commit()
    return resource


async def publish_resource(
    db: AsyncSession,
    *,
    cluster_id: int,
    resource: Any,
    resource_type: str,
    config_data: dict,
    edge_data: Any,
    publish_fn: Callable,
    display_name: str,
    log_path: str,
    log_resource_id: Optional[int],
    log_resource_name: Optional[str],
    node_ids: Optional[list[int]] = None,
    cluster_name: Optional[str] = None,
    prefer_display_name: bool = False,
    no_nodes_status: str = "error",
    no_nodes_message: str = "集群中没有活跃的 edge 节点",
    log_method: str = "PUT",
    log_status: Optional[int] = 201,
    log_error_as_str: bool = False,
    post_version_hook: Optional[Callable[[], Awaitable[None]]] = None,
    post_publish_fn: Optional[Callable] = None,
) -> dict:
    """通用发布编排：建版本 →（钩子）→ 选节点 → 逐节点发布 + 日志 → 汇总响应。

    调用方只负责资源载荷构造与取回 resource；其余脚手架统一在此维护。
    差异点通过参数表达：
    - cluster_name: 已解析的集群名；None 时按 prefer_display_name 决定解析规则
    - no_nodes_status/no_nodes_message: 无活跃节点时的响应（route 为 "ok" + 前缀文案）
    - log_status: dns/stream 原实现不传 response_status，传 None 保持一致
    - log_error_as_str: dns/stream 原实现对错误日志做 str() 归一化
    - post_version_hook: 版本快照之后执行（ssl 的 CA 过期检查与证书链拼接）
    - post_publish_fn: 发布后的附加动作（plugin_metadata 的 reload_plugins）
    """
    new_version = await create_config_version(db, resource_type, resource.id, cluster_id, config_data, resource)

    if post_version_hook is not None:
        await post_version_hook()

    active_nodes = await get_active_nodes(cluster_id, db, node_ids)
    if not active_nodes:
        return {"status": no_nodes_status, "message": no_nodes_message, "version": new_version, "results": []}

    if cluster_name is None:
        cluster = await db.get(Cluster, cluster_id)
        if prefer_display_name:
            cluster_name = cluster.display_name or cluster.name or str(cluster_id) if cluster else str(cluster_id)
        else:
            cluster_name = cluster.name if cluster else str(cluster_id)

    edge_logger = get_edge_logger()

    def _log_fn(node_result, response, error, encrypted):
        kwargs = dict(
            resource_type=resource_type,
            cluster_id=cluster_id,
            cluster_name=cluster_name,
            resource_id=log_resource_id,
            resource_name=log_resource_name,
            method=log_method,
            path=log_path,
            request_body=edge_data,
            encrypted_body=encrypted,
            response_body=response,
            error=error,
        )
        if log_status is not None:
            kwargs["response_status"] = log_status
        if log_error_as_str:
            kwargs["response_body"] = response if error is None else None
            kwargs["error"] = str(error) if error else None
        return edge_logger.log_publish_result(**kwargs)

    post_log_fn = None
    if post_publish_fn is not None:
        def post_log_fn(node_result, response, error, encrypted):
            return edge_logger.log_publish_result(
                resource_type=resource_type,
                cluster_id=cluster_id,
                cluster_name=cluster_name,
                resource_id=log_resource_id,
                resource_name=log_resource_name,
                method="PUT",
                path="/edge/admin/plugins/reload",
                request_body={},
                encrypted_body=encrypted,
                response_status=200,
                response_body=response,
                error=error,
            )

    results, success_count, fail_count = await publish_to_nodes(
        cluster_id, active_nodes, edge_data,
        publish_fn=publish_fn,
        log_fn=_log_fn,
        post_publish_fn=post_publish_fn,
        post_log_fn=post_log_fn,
    )
    return build_publish_response(results, success_count, fail_count, len(active_nodes), display_name, new_version)


async def list_config_versions(
    db: AsyncSession,
    *,
    resource_type: str,
    resource_id: int,
    current_version: Optional[int] = None,
) -> ConfigVersionListResponse:
    """按版本号倒序列出资源配置版本。"""
    result = await db.execute(
        select(ConfigVersion)
        .where(ConfigVersion.resource_type == resource_type, ConfigVersion.resource_id == resource_id)
        .order_by(ConfigVersion.version.desc())
    )
    versions = result.scalars().all()
    return ConfigVersionListResponse(
        total=len(versions),
        items=[ConfigVersionResponse.model_validate(v) for v in versions],
        current_version=current_version,
    )


async def delete_config_version(
    db: AsyncSession,
    *,
    resource_type: str,
    resource_id: int,
    history_id: int,
    detail: str = "历史版本不存在",
) -> None:
    """删除一条配置版本（不存在则 404）。"""
    config_version = await get_or_404(
        db, ConfigVersion,
        id=history_id, resource_type=resource_type, resource_id=resource_id,
        detail=detail,
    )
    await db.delete(config_version)
    await db.commit()


async def get_active_nodes(
    cluster_id: int,
    db: AsyncSession,
    node_ids: Optional[list[int]] = None,
    status: int = 1,
) -> list[Node]:
    """Query active nodes for a cluster, optionally filtered by node_ids."""
    query = select(Node).where(Node.cluster_id == cluster_id, Node.status == status)
    if node_ids:
        query = query.where(Node.id.in_(node_ids))
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_config_version(
    db: AsyncSession,
    resource_type: str,
    resource_id: int,
    cluster_id: int,
    config_data: dict,
    entity: Any,
) -> int:
    """Increment version, create ConfigVersion record, and return new version number.

    Args:
        db: Database session.
        resource_type: e.g. 'route', 'upstream', 'plugin_config', 'global_rule', 'plugin_metadata'.
        resource_id: ID of the resource.
        cluster_id: Cluster ID.
        config_data: Serialized config dict to store in ConfigVersion.
        entity: The SQLAlchemy model instance (sets entity.current_version).

    Returns:
        The new version number.
    """
    version_result = await db.execute(
        select(func.max(ConfigVersion.version)).where(
            ConfigVersion.resource_type == resource_type,
            ConfigVersion.resource_id == resource_id,
        )
    )
    latest_version = version_result.scalar() or 0
    new_version = latest_version + 1

    config_version = ConfigVersion(
        cluster_id=cluster_id,
        resource_type=resource_type,
        resource_id=resource_id,
        version=new_version,
        config=json.dumps(config_data, ensure_ascii=False),
    )
    db.add(config_version)
    entity.current_version = new_version
    await db.commit()
    return new_version


async def delete_on_nodes(
    cluster_id: int,
    active_nodes: list[Node],
    edge_uuid: str,
    edge_delete_fn: Callable[[EdgeClient, str], Any],
) -> list[dict]:
    """Delete a resource from multiple Edge nodes.

    Args:
        cluster_id: Cluster ID.
        active_nodes: List of nodes to delete from.
        edge_uuid: Edge UUID of the resource to delete.
        edge_delete_fn: Function like `client.delete_route(edge_uuid)`.

    Returns:
        List of result dicts with node, scope, status, and optional error.
    """
    if not active_nodes:
        return [{"scope": "edge", "status": "skipped", "message": "集群中没有活跃的 Edge 节点"}]

    results: list[dict] = []
    for node in active_nodes:
        node_result: dict[str, Any] = {
            "node": f"{node.ip}:{node.management_port}",
            "scope": "edge",
            "status": "pending",
        }
        try:
            client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)
            response = edge_delete_fn(client, edge_uuid)
            node_result["status"] = "success"
            node_result["response"] = response
        except (EdgeConnectionError, EdgeAPIError) as e:
            node_result["status"] = "failed"
            node_result["error"] = str(e)
        results.append(node_result)
    return results


async def publish_to_nodes(
    cluster_id: int,
    active_nodes: list[Node],
    edge_data: dict,
        publish_fn: Callable[[EdgeClient], Any],
    log_fn: Optional[Callable[[dict, Any, Optional[Exception], Optional[bytes]], None]] = None,
    post_publish_fn: Optional[Callable[[EdgeClient], Any]] = None,
    post_log_fn: Optional[Callable[[dict, Any, Optional[Exception], Optional[bytes]], None]] = None,
) -> tuple[list[dict], int, int]:
    """Publish resource data to multiple Edge nodes.

    Handles: node iteration, EdgeClient creation, body encryption,
    Edge API call, error handling, and optional logging.

    Args:
        cluster_id: Cluster ID.
        active_nodes: List of nodes to publish to.
        edge_data: Data dict to send (used for encryption).
        publish_fn: Async callable `async def fn(client: EdgeClient) -> response`.
        log_fn: Optional callback `fn(node_result, response, error, encrypted)` for
                resource-specific logging after each node result.
        post_publish_fn: Optional callback `fn(client)` called after successful
                publish on each node, for post-publish actions like reload.
        post_log_fn: Optional callback `fn(node_result, response, error, encrypted)`
                for logging the post-publish action result.

    Returns:
        Tuple of (results list, success_count, fail_count).
    """
    results: list[dict] = []
    success_count = 0
    fail_count = 0

    for node in active_nodes:
        node_result: dict[str, Any] = {
            "node": f"{node.ip}:{node.management_port}",
            "status": "pending",
        }
        try:
            client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)
            encrypted = client._encrypt(json.dumps(edge_data).encode())

            response = publish_fn(client)

            node_result["status"] = "success"
            node_result["response"] = response
            success_count += 1

            if log_fn:
                log_fn(node_result, response, None, encrypted)

            if post_publish_fn:
                post_response = post_publish_fn(client)
                node_result["post_action"] = "ok"
                if post_log_fn:
                    post_log_fn(node_result, post_response, None, None)

        except (EdgeConnectionError, EdgeAPIError) as e:
            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1

            if log_fn:
                log_fn(node_result, None, e, None)

            if post_publish_fn and node_result.get("post_action") != "ok":
                if post_log_fn:
                    post_log_fn(node_result, None, e, None)

        results.append(node_result)

    return results, success_count, fail_count


def build_publish_response(
    results: list[dict],
    success_count: int,
    fail_count: int,
    total_nodes: int,
    resource_name: str = "",
    version: Optional[int] = None,
) -> dict:
    """Build a standardized publish response dict."""
    base: dict[str, Any] = {
        "results": results,
        "version": version,
    }
    if success_count == total_nodes:
        base["status"] = "ok"
        base["message"] = f"{resource_name}发布成功，已同步到 {success_count} 个节点"
    elif success_count > 0:
        base["status"] = "partial"
        base["message"] = f"{resource_name}发布完成，{success_count}/{total_nodes} 节点同步成功"
    else:
        base["status"] = "error"
        base["message"] = f"{resource_name}发布失败：无法连接到任何 edge 服务器"
    return base


async def batch_load_cluster_stats(
    db: AsyncSession,
    clusters: list,
    cluster_ids: list[int],
) -> tuple[dict[int, int], dict[int, int], dict[int, int], dict[int, int], dict[int, int], dict[int, int], dict[int, int], dict[int, int], dict[int, list]]:
    """Load stats for multiple clusters in batch (8 GROUP BY queries total).

    Returns tuple of dicts keyed by cluster_id:
    (node_count, healthy_node_count, upstream_count, route_count,
     plugin_config_count, global_rule_count, static_resource_count, nodes)
    """
    if not cluster_ids:
        return {}, {}, {}, {}, {}, {}, {}, {}, {}

    # Nodes: count + health per cluster
    node_q = await db.execute(
        select(
            Node.cluster_id,
            func.count(),
            func.sum(case((Node.status == 1, 1), else_=0)),
        ).where(Node.cluster_id.in_(cluster_ids)).group_by(Node.cluster_id)
    )
    node_counts = {}
    healthy_counts = {}
    for row in node_q:
        node_counts[row[0]] = row[1] or 0
        healthy_counts[row[0]] = row[2] or 0

    # All nodes per cluster (for the detail list)
    nodes_q = await db.execute(
        select(Node).where(Node.cluster_id.in_(cluster_ids)).order_by(Node.cluster_id)
    )
    nodes_by_cluster: dict[int, list] = {}
    for n in nodes_q.scalars().all():
        nodes_by_cluster.setdefault(n.cluster_id, []).append(n)

    # Upstreams
    up_q = await db.execute(
        select(Upstream.cluster_id, func.count()).where(Upstream.cluster_id.in_(cluster_ids)).group_by(Upstream.cluster_id)
    )
    up_counts = {row[0]: row[1] or 0 for row in up_q}

    # Routes
    rt_q = await db.execute(
        select(Route.cluster_id, func.count()).where(Route.cluster_id.in_(cluster_ids)).group_by(Route.cluster_id)
    )
    rt_counts = {row[0]: row[1] or 0 for row in rt_q}

    # PluginConfigs
    pc_q = await db.execute(
        select(PluginConfig.cluster_id, func.count()).where(PluginConfig.cluster_id.in_(cluster_ids)).group_by(PluginConfig.cluster_id)
    )
    pc_counts = {row[0]: row[1] or 0 for row in pc_q}

    # GlobalRules
    gr_q = await db.execute(
        select(GlobalRule.cluster_id, func.count()).where(GlobalRule.cluster_id.in_(cluster_ids)).group_by(GlobalRule.cluster_id)
    )
    gr_counts = {row[0]: row[1] or 0 for row in gr_q}

    # StaticResources
    sr_q = await db.execute(
        select(StaticResource.cluster_id, func.count()).where(StaticResource.cluster_id.in_(cluster_ids)).group_by(StaticResource.cluster_id)
    )
    sr_counts = {row[0]: row[1] or 0 for row in sr_q}

    # PluginMetadata
    pm_q = await db.execute(
        select(PluginMetadata.cluster_id, func.count()).where(PluginMetadata.cluster_id.in_(cluster_ids)).group_by(PluginMetadata.cluster_id)
    )
    pm_counts = {row[0]: row[1] or 0 for row in pm_q}

    return (node_counts, healthy_counts, up_counts, rt_counts, pc_counts, gr_counts, sr_counts, pm_counts, nodes_by_cluster)
