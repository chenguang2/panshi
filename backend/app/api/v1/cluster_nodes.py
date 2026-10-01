import asyncio
import json
from datetime import datetime, timezone
from typing import Optional, Any
from enum import Enum

from fastapi import APIRouter, Body, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_db
from app.models.cluster import Cluster, Upstream, UpstreamTarget, Route, RoutePlugin, Node, ConfigVersion, PluginConfig, GlobalRule, PluginMetadata, StreamProxy
from app.models.ssl import SslCertificate
from app.models.user import User
from app.schemas.cluster import (
    NodeCreate, NodeUpdate, NodeResponse,
    DeleteClusterRequest, BatchCreateNodesRequest, BatchDeleteNodesRequest,
)
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services.audit import enrich_audit
from app.services.config_diff import EquivalenceRules
from app.services import config_diff
from app.services import edge_sync
from app.services import relay_registry
from app.services.ansible_service import (
    AnsibleRunnerService,
    AnsibleExecutionError,
    ALLOWED_TAGS,
    NGINX_CMD_MAP,
    ip_sort_key,
)
from app.core.deps import require_permission

router = APIRouter(prefix="/clusters", tags=["clusters"], dependencies=[Depends(require_permission('clusters'))])

NODE_ALLOWED_SORT_FIELDS = {"name", "ip", "service_port", "management_port", "status", "created_at"}
NODE_ALLOWED_SEARCH_FIELDS = {"name", "ip"}


# ── request / response schemas ────────────────────────────────


class NginxAction(str, Enum):
    start = "start"
    stop = "stop"
    restart = "restart"
    check = "check"


class BatchAction(str, Enum):
    start = "start"
    stop = "stop"
    restart = "restart"
    reload = "reload"
    check = "check"
    statistic = "statistic"


class NodeActionRequest(BaseModel):
    action: BatchAction
    node_ids: list[int] = []


class AnsibleRunRequest(BaseModel):
    tag: str
    extravars: dict[str, Any] = {}


# ── shared helpers ───────────────────────────────────────────

_ansible_service = AnsibleRunnerService()


async def _update_status_detail(db: AsyncSession, node: Node, detail: dict[str, Any]) -> None:
    # Preserve nginx status from previous detail if new detail doesn't have it.
    # nginx info comes from nginx_cmd_run tag; other tags (edge_statistic, etc.)
    # should not overwrite it.
    if "nginx" not in detail and node.status_detail:
        try:
            old = json.loads(node.status_detail) if isinstance(node.status_detail, str) else node.status_detail
            if isinstance(old, dict) and "nginx" in old:
                detail["nginx"] = old["nginx"]
        except (json.JSONDecodeError, TypeError):
            pass
    node.status_detail = json.dumps(detail, ensure_ascii=False)
    await db.commit()


async def _run_and_update(
    db: AsyncSession,
    node: Node,
    tag: str,
    extravars: dict[str, Any],
) -> dict[str, Any]:
    """Execute ansible playbook and persist result to node.status_detail,
    and sync node.status on success."""
    try:
        result = await _ansible_service.run_playbook(
            ip=node.ip, tag=tag, extravars=extravars,
        )
        detail = _ansible_service.build_status_detail(tag, result)

        # Sync node.status based on operation result
        if tag == "nginx_cmd_run":
            nginx_cmd = extravars.get("nginx_cmd", "")
            if nginx_cmd in ("nginx_stop",):
                node.status = 0
            elif nginx_cmd in ("nginx_start", "nginx_reload"):
                node.status = 1
            # nginx_check: config syntax test, does not reflect process status → skip
        elif tag == "edge_statistic":
            nginx_info = detail.get("nginx", {})
            nginx_running = nginx_info.get("nginx_running")
            if nginx_running is True:
                node.status = 1
            elif nginx_running is False:
                node.status = 0
            # nginx_running is None (no nginx info) → skip

        await _update_status_detail(db, node, detail)
        return result
    except AnsibleExecutionError as e:
        detail = {
            "last_execution": datetime.now(timezone.utc).isoformat(),
            "last_status": "failed",
            "last_rc": e.rc,
            "last_tag": tag,
            "last_error": str(e),
        }
        await _update_status_detail(db, node, detail)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT if e.rc == -1
            else status.HTTP_502_BAD_GATEWAY,
            detail=f"操作失败: {e}",
        )


