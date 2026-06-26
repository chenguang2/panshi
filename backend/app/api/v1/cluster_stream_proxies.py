import json
import os
from typing import Optional

import yaml
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_db
from app.config import MAX_PAGE_SIZE
from app.models.cluster import Cluster, StreamProxy, ConfigVersion, Node
from app.schemas.stream_proxy import (
    StreamProxyCreate, StreamProxyUpdate, StreamProxyResponse,
    DetectPortsRequest, DetectPortsResponse, PortItem,
)
from app.schemas.cluster import ConfigVersionResponse, ConfigVersionListResponse, PublishRequest, DeleteClusterRequest
from app.services import edge_sync
from app.services.edge_client import EdgeClient

router = APIRouter(prefix="/clusters", tags=["stream-proxies"])

# Global stream proxy list endpoint (not cluster-scoped)
global_router = APIRouter(prefix="/stream-proxies", tags=["stream-proxies"])


ALLOWED_SEARCH_FIELDS = {"name", "description"}


async def _proxy_response_with_cluster_name(proxy, cluster_id: int, db):
    """Return StreamProxyResponse with cluster_name added."""
    cluster = await db.get(Cluster, cluster_id)
    cluster_name = cluster.display_name or cluster.name if cluster else ""
    resp = StreamProxyResponse.model_validate(proxy)
    item = resp.model_dump()
    item["cluster_name"] = cluster_name
    return item
ALLOWED_SORT_FIELDS = {"name", "listen_port", "load_balance", "created_at"}


