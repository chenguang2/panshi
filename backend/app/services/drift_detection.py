"""集群配置漂移检测（openspec: config-drift-detection）。

基线 = 各资源最新发布快照的实发 Edge 载荷（ConfigVersion.edge_payload，
publish_resource 留痕）；检测 = 基线 vs Edge 运行态（抽样 1 个活跃节点全类型
列表）的字段级对比，三态结论：ok / drift / unknown。纯只读：不写库、不改 Edge。

对比语义（design D2，基线驱动）：
- 基线字段在运行态缺失 → removed；两侧都有但不等 → changed；
- 运行态独有字段不报（Edge 服务端默认展开非旁路修改）；
- 自管理字段白名单双侧剔除（真实抓形：id/create_time/update_time/etcd 索引）；
- 数值/字符串归一；敏感字段（SSL 私钥）输出脱敏；
- 类型注册表驱动（全部 publish_resource 资源类型），各类型带 normalize 钩子
  （Edge 对部分类型存储时会重排载荷：plugin_metadata 展平信封、ssl 私钥改名）。
"""
import asyncio
import json
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import (
    ConfigVersion,
    GlobalRule,
    Node,
    PluginConfig,
    PluginMetadata,
    Route,
    StreamProxy,
    Upstream,
)
from app.models.ssl import SslCertificate
from app.services.edge_client import EdgeClient

logger = logging.getLogger("app.drift")

# Edge 运行态自管理字段（真实抓形钉定）：value.id、时间戳、etcd 索引。
# 注意：etcd 包装层的 key 字段在采集层（_parse_entries）即被剥离，不进 diff；
# 此处不含 "key"——避免与 SSL 私钥列（同名 key，走 mask 脱敏）冲突。
BASE_WHITELIST = {"id", "create_time", "update_time", "createdIndex", "modifiedIndex"}

# 不经统一发布编排（publish_resource）的资源类型：仅明示未纳入，不检测
OUT_OF_SCOPE_TYPES = ["static_resource", "node"]


def _identity(baseline: dict) -> dict:
    return baseline


def _normalize_plugin_metadata(baseline: dict) -> dict:
    """Edge 存储 plugin_metadata 时展平 {plugin_name, config_data} 信封：
    实测存储形态 {id: 名字, **config_data 内容}。"""
    inner = baseline.get("config_data")
    normalized = dict(inner) if isinstance(inner, dict) else {}
    return normalized


def _normalize_ssl(baseline: dict) -> dict:
    """Edge 存储把平台 private_key 改名为 key（实测存储形态）。"""
    normalized = dict(baseline)
    if "private_key" in normalized:
        normalized["key"] = normalized.pop("private_key")
    return normalized


# 类型注册表（清单 = publish_resource 全部调用方枚举，grep 钉定 8 处 7 类型；
# DNS 代理与四层代理共用 StreamProxy 表与 stream_proxy 快照类型）
DRIFT_TYPE_REGISTRY: dict = {
    "route": {
        "label": "路由", "model": Route, "edge_attr": "edge_uuid",
        "edge_key": "route", "name_attr": "name",
        "mask": set(), "normalize": _identity,
    },
    "upstream": {
        "label": "上游", "model": Upstream, "edge_attr": "edge_uuid",
        "edge_key": "upstream", "name_attr": "name",
        "mask": set(), "normalize": _identity,
    },
    "plugin_config": {
        "label": "插件组", "model": PluginConfig, "edge_attr": "edge_uuid",
        "edge_key": "plugin_config", "name_attr": "name",
        "mask": set(), "normalize": _identity,
    },
    "global_rule": {
        "label": "全局规则", "model": GlobalRule, "edge_attr": "edge_uuid",
        "edge_key": "global_rule", "name_attr": "name",
        "mask": set(), "normalize": _identity,
    },
    "plugin_metadata": {
        "label": "插件元数据", "model": PluginMetadata, "edge_attr": "plugin_name",
        "edge_key": "plugin_metadata", "name_attr": "plugin_name",
        "mask": set(), "normalize": _normalize_plugin_metadata,
    },
    "ssl": {
        "label": "SSL 证书", "model": SslCertificate, "edge_attr": "edge_uuid",
        "edge_key": "ssl", "name_attr": "name",
        "mask": {"key", "private_key"}, "normalize": _normalize_ssl,
    },
    "stream_proxy": {
        "label": "四层/DNS 代理", "model": StreamProxy, "edge_attr": "edge_uuid",
        "edge_key": "stream_route", "name_attr": "name",
        "mask": set(), "normalize": _identity,
    },
}


