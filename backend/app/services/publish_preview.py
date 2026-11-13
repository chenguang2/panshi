"""发布差异预览（openspec: publish-diff-preview）。

核心不变式：**候选载荷与发布同源**。publish 端点与预览端点都经本模块的
build_candidate 构造「将要发给 Edge 的载荷」——预览展示的待发布值与发布实发
内容逐字段一致（源码守卫 test_publish_candidate_single_source.py 钉住）。

类型注册表：label/edge_attr/edge_key/mask/normalize 直接引用漂移检测
DRIFT_TYPE_REGISTRY（单一事实源，不复制）；build_candidate 为本模块新增，
内含子表查询（上游 targets、路由 plugins/upstream 反查）。
"""
import asyncio
import json
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import (
    ConfigVersion,
    Node,
    Route,
    RoutePlugin,
    Upstream,
    UpstreamTarget,
)
from app.services import drift_detection
from app.services.drift_detection import (
    BASE_WHITELIST,
    DRIFT_TYPE_REGISTRY,
    diff_edge_payload,
    _is_masked,
    _masked,
)
from app.services.edge_client import EdgeClient


# ── 候选载荷构造单点（publish 端点与预览端点共用）──────────────────

async def _build_upstream_candidate(db: AsyncSession, upstream: Upstream) -> tuple[dict, Any]:
    targets_result = await db.execute(select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream.id))
    targets = targets_result.scalars().all()
    targets_list = [{"target": t.target, "weight": t.weight} for t in targets]

    config_data = {
        "id": upstream.id, "edge_uuid": upstream.edge_uuid, "name": upstream.name,
        "load_balance": upstream.load_balance, "hash_on": upstream.hash_on, "key": upstream.key,
        "targets": targets_list,
        "checks": json.loads(upstream.checks) if upstream.checks else None,
        "retries": upstream.retries, "retry_timeout": upstream.retry_timeout,
        "timeout": json.loads(upstream.timeout) if upstream.timeout else None,
        "pass_host": upstream.pass_host, "upstream_host": upstream.upstream_host,
        "scheme": upstream.scheme,
        "keepalive_pool": json.loads(upstream.keepalive_pool) if upstream.keepalive_pool else None,
    }

    edge_data = EdgeClient.convert_upstream_to_edge_format(
        upstream.id, upstream.name, upstream.load_balance, targets_list,
        hash_on=upstream.hash_on, key=upstream.key,
        checks=json.loads(upstream.checks) if upstream.checks else None,
        retries=upstream.retries, retry_timeout=upstream.retry_timeout,
        timeout=json.loads(upstream.timeout) if upstream.timeout else None,
        pass_host=upstream.pass_host, upstream_host=upstream.upstream_host,
        scheme=upstream.scheme, keepalive_pool=json.loads(upstream.keepalive_pool) if upstream.keepalive_pool else None)
    return config_data, edge_data


async def _build_route_candidate(db: AsyncSession, route: Route) -> tuple[dict, Any]:
    plugins_result = await db.execute(select(RoutePlugin).where(RoutePlugin.route_id == route.id))
    plugins = plugins_result.scalars().all()

    upstream_edge_uuid = None
    if route.upstream_id:
        upstream_result = await db.execute(select(Upstream).where(Upstream.id == route.upstream_id))
        upstream = upstream_result.scalar_one_or_none()
        if upstream:
            upstream_edge_uuid = upstream.edge_uuid

    plugins_edge_format = {}
    for p in plugins:
        try:
            plugins_edge_format[p.plugin_name] = json.loads(p.config) if isinstance(p.config, str) else (p.config or {})
        except (json.JSONDecodeError, TypeError):
            plugins_edge_format[p.plugin_name] = {}

    config_data = {
        "id": route.id, "edge_uuid": route.edge_uuid, "name": route.name,
        "uri": route.uri, "methods": route.methods, "priority": route.priority,
        "status": route.status, "upstream_id": route.upstream_id,
        "upstream_edge_uuid": upstream_edge_uuid, "hosts": route.hosts,
        "remote_addrs": route.remote_addrs,
        "vars": json.loads(route.vars) if isinstance(route.vars, str) and route.vars else None,
        "advanced_match_enabled": bool(route.advanced_match_enabled) if route.advanced_match_enabled else False,
        "plugins": plugins_edge_format,
        "plugin_config_ids": json.loads(route.plugin_config_ids) if route.plugin_config_ids else None,
        "enable_websocket": route.enable_websocket or False}

    edge_data = EdgeClient.convert_route_to_edge_format(
        edge_uuid=route.edge_uuid, name=route.name, uri=route.uri,
        methods=route.methods, hosts=route.hosts,
        upstream_edge_uuid=upstream_edge_uuid, priority=route.priority or 0,
        vars_json=route.vars if isinstance(route.vars, str) else None,
        plugins=plugins, status=route.status,
        plugin_config_ids=json.loads(route.plugin_config_ids) if route.plugin_config_ids else None,
        enable_websocket=route.enable_websocket)
    return config_data, edge_data


