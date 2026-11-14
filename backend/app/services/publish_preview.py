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
    GlobalRule,
    Node,
    PluginConfig,
    PluginMetadata,
    Route,
    RoutePlugin,
    StreamProxy,
    Upstream,
    UpstreamTarget,
)
from app.models.ssl import SslCertificate
from app.schemas.stream_proxy import StreamProxyResponse
from app.services import drift_detection
from app.services.config_diff import expand_empty_plugin_config, expand_empty_plugin_defaults
from app.services.drift_detection import (
    BASE_WHITELIST,
    DRIFT_TYPE_REGISTRY,
    diff_edge_payload,
    _is_masked,
    _masked,
)
from app.services.dns_wan import build_dns_plugins
from app.services.ssl_pem import merge_reserved_into_sni_str, parse_cert_pem
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


async def _build_plugin_metadata_candidate(db: AsyncSession, item: PluginMetadata) -> tuple[dict, Any]:
    plugin_config = json.loads(item.config_data) if item.config_data else {}
    config_data = {"plugin_name": item.plugin_name, "config_data": plugin_config}
    edge_data = plugin_config
    return config_data, edge_data


async def _build_plugin_config_candidate(db: AsyncSession, config: PluginConfig) -> tuple[dict, Any]:
    upstream_plugins = json.loads(config.plugins) if config.plugins else None

    config_data = {
        "id": config.id, "edge_uuid": config.edge_uuid, "name": config.name,
        "description": config.description, "plugins": upstream_plugins}
    edge_data = {"desc": config.name, "plugins": upstream_plugins or {}}
    return config_data, edge_data


async def _build_global_rule_candidate(db: AsyncSession, rule: GlobalRule) -> tuple[dict, Any]:
    rule_plugins = json.loads(rule.plugins) if rule.plugins else None

    config_data = {"id": rule.id, "edge_uuid": rule.edge_uuid, "name": rule.name, "description": rule.description, "plugins": rule_plugins}
    edge_data = {"desc": rule.name, "plugins": rule_plugins or {}}
    return config_data, edge_data


def edge_protocol(scheme: str | None) -> str | None:
    """内部 scheme → Edge stream_route 顶层 protocol 枚举（TCP/UDP；TLS 经
    upstream.scheme="tls" 表达，protocol 层发布为 TCP）。

    batch2 依赖方向反转：原居 cluster_stream_proxies（api 层），builder 抽取后
    api 侧反向引用本单点，避免 services → api 循环导入。
    """
    if not scheme:
        return None
    if scheme == "udp":
        return "UDP"
    return "TCP"


async def _build_ssl_candidate(db: AsyncSession, cert: SslCertificate) -> tuple[dict, Any]:
    """复刻 publish_ssl_certificate 的 config_data 构造（**拼接前**形态——与版本快照
    同语义，保护回滚不被链污染）。实发形态的证书链拼接由注册表 expand_payload 钩子
    承载（预览候选/基线与漂移基线三处消费）；不含 hook 中的 openssl 过期检查
    （发布期守卫，非载荷构造）。"""
    if cert.cert_type == "client":
        raise HTTPException(status_code=400, detail="客户端证书不需要发布到 Edge 节点")
    if cert.is_ca:
        raise HTTPException(status_code=400, detail="CA 证书不需要发布到 Edge 节点")

    # DB 存 SNI 为逗号串；Edge 期望单域 sni 或数组 snis。与发布同款：从 PEM SAN
    # 推导匹配名单（PEM 为唯一事实源），解析失败回退现 sni 拆分。只读推导，
    # 不回写 cert.sni（发布端点的回写属于发布动作）。
    cert_info = parse_cert_pem(cert.cert)
    if cert_info is not None:
        derived_sni = merge_reserved_into_sni_str(",".join(cert_info["dns_sans"] + cert_info["ip_sans"]))
    else:
        derived_sni = cert.sni
    sni_list = [s.strip() for s in derived_sni.split(",") if s.strip()] if derived_sni else []

    config_data: dict = {
        "name": cert.name,
        "cert": cert.cert, "key": cert.private_key,
        "type": cert.cert_type,
    }
    if len(sni_list) == 1:
        config_data["sni"] = sni_list[0]
    elif len(sni_list) > 1:
        config_data["snis"] = sni_list
    if cert.ssl_protocols:
        try:
            config_data["ssl_protocols"] = json.loads(cert.ssl_protocols)
        except (json.JSONDecodeError, TypeError):
            pass
    if cert.gm:
        config_data["certs"] = [cert.sign_cert] if cert.sign_cert else []
        config_data["keys"] = [cert.sign_key] if cert.sign_key else []
        config_data["gm"] = True

        if cert.ca_cert_id:
            ca_record = await db.get(SslCertificate, cert.ca_cert_id)
            if ca_record:
                sign_pem = (cert.sign_cert or "").strip()
                ca_pem = (ca_record.cert or "").strip()
                if sign_pem and ca_pem:
                    config_data["cert_chain"] = sign_pem + "\n" + ca_pem

        if cert.gm and cert.client_ca:
            client = {"ca": cert.client_ca}
            if cert.client_depth is not None:
                client["depth"] = cert.client_depth
            if cert.skip_mtls_uri_regex:
                client["skip_mtls_uri_regex"] = cert.skip_mtls_uri_regex
            config_data["client"] = client

    # 证书链拼接属实发变换，由注册表 expand_payload 钩子承载（此处保持拼接前形态）
    return config_data, config_data


