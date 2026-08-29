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
from app.schemas.cluster import (
    ConfigVersionListResponse, PublishRequest, DeleteClusterRequest,
    BatchDeleteStreamProxiesRequest,
)
from app.services import edge_sync
from app.services.edge_client import EdgeClient
from app.services.ansible_service import AnsibleRunnerService

from app.core.deps import require_permission, require_any_permission

router = APIRouter(prefix="/clusters", tags=["stream-proxies"], dependencies=[Depends(require_permission('clusters'))])

# Global stream proxy list endpoint (not cluster-scoped)
global_router = APIRouter(prefix="/stream-proxies", tags=["stream-proxies"], dependencies=[Depends(require_any_permission('stream_proxy', 'dns_proxy_udp'))])

# Module-level singleton (V1/V6): all callers share the same instance so the
# max_playbooks semaphore is a true process-wide limit.
_ansible_service = AnsibleRunnerService()


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


# ── Shared helpers for DNS UDP proxy module ──────────────────────────


async def _build_publish_map(db: AsyncSession, proxy_ids: list[int], resource_type: str = "stream_proxy") -> dict:
    """Build a map of proxy id → latest published timestamp."""
    if not proxy_ids:
        return {}
    pub_result = await db.execute(
        select(
            ConfigVersion.resource_id,
            func.max(ConfigVersion.created_at).label("latest_ts"),
        ).where(
            ConfigVersion.resource_type == resource_type,
            ConfigVersion.resource_id.in_(proxy_ids),
        ).group_by(ConfigVersion.resource_id)
    )
    return {r.resource_id: r.latest_ts for r in pub_result.all()}


async def _get_proxy_or_404(db: AsyncSession, proxy_id: int, cluster_id: int, detail: str = "四层代理不存在"):
    """Get a stream proxy or raise 404."""
    return await edge_sync.get_or_404(db, StreamProxy, id=proxy_id, cluster_id=cluster_id, detail=detail)


async def _delete_proxy_versions(db: AsyncSession, proxy_id: int, resource_type: str = "stream_proxy"):
    """Delete all config versions for a proxy."""
    await db.execute(
        ConfigVersion.__table__.delete().where(
            ConfigVersion.resource_type == resource_type,
            ConfigVersion.resource_id == proxy_id,
        )
    )


