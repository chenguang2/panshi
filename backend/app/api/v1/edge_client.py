from fastapi import APIRouter, HTTPException, status, Depends, Query
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Any

from app.core.database import get_db
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services import edge_sync
from app.models.cluster import Node, Cluster

from app.core.deps import require_permission

router = APIRouter(prefix="/edge-client", tags=["edge-client"], dependencies=[Depends(require_permission('edge_nodes'))])


async def run_edge_sync(call, timeout=10.0):
    """Run a synchronous EdgeClient call in a thread pool so it doesn't block the event loop.
    
    The event loop must remain free to handle cancellation (client disconnect)
    and other concurrent requests. Without this, 6 parallel edge queries
    would serialize and block the server for up to 30 seconds.
    """
    return await asyncio.wait_for(asyncio.to_thread(call), timeout=timeout)


class UpstreamCreate(BaseModel):
    type: str = "roundrobin"
    name: str | None = None
    nodes: dict[str, int] | None = None
    hash_on: str | None = None
    key: str | None = None
    pass_host: str = "pass"
    scheme: str = "http"


class UpstreamUpdate(BaseModel):
    type: str | None = None
    name: str | None = None
    nodes: dict[str, int] | None = None
    hash_on: str | None = None
    key: str | None = None
    pass_host: str | None = None
    scheme: str | None = None


class StreamRouteCreate(BaseModel):
    """四层代理写载荷（Edge 直连）。

    两个刻意的设计：

    1. `extra="allow"`：Edge 侧写入是全量替换，载荷里会带表单不覆盖的字段
       （`plugins`、`upstream.checks`、`upstream.pass_host` 等），模型不得吞掉它们；
       配合 `model_dump(exclude_unset=True)` 可做到"校验必填项 + 其余原样透传"。
    2. 必填项只有 `server_port` 与 `upstream.nodes`：实测 Edge 的创建接口**不做任何校验**
       （空载荷 `{}` 也返回 200 并生成一条无端口、无上游的路由），所以平台侧必须立住
       这两条底线，否则会往节点里塞无效路由。
    """

    model_config = ConfigDict(extra="allow")

    server_port: int = Field(ge=1, le=65535)
    upstream: dict[str, Any] = Field(...)
    name: str | None = None
    protocol: str | None = None
    sni: str | None = None
    remote_addr: str | None = None

    @field_validator("upstream")
    @classmethod
    def _require_nodes(cls, v: dict[str, Any]) -> dict[str, Any]:
        nodes = v.get("nodes")
        if not isinstance(nodes, dict) or not nodes:
            raise ValueError("upstream.nodes 至少需要一个节点")
        return v


class StreamRouteUpdate(StreamRouteCreate):
    """更新载荷：Edge 的 PUT 为全量替换，故必填项与创建一致。"""


class RouteCreate(BaseModel):
    uri: str | None = None
    uris: list[str] | None = None
    name: str | None = None
    methods: list[str] | None = None
    hosts: list[str] | None = None
    priority: int = 0
    upstream_id: str | None = None
    plugins: dict[str, Any] | None = None
    plugin_config_ids: list[str] | None = None
    vars: list[tuple[str, str, str]] | None = None


class RouteUpdate(BaseModel):
    uri: str | None = None
    uris: list[str] | None = None
    name: str | None = None
    methods: list[str] | None = None
    hosts: list[str] | None = None
    priority: int | None = None
    upstream_id: str | None = None
    plugins: dict[str, Any] | None = None
    plugin_config_ids: list[str] | None = None
    vars: list[tuple[str, str, str]] | None = None


@router.get("/nodes")
async def list_edge_nodes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.status == 1))
    nodes = result.scalars().all()
    node_list = []
    for node in nodes:
        cluster_result = await db.execute(select(Cluster).where(Cluster.id == node.cluster_id))
        cluster = cluster_result.scalar_one_or_none()
        node_list.append({
            "id": node.id,
            "cluster_id": node.cluster_id,
            "cluster_name": cluster.name if cluster else f"Cluster-{node.cluster_id}",
            "ip": node.ip,
            "management_port": node.management_port
        })
    return {"nodes": node_list}