async def _build_stream_proxy_candidate(db: AsyncSession, proxy: StreamProxy) -> tuple[dict, Any]:
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
    protocol = edge_protocol(proxy.scheme)
    if protocol:
        edge_body["protocol"] = protocol
    if proxy.sni:
        edge_body["sni"] = proxy.sni
    if proxy.remote_addr:
        edge_body["remote_addr"] = proxy.remote_addr
    if proxy.name:
        edge_body["name"] = proxy.name

    config_data = StreamProxyResponse.model_validate(proxy).model_dump()
    return config_data, edge_body


async def _build_dns_proxy_candidate(db: AsyncSession, proxy: StreamProxy) -> tuple[dict, Any]:
    protocol = edge_protocol(proxy.scheme)

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
    return config_data, edge_body


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
    "plugin_config": {
        **DRIFT_TYPE_REGISTRY["plugin_config"],
        "build_candidate": _build_plugin_config_candidate,
    },
    "global_rule": {
        **DRIFT_TYPE_REGISTRY["global_rule"],
        "build_candidate": _build_global_rule_candidate,
    },
    "plugin_metadata": {
        **DRIFT_TYPE_REGISTRY["plugin_metadata"],
        "build_candidate": _build_plugin_metadata_candidate,
    },
    "ssl": {
        **DRIFT_TYPE_REGISTRY["ssl"],
        "build_candidate": _build_ssl_candidate,
        "expand_payload": drift_detection.expand_ssl_cert_chain,
    },
    # 四层/DNS 共用 StreamProxy 表与 stream_proxy 快照类型（发布留痕同类型），
    # 载荷形态不同 → 注册表双键，各挂各的 builder（与发布同源）
    "stream_proxy": {
        **DRIFT_TYPE_REGISTRY["stream_proxy"],
        "build_candidate": _build_stream_proxy_candidate,
    },
    "dns_proxy": {
        **DRIFT_TYPE_REGISTRY["stream_proxy"],
        "build_candidate": _build_dns_proxy_candidate,
        "snapshot_resource_type": "stream_proxy",
    },
}


async def build_candidate(db: AsyncSession, resource_type: str, resource: Any) -> tuple[dict, Any]:
    """按类型注册表构造候选载荷（config_data, edge_data）。未接入类型 400 明示。"""
    conf = PUBLISH_PREVIEW_REGISTRY.get(resource_type)
    if conf is None:
        raise HTTPException(
            status_code=400,
            detail=f"资源类型 {resource_type} 尚未接入发布差异预览（静态资源与节点不经统一发布编排）",
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
            detail=f"资源类型 {resource_type} 尚未接入发布差异预览（静态资源与节点不经统一发布编排）",
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
    # 空插件配置 {} → 已知默认展开（equivalence_rules.yaml 单一事实源）：
    # Edge lua 对空插件补默认（如 log_process {} → {logs: logs/process.log}），
    # 此差异不是旁路修改，三个对比面（数据库对比/漂移/预览）统一等效。
    if resource_type in ("plugin_config", "global_rule"):
        candidate_edge = dict(candidate_edge)
        candidate_edge["plugins"] = expand_empty_plugin_defaults(
            resource_type, candidate_edge.get("plugins") or {})
    elif resource_type == "plugin_metadata":
        candidate_edge = expand_empty_plugin_config(
            resource_type, resource.plugin_name, candidate_edge)
    # SSL 证书链镜像拼接：候选展开到实发形态（expand_payload，batch2）
    expand_hook = conf.get("expand_payload")
    if expand_hook is not None:
        candidate_edge = await expand_hook(db, resource, candidate_edge)
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
    # 快照类型映射（batch2）：dns_proxy 与 stream_proxy 共用 stream_proxy 快照类型
    snapshot_type = conf.get("snapshot_resource_type", resource_type)
    cv = (
        await db.execute(
            select(ConfigVersion)
            .where(ConfigVersion.cluster_id == cluster_id,
                   ConfigVersion.resource_type == snapshot_type,
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
            # 平台侧变更同样做空插件默认等效（与候选同口径）
            if resource_type in ("plugin_config", "global_rule") and isinstance(baseline, dict):
                baseline = dict(baseline)
                baseline["plugins"] = expand_empty_plugin_defaults(
                    resource_type, baseline.get("plugins") or {})
            elif resource_type == "plugin_metadata" and isinstance(baseline, dict):
                baseline = expand_empty_plugin_config(
                    resource_type, resource.plugin_name, baseline)
            # SSL 证书链镜像拼接（batch2）：基线快照存拼接前内容，按当前 CA 关联
            # 展开到实发形态后再比——拼接本身不构成「平台侧变更」
            if expand_hook is not None and isinstance(baseline, dict):
                baseline = await expand_hook(db, resource, baseline)
            result["has_baseline"] = True
            base_diff = diff_edge_payload(baseline, candidate_edge, mask_fields=mask_fields)
            result["platform_change"] = {
                # changed 条目对齐响应契约（design D2）：候选值键名为 candidate
                # （diff_edge_payload 原生键为 edge，直接透传会导致前端取值落空）
                "changed": [
                    {"path": c["path"], "baseline": c["baseline"], "candidate": c["edge"]}
                    for c in base_diff["changed"]
                ],
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