@router.get("/{cluster_id}/stream-proxies", response_model=dict)
async def list_stream_proxies(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
    search: Optional[str] = None,
):
    query = select(StreamProxy).where(
        StreamProxy.cluster_id == cluster_id,
        StreamProxy.proxy_type == "normal",
    )

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
    group_name: str = Query("__all__"),
    search: Optional[str] = None,
    proxy_type: Optional[str] = Query(None, pattern="^(normal|dns)$"),
    cluster_id: Optional[int] = Query(None),
):
    """List stream proxies across all clusters (global view)."""
    query = select(StreamProxy).order_by(StreamProxy.created_at.desc())

    if proxy_type:
        query = query.where(StreamProxy.proxy_type == proxy_type)
    if cluster_id is not None:
        query = query.where(StreamProxy.cluster_id == cluster_id)

    if group_name == "__ung__":
        query = query.join(Cluster, StreamProxy.cluster_id == Cluster.id).where(
            Cluster.group_name.is_(None) | (Cluster.group_name == "")
        )
    elif group_name != "__all__":
        query = query.join(Cluster, StreamProxy.cluster_id == Cluster.id).where(
            Cluster.group_name == group_name
        )

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

    # Build cluster_id → cluster_name/cluster_group_name map
    clusters_result = await db.execute(select(Cluster.id, Cluster.display_name, Cluster.name, Cluster.group_name))
    cluster_name_map: dict[int, str] = {}
    cluster_group_map: dict[int, str] = {}
    for row in clusters_result.all():
        cluster_name_map[row.id] = row.display_name or row.name or ""
        cluster_group_map[row.id] = row.group_name or ""

    # Build published_at map from ConfigVersion
    proxy_ids = [p.id for p in proxies]
    pub_result = await db.execute(
        select(ConfigVersion.resource_id, func.max(ConfigVersion.created_at).label("latest_ts"))
        .where(
            ConfigVersion.resource_type == "stream_proxy",
            ConfigVersion.resource_id.in_(proxy_ids) if proxy_ids else False,
        ).group_by(ConfigVersion.resource_id)
    )
    pub_map = {r.resource_id: r.latest_ts for r in pub_result.all()} if proxy_ids else {}

    items = []
    for p in proxies:
        resp = StreamProxyResponse.model_validate(p)
        ts = pub_map.get(p.id)
        resp.published_at = ts.isoformat() + "Z" if ts else None
        item = resp.model_dump()
        item["cluster_name"] = cluster_name_map.get(p.cluster_id, "")
        item["cluster_group_name"] = cluster_group_map.get(p.cluster_id, "")
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
    if proxy_data.get("checks"):
        proxy_data["checks"] = json.dumps(proxy_data["checks"])
    if proxy_data.get("dns_config"):
        proxy_data["dns_config"] = json.dumps(proxy_data["dns_config"])

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

    try:
        result = await _ansible_service.generic_run(
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

    # ── Query DB for occupied ports (exclude self if editing) ──
    db_query = select(StreamProxy).where(StreamProxy.cluster_id == cluster_id)
    if req.exclude_proxy_id:
        db_query = db_query.where(StreamProxy.id != req.exclude_proxy_id)
    db_result = await db.execute(db_query)
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

    if req.exclude_port:
        occupied_ports.pop(req.exclude_port, None)
        edge_occupied.discard(req.exclude_port)

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
    for key in ("checks", "dns_config"):
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
        await _delete_proxy_versions(db, proxy_id, "stream_proxy")
        await db.delete(proxy)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    return {"message": "四层代理已删除", "results": results}


async def _delete_stream_proxy_inner(
    proxy: StreamProxy,
    delete_db: bool,
    delete_edge: bool,
    node_ids: Optional[list[int]],
    db: AsyncSession,
) -> list[dict]:
    """执行单个四层代理的删除（Edge + 数据库），返回单删 results 列表。

    与单删端点 delete_stream_proxy 的删除语义一致：
    - delete_edge: 对各集群在线节点（node_ids 为空则全部在线节点）调用 Edge stream_route delete
    - delete_db: 删除版本历史与数据库记录
    """
    results: list[dict] = []

    if delete_edge:
        active_nodes = await edge_sync.get_active_nodes(
            proxy.cluster_id, db, node_ids if node_ids else None)
        edge_results = await edge_sync.delete_on_nodes(
            proxy.cluster_id, active_nodes, proxy.edge_uuid,
            lambda client, uuid: client.api("stream_route", "delete", uuid),
        )
        results.extend(edge_results)

    if delete_db:
        await _delete_proxy_versions(db, proxy.id, "stream_proxy")
        await db.delete(proxy)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    return results


@global_router.delete("", response_model=dict)
async def delete_stream_proxies_batch(
    body: BatchDeleteStreamProxiesRequest,
    db: AsyncSession = Depends(get_db),
):
    """批量删除四层代理（跨集群，全局视图）。

    - 覆盖 normal 与 dns 两类（V2 修订）：同属 ps_stream_proxy 表，按 id 精确删除，不按 proxy_type 过滤
    - 逐条独立处理（V5）：单条异常标记 failed，不抛 HTTPException 中断整体
    - node_ids 为空时删除各集群全部在线节点（V6）
    - 返回 results 含 name 字段（V4，对齐前端 nameField）
    """
    if not body.proxy_ids:
        raise HTTPException(status_code=400, detail="请至少选择一个四层代理")
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    proxy_result = await db.execute(
        select(StreamProxy).where(StreamProxy.id.in_(body.proxy_ids))
    )
    proxies = {p.id: p for p in proxy_result.scalars().all()}

    results: list[dict] = []
    for pid in body.proxy_ids:
        proxy = proxies.get(pid)
        if proxy is None:
            results.append({
                "proxy_id": pid, "name": None,
                "status": "failed",
                "message": "代理不存在",
            })
            continue
        try:
            proxy_results = await _delete_stream_proxy_inner(
                proxy, body.delete_db, body.delete_edge, body.node_ids, db)
            results.append({
                "proxy_id": pid, "name": proxy.name,
                "status": "success", "results": proxy_results,
            })
        except Exception as e:  # V5: 单条失败不阻塞其余
            await db.rollback()
            results.append({
                "proxy_id": pid, "name": proxy.name,
                "status": "failed", "message": str(e),
            })

    return {"message": "四层代理批量删除完成", "results": results}


def _edge_protocol(scheme: str | None) -> str | None:
    """Map internal scheme to Edge's top-level `protocol` enum value.

    Edge only accepts "TCP"/"UDP" for stream route protocol; TLS is expressed
    via upstream.scheme="tls", so it publishes as "TCP" at protocol level.
    """
    if not scheme:
        return None
    if scheme == "udp":
        return "UDP"
    return "TCP"


@router.post("/{cluster_id}/stream-proxies/{proxy_id}/publish")
async def publish_stream_proxy(
    cluster_id: int,
    proxy_id: int,
    req: Optional[PublishRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    proxy = await edge_sync.get_or_404(db, StreamProxy, id=proxy_id, cluster_id=cluster_id, detail="四层代理不存在")

    _protocol = _edge_protocol(proxy.scheme)

    targets = json.loads(proxy.targets) if proxy.targets else []
    nodes_dict = {t["target"]: t.get("weight", 100) for t in targets}

    lb_map = {"weighted_roundrobin": "roundrobin"}
    lb_type = lb_map.get(proxy.load_balance, proxy.load_balance)

    upstream_data: dict = {
        "nodes": nodes_dict,
        "type": lb_type,
        "scheme": proxy.scheme or "tcp",
    }
    if proxy.hash_on and proxy.key:
        upstream_data["hash_on"] = proxy.hash_on
        upstream_data["key"] = proxy.key
    if proxy.retries is not None:
        upstream_data["retries"] = proxy.retries
    if proxy.retry_timeout is not None:
        upstream_data["retry_timeout"] = proxy.retry_timeout
    if proxy.checks:
        upstream_data["checks"] = json.loads(proxy.checks)

    edge_body: dict = {
        "server_port": proxy.listen_port,
        "upstream": upstream_data,
    }
    if _protocol:
        edge_body["protocol"] = _protocol
    if proxy.sni:
        edge_body["sni"] = proxy.sni
    if proxy.remote_addr:
        edge_body["remote_addr"] = proxy.remote_addr
    if proxy.name:
        edge_body["name"] = proxy.name

    config_data = StreamProxyResponse.model_validate(proxy).model_dump()

    return await edge_sync.publish_resource(
        db, cluster_id=cluster_id, resource=proxy, resource_type="stream_proxy",
        config_data=config_data, edge_data=edge_body,
        publish_fn=lambda client: client.api("stream_route", "update", proxy.edge_uuid, edge_body),
        display_name=f"四层代理 {proxy.name} ",
        log_path=f"/stream/edge/admin/routes/{proxy.edge_uuid}",
        log_resource_id=proxy_id, log_resource_name=proxy.name,
        node_ids=req.node_ids if req else None,
        prefer_display_name=True,
        log_status=None,
        log_error_as_str=True,
        no_nodes_message=f"四层代理 {proxy.name} 发布成功，但集群中没有活跃的 edge 节点",
    )


@router.get("/{cluster_id}/stream-proxies/{proxy_id}/history", response_model=ConfigVersionListResponse)
async def get_stream_proxy_history(
    cluster_id: int,
    proxy_id: int,
    db: AsyncSession = Depends(get_db),
):
    await edge_sync.get_or_404(db, StreamProxy, id=proxy_id, cluster_id=cluster_id, detail="四层代理不存在")
    proxy = await db.get(StreamProxy, proxy_id)
    return await edge_sync.list_config_versions(
        db, resource_type="stream_proxy", resource_id=proxy_id,
        current_version=proxy.current_version if proxy else None,
    )


@router.post("/{cluster_id}/stream-proxies/{proxy_id}/rollback/{version}")
async def rollback_stream_proxy(
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
        not_found_detail="四层代理不存在", cluster_id=cluster_id, restore_fn=_restore)
    return {"status": "ok", "message": f"四层代理已切换到版本 v{version}", "version": version}


@router.delete("/{cluster_id}/stream-proxies/{proxy_id}/history/{history_id}")
async def delete_stream_proxy_history(
    cluster_id: int,
    proxy_id: int,
    history_id: int,
    db: AsyncSession = Depends(get_db),
):
    await edge_sync.delete_config_version(db, resource_type="stream_proxy", resource_id=proxy_id, history_id=history_id)
    return {"status": "ok", "message": "历史版本已删除"}
