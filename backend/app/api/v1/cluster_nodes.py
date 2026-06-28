import json
from datetime import datetime, timezone
from typing import Optional, Any
from enum import Enum

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_db
from app.models.cluster import Cluster, Upstream, UpstreamTarget, Route, RoutePlugin, Node, ConfigVersion, PluginConfig, GlobalRule, PluginMetadata, StreamProxy
from app.models.user import User
from app.schemas.cluster import (
    NodeCreate, NodeUpdate, NodeResponse,
    DeleteClusterRequest,
)
from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.services.config_diff import EquivalenceRules
from app.services import edge_sync
from app.services.ansible_service import (
    AnsibleRunnerService,
    AnsibleExecutionError,
    ALLOWED_TAGS,
    NGINX_CMD_MAP,
)
from app.services.ansible_service import MAX_LOG_LINES
from app.api.v1.clusters import get_current_user

router = APIRouter(prefix="/clusters", tags=["clusters"])

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


async def _verify_node(cluster_id: int, node_id: int, db: AsyncSession) -> Node:
    result = await db.execute(
        select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id)
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")
    return node


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
            nginx_status = nginx_info.get("nginx_status")
            if nginx_running is True:
                node.status = 1
            elif nginx_running is False and nginx_status != "unknown":
                node.status = 0
            # nginx_running is None, or nginx_status == "unknown" → skip

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

    if sort_by and sort_by in NODE_ALLOWED_SORT_FIELDS:
        sort_column = getattr(Node, sort_by)
        if sort_order == "desc":
            sort_column = sort_column.desc()
        query = query.order_by(sort_column)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    nodes = result.scalars().all()
    return {"total": total, "page": page, "page_size": page_size, "items": [NodeResponse.model_validate(n) for n in nodes]}


@router.post("/{cluster_id}/nodes", response_model=NodeResponse, status_code=status.HTTP_201_CREATED)
async def create_node(cluster_id: int, node: NodeCreate, db: AsyncSession = Depends(get_db)):
    await edge_sync.get_or_404(db, Cluster, id=cluster_id, detail="集群不存在")

    db_node = Node(cluster_id=cluster_id, **node.model_dump(exclude={"cluster_id"}))
    db.add(db_node)
    await db.commit()
    await db.refresh(db_node)
    return NodeResponse.model_validate(db_node)