@router.get("/{cluster_id}/stream-proxies", response_model=dict)
async def list_stream_proxies(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    search: Optional[str] = None,
):
    query = select(StreamProxy).where(StreamProxy.cluster_id == cluster_id)

    if search:
        pattern = f"%{search}%"
        conditions = [
            getattr(StreamProxy, field).ilike(pattern)
            for field in ALLOWED_SEARCH_FIELDS
            if hasattr(StreamProxy, field)
        ]
        query = query.where(or_(*conditions))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(StreamProxy.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    proxies = result.scalars().all()

    proxy_ids = [p.id for p in proxies]
    pub_result = await db.execute(
        select(
            ConfigVersion.resource_id,
            func.max(ConfigVersion.created_at).label("latest_ts"),
        ).where(
            ConfigVersion.resource_type == "stream_proxy",
            ConfigVersion.resource_id.in_(proxy_ids) if proxy_ids else False,
        ).group_by(ConfigVersion.resource_id)
    )
    pub_map = {r.resource_id: r.latest_ts for r in pub_result.all()} if proxy_ids else {}

    cluster = await db.get(Cluster, cluster_id)
    cluster_name = cluster.display_name or cluster.name if cluster else ""

    items = []
    for p in proxies:
        resp = StreamProxyResponse.model_validate(p)
        ts = pub_map.get(p.id)
        resp.published_at = ts.isoformat() + "Z" if ts else None
        item = resp.model_dump()
        item["cluster_name"] = cluster_name
        items.append(item)

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@global_router.get("", response_model=dict)
async def list_all_stream_proxies(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    search: Optional[str] = None,
):
    """List stream proxies across all clusters (global view)."""
    query = select(StreamProxy).order_by(StreamProxy.created_at.desc())
    if search:
        pattern = f"%{search}%"
        conditions = [
            getattr(StreamProxy, field).ilike(pattern)
            for field in ALLOWED_SEARCH_FIELDS
            if hasattr(StreamProxy, field)
        ]
        query = query.where(or_(*conditions))
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    proxies = result.scalars().all()

    # Build cluster_id → cluster_name map
    clusters_result = await db.execute(select(Cluster.id, Cluster.display_name, Cluster.name))
    cluster_map = {}
    for row in clusters_result.all():
        cluster_map[row.id] = row.display_name or row.name or ""

    items = []
    for p in proxies:
        resp = StreamProxyResponse.model_validate(p)
        item = resp.model_dump()
        item["cluster_name"] = cluster_map.get(p.cluster_id, "")
        items.append(item)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.post("/{cluster_id}/stream-proxies", response_model=StreamProxyResponse, status_code=status.HTTP_201_CREATED)
async def create_stream_proxy(
    cluster_id: int,
    data: StreamProxyCreate,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(StreamProxy).where(
            StreamProxy.cluster_id == cluster_id,
            StreamProxy.listen_port == data.listen_port,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="端口已被占用")

    proxy_data = data.model_dump(exclude={"targets"})
    if data.targets is not None:
        proxy_data["targets"] = json.dumps([t.model_dump() for t in data.targets])
    if proxy_data.get("timeout"):
        proxy_data["timeout"] = json.dumps(proxy_data["timeout"])
    if proxy_data.get("keepalive_pool"):
        proxy_data["keepalive_pool"] = json.dumps(proxy_data["keepalive_pool"])

    proxy = StreamProxy(cluster_id=cluster_id, **proxy_data)
    db.add(proxy)
    await db.commit()
    await db.refresh(proxy)
    return await _proxy_response_with_cluster_name(proxy, cluster_id, db)


@router.post("/{cluster_id}/stream-proxies/detect-ports", response_model=DetectPortsResponse)
async def detect_stream_proxy_ports(
    cluster_id: int,
    req: DetectPortsRequest,
    db: AsyncSession = Depends(get_db),
):
    """Detect available stream ports from edge.env on a reference node."""
    node = await db.get(Node, req.node_id)
    if not node or node.cluster_id != cluster_id:
        raise HTTPException(status_code=404, detail="节点不存在或不属于该集群")

    from app.services.ansible_service import AnsibleRunnerService
    ansible = AnsibleRunnerService()
    try:
        result = await ansible.generic_run(
            ip=node.ip, tag="edge_read_env",
            extravars={"edge_path": node.edge_path},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"节点 {node.ip} 连接失败: {str(e)}")

    if result.get("rc") != 0:
        raise HTTPException(status_code=502, detail=f"节点 {node.ip} 读取 edge.env 失败")

    content = result.get("shell_stdout") or result.get("stdout", "")
    if not content:
        return DetectPortsResponse(ports=[])

    try:
        parsed = yaml.safe_load(content)
    except yaml.YAMLError:
        raise HTTPException(status_code=422, detail="edge.env YAML 格式解析失败")

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail="edge.env 格式无效")

    deploy = parsed.get("deploy", {})
    stream_cfg = deploy.get("stream") or deploy.get("NOstream")

    if stream_cfg is None:
        return DetectPortsResponse(ports=[])

    if isinstance(stream_cfg, str) and stream_cfg.startswith("NO"):
        return DetectPortsResponse(ports=[])

    if not isinstance(stream_cfg, dict):
        return DetectPortsResponse(ports=[])

    edge_cfg = stream_cfg.get("edge", {})
    listen_addrs = edge_cfg.get("listen", [])
    if not isinstance(listen_addrs, list):
        return DetectPortsResponse(ports=[])

    detected_ports = set()
    for entry in listen_addrs:
        if isinstance(entry, dict):
            addr = entry.get("addr", "")
        elif isinstance(entry, str):
            addr = entry
        else:
            continue
        if ":" in addr:
            port_str = addr.rsplit(":", 1)[-1]
            try:
                detected_ports.add(int(port_str))
            except ValueError:
                continue

    # ── Query DB for occupied ports ──
    db_result = await db.execute(
        select(StreamProxy).where(StreamProxy.cluster_id == cluster_id)
    )
    existing_proxies = db_result.scalars().all()
    occupied_ports = {p.listen_port: p.name for p in existing_proxies}

    # ── Query Edge node for actual stream routes (ports used on node) ──
    edge_occupied = set()
    cluster = await db.get(Cluster, cluster_id)
    if cluster:
        try:
            client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)
            routes_result = client.api("stream_route", "list")
            routes = routes_result if isinstance(routes_result, list) else []
            for route in routes:
                node_val = route.get("value", route)
                sp = node_val.get("server_port")
                if sp:
                    edge_occupied.add(int(sp))
        except Exception:
            pass  # non-blocking: edge query failure should not block detection

    ports = []
    for port in sorted(detected_ports):
        if port in occupied_ports:
            ports.append(PortItem(port=port, status="in_use", used_by=occupied_ports[port], source="db"))
        elif port in edge_occupied:
            ports.append(PortItem(port=port, status="in_use", used_by="Edge 节点已有路由", source="edge"))
        else:
            ports.append(PortItem(port=port, status="available"))

    return DetectPortsResponse(ports=ports)


