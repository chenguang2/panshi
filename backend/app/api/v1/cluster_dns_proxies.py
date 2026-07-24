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
from app.schemas.cluster import ConfigVersionResponse, ConfigVersionListResponse, PublishRequest, DeleteClusterRequest
from app.services import edge_sync
from app.services.edge_client import EdgeClient
from app.services.edge_logger import get_edge_logger
from app.api.v1.cluster_stream_proxies import (
    _proxy_response_with_cluster_name,
    _build_publish_map,
    _get_proxy_or_404,
    _delete_proxy_versions,
    ALLOWED_SEARCH_FIELDS,
    ALLOWED_SORT_FIELDS,
)

router = APIRouter(prefix="/clusters", tags=["dns-proxies"])

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

    protocol = proxy.scheme.upper() if proxy.scheme else None

    edge_body: dict = {
        "server_port": proxy.listen_port,
        "name": proxy.name or "",
    }
    if protocol:
        edge_body["protocol"] = protocol

    dns_cfg = json.loads(proxy.dns_config) if proxy.dns_config else {}
    hosts = dns_cfg.get("hosts", {})
    dns_checks = json.loads(proxy.checks) if proxy.checks else {}
    if dns_checks and any(k for k in dns_checks if k in ('active', 'passive')):
        for domain_name in hosts:
            if 'checks' not in hosts[domain_name]:
                hosts[domain_name]['checks'] = dns_checks
    plugins: dict = {
        "dns_upstream": {
            "disable": False,
            "hosts": hosts,
        }
    }
    log_process = dns_cfg.get("log_process")
    if log_process:
        plugins["log_process"] = log_process
    edge_body["plugins"] = plugins

    config_data = StreamProxyResponse.model_validate(proxy).model_dump()
    new_version = await edge_sync.create_config_version(db, "stream_proxy", proxy_id, cluster_id, config_data, proxy)

    active_nodes = await edge_sync.get_active_nodes(cluster_id, db, req.node_ids if req else None)
    if not active_nodes:
        return {"status": "error", "message": f"DNS 代理 {proxy.name} 发布成功，但集群中没有活跃的 edge 节点", "version": new_version, "results": []}

    cluster = await db.get(Cluster, cluster_id)
    edge_logger = get_edge_logger()

    results, success_count, fail_count = await edge_sync.publish_to_nodes(
        cluster_id, active_nodes, edge_body,
        publish_fn=lambda client: client.api("stream_route", "update", proxy.edge_uuid, edge_body),
        log_fn=lambda node_result, response, error, encrypted: edge_logger.log_publish_result(
            resource_type="stream_proxy",
            cluster_id=cluster_id,
            cluster_name=cluster.display_name or cluster.name or str(cluster_id) if cluster else str(cluster_id),
            resource_id=proxy_id,
            resource_name=proxy.name,
            method="PUT",
            path=f"/stream/edge/admin/routes/{proxy.edge_uuid}",
            request_body=edge_body,
            encrypted_body=encrypted,
            response_body=response if error is None else None,
            error=str(error) if error else None,
        ),
    )

    return edge_sync.build_publish_response(results, success_count, fail_count, len(active_nodes), f"DNS 代理 {proxy.name} ", new_version)


@router.get("/{cluster_id}/dns-proxies/{proxy_id}/history", response_model=ConfigVersionListResponse)
async def get_dns_proxy_history(
    cluster_id: int,
    proxy_id: int,
    db: AsyncSession = Depends(get_db),
):
    await _get_proxy_or_404(db, proxy_id, cluster_id, "DNS 代理不存在")
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


@router.post("/{cluster_id}/dns-proxies/{proxy_id}/rollback/{version}")
async def rollback_dns_proxy(
    cluster_id: int,
    proxy_id: int,
    version: int,
    db: AsyncSession = Depends(get_db),
):
    proxy = await _get_proxy_or_404(db, proxy_id, cluster_id, "DNS 代理不存在")
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

    return {"status": "ok", "message": f"DNS 代理已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/dns-proxies/{proxy_id}/history/{history_id}")
async def delete_dns_proxy_history(
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