# ── 字段级 diff（基线驱动，纯函数）─────────────────────────────

def _values_equal(baseline_v, edge_v) -> bool:
    """值等价：数值/数字字符串归一（Edge 回传字符串端口 vs 基线数值）。"""
    if isinstance(baseline_v, bool) or isinstance(edge_v, bool):
        return baseline_v == edge_v
    if isinstance(baseline_v, (int, float)) and isinstance(edge_v, str):
        try:
            return float(edge_v) == float(baseline_v)
        except ValueError:
            return False
    if isinstance(edge_v, (int, float)) and isinstance(baseline_v, str):
        try:
            return float(baseline_v) == float(edge_v)
        except ValueError:
            return False
    return baseline_v == edge_v


def _is_masked(path: str, mask_fields: set) -> bool:
    leaf = path.split(".")[-1].split("[")[0]
    return leaf in mask_fields


def _masked(path: str, value, mask_fields: set):
    return "******" if _is_masked(path, mask_fields) else value


def diff_edge_payload(
    baseline,
    actual,
    whitelist: set | None = None,
    mask_fields: set | None = None,
) -> dict:
    """基线驱动的字段级递归 diff。返回 {"removed": {path: value}, "changed": [...]}。

    - 基线字段运行态缺失 → removed；两侧都有但不等 → changed；
    - 运行态独有字段忽略（Edge 服务端默认展开非旁路修改）；
    - whitelist 双侧剔除；mask_fields 输出脱敏。
    """
    wl = BASE_WHITELIST | (whitelist or set())
    mask = mask_fields or set()
    removed: dict = {}
    changed: list = []

    def walk(bl, ac, prefix: str) -> None:
        if isinstance(bl, dict):
            if not isinstance(ac, dict):
                changed.append({
                    "path": prefix,
                    "baseline": _masked(prefix, bl, mask),
                    "edge": _masked(prefix, ac, mask),
                })
                return
            for k, v in bl.items():
                if k in wl and k not in mask:
                    continue
                path = f"{prefix}.{k}" if prefix else k
                if k not in ac:
                    removed[path] = _masked(path, v, mask)
                    continue
                walk(v, ac[k], path)
            return
        if isinstance(bl, list):
            if not isinstance(ac, list):
                changed.append({
                    "path": prefix,
                    "baseline": _masked(prefix, bl, mask),
                    "edge": _masked(prefix, ac, mask),
                })
                return
            for i, v in enumerate(bl):
                path = f"{prefix}[{i}]"
                if i >= len(ac):
                    removed[path] = _masked(path, v, mask)
                    continue
                walk(v, ac[i], path)
            return
        if not _values_equal(bl, ac):
            changed.append({
                "path": prefix,
                "baseline": _masked(prefix, bl, mask),
                "edge": _masked(prefix, ac, mask),
            })

    walk(baseline, actual, "")
    return {"removed": removed, "changed": changed}


# ── Edge 运行态采集（同步阻塞，仅可在 to_thread 内执行）──────────

def _parse_entries(raw) -> list:
    """真实抓形：list 返回 [{createdIndex, key, modifiedIndex, value}]；
    个别残缺条目缺 key/value（真实库存在），match_id 兜底取 key 尾段。"""
    entries = []
    for entry in raw or []:
        value = entry.get("value") or {}
        match_id = value.get("id") or (entry.get("key") or "").rsplit("/", 1)[-1]
        entries.append({"match_id": str(match_id), "value": value})
    return entries


def _collect_edge_lists(cluster_id: int, node_ip: str, node_port: int) -> dict:
    """单活跃节点全类型列表采集。阻塞网络 IO——只在 to_thread 内调用，
    线程闭包内不触碰请求级 db 会话（事件循环纯度黑名单 #190）。"""
    client = EdgeClient(cluster_id, node_ip=node_ip, node_port=node_port)
    result: dict = {}
    for conf in DRIFT_TYPE_REGISTRY.values():
        edge_key = conf["edge_key"]
        try:
            if edge_key == "route":
                raw = client.list_routes()
            elif edge_key == "upstream":
                raw = client.list_upstreams()
            else:
                raw = client.api(edge_key, "list")
            result[edge_key] = _parse_entries(raw)
        except Exception as e:  # 单类型失败隔离：该类型整体降级，其余正常
            result[edge_key] = {"__error__": str(e)}
    return result