def _nginx_extravars(node: Node, ports: str = "") -> dict[str, Any]:
    return {
        "prefix": node.edge_path,
        "ports": ports or str(node.management_port),
    }


# 单节点 nginx 动作 → 用户文案（check 响应不含 message/stderr/command，见 check_node）
_NGINX_ACTION_MESSAGES = {
    "nginx_start": "节点已启动",
    "nginx_stop": "节点已停止",
    "nginx_reload": "节点已重启",
}


async def _run_nginx_cmd(db: AsyncSession, node: Node, nginx_cmd: str) -> dict[str, Any]:
    """执行 nginx 动作并返回标准响应（status/message/rc/stdout/stderr/command）。"""
    result = await _run_and_update(
        db, node, "nginx_cmd_run",
        _nginx_extravars(node) | {"nginx_cmd": nginx_cmd},
    )
    return {
        "status": "ok",
        "message": _NGINX_ACTION_MESSAGES[nginx_cmd],
        "rc": result.get("rc"),
        "stdout": result.get("stdout", ""),
        "stderr": result.get("stderr", ""),
        "command": result.get("command", ""),
    }


@router.get("/{cluster_id}/nodes", response_model=dict)
async def list_nodes(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
    search: Optional[str] = None,
    search_field: Optional[str] = None
):
    await edge_sync.get_or_404(db, Cluster, id=cluster_id, detail="集群不存在")

    query = select(Node).where(Node.cluster_id == cluster_id)

    if search:
        search_pattern = f"%{search}%"
        if search_field and search_field in NODE_ALLOWED_SEARCH_FIELDS:
            search_col = getattr(Node, search_field)
            query = query.where(search_col.ilike(search_pattern))
        else:
            conditions = [
                getattr(Node, field).ilike(search_pattern)
                for field in NODE_ALLOWED_SEARCH_FIELDS
                if hasattr(Node, field)
            ]
            query = query.where(or_(*conditions))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    if sort_by and sort_by in NODE_ALLOWED_SORT_FIELDS:
        # 用户主动排序：SQL 排序 + 分页
        sort_column = getattr(Node, sort_by)
        if sort_order == "desc":
            sort_column = sort_column.desc()
        query = query.order_by(sort_column)
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)
        result = await db.execute(query)
        nodes = result.scalars().all()
    else:
        # 默认按 IP 数值升序（Python 层，跨 DB 一致，避免字符串排序 114 在 42 前）
        result = await db.execute(query)
        nodes = list(result.scalars().all())
        nodes.sort(key=lambda n: ip_sort_key(n.ip))
        nodes = nodes[(page - 1) * page_size : page * page_size]
    return {"total": total, "page": page, "page_size": page_size, "items": [NodeResponse.model_validate(n) for n in nodes]}


@router.post("/{cluster_id}/nodes", response_model=NodeResponse, status_code=status.HTTP_201_CREATED)
async def create_node(cluster_id: int, node: NodeCreate, db: AsyncSession = Depends(get_db), request: Request = None):
    await edge_sync.get_or_404(db, Cluster, id=cluster_id, detail="集群不存在")

    db_node = Node(cluster_id=cluster_id, **node.model_dump(exclude={"cluster_id"}))
    db.add(db_node)
    await db.flush()  # 审计增强前先拿 id
    audit = getattr(request.state, "audit", None)
    if audit is not None:
        audit.resource_id = db_node.id
        audit.detail = f"创建节点 {db_node.ip}:{db_node.service_port}"
    await db.commit()
    await db.refresh(db_node)
    # 节点归属决定中继路由（node_region 派生自 ps_node），写后强制重载
    await relay_registry.refresh_routing()
    return NodeResponse.model_validate(db_node)