@router.put("/{cluster_id}/nodes/{node_id}", response_model=NodeResponse)
async def update_node(cluster_id: int, node_id: int, node_update: NodeUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")

    for key, value in node_update.model_dump(exclude_unset=True).items():
        setattr(node, key, value)

    await db.commit()
    await db.refresh(node)
    return NodeResponse.model_validate(node)


@router.delete("/{cluster_id}/nodes/{node_id}")
async def delete_node(cluster_id: int, node_id: int, body: DeleteClusterRequest = Body(...), db: AsyncSession = Depends(get_db)):
    if not body.delete_db and not body.delete_edge:
        raise HTTPException(status_code=400, detail="请至少选择一项：数据库 或 Edge 节点")

    result = await db.execute(select(Node).where(Node.id == node_id, Node.cluster_id == cluster_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")

    results = []

    if body.delete_db:
        await db.delete(node)
        await db.commit()
        results.append({"scope": "database", "status": "success", "message": "数据库记录已删除"})

    if body.delete_edge:
        # 节点本身是 Edge 运行时，没有对应的 Edge API 删除操作
        results.append({"scope": "edge", "status": "skipped", "message": "节点是 Edge 运行时，无对应的 Edge API 删除操作"})

    return {"message": "节点已删除", "results": results}


@router.post("/{cluster_id}/nodes/{node_id}/start")
async def start_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    node = await _verify_node(cluster_id, node_id, db)
    result = await _run_and_update(
        db, node, "nginx_cmd_run",
        _nginx_extravars(node) | {"nginx_cmd": "nginx_start"},
    )
    return {
        "status": "ok",
        "message": "节点已启动",
        "rc": result.get("rc"),
        "stdout": result.get("stdout", ""),
        "stderr": result.get("stderr", ""),
        "command": result.get("command", ""),
    }


@router.post("/{cluster_id}/nodes/{node_id}/stop")
async def stop_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    node = await _verify_node(cluster_id, node_id, db)
    result = await _run_and_update(
        db, node, "nginx_cmd_run",
        _nginx_extravars(node) | {"nginx_cmd": "nginx_stop"},
    )
    return {
        "status": "ok",
        "message": "节点已停止",
        "rc": result.get("rc"),
        "stdout": result.get("stdout", ""),
        "stderr": result.get("stderr", ""),
        "command": result.get("command", ""),
    }


@router.post("/{cluster_id}/nodes/{node_id}/restart")
async def restart_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    node = await _verify_node(cluster_id, node_id, db)
    result = await _run_and_update(
        db, node, "nginx_cmd_run",
        _nginx_extravars(node) | {"nginx_cmd": "nginx_reload"},
    )
    return {
        "status": "ok",
        "message": "节点已重启",
        "rc": result.get("rc"),
        "stdout": result.get("stdout", ""),
        "stderr": result.get("stderr", ""),
        "command": result.get("command", ""),
    }


@router.post("/{cluster_id}/nodes/{node_id}/check")
async def check_node(cluster_id: int, node_id: int, db: AsyncSession = Depends(get_db)):
    node = await _verify_node(cluster_id, node_id, db)
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
    node = await _verify_node(cluster_id, node_id, db)
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
    node = await _verify_node(cluster_id, node_id, db)
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
    node = await _verify_node(cluster_id, node_id, db)
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
    # resolve nodes
    query = select(Node).where(Node.cluster_id == cluster_id)
    if body.node_ids:
        query = query.where(Node.id.in_(body.node_ids))
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
            else:
                r = await _run_and_update(
                    db, node, "nginx_cmd_run",
                    _nginx_extravars(node) | {"nginx_cmd": NGINX_CMD_MAP[body.action.value]},
                )
            results.append({
                "node_id": node.id, "ip": node.ip,
                "status": "success", "rc": r.get("rc"),
            })
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

    # ---------- 3. 对比函数 ----------
    _rules = EquivalenceRules()

    def _parse_json_safe(val: Any) -> Any:
        if isinstance(val, str) and val.strip().startswith(("{", "[")):
            try:
                return json.loads(val)
            except json.JSONDecodeError:
                return val
        return val

    def _compare_field(db_val, edge_val) -> dict | None:
        """对比单个字段，返回差异信息"""
        db_parsed = _parse_json_safe(db_val)
        edge_parsed = _parse_json_safe(edge_val)
        if json.dumps(db_parsed, sort_keys=True, default=str) != json.dumps(edge_parsed, sort_keys=True, default=str):
            return {"name": "value", "db": str(db_parsed), "edge": str(edge_parsed)}
        return None

    def _compare_upstream_targets(u_id: int, edge_nodes: Any) -> dict:
        db_targets = db_upstream_targets.get(u_id, {})
        edge_nodes_dict = {}
        if isinstance(edge_nodes, dict):
            edge_nodes_dict = edge_nodes
        elif isinstance(edge_nodes, list):
            for n in edge_nodes:
                host = n.get('host', '')
                port = n.get('port', '')
                key = f"{host}:{port}" if port else host
                edge_nodes_dict[key] = n.get('weight', 1)
        equal = json.dumps(db_targets, sort_keys=True, default=str) == json.dumps(edge_nodes_dict, sort_keys=True, default=str)
        return {"name": "targets", "db": json.dumps(db_targets, indent=1, ensure_ascii=False) if db_targets else "{}", "edge": json.dumps(edge_nodes_dict, indent=1, ensure_ascii=False) if edge_nodes_dict else "{}", "status": "equal" if equal else "diff"}

    def _compare_upstream(db_u, edge_data: dict | None):
        if not edge_data:
            return {"name": db_u.name, "id": db_u.edge_uuid, "status": "only_in_db", "fields": []}
        fields = []
        fields.append(_compare_upstream_targets(db_u.id, edge_data.get("nodes")))
        for key in ("load_balance", "scheme", "pass_host", "retries", "hash_on", "key"):
            db_raw = getattr(db_u, key, None)
            edge_key = _rules.get_field_alias("upstream", key)
            edge_v = edge_data.get(edge_key)
            if edge_v is None:
                fields.append({
                    "name": key,
                    "db": str(db_raw) if db_raw is not None and db_raw != _rules.get_field_default("upstream", key) else "(默认)",
                    "edge": "(未配置)",
                    "status": "diff" if (db_raw is not None and db_raw != _rules.get_field_default("upstream", key)) else "equal",
                })
                continue
            db_v = _rules.normalize_value("upstream", db_raw, key)
            if db_v is None:
                db_v = _rules.normalize_scalar("upstream", db_raw, key)
            equal = str(db_v) == str(edge_v)
            fields.append({
                "name": key,
                "db": str(db_v),
                "edge": str(edge_v),
                "status": "equal" if equal else "diff",
            })
        for jkey in ("checks", "timeout", "keepalive_pool"):
            db_v = getattr(db_u, jkey, None)
            edge_v = edge_data.get(jkey)
            if db_v or edge_v:
                result = _rules.compare_json_field(db_v, edge_v, _rules.get_json_rules("upstream", jkey))
                fields.append({
                    "name": jkey,
                    "db": result["db"] if result else (json.dumps(db_v, indent=1, ensure_ascii=False) if isinstance(db_v, dict) else str(db_v or "{}")),
                    "edge": result["edge"] if result else (json.dumps(edge_v, indent=1, ensure_ascii=False) if isinstance(edge_v, dict) else str(edge_v or "{}")),
                    "status": "equal" if not result else "diff",
                })
        return {"name": db_u.name, "id": db_u.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _compare_route(db_r, edge_data: dict | None):
        if not edge_data:
            return {"name": db_r.name, "id": db_r.edge_uuid, "status": "only_in_db", "fields": []}
        fields = []
        for key in ("uri", "methods", "hosts", "priority", "status"):
            db_v = getattr(db_r, key, None)
            edge_v = edge_data.get(key)
            if db_v is None or db_v == "":
                continue
            if _rules.is_list_field("route", key):
                matched, db_norm, edge_norm = _rules.normalize_list(db_v, edge_v)
                fields.append({
                    "name": key,
                    "db": str(db_v),
                    "edge": str(edge_v),
                    "status": "equal" if matched else "diff",
                })
            else:
                equal = str(db_v) == str(edge_v)
                fields.append({
                    "name": key,
                    "db": str(db_v),
                    "edge": str(edge_v),
                    "status": "equal" if equal else "diff",
                })
        # 高级匹配 vars
        db_vars = json.loads(db_r.vars) if db_r.vars else None
        edge_vars = edge_data.get("vars")
        if db_vars or edge_vars:
            equal = json.dumps(db_vars, sort_keys=True, default=str) == json.dumps(edge_vars, sort_keys=True, default=str)
            fields.append({
                "name": "vars",
                "db": json.dumps(db_vars, indent=1, ensure_ascii=False) if db_vars else "{}",
                "edge": json.dumps(edge_vars, indent=1, ensure_ascii=False) if edge_vars else "{}",
                "status": "equal" if equal else "diff",
            })
        # 插件组 plugin_config_ids
        db_pids = json.loads(db_r.plugin_config_ids) if db_r.plugin_config_ids else None
        edge_pids = edge_data.get("plugin_config_ids")
        if db_pids or edge_pids:
            equal = json.dumps(db_pids, sort_keys=True, default=str) == json.dumps(edge_pids, sort_keys=True, default=str)
            fields.append({
                "name": "plugin_config_ids",
                "db": json.dumps(db_pids, indent=1, ensure_ascii=False) if db_pids else "[]",
                "edge": json.dumps(edge_pids, indent=1, ensure_ascii=False) if edge_pids else "[]",
                "status": "equal" if equal else "diff",
            })
        # 路由级插件 RoutePlugin
        db_rp = db_route_plugins.get(db_r.id, {})
        edge_plugins = edge_data.get("plugins", {})
        if isinstance(edge_plugins, str):
            try:
                edge_plugins = json.loads(edge_plugins)
            except json.JSONDecodeError:
                pass
        if db_rp or edge_plugins:
            plugin_fields = _rules.compare_plugins(db_rp, edge_plugins, _rules.get_plugin_defaults("plugin_config"), ignore_edge_fields=_rules.get_ignore_plugin_fields("plugin_config"))
            fields.extend(plugin_fields)
        return {"name": db_r.name, "id": db_r.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _compare_plugin_config(db_p, edge_data: dict | None):
        if not edge_data:
            return {"name": db_p.name, "id": db_p.edge_uuid, "status": "only_in_db", "fields": []}
        db_plugins = json.loads(db_p.plugins) if db_p.plugins else {}
        edge_plugins = edge_data.get("plugins", {})
        if isinstance(edge_plugins, str):
            try:
                edge_plugins = json.loads(edge_plugins)
            except json.JSONDecodeError:
                pass
        fields = _rules.compare_plugins(db_plugins, edge_plugins, _rules.get_plugin_defaults("plugin_config"), ignore_edge_fields=_rules.get_ignore_plugin_fields("plugin_config"))
        return {"name": db_p.name, "id": db_p.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _compare_global_rule(db_g, edge_data: dict | None):
        if not edge_data:
            return {"name": db_g.name, "id": db_g.edge_uuid, "status": "only_in_db", "fields": []}
        db_plugins = json.loads(db_g.plugins) if db_g.plugins else {}
        edge_plugins = edge_data.get("plugins", {})
        if isinstance(edge_plugins, str):
            try:
                edge_plugins = json.loads(edge_plugins)
            except json.JSONDecodeError:
                pass
        fields = _rules.compare_plugins(db_plugins, edge_plugins, _rules.get_plugin_defaults("global_rule"), ignore_edge_fields=_rules.get_ignore_plugin_fields("global_rule"))
        return {"name": db_g.name, "id": db_g.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _compare_plugin_metadata(db_pm, edge_data: dict | None):
        if edge_data is None:
            return {"name": db_pm.plugin_name, "id": db_pm.plugin_name, "status": "only_in_db", "fields": []}
        fields = []
        db_config = json.loads(db_pm.config_data) if db_pm.config_data else {}
        edge_config = edge_data
        if isinstance(edge_config, str):
            try:
                edge_config = json.loads(edge_config)
            except json.JSONDecodeError:
                pass
        equal = json.dumps(db_config, sort_keys=True) == json.dumps(edge_config, sort_keys=True)
        fields.append({
            "name": "config",
            "db": json.dumps(db_config, indent=1, ensure_ascii=False),
            "edge": json.dumps(edge_config, indent=1, ensure_ascii=False),
            "status": "equal" if equal else "diff",
        })
        return {"name": db_pm.plugin_name, "id": db_pm.plugin_name, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _compare_stream_targets(db_targets_json: Any, edge_nodes: Any) -> dict:
        """对比 stream proxy targets（DB JSON array ↔ Edge upstream.nodes dict）"""
        db_dict: dict[str, int] = {}
        if db_targets_json:
            try:
                targets = json.loads(db_targets_json) if isinstance(db_targets_json, str) else db_targets_json
                for t in (targets or []):
                    db_dict[t.get("target", "")] = t.get("weight", 1)
            except (json.JSONDecodeError, TypeError):
                pass
        edge_dict = edge_nodes if isinstance(edge_nodes, dict) else {}
        equal = json.dumps(db_dict, sort_keys=True, default=str) == json.dumps(edge_dict, sort_keys=True, default=str)
        return {"name": "targets", "db": json.dumps(db_dict, indent=1, ensure_ascii=False) if db_dict else "{}", "edge": json.dumps(edge_dict, indent=1, ensure_ascii=False) if edge_dict else "{}", "status": "equal" if equal else "diff"}

    def _compare_stream_proxy(db_sp, edge_data: dict | None):
        """对比四层代理配置（DB vs Edge），处理 upstream 嵌套结构"""
        if not edge_data:
            return {"name": db_sp.name, "id": db_sp.edge_uuid, "status": "only_in_db", "fields": []}
        fields = []
        edge_upstream = edge_data.get("upstream", {})

        # listen_port → server_port
        db_v = db_sp.listen_port
        edge_v = edge_data.get("server_port")
        equal = str(db_v) == str(edge_v)
        fields.append({"name": "listen_port", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

        # load_balance → upstream.type（需算法归一化）
        db_v = db_sp.load_balance
        edge_v = edge_upstream.get("type", "")
        db_norm = _rules.normalize_value("upstream", db_v, "load_balance") or db_v
        equal = str(db_norm) == str(edge_v)
        fields.append({"name": "load_balance", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

        # scheme → upstream.scheme
        db_v = db_sp.scheme
        edge_v = edge_upstream.get("scheme", "tcp")
        equal = str(db_v) == str(edge_v)
        fields.append({"name": "scheme", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

        # targets → upstream.nodes
        fields.append(_compare_stream_targets(db_sp.targets, edge_upstream.get("nodes")))

        # timeout / keepalive_pool → upstream.timeout / upstream.keepalive_pool
        for jkey in ("timeout", "keepalive_pool"):
            db_val = getattr(db_sp, jkey, None)
            edge_val = edge_upstream.get(jkey)
            if db_val or edge_val:
                result = _rules.compare_json_field(db_val, edge_val, _rules.get_json_rules("upstream", jkey))
                fields.append({
                    "name": jkey,
                    "db": result["db"] if result else (json.dumps(db_val, indent=1, ensure_ascii=False) if isinstance(db_val, dict) else str(db_val or "{}")),
                    "edge": result["edge"] if result else (json.dumps(edge_val, indent=1, ensure_ascii=False) if isinstance(edge_val, dict) else str(edge_val or "{}")),
                    "status": "equal" if not result else "diff",
                })

        # remote_addr / sni（顶层字段）
        for key in ("remote_addr", "sni"):
            db_v = getattr(db_sp, key, None) or ""
            edge_v = edge_data.get(key, "") or ""
            equal = str(db_v) == str(edge_v)
            fields.append({"name": key, "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

        return {"name": db_sp.name, "id": db_sp.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    def _find_only_in_edge(edge_dict, db_items, id_attr="id"):
        """找出仅在 Edge 上存在、DB 中没有的项"""
        db_ids = {getattr(d, "edge_uuid", getattr(d, "plugin_name", "")) for d in db_items}
        result = []
        for eid, edata in edge_dict.items():
            if eid and eid not in db_ids:
                # stream proxy 没有 uri，用 server_port 作为后备显示名
                name = edata.get("name") or (str(edata.get("server_port", eid)) if "server_port" in edata else edata.get("uri", eid))
                result.append({"name": name, "id": eid, "status": "only_in_edge", "fields": []})
        return result

    # ---------- 4. 构建分组 ----------
    groups = []
    summary = {"total": 0, "match": 0, "mismatch": 0, "only_in_db": 0, "only_in_edge": 0}

    def _add_group(label: str, type_name: str, items: list):
        groups.append({"type": type_name, "label": label, "items": items or []})
        for it in items or []:
            s = it["status"]
            summary["total"] += 1
            if s in summary:
                summary[s] += 1

    # 上游
    upstream_items = [_compare_upstream(u, edge_upstreams.get(u.edge_uuid)) for u in db_upstreams]
    upstream_items += _find_only_in_edge(edge_upstreams, db_upstreams)
    _add_group("上游服务", "upstreams", upstream_items)

    # 路由
    route_items = [_compare_route(r, edge_routes.get(r.edge_uuid)) for r in db_routes]
    route_items += _find_only_in_edge(edge_routes, db_routes)
    _add_group("路由规则", "routes", route_items)

    # 插件组
    pc_items = [_compare_plugin_config(p, edge_plugin_configs.get(p.edge_uuid)) for p in db_plugin_configs]
    pc_items += _find_only_in_edge(edge_plugin_configs, db_plugin_configs)
    _add_group("插件组", "plugin_configs", pc_items)

    # 全局规则
    gr_items = [_compare_global_rule(g, edge_global_rules.get(g.edge_uuid)) for g in db_global_rules]
    gr_items += _find_only_in_edge(edge_global_rules, db_global_rules)
    _add_group("全局规则", "global_rules", gr_items)

    # 插件元数据
    pm_items = [_compare_plugin_metadata(p, edge_plugin_metadatas.get(p.plugin_name)) for p in db_plugin_metadatas]
    pm_items += _find_only_in_edge(edge_plugin_metadatas, db_plugin_metadatas, id_attr="name")
    _add_group("插件元数据", "plugin_metadata", pm_items)

    # 四层代理
    sp_items = [_compare_stream_proxy(sp, edge_stream_proxies.get(sp.edge_uuid)) for sp in db_stream_proxies]
    sp_items += _find_only_in_edge(edge_stream_proxies, db_stream_proxies)
    _add_group("四层代理", "stream_proxies", sp_items)

    return {
        "node": f"{node.ip}:{node.management_port}",
        "summary": summary,
        "groups": groups,
    }