# ── 类型注册表（引用漂移检测单一事实源 + 候选构造器）────────────────

PUBLISH_PREVIEW_REGISTRY: dict = {
    "upstream": {
        **DRIFT_TYPE_REGISTRY["upstream"],
        "build_candidate": _build_upstream_candidate,
    },
    "route": {
        **DRIFT_TYPE_REGISTRY["route"],
        "build_candidate": _build_route_candidate,
    },
}


async def build_candidate(db: AsyncSession, resource_type: str, resource: Any) -> tuple[dict, Any]:
    """按类型注册表构造候选载荷（config_data, edge_data）。未接入类型 400 明示。"""
    conf = PUBLISH_PREVIEW_REGISTRY.get(resource_type)
    if conf is None:
        raise HTTPException(
            status_code=400,
            detail=f"资源类型 {resource_type} 尚未接入发布差异预览（首批：上游、路由）",
        )
    return await conf["build_candidate"](db, resource)


# ── 逐节点差异预览编排（候选载荷 vs 各节点实况）────────────────────
#
# 与漂移检测的关键语义差异（design D4）：**不做均匀性过滤**——正常待发布
# 状态下所有节点都呈相同差异（都是旧值），漂移的「全节点同差 → 判 Edge
# 确定性展开」会把真实待发布差异全部滤掉。「落后节点」= 在其余节点与候选
# 一致的路径上仍不同的节点（连上次发布都没吃到的节点）。


def _masked_at(path: str, value, mask_fields: set):
    return "******" if _is_masked(path, mask_fields) else value


def _leaf_values(obj, whitelist: set, mask_fields: set, prefix: str = "") -> dict:
    """候选侧叶子路径枚举（镜像 diff_edge_payload 的剔除规则：白名单跳过、
    mask 脱敏），供「一致字段行」与 same_count 使用。"""
    leaves: dict = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in whitelist and k not in mask_fields:
                continue
            path = f"{prefix}.{k}" if prefix else k
            if isinstance(v, (dict, list)):
                leaves.update(_leaf_values(v, whitelist, mask_fields, path))
            else:
                leaves[path] = _masked_at(path, v, mask_fields)
        return leaves
    if isinstance(obj, list):
        for i, v in enumerate(obj):
            path = f"{prefix}[{i}]"
            if isinstance(v, (dict, list)):
                leaves.update(_leaf_values(v, whitelist, mask_fields, path))
            else:
                leaves[path] = _masked_at(path, v, mask_fields)
        return leaves
    return {prefix: _masked_at(prefix, obj, mask_fields)}


def _diff_added(new_side, old_side, whitelist: set, mask_fields: set, prefix: str = "") -> dict:
    """候选独有字段（相对上次发布基线新增），镜像 diff_edge_payload 走法。"""
    added: dict = {}
    if isinstance(new_side, dict):
        if not isinstance(old_side, dict):
            added[prefix] = _masked_at(prefix, new_side, mask_fields)
            return added
        for k, v in new_side.items():
            if k in whitelist and k not in mask_fields:
                continue
            path = f"{prefix}.{k}" if prefix else k
            if k not in old_side:
                added[path] = _masked_at(path, v, mask_fields)
            elif isinstance(v, (dict, list)):
                added.update(_diff_added(v, old_side[k], whitelist, mask_fields, path))
        return added
    if isinstance(new_side, list):
        if not isinstance(old_side, list):
            added[prefix] = _masked_at(prefix, new_side, mask_fields)
            return added
        for i in range(len(old_side), len(new_side)):
            path = f"{prefix}[{i}]"
            added[path] = _masked_at(path, new_side[i], mask_fields)
        return added
    return added