@router.post("/{cluster_id}/nodes/batch")
async def create_nodes_batch(cluster_id: int, body: BatchCreateNodesRequest = Body(...), db: AsyncSession = Depends(get_db)):
    """批量创建同一集群内的多个节点。

    每条节点独立处理：单条失败（同 IP+edge_path+service_port 组合重复 /
    数据错误 / 其他异常）不阻塞其余节点。同 IP 不同 edge_path 或 service_port 合法。
    """

    if not body.nodes:
        raise HTTPException(status_code=400, detail="nodes 不能为空")

    await edge_sync.get_or_404(db, Cluster, id=cluster_id, detail="集群不存在")

    results = []
    success_count = 0
    fail_count = 0
    for node in body.nodes:
        node_result: dict = {
            "ip": node.ip,
            "status": "failed",
        }
        try:
            existing = await db.execute(select(Node).where(
                Node.cluster_id == cluster_id,
                Node.ip == node.ip,
                Node.edge_path == node.edge_path,
                Node.service_port == node.service_port,
            ))
            if existing.scalars().first() is not None:
                node_result["error"] = "该集群已存在相同 IP、Edge 路径与服务端口的节点"
                results.append(node_result)
                fail_count += 1
                continue

            db_node = Node(cluster_id=cluster_id, **node.model_dump(exclude={"cluster_id"}))
            db.add(db_node)
            await db.commit()
            node_result["status"] = "success"
            success_count += 1
        except Exception as e:  # noqa: BLE001 - 单条失败不阻塞其余
            await db.rollback()
            node_result["error"] = str(e)
            fail_count += 1
        results.append(node_result)

    if success_count:
        await relay_registry.refresh_routing()
    return {"message": f"成功创建 {success_count} 条，失败 {fail_count} 条", "results": results}


@router.put("/{cluster_id}/nodes/{node_id}", response_model=NodeResponse)
async def update_node(cluster_id: int, node_id: int, node_update: NodeUpdate, db: AsyncSession = Depends(get_db), request: Request = None):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")

    for key, value in node_update.model_dump(exclude_unset=True).items():
        setattr(node, key, value)

    audit = getattr(request.state, "audit", None)
    if audit is not None:
        audit.detail = f"更新节点 {node.ip}:{node.service_port}"

    await db.commit()
    await db.refresh(node)
    await relay_registry.refresh_routing()
    return NodeResponse.model_validate(node)


@router.delete("/{cluster_id}/nodes/{node_id}")
async def delete_node(cluster_id: int, node_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db), request: Request = None):
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")

    audit = getattr(request.state, "audit", None)
    if audit is not None:
        audit.detail = f"删除节点 {node.ip}:{node.service_port}"

    results = []

    if body.delete_db:
        await db.delete(node)
        await db.commit()
        await relay_registry.refresh_routing()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        # 节点本身是 Edge 运行时，没有对应的 Edge API 删除操作
        results.append({"scope": "edge", "status": "skipped", "message": "节点是 Edge 运行时，无对应的 Edge API 删除操作"})

    return {"message": "节点已删除", "results": results}


@router.delete("/{cluster_id}/nodes")
async def delete_nodes_batch(cluster_id: int, body: BatchDeleteNodesRequest = Body(...), db: AsyncSession = Depends(get_db), request: Request = None):
    """批量删除同一集群内的多个节点。

    每条节点独立处理：单条失败（节点不存在 / 数据错误 / 其他异常）不阻塞其余节点。
    Edge 阶段固定 skipped——节点是 Edge 运行时，无对应的 Edge API 删除操作。
    """

    if not body.node_ids:
        raise HTTPException(status_code=400, detail="node_ids 不能为空")

    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    results = []
    for node_id in body.node_ids:
        node_result: dict = {
            "node_id": node_id,
            "node_ip": "",
            "status": "failed",
            "results": [],
        }
        try:
            node = await edge_sync.get_or_404(db, Node, id=node_id, cluster_id=cluster_id, detail="节点不存在")
            node_result["node_ip"] = node.ip

            if body.delete_db:
                await db.delete(node)
                await db.commit()
                node_result["results"].append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

            if body.delete_edge:
                node_result["results"].append({
                    "scope": "edge", "status": "skipped",
                    "message": "节点是 Edge 运行时，无对应的 Edge API 删除操作",
                })

            node_result["status"] = "success"
        except HTTPException as e:
            node_result["error"] = str(e.detail)
        except Exception as e:  # noqa: BLE001 - 单条失败不阻塞其余
            await db.rollback()
            node_result["error"] = str(e)
        results.append(node_result)

    names = [str(r.get("node_ip") or "") for r in results if r.get("node_ip")]
    summary = "、".join(n for n in names[:5] if n) + ("…" if len(names) > 5 else "")
    enrich_audit(request, detail=f"批量删除节点 {len(names)} 个：{summary}")
    await db.commit()
    if names:
        await relay_registry.refresh_routing()
    return {"message": f"批量删除完成: {len(results)} 条节点", "results": results}