@router.get("/{cluster_id}/stream-proxies/{proxy_id}", response_model=StreamProxyResponse)
async def get_stream_proxy(
    cluster_id: int,
    proxy_id: int,
    db: AsyncSession = Depends(get_db),
):
    proxy = await edge_sync.get_or_404(db, StreamProxy, id=proxy_id, cluster_id=cluster_id, detail="四层代理不存在")
    return await _proxy_response_with_cluster_name(proxy, cluster_id, db)


@router.put("/{cluster_id}/stream-proxies/{proxy_id}", response_model=StreamProxyResponse)
async def update_stream_proxy(
    cluster_id: int,
    proxy_id: int,
    data: StreamProxyUpdate,
    db: AsyncSession = Depends(get_db),
):
    proxy = await edge_sync.get_or_404(db, StreamProxy, id=proxy_id, cluster_id=cluster_id, detail="四层代理不存在")

    update_data = data.model_dump(exclude_unset=True)
    if "targets" in update_data and update_data["targets"] is not None:
        update_data["targets"] = json.dumps(update_data["targets"])
    elif "targets" in update_data:
        update_data["targets"] = None
    for key in ("timeout", "keepalive_pool"):
        if key in update_data and update_data[key] is not None:
            update_data[key] = json.dumps(update_data[key])

    for key, value in update_data.items():
        setattr(proxy, key, value)

    await db.commit()
    await db.refresh(proxy)
    return await _proxy_response_with_cluster_name(proxy, cluster_id, db)


@router.delete("/{cluster_id}/stream-proxies/{proxy_id}")
async def delete_stream_proxy(
    cluster_id: int,
    proxy_id: int,
    body: DeleteClusterRequest,
    db: AsyncSession = Depends(get_db),
):
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    proxy = await edge_sync.get_or_404(db, StreamProxy, id=proxy_id, cluster_id=cluster_id, detail="四层代理不存在")
    results = []

    if body.delete_edge:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db, body.node_ids if body.node_ids else None)
        edge_results = await edge_sync.delete_on_nodes(
            cluster_id, active_nodes, proxy.edge_uuid,
            lambda client, uuid: client.api("stream_route", "delete", uuid),
        )
        results.extend(edge_results)

    if body.delete_db:
        await db.execute(
            ConfigVersion.__table__.delete().where(
                ConfigVersion.resource_type == "stream_proxy",
                ConfigVersion.resource_id == proxy_id,
            )
        )
        await db.delete(proxy)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    return {"message": "四层代理已删除", "results": results}