# ── 编排 ─────────────────────────────────────────────────────

def _item(rid, name, status, reason=None, diff=None) -> dict:
    return {
        "resource_id": rid,
        "name": name,
        "status": status,
        "reason": reason,
        "diff": diff,
    }


async def detect_cluster_drift(db: AsyncSession, cluster_id: int) -> dict:
    """按集群执行只读漂移检测，返回三态结论与字段级差异（不写库）。"""
    result = {
        "cluster_id": cluster_id,
        "checked_at": datetime.utcnow().isoformat(),
        "cluster_error": None,
        "summary": {"ok": 0, "drift": 0, "unknown": 0, "out_of_scope": 0},
        "types": {},
        "out_of_scope_types": list(OUT_OF_SCOPE_TYPES),
    }

    nodes = (
        await db.execute(
            select(Node)
            .where(Node.cluster_id == cluster_id, Node.status == 1)
            .order_by(Node.id)
        )
    ).scalars().all()
    if not nodes:
        result["cluster_error"] = "集群中没有活跃的 edge 节点"
        return result
    node = nodes[0]

    # 线程闭包内不触碰请求级 db 会话；client 在线程内构建
    lists = await asyncio.to_thread(
        _collect_edge_lists, cluster_id, node.ip, node.management_port
    )

    for type_key, conf in DRIFT_TYPE_REGISTRY.items():
        edge_key = conf["edge_key"]
        collected = lists.get(edge_key)
        error = collected.get("__error__") if isinstance(collected, dict) else None
        entries = [] if error else collected

        rows = (
            await db.execute(
                select(conf["model"]).where(conf["model"].cluster_id == cluster_id)
            )
        ).scalars().all()
        edge_map = {r.id: getattr(r, conf["edge_attr"]) for r in rows}
        name_map = {
            r.id: (getattr(r, conf["name_attr"], None) or f"{conf['label']}#{r.id}")
            for r in rows
        }

        # 最新快照：version 升序遍历，同资源后写覆盖 = max(version)
        snaps: dict = {}
        cvs = (
            await db.execute(
                select(ConfigVersion).where(
                    ConfigVersion.cluster_id == cluster_id,
                    ConfigVersion.resource_type == type_key,
                ).order_by(ConfigVersion.version)
            )
        ).scalars().all()
        for cv in cvs:
            snaps[cv.resource_id] = cv

        items: list = []
        matched_ids: set = set()
        for rid, edge_id in edge_map.items():
            display = name_map.get(rid) or f"{conf['label']}#{rid}"
            if rid not in snaps:
                items.append(_item(rid, display, "unknown", reason="未发布过（无版本快照）"))
                continue
            cv = snaps[rid]
            if not (cv.edge_payload or "").strip():
                items.append(_item(
                    rid, display, "unknown",
                    reason="基线缺失：该快照不含实发载荷（旧版本），请重新发布以建立基线",
                ))
                continue
            if error:
                items.append(_item(rid, display, "unknown", reason=f"Edge 读取失败：{error}"))
                continue
            try:
                baseline = conf["normalize"](json.loads(cv.edge_payload))
            except ValueError:
                items.append(_item(rid, display, "unknown", reason="基线损坏：实发载荷非合法 JSON"))
                continue
            entry = next(
                (e for e in entries if e["match_id"] == str(edge_id)), None
            )
            if entry is None:
                items.append(_item(rid, display, "drift", reason="Edge 已删除该资源"))
                continue
            matched_ids.add(entry["match_id"])
            diff = diff_edge_payload(baseline, entry["value"], mask_fields=conf["mask"])
            if diff["removed"] or diff["changed"]:
                items.append(_item(rid, display, "drift", diff=diff))
            else:
                items.append(_item(rid, display, "ok"))

        # Edge 多出的旁路资源（平台无对应发布记录）
        for e in entries:
            if e["match_id"] in matched_ids or not e["match_id"]:
                continue
            display = e["value"].get("name") or e["match_id"]
            items.append(_item(
                None, display, "drift", reason="Edge 多出的旁路资源（平台无此发布记录）",
            ))

        result["types"][type_key] = {"label": conf["label"], "items": items}

    for t in result["types"].values():
        for it in t["items"]:
            result["summary"][it["status"]] += 1
    return result
