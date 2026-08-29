"""DNS UDP proxy management API endpoints.

Separated from TCP stream proxies (cluster_stream_proxies.py) to allow
independent feature gating via dns_proxy_udf in features.yaml.
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_db
from app.config import MAX_PAGE_SIZE
from app.models.cluster import Cluster, StreamProxy, ConfigVersion, Node
from app.schemas.stream_proxy import (
    StreamProxyCreate, StreamProxyUpdate, StreamProxyResponse,
    DetectPortsRequest, DetectPortsResponse,
)
from app.schemas.cluster import ConfigVersionListResponse, PublishRequest, DeleteClusterRequest
from app.services import edge_sync
from app.services.dns_wan import build_dns_plugins
from app.services.edge_client import EdgeClient
from app.api.v1.cluster_stream_proxies import (
    _proxy_response_with_cluster_name,
    _build_publish_map,
    _get_proxy_or_404,
    _delete_proxy_versions,
    _edge_protocol,
    ALLOWED_SEARCH_FIELDS,
    ALLOWED_SORT_FIELDS,
)

from app.core.deps import require_permission

router = APIRouter(prefix="/clusters", tags=["dns-proxies"], dependencies=[Depends(require_permission('clusters'))])

ALLOWED_SEARCH_FIELDS_DNS = ALLOWED_SEARCH_FIELDS


@router.get("/{cluster_id}/dns-proxies", response_model=dict)
async def list_dns_proxies(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    search: Optional[str] = None,
):
    query = select(StreamProxy).where(
        StreamProxy.cluster_id == cluster_id,
        StreamProxy.proxy_type == "dns",
    )

    if search:
        pattern = f"%{search}%"
        conditions = [
            getattr(StreamProxy, field).ilike(pattern)
            for field in ALLOWED_SEARCH_FIELDS_DNS
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
    pub_map = await _build_publish_map(db, proxy_ids, "stream_proxy")

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


@router.post("/{cluster_id}/dns-proxies", response_model=StreamProxyResponse, status_code=status.HTTP_201_CREATED)
async def create_dns_proxy(
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
    if proxy_data.get("checks"):
        proxy_data["checks"] = json.dumps(proxy_data["checks"])
    if proxy_data.get("dns_config"):
        proxy_data["dns_config"] = json.dumps(proxy_data["dns_config"])
    proxy_data["proxy_type"] = "dns"
    proxy_data["scheme"] = "udp"  # DNS 代理固定 UDP 协议，忽略客户端传入的 scheme

    proxy = StreamProxy(cluster_id=cluster_id, **proxy_data)
    db.add(proxy)
    await db.commit()
    await db.refresh(proxy)
    return await _proxy_response_with_cluster_name(proxy, cluster_id, db)


@router.get("/{cluster_id}/dns-proxies/{proxy_id}", response_model=StreamProxyResponse)
async def get_dns_proxy(
    cluster_id: int,
    proxy_id: int,
    db: AsyncSession = Depends(get_db),
):
    proxy = await _get_proxy_or_404(db, proxy_id, cluster_id, "DNS 代理不存在")
    return await _proxy_response_with_cluster_name(proxy, cluster_id, db)


@router.put("/{cluster_id}/dns-proxies/{proxy_id}", response_model=StreamProxyResponse)
async def update_dns_proxy(
    cluster_id: int,
    proxy_id: int,
    data: StreamProxyUpdate,
    db: AsyncSession = Depends(get_db),
):
    proxy = await _get_proxy_or_404(db, proxy_id, cluster_id, "DNS 代理不存在")

    update_data = data.model_dump(exclude_unset=True)
    if "targets" in update_data and update_data["targets"] is not None:
        update_data["targets"] = json.dumps(update_data["targets"])
    elif "targets" in update_data:
        update_data["targets"] = None
    for key in ("checks", "dns_config"):
        if key in update_data and update_data[key] is not None:
            update_data[key] = json.dumps(update_data[key])

    for key, value in update_data.items():
        setattr(proxy, key, value)

    proxy.scheme = "udp"  # DNS 代理固定 UDP 协议，忽略客户端传入的 scheme

    await db.commit()
    await db.refresh(proxy)
    return await _proxy_response_with_cluster_name(proxy, cluster_id, db)


@router.delete("/{cluster_id}/dns-proxies/{proxy_id}")
async def delete_dns_proxy(
    cluster_id: int,
    proxy_id: int,
    body: DeleteClusterRequest,
    db: AsyncSession = Depends(get_db),
):
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    proxy = await _get_proxy_or_404(db, proxy_id, cluster_id, "DNS 代理不存在")
    results = []

    if body.delete_edge:
        active_nodes = await edge_sync.get_active_nodes(cluster_id, db, body.node_ids if body.node_ids else None)
        edge_results = await edge_sync.delete_on_nodes(
            cluster_id, active_nodes, proxy.edge_uuid,
            lambda client, uuid: client.api("stream_route", "delete", uuid),
        )
        results.extend(edge_results)

    if body.delete_db:
        await _delete_proxy_versions(db, proxy_id, "stream_proxy")
        await db.delete(proxy)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    return {"message": "DNS 代理已删除", "results": results}


@router.post("/{cluster_id}/dns-proxies/{proxy_id}/publish")
async def publish_dns_proxy(
    cluster_id: int,
    proxy_id: int,
    req: Optional[PublishRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    proxy = await _get_proxy_or_404(db, proxy_id, cluster_id, "DNS 代理不存在")

    protocol = _edge_protocol(proxy.scheme)

    edge_body: dict = {
        "server_port": proxy.listen_port,
        "name": proxy.name or "",
    }
    if protocol:
        edge_body["protocol"] = protocol

    dns_cfg = json.loads(proxy.dns_config) if proxy.dns_config else {}
    dns_checks = json.loads(proxy.checks) if proxy.checks else {}
    try:
        plugins = build_dns_plugins(dns_cfg, dns_checks)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    edge_body["plugins"] = plugins

    config_data = StreamProxyResponse.model_validate(proxy).model_dump()

    return await edge_sync.publish_resource(
        db, cluster_id=cluster_id, resource=proxy, resource_type="stream_proxy",
        config_data=config_data, edge_data=edge_body,
        publish_fn=lambda client: client.api("stream_route", "update", proxy.edge_uuid, edge_body),
        display_name=f"DNS 代理 {proxy.name} ",
        log_path=f"/stream/edge/admin/routes/{proxy.edge_uuid}",
        log_resource_id=proxy_id, log_resource_name=proxy.name,
        node_ids=req.node_ids if req else None,
        prefer_display_name=True,
        log_status=None,
        log_error_as_str=True,
        no_nodes_message=f"DNS 代理 {proxy.name} 发布成功，但集群中没有活跃的 edge 节点",
    )


@router.get("/{cluster_id}/dns-proxies/{proxy_id}/history", response_model=ConfigVersionListResponse)
async def get_dns_proxy_history(
    cluster_id: int,
    proxy_id: int,
    db: AsyncSession = Depends(get_db),
):
    await _get_proxy_or_404(db, proxy_id, cluster_id, "DNS 代理不存在")
    proxy = await db.get(StreamProxy, proxy_id)
    return await edge_sync.list_config_versions(
        db, resource_type="stream_proxy", resource_id=proxy_id,
        current_version=proxy.current_version if proxy else None,
    )


@router.post("/{cluster_id}/dns-proxies/{proxy_id}/rollback/{version}")
async def rollback_dns_proxy(
    cluster_id: int,
    proxy_id: int,
    version: int,
    db: AsyncSession = Depends(get_db),
):
    async def _restore(_db, proxy, cfg):
        for key in ("name", "load_balance", "scheme", "remote_addr", "sni", "status"):
            if key in cfg:
                setattr(proxy, key, cfg[key])
        if "targets" in cfg:
            proxy.targets = json.dumps(cfg["targets"]) if isinstance(cfg["targets"], list) else cfg["targets"]
        if "timeout" in cfg:
            proxy.timeout = json.dumps(cfg["timeout"]) if isinstance(cfg["timeout"], dict) else cfg["timeout"]
        if "keepalive_pool" in cfg:
            proxy.keepalive_pool = json.dumps(cfg["keepalive_pool"]) if isinstance(cfg["keepalive_pool"], dict) else cfg["keepalive_pool"]

    await edge_sync.rollback_resource(
        db, StreamProxy, resource_type="stream_proxy", resource_id=proxy_id, version=version,
        not_found_detail="DNS 代理不存在", cluster_id=cluster_id,
        loader=lambda _db: _get_proxy_or_404(_db, proxy_id, cluster_id, "DNS 代理不存在"),
        restore_fn=_restore)
    return {"status": "ok", "message": f"DNS 代理已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/dns-proxies/{proxy_id}/history/{history_id}")
async def delete_dns_proxy_history(
    cluster_id: int,
    proxy_id: int,
    history_id: int,
    db: AsyncSession = Depends(get_db),
):
    await edge_sync.delete_config_version(db, resource_type="stream_proxy", resource_id=proxy_id, history_id=history_id)
    return {"status": "ok", "message": "历史版本已删除"}