@router.post("/{cluster_id}/nodes/{node_id}/start")
async def start_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    node = await edge_sync.verify_node(db, cluster_id, node_id)
    return await _run_nginx_cmd(db, node, "nginx_start")


@router.post("/{cluster_id}/nodes/{node_id}/stop")
async def stop_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    node = await edge_sync.verify_node(db, cluster_id, node_id)
    return await _run_nginx_cmd(db, node, "nginx_stop")


@router.post("/{cluster_id}/nodes/{node_id}/reload")
async def reload_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    node = await edge_sync.verify_node(db, cluster_id, node_id)
    return await _run_nginx_cmd(db, node, "nginx_reload")


@router.post("/{cluster_id}/nodes/{node_id}/check")
async def check_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    node = await edge_sync.verify_node(db, cluster_id, node_id)
    result = await _run_and_update(
        db, node, "nginx_cmd_run",
        _nginx_extravars(node) | {"nginx_cmd": "nginx_check"},
    )
    return {
        "status": "ok",
        "rc": result.get("rc"),
        "stdout": result.get("stdout", ""),
    }


@router.post("/{cluster_id}/nodes/{node_id}/statistic")
async def statistic_node(
    cluster_id: int, node_id: int,
    ports: str = "",
    db: AsyncSession = Depends(get_db),
):
    node = await edge_sync.verify_node(db, cluster_id, node_id)
    if not ports:
        ports = str(node.management_port)
    result = await _run_and_update(
        db, node, "edge_statistic",
        {"prefix": node.edge_path, "ports": ports},
    )
    detail = _ansible_service.build_status_detail("edge_statistic", result)
    return {
        "status": "ok",
        "rc": result.get("rc"),
        "statistic": detail.get("statistic", {}),
        "stdout": result.get("stdout", ""),
        "stderr": result.get("stderr", ""),
        "command": result.get("command", ""),
    }


@router.get("/{cluster_id}/nodes/{node_id}/status")
async def get_node_status(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    node = await edge_sync.verify_node(db, cluster_id, node_id)
    detail: dict[str, Any] = {}
    if node.status_detail:
        try:
            detail = json.loads(node.status_detail)
        except (json.JSONDecodeError, TypeError):
            pass
    return {
        "status": "ok",
        "node_status": node.status,
        "status_detail": detail,
        "last_heartbeat": detail.get("last_execution"),
    }


@router.post("/{cluster_id}/nodes/{node_id}/ansible-run")
async def ansible_run(
    cluster_id: int, node_id: int,
    body: AnsibleRunRequest,
    db: AsyncSession = Depends(get_db),
):
    node = await edge_sync.verify_node(db, cluster_id, node_id)
    if body.tag not in ALLOWED_TAGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不允许的操作: {body.tag}",
        )
    result = await _run_and_update(db, node, body.tag, body.extravars)
    return {
        "status": "ok",
        "tag": body.tag,
        "rc": result.get("rc"),
        "stdout": result.get("stdout", ""),
    }