async def preview_publish_diff(db: AsyncSession, *, cluster_id: int,
                               resource_type: str, resource_id: int) -> dict:
    """候选载荷 vs 各活跃节点实况的逐节点字段级差异（纯只读，不写库不改 Edge）。"""
    conf = PUBLISH_PREVIEW_REGISTRY.get(resource_type)
    if conf is None:
        raise HTTPException(
            status_code=400,
            detail=f"资源类型 {resource_type} 尚未接入发布差异预览（首批：上游、路由）",
        )

    resource = await db.execute(
        select(conf["model"]).where(
            conf["model"].id == resource_id,
            conf["model"].cluster_id == cluster_id,
        )
    )
    resource = resource.scalar_one_or_none()
    if resource is None:
        raise HTTPException(status_code=404, detail=f"{conf['label']}不存在")

    candidate_config, candidate_edge = await build_candidate(db, resource_type, resource)
    normalized_candidate = conf["normalize"](candidate_edge)
    whitelist = BASE_WHITELIST | set()
    mask_fields = conf["mask"]

    result = {
        "cluster_id": cluster_id,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "name": getattr(resource, conf["name_attr"], None) or f"{conf['label']}#{resource_id}",
        "checked_at": datetime.utcnow().isoformat(),
        "cluster_error": None,
        "has_baseline": False,
        "baseline_missing_reason": None,
        "platform_change": None,
        "nodes": [],
        "matrix": {"node_labels": [], "diff_rows": [], "same_rows": []},
        "summary": {"diff_count": 0, "same_count": 0, "behind_nodes": []},
    }

    # ── 平台侧变更段（候选 vs 最新快照实发载荷；零网络请求）──
    cv = (
        await db.execute(
            select(ConfigVersion)
            .where(ConfigVersion.cluster_id == cluster_id,
                   ConfigVersion.resource_type == resource_type,
                   ConfigVersion.resource_id == resource_id)
            .order_by(ConfigVersion.version.desc())
        )
    ).scalars().first()
    if cv is None:
        result["baseline_missing_reason"] = "未发布过（无版本快照）"
    elif not (cv.edge_payload or "").strip():
        result["baseline_missing_reason"] = "基线缺失：该快照不含实发载荷（旧版本），重新发布后可用"
    else:
        try:
            baseline = json.loads(cv.edge_payload)
        except ValueError:
            result["baseline_missing_reason"] = "基线损坏：实发载荷非合法 JSON"
        else:
            result["has_baseline"] = True
            base_diff = diff_edge_payload(baseline, candidate_edge, mask_fields=mask_fields)
            result["platform_change"] = {
                "changed": base_diff["changed"],
                "removed": base_diff["removed"],
                "added": _diff_added(candidate_edge, baseline, BASE_WHITELIST, mask_fields),
            }

    # ── 逐活跃节点采集（to_thread；线程闭包不触碰请求级会话 #190）──
    nodes = (
        await db.execute(
            select(Node).where(Node.cluster_id == cluster_id, Node.status == 1)
            .order_by(Node.id)
        )
    ).scalars().all()
    if not nodes:
        result["cluster_error"] = "集群中没有活跃的 edge 节点"
        return result

    node_lists: dict = {}
    for n in nodes:
        label = n.ip or f"node-{n.id}"
        try:
            node_lists[label] = await asyncio.to_thread(
                drift_detection._collect_edge_lists_for_node,
                cluster_id, n.ip, n.management_port,
                [conf["edge_key"]],
            )
        except Exception as e:  # 单节点故障隔离
            node_lists[label] = {"__node_error__": str(e)}

    edge_key = conf["edge_key"]
    entries_by_label: dict = {}
    for label, lists in node_lists.items():
        if "__node_error__" in lists:
            entries_by_label[label] = {"__error__": lists["__node_error__"]}
            continue
        collected = lists.get(edge_key)
        if isinstance(collected, dict) and "__error__" in collected:
            entries_by_label[label] = collected
        else:
            entries_by_label[label] = collected or []

    # ── 逐节点 diff（候选为基线；removed = 候选字段节点缺失 → 发布将新增）──
    node_diffs: dict = {}
    node_status: dict = {}
    node_reason: dict = {}
    entry_labels: list = []
    for label in node_lists.keys():
        e = entries_by_label[label]
        if isinstance(e, dict) and "__error__" in e:
            node_status[label] = "unreachable"
            node_reason[label] = e["__error__"]
            continue
        matched = next((it for it in e if it["match_id"] == str(getattr(resource, conf["edge_attr"]))), None)
        if matched is None:
            node_status[label] = "missing"
            node_reason[label] = "该节点无此资源"
            continue
        entry_labels.append(label)
        node_status[label] = "ok"
        node_diffs[label] = diff_edge_payload(
            normalized_candidate, matched["value"], mask_fields=mask_fields)
        d = node_diffs[label]
        if d["changed"] or d["removed"]:
            node_status[label] = "diff"

    # ── 差异矩阵行合并（候选值同源，无需按路径反查节点条目）──
    diff_paths: set = set()
    for d in node_diffs.values():
        diff_paths.update(c["path"] for c in d["changed"])
        diff_paths.update(d["removed"].keys())

    node_labels = list(node_lists.keys())
    diff_rows: list = []
    behind_paths: dict = {}
    for path in sorted(diff_paths):
        candidate_value = None
        values: dict = {}
        differing: list = []
        consistent: list = []
        for label in node_labels:
            d = node_diffs.get(label)
            if d is None:
                values[label] = None  # unreachable/missing 节点无对照值
                continue
            entry = next((c for c in d["changed"] if c["path"] == path), None)
            if entry is not None:
                candidate_value = entry["baseline"]
                values[label] = entry["edge"]
                differing.append(label)
                continue
            if path in d["removed"]:
                candidate_value = d["removed"][path]
                values[label] = None  # 该节点缺失此字段
                differing.append(label)
                continue
            consistent.append(label)  # 该节点与候选一致，候选值确定后回填
        for label in consistent:
            values[label] = candidate_value
        diff_rows.append({"path": path, "candidate": candidate_value, "values": values})
        # 落后判定：部分节点一致、其余不同的路径 → 差异节点落后
        if 0 < len(differing) < len(entry_labels):
            for label in differing:
                behind_paths.setdefault(label, []).append(path)

    # ── 一致字段行（无任何节点差异的候选叶子路径）──
    leaf = _leaf_values(normalized_candidate, whitelist, mask_fields)
    same_rows: list = []
    for path in sorted(leaf.keys()):
        if path in diff_paths:
            continue
        values = {}
        for label in node_labels:
            values[label] = leaf[path] if label in entry_labels else None
        same_rows.append({"path": path, "candidate": leaf[path], "values": values})

    nodes_out: list = []
    behind_nodes: list = []
    for label in node_labels:
        status = node_status.get(label, "unreachable")
        behind = label in behind_paths or status == "missing"
        behind_reason = None
        if status == "missing":
            behind_reason = "缺失该资源（未收到此前发布或被 Edge 侧删除）"
        elif label in behind_paths:
            paths_b = behind_paths[label]
            head = "、".join(paths_b[:3])
            more = f" 等 {len(paths_b)} 项" if len(paths_b) > 3 else ""
            behind_reason = f"落后于上次发布：{head}{more}与待发布配置不一致（其余节点已一致）"
        if behind:
            behind_nodes.append(label)
        d = node_diffs.get(label)
        nodes_out.append({
            "label": label,
            "status": status,
            "reason": node_reason.get(label),
            "diff_count": (len(d["changed"]) + len(d["removed"])) if d else 0,
            "behind": behind,
            "behind_reason": behind_reason,
        })

    result["nodes"] = nodes_out
    result["matrix"] = {
        "node_labels": node_labels,
        "diff_rows": diff_rows,
        "same_rows": same_rows,
    }
    result["summary"] = {
        "diff_count": len(diff_rows),
        "same_count": len(same_rows),
        "behind_nodes": behind_nodes,
    }
    return result