@router.post("/{cluster_id}/stream-proxies/{proxy_id}/publish")
async def publish_stream_proxy(
    cluster_id: int,
    proxy_id: int,
    req: Optional[PublishRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    proxy = await edge_sync.get_or_404(db, StreamProxy, id=proxy_id, cluster_id=cluster_id, detail="四层代理不存在")

    targets = json.loads(proxy.targets) if proxy.targets else []
    nodes_dict = {t["target"]: t.get("weight", 100) for t in targets}

    lb_map = {"weighted_roundrobin": "roundrobin"}
    lb_type = lb_map.get(proxy.load_balance, proxy.load_balance)

    upstream_data = {
        "nodes": nodes_dict,
        "type": lb_type,
    }
    if proxy.timeout:
        upstream_data["timeout"] = json.loads(proxy.timeout)
    if proxy.keepalive_pool:
        upstream_data["keepalive_pool"] = json.loads(proxy.keepalive_pool)

    edge_body = {
        "server_port": proxy.listen_port,
        "upstream": upstream_data,
    }
    if proxy.sni:
        edge_body["sni"] = proxy.sni
    if proxy.remote_addr:
        edge_body["remote_addr"] = proxy.remote_addr
    if proxy.name:
        edge_body["name"] = proxy.name

    config_data = StreamProxyResponse.model_validate(proxy).model_dump()
    new_version = await edge_sync.create_config_version(db, "stream_proxy", proxy_id, cluster_id, config_data, proxy)

    active_nodes = await edge_sync.get_active_nodes(cluster_id, db, req.node_ids if req else None)
    if not active_nodes:
        return {"status": "error", "message": f"四层代理 {proxy.name} 发布成功，但集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    results, success_count, fail_count = await edge_sync.publish_to_nodes(
        cluster_id, active_nodes, edge_body,
        publish_fn=lambda client: client.api("stream_route", "update", proxy.edge_uuid, edge_body),
    )

    return edge_sync.build_publish_response(results, success_count, fail_count, len(active_nodes), f"四层代理 {proxy.name} ", new_version)


@router.get("/{cluster_id}/stream-proxies/{proxy_id}/history", response_model=ConfigVersionListResponse)
async def get_stream_proxy_history(
    cluster_id: int,
    proxy_id: int,
    db: AsyncSession = Depends(get_db),
):
    await edge_sync.get_or_404(db, StreamProxy, id=proxy_id, cluster_id=cluster_id, detail="四层代理不存在")
    versions = (await db.execute(
        select(ConfigVersion)
        .where(ConfigVersion.resource_type == "stream_proxy", ConfigVersion.resource_id == proxy_id)
        .order_by(ConfigVersion.version.desc())
    )).scalars().all()

    proxy = await db.get(StreamProxy, proxy_id)
    return ConfigVersionListResponse(
        total=len(versions),
        items=[ConfigVersionResponse.model_validate(v) for v in versions],
        current_version=proxy.current_version if proxy else None,
    )


@router.post("/{cluster_id}/stream-proxies/{proxy_id}/rollback/{version}")
async def rollback_stream_proxy(
    cluster_id: int,
    proxy_id: int,
    version: int,
    db: AsyncSession = Depends(get_db),
):
    proxy = await edge_sync.get_or_404(db, StreamProxy, id=proxy_id, cluster_id=cluster_id, detail="四层代理不存在")
    config_version = await edge_sync.get_or_404(
        db, ConfigVersion,
        resource_type="stream_proxy", resource_id=proxy_id, version=version,
        detail="版本不存在",
    )

    config_data = json.loads(config_version.config)
    for key in ("name", "load_balance", "scheme", "remote_addr", "sni", "status"):
        if key in config_data:
            setattr(proxy, key, config_data[key])
    if "targets" in config_data:
        proxy.targets = json.dumps(config_data["targets"]) if isinstance(config_data["targets"], list) else config_data["targets"]
    if "timeout" in config_data:
        proxy.timeout = json.dumps(config_data["timeout"]) if isinstance(config_data["timeout"], dict) else config_data["timeout"]
    if "keepalive_pool" in config_data:
        proxy.keepalive_pool = json.dumps(config_data["keepalive_pool"]) if isinstance(config_data["keepalive_pool"], dict) else config_data["keepalive_pool"]
    proxy.current_version = version
    await db.commit()

    return {"status": "ok", "message": f"四层代理已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/stream-proxies/{proxy_id}/history/{history_id}")
async def delete_stream_proxy_history(
    cluster_id: int,
    proxy_id: int,
    history_id: int,
    db: AsyncSession = Depends(get_db),
):
    config_version = await edge_sync.get_or_404(
        db, ConfigVersion,
        id=history_id, resource_type="stream_proxy", resource_id=proxy_id,
        detail="历史版本不存在",
    )
    await db.delete(config_version)
    await db.commit()
    return {"status": "ok", "message": "历史版本已删除"}