@router.post("/{cluster_id}/nodes/action")
async def batch_node_action(
    cluster_id: int,
    body: NodeActionRequest,
    db: AsyncSession = Depends(get_db),
):
    if not body.node_ids:
        raise HTTPException(status_code=400, detail="node_ids 不能为空")

    # resolve nodes
    query = select(Node).where(Node.cluster_id == cluster_id, Node.id.in_(body.node_ids))
    result = await db.execute(query)
    nodes = result.scalars().all()

    if not nodes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到节点")

    # build per-node results
    results: list[dict[str, Any]] = []
    for node in nodes:
        try:
            if body.action == BatchAction.statistic:
                r = await _run_and_update(
                    db, node, "edge_statistic",
                    {"prefix": node.edge_path, "ports": str(node.management_port)},
                )
                detail = _ansible_service.build_status_detail("edge_statistic", r)
            else:
                r = await _run_and_update(
                    db, node, "nginx_cmd_run",
                    _nginx_extravars(node) | {"nginx_cmd": NGINX_CMD_MAP[body.action.value]},
                )
                detail = None
            entry: dict[str, Any] = {
                "node_id": node.id, "ip": node.ip,
                "status": "success", "rc": r.get("rc"),
                "stdout": r.get("stdout", ""),
                "stderr": r.get("stderr", ""),
                "command": r.get("command", ""),
            }
            if body.action == BatchAction.statistic:
                entry["statistic"] = detail.get("statistic", {})
            results.append(entry)
        except HTTPException as e:
            results.append({
                "node_id": node.id, "ip": node.ip,
                "status": "error", "detail": e.detail,
            })

    return {"action": body.action.value, "results": results}


