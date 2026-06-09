"""
Shared Edge node synchronization utilities.

Extracts the repeated `for node in active_nodes: EdgeClient(...)` pattern
that appeared 12+ times across clusters.py, routes.py, and plugin_metadata.py.
"""

import json
from typing import Any, Optional, Callable, Awaitable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.cluster import Node, ConfigVersion
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError


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
    publish_fn: Callable[[EdgeClient], Awaitable[Any]],
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

            response = await publish_fn(client)

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
