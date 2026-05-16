from fastapi import APIRouter, HTTPException, status, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from pydantic import BaseModel
from typing import Any

from app.core.database import get_db, is_sqlite, DATABASE_URL
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.models.cluster import Node, Cluster

router = APIRouter(prefix="/edge-client", tags=["edge-client"])


def get_sync_db():
    sync_url = DATABASE_URL.replace("sqlite+aiosqlite://", "sqlite://").replace("postgresql+asyncpg://", "postgresql://")
    if is_sqlite(DATABASE_URL):
        engine = create_engine(sync_url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    else:
        engine = create_engine(sync_url)
    return Session(engine)


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
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.list_upstreams()
        import json
        print(f"[DEBUG] Edge upstream raw result keys: {result.keys() if isinstance(result, dict) else type(result)}")
        if isinstance(result, dict) and "raw_response" in result:
            return {"error": "解密失败", "detail": "Edge server response could not be decrypted", "raw_length": len(result.get("raw_response", ""))}
        nodes = client._parse_node_list(result)
        return {"upstreams": nodes}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"连接失败: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/upstreams/{upstream_id}")
async def get_upstream(ip: str, port: int, upstream_id: str, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.get_upstream(upstream_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/nodes/{ip}/{port}/upstreams")
async def create_upstream(ip: str, port: int, data: UpstreamCreate, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
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
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    payload = data.model_dump(exclude_none=True)
    try:
        result = client.update_upstream(upstream_id, payload)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/upstreams/{upstream_id}")
async def delete_upstream(ip: str, port: int, upstream_id: str, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.delete_upstream(upstream_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/routes")
async def list_routes(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.list_routes()
        return {"routes": result}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/routes/{route_id}")
async def get_route(ip: str, port: int, route_id: str, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.get_route(route_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/nodes/{ip}/{port}/routes")
async def create_route(ip: str, port: int, data: RouteCreate, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
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
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    payload = data.model_dump(exclude_none=True)
    try:
        result = client.update_route(route_id, payload)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/routes/{route_id}")
async def delete_route_endpoint(ip: str, port: int, route_id: str, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.delete_route(route_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugins")
async def list_plugins(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.list_plugins()
        return {"plugins": result}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/global_rules")
async def list_global_rules(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.list_global_rules()
        return {"global_rules": result}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/global_rules/{rule_id}")
async def get_global_rule(ip: str, port: int, rule_id: str, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.get_global_rule(rule_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/global_rules/{rule_id}")
async def create_global_rule(ip: str, port: int, rule_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.create_global_rule(rule_id, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.patch("/nodes/{ip}/{port}/global_rules/{rule_id}")
async def update_global_rule(ip: str, port: int, rule_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.update_global_rule(rule_id, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/global_rules/{rule_id}")
async def delete_global_rule(ip: str, port: int, rule_id: str, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.delete_global_rule(rule_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugin_configs")
async def list_plugin_configs(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.list_plugin_configs()
        return {"plugin_configs": result}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugin_configs/{config_id}")
async def get_plugin_config(ip: str, port: int, config_id: str, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.get_plugin_config(config_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/plugin_configs/{config_id}")
async def create_plugin_config(ip: str, port: int, config_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.create_plugin_config(config_id, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.patch("/nodes/{ip}/{port}/plugin_configs/{config_id}")
async def update_plugin_config(ip: str, port: int, config_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.update_plugin_config(config_id, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/plugin_configs/{config_id}")
async def delete_plugin_config(ip: str, port: int, config_id: str, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.delete_plugin_config(config_id)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugin_metadata")
async def list_plugin_metadata(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.list_plugin_metadata()
        return {"plugin_metadata": result}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugin_metadata/{plugin_name}")
async def get_plugin_metadata(ip: str, port: int, plugin_name: str, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.get_plugin_metadata(plugin_name)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/plugin_metadata/{plugin_name}")
async def create_plugin_metadata(ip: str, port: int, plugin_name: str, data: dict, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.create_plugin_metadata(plugin_name, data)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.delete("/nodes/{ip}/{port}/plugin_metadata/{plugin_name}")
async def delete_plugin_metadata(ip: str, port: int, plugin_name: str, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.delete_plugin_metadata(plugin_name)
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/nodes/{ip}/{port}/plugins/list")
async def list_available_plugins(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.list_available_plugins()
        return {"plugins": result}
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/nodes/{ip}/{port}/plugins/reload")
async def reload_plugins(ip: str, port: int, db: AsyncSession = Depends(get_db)):
    sync_db = get_sync_db()
    client = EdgeClient(0, sync_db, node_ip=ip, node_port=port)
    try:
        result = client.reload_plugins()
        return result
    except EdgeConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")
    except EdgeAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

