"""
Shared Edge node synchronization utilities.

Extracts the repeated `for node in active_nodes: EdgeClient(...)` pattern
that appeared 12+ times across clusters.py, routes.py, and plugin_metadata.py.
"""

from typing import Any, Optional, Callable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.cluster import Node
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
    edge_uuid: str,
    edge_data: dict,
    edge_publish_fn: Callable[[EdgeClient, str, dict], Any],
    encrypt_body: bool = True,
    logger_fn: Optional[Callable] = None,
    logger_kwargs: Optional[dict] = None,
) -> tuple[list[dict], int, int]:
    """Publish a resource to multiple Edge nodes.

    Args:
        cluster_id: Cluster ID.
        db: Database session.
        active_nodes: List of nodes to publish to.
        edge_uuid: Edge UUID of the resource.
        edge_data: Data to send to Edge nodes.
        edge_publish_fn: Function like `client.update_route(edge_uuid, data)`.
        encrypt_body: Whether to encrypt the request body for logging.
        logger_fn: Edge logger function for operation logging.
        logger_kwargs: Additional kwargs for the logger function.

    Returns:
        Tuple of (results list, success_count, fail_count).
    """
    results: list[dict] = []
    success_count = 0
    fail_count = 0
    logger_kwargs = logger_kwargs or {}

    for node in active_nodes:
        node_result: dict[str, Any] = {
            "node": f"{node.ip}:{node.management_port}",
            "status": "pending",
        }
        try:
            client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)
            encrypted = client._encrypt(__import__("json").dumps(edge_data).encode()) if encrypt_body else None
            response = edge_publish_fn(client, edge_uuid, edge_data)

            if logger_fn:
                log_data = {
                    "cluster_id": cluster_id,
                    "method": "PUT",
                    "path": f"/edge/admin/{logger_kwargs.get('resource_type', '')}/{edge_uuid}",
                    "request_body": edge_data,
                    "encrypted_body": encrypted,
                    "response_status": 201,
                    "response_body": response,
                    "status": "SUCCESS",
                    **(logger_kwargs.get("extra_success", {})),
                }
                logger_fn(**log_data)

            node_result["status"] = "success"
            node_result["response"] = response
            success_count += 1

        except (EdgeConnectionError, EdgeAPIError) as e:
            if logger_fn:
                log_data = {
                    "cluster_id": cluster_id,
                    "method": "PUT",
                    "path": f"/edge/admin/{logger_kwargs.get('resource_type', '')}/{edge_uuid}",
                    "request_body": edge_data,
                    "encrypted_body": None,
                    "response_status": e.status_code if isinstance(e, EdgeAPIError) else None,
                    "response_body": e.response_body if isinstance(e, EdgeAPIError) else None,
                    "status": "FAILED",
                    "error": str(e),
                    **(logger_kwargs.get("extra_fail", {})),
                }
                logger_fn(**log_data)

            node_result["status"] = "failed"
            node_result["error"] = str(e)
            fail_count += 1

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
    base = {
        "results": results,
        "version": version,
    }
    if success_count == total_nodes:
        base["status"] = "ok"
        msg = f"{resource_name}发布成功，已同步到 {success_count} 个节点"
    elif success_count > 0:
        base["status"] = "partial"
        msg = f"{resource_name}发布完成，{success_count}/{total_nodes} 节点同步成功"
    else:
        base["status"] = "error"
        msg = f"{resource_name}发布失败：无法连接到任何 edge 服务器"
    base["message"] = msg
    return base
