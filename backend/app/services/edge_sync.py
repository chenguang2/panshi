"""
Shared Edge node synchronization utilities.

Extracts the repeated `for node in active_nodes: EdgeClient(...)` pattern
that appeared 12+ times across clusters.py, routes.py, and plugin_metadata.py.
"""

import json
from typing import Any, Optional, Callable
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, inspect as sa_inspect

from app.models.cluster import Node, ConfigVersion, Upstream, Route, PluginConfig, GlobalRule, PluginMetadata
from app.models.static_resource import StaticResource
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError


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

        except (EdgeConnectionError, EdgeAPIError) as e:
            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1

            if log_fn:
                log_fn(node_result, None, e, None)

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
            func.sum(Node.status == 1),
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