@router.get("/{cluster_id}/nodes/{node_id}/diff")
async def diff_cluster_config(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    """对比数据库中某集群的配置与指定 Edge 节点上的运行配置"""
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")

    client = EdgeClient(cluster_id, node_ip=node.ip, node_port=node.management_port)
    # 节点执行路径：按该 client 实例判定，在发起 Edge 请求前调用 → 失败也带。
    route_info: dict[str, Any] = {}
    edge_sync.mark_route(route_info, client)

    # ---------- 1. 从 DB 查询 ----------
    async def _get_all(model, **filters):
        q = select(model).filter_by(**filters)
        r = await db.execute(q)
        return r.scalars().all()

    db_upstreams = await _get_all(Upstream, cluster_id=cluster_id)
    db_routes = await _get_all(Route, cluster_id=cluster_id)
    db_plugin_configs = await _get_all(PluginConfig, cluster_id=cluster_id)
    db_global_rules = await _get_all(GlobalRule, cluster_id=cluster_id)
    db_plugin_metadatas = await _get_all(PluginMetadata, cluster_id=cluster_id)

    db_stream_proxies = await _get_all(StreamProxy, cluster_id=cluster_id)
    db_ssl_certificates = await _get_all(SslCertificate, cluster_id=cluster_id)

    # 查询路由级插件，按 route_id 分组
    db_route_plugins_all = await _get_all(RoutePlugin)
    db_route_plugins: dict[int, dict[str, Any]] = {}
    for rp in db_route_plugins_all:
        if rp.route_id not in db_route_plugins:
            db_route_plugins[rp.route_id] = {}
        db_route_plugins[rp.route_id][rp.plugin_name] = json.loads(rp.config) if rp.config else {}

    # 查询上游目标节点，按 upstream_id 分组
    db_upstream_targets_all = await _get_all(UpstreamTarget)
    db_upstream_targets: dict[int, dict[str, int]] = {}
    for t in db_upstream_targets_all:
        if t.upstream_id not in db_upstream_targets:
            db_upstream_targets[t.upstream_id] = {}
        db_upstream_targets[t.upstream_id][t.target] = t.weight

    # ---------- 2. 从 Edge 拉取 ----------
    def _edge_val(item: dict) -> dict:
        """Edge API 列表返回格式：{key, value: {实际数据}, ...}，提取 value"""
        v = item.get("value")
        return v if isinstance(v, dict) else item

    def _fetch_edge_config() -> dict:
        """同步拉取 Edge 侧全量配置（仅供 asyncio.to_thread 调用）。

        只触碰 EdgeClient（普通属性 + 同步 httpx），绝不触碰 db/AsyncSession。
        保持既有 try/except 语义：主 5 项失败 → 抛 HTTPException(502)；
        stream routes / SSL 失败各自降级为空 dict。
        """
        try:
            # list_upstreams 返回解析后的 [{key, value}, ...]
            edge_upstreams = {_edge_val(u).get("id", ""): _edge_val(u) for u in client.list_upstreams()}
            edge_routes = {_edge_val(r).get("id", ""): _edge_val(r) for r in client.list_routes()}
            edge_plugin_configs = {_edge_val(p).get("id", ""): _edge_val(p) for p in client.list_plugin_configs()}
            edge_global_rules = {_edge_val(g).get("id", ""): _edge_val(g) for g in client.list_global_rules()}
            edge_plugin_metadatas = {}
            for p in client.list_plugin_metadata():
                pd = _edge_val(p)
                pname = pd.get("name") or (p.get("key", "").rsplit("/", 1)[-1] if p.get("key") else "")
                if pname:
                    edge_plugin_metadatas[pname] = pd
        except (EdgeConnectionError, EdgeAPIError) as e:
            raise HTTPException(status_code=502, detail=f"连接 Edge 节点失败: {e}")

        # 单独拉取 stream routes：不受支持的 Edge 节点不应影响其他资源的对比
        try:
            edge_stream_proxies = {_edge_val(sp).get("id", ""): _edge_val(sp) for sp in client.list_stream_routes()}
        except Exception:
            edge_stream_proxies = {}

        # 单独拉取 SSL 证书
        try:
            edge_ssl_certificates = {}
            for c in client.list_ssl():
                cd = _edge_val(c)
                cid = cd.get("id", "") or (c.get("key", "").rsplit("/", 1)[-1] if isinstance(c, dict) and c.get("key") else "")
                if cid:
                    cd["id"] = cid  # 确保 id 字段存在，供后续对比使用
                    edge_ssl_certificates[cid] = cd
        except Exception:
            edge_ssl_certificates = {}

        return {
            "edge_upstreams": edge_upstreams,
            "edge_routes": edge_routes,
            "edge_plugin_configs": edge_plugin_configs,
            "edge_global_rules": edge_global_rules,
            "edge_plugin_metadatas": edge_plugin_metadatas,
            "edge_stream_proxies": edge_stream_proxies,
            "edge_ssl_certificates": edge_ssl_certificates,
        }

    # 一次线程跳转内完成全部同步 Edge 拉取（不阻塞事件循环；仅线程做 Edge HTTP）。
    fetched = await asyncio.to_thread(_fetch_edge_config)
    edge_upstreams = fetched["edge_upstreams"]
    edge_routes = fetched["edge_routes"]
    edge_plugin_configs = fetched["edge_plugin_configs"]
    edge_global_rules = fetched["edge_global_rules"]
    edge_plugin_metadatas = fetched["edge_plugin_metadatas"]
    edge_stream_proxies = fetched["edge_stream_proxies"]
    edge_ssl_certificates = fetched["edge_ssl_certificates"]

    # ---------- 3. 对比与汇总（纯逻辑委托 config_diff，行为不变） ----------
    groups, summary = config_diff.build_diff_groups(
        EquivalenceRules(),
        db_upstreams=db_upstreams, edge_upstreams=edge_upstreams,
        upstream_targets=db_upstream_targets,
        db_routes=db_routes, edge_routes=edge_routes, route_plugins=db_route_plugins,
        db_plugin_configs=db_plugin_configs, edge_plugin_configs=edge_plugin_configs,
        db_global_rules=db_global_rules, edge_global_rules=edge_global_rules,
        db_plugin_metadatas=db_plugin_metadatas, edge_plugin_metadatas=edge_plugin_metadatas,
        db_stream_proxies=db_stream_proxies, edge_stream_proxies=edge_stream_proxies,
        db_ssl_certificates=db_ssl_certificates, edge_ssl_certificates=edge_ssl_certificates,
    )

    return {
        "node": f"{node.ip}:{node.management_port}",
        "summary": summary,
        "groups": groups,
        **route_info,
    }