@router.get("/nodes/{ip}/{port}/upstreams")
async def list_upstreams(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    # 节点执行路径：按该 client 实例判定，在发起 Edge 请求前调用 → 失败也带。
    route_info: dict[str, Any] = {}
    edge_sync.mark_route(route_info, client)
    try:
        result = await run_edge_sync(client.list_upstreams)
        if isinstance(result, list):
            return {"upstreams": result, **route_info}
        if isinstance(result, dict) and "raw_response" in result:
            return {"error": "解密失败", "detail": "Edge server response could not be decrypted", "raw_length": len(result.get("raw_response", "")), **route_info}
        nodes = client._parse_node_list(result)
        return {"upstreams": nodes, **route_info}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"连接失败: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/upstreams/{upstream_id}")
async def get_upstream(ip: str, port: int, upstream_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.get_upstream(upstream_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/nodes/{ip}/{port}/upstreams")
async def create_upstream(ip: str, port: int, data: UpstreamCreate, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    payload = data.model_dump(exclude_none=True)
    try:
        result = client.create_upstream(payload)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/upstreams/{upstream_id}")
async def update_upstream(ip: str, port: int, upstream_id: str, data: UpstreamUpdate, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    payload = data.model_dump(exclude_none=True)
    try:
        result = client.update_upstream(upstream_id, payload)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.patch("/nodes/{ip}/{port}/upstreams/{upstream_id}")
async def patch_upstream_endpoint(ip: str, port: int, upstream_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.patch_upstream(upstream_id, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/upstreams/{upstream_id}")
async def delete_upstream(ip: str, port: int, upstream_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.delete_upstream(upstream_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/routes")
async def list_routes(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    # 节点执行路径：按该 client 实例判定，在发起 Edge 请求前调用 → 失败也带。
    route_info: dict[str, Any] = {}
    edge_sync.mark_route(route_info, client)
    try:
        result = await run_edge_sync(client.list_routes)
        return {"routes": result, **route_info}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/routes/{route_id}")
async def get_route(ip: str, port: int, route_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.get_route(route_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/nodes/{ip}/{port}/routes")
async def create_route(ip: str, port: int, data: RouteCreate, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    payload = data.model_dump(exclude_none=True)
    try:
        result = client.create_route(payload)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/routes/{route_id}")
async def update_route_endpoint(ip: str, port: int, route_id: str, data: RouteUpdate, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    payload = data.model_dump(exclude_none=True)
    try:
        result = client.update_route(route_id, payload)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.patch("/nodes/{ip}/{port}/routes/{route_id}")
async def patch_route_endpoint(ip: str, port: int, route_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.patch_route(route_id, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/routes/{route_id}")
async def delete_route_endpoint(ip: str, port: int, route_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.delete_route(route_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugins")
async def list_plugins(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = await run_edge_sync(client.list_plugins)
        return {"plugins": result}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/global_rules")
async def list_global_rules(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    # 节点执行路径：按该 client 实例判定，在发起 Edge 请求前调用 → 失败也带。
    route_info: dict[str, Any] = {}
    edge_sync.mark_route(route_info, client)
    try:
        result = await run_edge_sync(client.list_global_rules)
        return {"global_rules": result, **route_info}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/global_rules/{rule_id}")
async def get_global_rule(ip: str, port: int, rule_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.get_global_rule(rule_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/global_rules/{rule_id}")
async def create_global_rule(ip: str, port: int, rule_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.create_global_rule(rule_id, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.patch("/nodes/{ip}/{port}/global_rules/{rule_id}")
async def update_global_rule(ip: str, port: int, rule_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.update_global_rule(rule_id, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/global_rules/{rule_id}")
async def delete_global_rule(ip: str, port: int, rule_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.delete_global_rule(rule_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugin_configs")
async def list_plugin_configs(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    # 节点执行路径：按该 client 实例判定，在发起 Edge 请求前调用 → 失败也带。
    route_info: dict[str, Any] = {}
    edge_sync.mark_route(route_info, client)
    try:
        result = await run_edge_sync(client.list_plugin_configs)
        return {"plugin_configs": result, **route_info}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugin_configs/{config_id}")
async def get_plugin_config(ip: str, port: int, config_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.get_plugin_config(config_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/plugin_configs/{config_id}")
async def create_plugin_config(ip: str, port: int, config_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.create_plugin_config(config_id, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.patch("/nodes/{ip}/{port}/plugin_configs/{config_id}")
async def update_plugin_config(ip: str, port: int, config_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.update_plugin_config(config_id, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/plugin_configs/{config_id}")
async def delete_plugin_config(ip: str, port: int, config_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.delete_plugin_config(config_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugin_metadata")
async def list_plugin_metadata(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    # 节点执行路径：按该 client 实例判定，在发起 Edge 请求前调用 → 失败也带。
    route_info: dict[str, Any] = {}
    edge_sync.mark_route(route_info, client)
    try:
        result = await run_edge_sync(client.list_plugin_metadata)
        return {"plugin_metadata": result, **route_info}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugin_metadata/{plugin_name}")
async def get_plugin_metadata(ip: str, port: int, plugin_name: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.get_plugin_metadata(plugin_name)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/plugin_metadata/{plugin_name}")
async def create_plugin_metadata(ip: str, port: int, plugin_name: str, data: dict, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.create_plugin_metadata(plugin_name, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.patch("/nodes/{ip}/{port}/plugin_metadata/{plugin_name}")
async def patch_plugin_metadata_endpoint(ip: str, port: int, plugin_name: str, data: dict, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.update_plugin_metadata(plugin_name, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/plugin_metadata/{plugin_name}")
async def delete_plugin_metadata(ip: str, port: int, plugin_name: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.delete_plugin_metadata(plugin_name)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/ssl")
async def list_ssl_certificates(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    # 节点执行路径：按该 client 实例判定，在发起 Edge 请求前调用 → 失败也带。
    route_info: dict[str, Any] = {}
    edge_sync.mark_route(route_info, client)
    try:
        result = client.api("ssl", "list")
        return {"ssl_certificates": result, **route_info}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/ssl/{cert_id}")
async def get_ssl_certificate(ip: str, port: int, cert_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        return client.api("ssl", "get", cert_id)
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/ssl/{cert_id}")
async def delete_ssl_certificate(ip: str, port: int, cert_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        return client.api("ssl", "delete", cert_id)
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugins/list")
async def list_available_plugins(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    # 节点执行路径：按该 client 实例判定，在发起 Edge 请求前调用 → 失败也带。
    route_info: dict[str, Any] = {}
    edge_sync.mark_route(route_info, client)
    try:
        result = await run_edge_sync(client.list_available_plugins)
        return {"plugins": result, **route_info}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/plugins/reload")
async def reload_plugins(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.reload_plugins()
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


# ── Stream Route endpoints ──


@router.get("/nodes/{ip}/{port}/stream-routes")
async def list_stream_routes(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    # 节点执行路径：按该 client 实例判定，在发起 Edge 请求前调用 → 失败也带。
    route_info: dict[str, Any] = {}
    edge_sync.mark_route(route_info, client)
    try:
        result = await run_edge_sync(client.list_stream_routes)
        return {"stream_routes": result, **route_info}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/stream-routes/{route_id}")
async def get_stream_route(ip: str, port: int, route_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = await run_edge_sync(lambda: client.get_stream_route(route_id))
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/nodes/{ip}/{port}/stream-routes")
async def create_stream_route(ip: str, port: int, data: StreamRouteCreate, db: AsyncSession = Depends(get_db)):
    """在 Edge 节点上创建 Stream 路由（集合创建，id 由 Edge 分配）。

    `StreamRouteCreate` 负责把无效载荷挡在平台侧——Edge 不做校验（见模型 docstring）。
    """
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.create_stream_route(data.model_dump(exclude_unset=True))
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/stream-routes/{route_id}")
async def update_stream_route(ip: str, port: int, route_id: str, data: StreamRouteUpdate, db: AsyncSession = Depends(get_db)):
    """更新 Edge 节点上的 Stream 路由（PUT 全量替换，路径 id 为准）。"""
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.update_stream_route(route_id, data.model_dump(exclude_unset=True))
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/stream-routes/{route_id}")
async def delete_stream_route(ip: str, port: int, route_id: str, db: AsyncSession = Depends(get_db)):
    client = EdgeClient(0, node_ip=ip, node_port=port)
    try:
        result = client.delete_stream_route(route_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

