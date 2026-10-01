import json
from copy import deepcopy
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None  # pyyaml not installed, rules file won't load


_RULES_PATH = Path(__file__).resolve().parent.parent / "config" / "equivalence_rules.yaml"


def _deep_fill(obj: Any, defaults: Any) -> Any:
    """Recursively fill missing keys from defaults without overwriting existing values."""
    if not isinstance(obj, dict) or not isinstance(defaults, dict):
        return obj if obj is not None else defaults
    result = {}
    for k, v in obj.items():
        if k in defaults:
            result[k] = _deep_fill(v, defaults[k])
        else:
            result[k] = v
    for k, v in defaults.items():
        if k not in result:
            result[k] = deepcopy(v)
    return result


def _deep_pop(obj: dict, path: str) -> None:
    """Remove a nested key from dict by dotted path (e.g. 'passive.healthy.successes')."""
    parts = path.split(".", 1)
    if len(parts) == 1:
        obj.pop(parts[0], None)
    elif len(parts) == 2 and parts[0] in obj and isinstance(obj[parts[0]], dict):
        _deep_pop(obj[parts[0]], parts[1])


class EquivalenceRules:
    """Loads and applies field equivalence rules for DB-Edge config comparison."""

    _instance = None
    _rules: dict = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load()
        return cls._instance

    def _load(self) -> None:
        if yaml is None or not _RULES_PATH.exists():
            self._rules = {}
            return
        with open(_RULES_PATH, encoding="utf-8") as f:
            self._rules = yaml.safe_load(f) or {}

    def _res_type(self, resource_type: str) -> dict:
        return self._rules.get(resource_type, {})

    def get_field_default(self, resource_type: str, field: str) -> Any:
        return self._res_type(resource_type).get("field_defaults", {}).get(field)

    def get_field_alias(self, resource_type: str, field: str) -> str:
        return self._res_type(resource_type).get("field_aliases", {}).get(field, field)

    def get_json_rules(self, resource_type: str, field: str) -> dict:
        return self._res_type(resource_type).get("json_fields", {}).get(field, {})

    def is_list_field(self, resource_type: str, field: str) -> bool:
        return field in self._res_type(resource_type).get("list_fields", [])

    def should_ignore_edge_field(self, resource_type: str, field: str) -> bool:
        return field in self._res_type(resource_type).get("ignore_edge_fields", [])

    def get_plugin_defaults(self, resource_type: str) -> dict:
        return self._res_type(resource_type).get("per_plugin_defaults", {})

    def get_ignore_plugin_fields(self, resource_type: str) -> list[str]:
        return self._res_type(resource_type).get("ignore_edge_plugin_fields", [])

    def normalize_scalar(self, resource_type: str, db_value: Any, field: str) -> Any:
        if db_value is None or db_value == "":
            default = self.get_field_default(resource_type, field)
            if default is not None:
                return default
        return db_value

    def normalize_value(self, resource_type: str, db_value: Any, field: str) -> Any:
        """Map DB value to equivalent Edge value using value_mappings.
        E.g., DB 'weighted_roundrobin' -> Edge 'roundrobin'.
        Only applies when db_value is not None and a mapping exists."""
        if db_value is None:
            return db_value
        mappings = self._res_type(resource_type).get("value_mappings", {}).get(field, {})
        return mappings.get(db_value, db_value)

    def normalize_list(self, db_value: Any, edge_value: Any) -> tuple:
        if isinstance(db_value, str) and isinstance(edge_value, list):
            parts = [p.strip() for p in db_value.split(",") if p.strip()]
            if parts == edge_value:
                return True, parts, edge_value
        if isinstance(db_value, list) and isinstance(edge_value, str):
            parts = [p.strip() for p in edge_value.split(",") if p.strip()]
            if parts == db_value:
                return True, db_value, parts
        return False, db_value, edge_value

    def compare_json_field(self, db_val: Any, edge_val: Any, field_rules: dict) -> dict | None:
        db_parsed = self._parse_json(db_val)
        edge_parsed = self._parse_json(edge_val)

        for key in field_rules.get("ignore_edge_keys", []):
            _deep_pop(edge_parsed, key)
        defaults = field_rules.get("fill_defaults", {})
        if defaults:
            db_parsed = _deep_fill(db_parsed, defaults)
            edge_parsed = _deep_fill(edge_parsed, defaults)

        if json.dumps(db_parsed, sort_keys=True, default=str) != json.dumps(
            edge_parsed, sort_keys=True, default=str
        ):
            return {
                "name": "value",
                "db": json.dumps(db_parsed, indent=1, ensure_ascii=False),
                "edge": json.dumps(edge_parsed, indent=1, ensure_ascii=False),
            }
        return None

    def compare_plugins(
        self, db_plugins: Any, edge_plugins: Any, per_plugin_defaults: dict,
        ignore_edge_fields: list[str] | None = None,
    ) -> list:
        db = self._parse_json(db_plugins)
        edge = self._parse_json(edge_plugins)
        fields = []
        ignore = set(ignore_edge_fields or [])
        all_plugins = set(list(db.keys()) + list(edge.keys()))
        for name in sorted(all_plugins):
            db_conf = db.get(name, {})
            edge_conf = edge.get(name, {})
            for k in ignore:
                edge_conf.pop(k, None)
                db_conf.pop(k, None)
            defaults = per_plugin_defaults.get(name, {})
            # 先做字面比较
            equal = json.dumps(db_conf, sort_keys=True, default=str) == json.dumps(
                edge_conf, sort_keys=True, default=str
            )
            if not equal and defaults:
                # DB 可能是省略的缺省值，填充后再比一次
                db_filled = _deep_fill(db_conf, defaults)
                equal = json.dumps(db_filled, sort_keys=True, default=str) == json.dumps(
                    edge_conf, sort_keys=True, default=str
                )
            fields.append({
                "name": name,
                "db": json.dumps(db_conf, indent=1, ensure_ascii=False),
                "edge": json.dumps(edge_conf, indent=1, ensure_ascii=False),
                "status": "equal" if equal else "diff",
            })
        return fields

    @staticmethod
    def _parse_json(val: Any) -> dict:
        if val is None:
            return {}
        if isinstance(val, str):
            try:
                return json.loads(val)
            except (json.JSONDecodeError, TypeError):
                return {}
        if isinstance(val, dict):
            return val
        return {}


# ════════ 配置对比纯函数（2026-10-01 自 config_diff_service.py 并入，单一原子模块） ════════
def normalize_sni_csv(raw: str) -> str:
    """归一化 SNI 逗号分隔字符串，统一去除逗号周围空格。"""
    return ",".join(part.strip() for part in raw.split(",") if part.strip())


def normalize_edge_sni(edge_data: dict) -> str:
    """归一化 Edge SSL 的 sni/snis 字段为归一化后的逗号分隔字符串。"""
    if "snis" in edge_data:
        snis = edge_data["snis"]
        raw = ", ".join(snis) if isinstance(snis, list) else str(snis)
    else:
        raw = edge_data.get("sni", "")
    return normalize_sni_csv(raw)


def compare_upstream_targets(db_targets: dict[str, int] | None, edge_nodes: Any) -> dict:
    """对比上游 targets（DB ``{target: weight}`` ↔ Edge upstream.nodes）。"""
    db_dict = db_targets or {}
    edge_nodes_dict = {}
    if isinstance(edge_nodes, dict):
        edge_nodes_dict = edge_nodes
    elif isinstance(edge_nodes, list):
        for n in edge_nodes:
            host = n.get('host', '')
            port = n.get('port', '')
            key = f"{host}:{port}" if port else host
            edge_nodes_dict[key] = n.get('weight', 1)
    equal = json.dumps(db_dict, sort_keys=True, default=str) == json.dumps(edge_nodes_dict, sort_keys=True, default=str)
    return {"name": "targets", "db": json.dumps(db_dict, indent=1, ensure_ascii=False) if db_dict else "{}", "edge": json.dumps(edge_nodes_dict, indent=1, ensure_ascii=False) if edge_nodes_dict else "{}", "status": "equal" if equal else "diff"}


def compare_upstream(
    db_u: Any,
    edge_data: dict | None,
    rules: EquivalenceRules,
    db_targets: dict[str, int] | None = None,
) -> dict:
    if not edge_data:
        return {"name": db_u.name, "id": db_u.edge_uuid, "status": "only_in_db", "fields": []}
    fields = []
    fields.append(compare_upstream_targets(db_targets, edge_data.get("nodes")))
    for key in ("load_balance", "scheme", "pass_host", "retries", "hash_on", "key"):
        db_raw = getattr(db_u, key, None)
        edge_key = rules.get_field_alias("upstream", key)
        edge_v = edge_data.get(edge_key)
        if edge_v is None:
            fields.append({
                "name": key,
                "db": str(db_raw) if db_raw is not None and db_raw != rules.get_field_default("upstream", key) else "(默认)",
                "edge": "(未配置)",
                "status": "diff" if (db_raw is not None and db_raw != rules.get_field_default("upstream", key)) else "equal",
            })
            continue
        db_v = rules.normalize_value("upstream", db_raw, key)
        if db_v is None:
            db_v = rules.normalize_scalar("upstream", db_raw, key)
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
            result = rules.compare_json_field(db_v, edge_v, rules.get_json_rules("upstream", jkey))
            fields.append({
                "name": jkey,
                "db": result["db"] if result else (json.dumps(db_v, indent=1, ensure_ascii=False) if isinstance(db_v, dict) else str(db_v or "{}")),
                "edge": result["edge"] if result else (json.dumps(edge_v, indent=1, ensure_ascii=False) if isinstance(edge_v, dict) else str(edge_v or "{}")),
                "status": "equal" if not result else "diff",
            })
    return {"name": db_u.name, "id": db_u.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}


def compare_route(
    db_r: Any,
    edge_data: dict | None,
    rules: EquivalenceRules,
    route_plugins: dict[int, dict[str, Any]] | None = None,
) -> dict:
    if not edge_data:
        return {"name": db_r.name, "id": db_r.edge_uuid, "status": "only_in_db", "fields": []}
    fields = []
    for key in ("uri", "methods", "hosts", "priority", "status"):
        db_v = getattr(db_r, key, None)
        edge_v = edge_data.get(key)
        if db_v is None or db_v == "":
            continue
        if rules.is_list_field("route", key):
            matched, db_norm, edge_norm = rules.normalize_list(db_v, edge_v)
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
    # enable_websocket
    db_ws = getattr(db_r, "enable_websocket", None)
    edge_ws = edge_data.get("enable_websocket")
    if db_ws or edge_ws:
        equal = str(db_ws or "") == str(edge_ws or "")
        fields.append({
            "name": "enable_websocket",
            "db": str(db_ws or ""),
            "edge": str(edge_ws or ""),
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
    db_rp = (route_plugins or {}).get(db_r.id, {})
    edge_plugins = edge_data.get("plugins", {})
    if isinstance(edge_plugins, str):
        try:
            edge_plugins = json.loads(edge_plugins)
        except json.JSONDecodeError:
            pass
    if db_rp or edge_plugins:
        plugin_fields = rules.compare_plugins(db_rp, edge_plugins, rules.get_plugin_defaults("plugin_config"), ignore_edge_fields=rules.get_ignore_plugin_fields("plugin_config"))
        fields.extend(plugin_fields)
    return {"name": db_r.name, "id": db_r.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}


def compare_plugin_config(db_p: Any, edge_data: dict | None, rules: EquivalenceRules) -> dict:
    if not edge_data:
        return {"name": db_p.name, "id": db_p.edge_uuid, "status": "only_in_db", "fields": []}
    db_plugins = json.loads(db_p.plugins) if db_p.plugins else {}
    edge_plugins = edge_data.get("plugins", {})
    if isinstance(edge_plugins, str):
        try:
            edge_plugins = json.loads(edge_plugins)
        except json.JSONDecodeError:
            pass
    fields = rules.compare_plugins(db_plugins, edge_plugins, rules.get_plugin_defaults("plugin_config"), ignore_edge_fields=rules.get_ignore_plugin_fields("plugin_config"))
    return {"name": db_p.name, "id": db_p.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}


def compare_global_rule(db_g: Any, edge_data: dict | None, rules: EquivalenceRules) -> dict:
    if not edge_data:
        return {"name": db_g.name, "id": db_g.edge_uuid, "status": "only_in_db", "fields": []}
    db_plugins = json.loads(db_g.plugins) if db_g.plugins else {}
    edge_plugins = edge_data.get("plugins", {})
    if isinstance(edge_plugins, str):
        try:
            edge_plugins = json.loads(edge_plugins)
        except json.JSONDecodeError:
            pass
    fields = rules.compare_plugins(db_plugins, edge_plugins, rules.get_plugin_defaults("global_rule"), ignore_edge_fields=rules.get_ignore_plugin_fields("global_rule"))
    return {"name": db_g.name, "id": db_g.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}


def compare_plugin_metadata(db_pm: Any, edge_data: dict | None, rules: EquivalenceRules) -> dict:
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
    # 通过规则文件忽略 Edge 侧自动注入的字段（如 id）
    for fld in rules._res_type("plugin_metadata").get("ignore_edge_fields", []):
        edge_config.pop(fld, None)
    equal = json.dumps(db_config, sort_keys=True) == json.dumps(edge_config, sort_keys=True)
    fields.append({
        "name": "config",
        "db": json.dumps(db_config, indent=1, ensure_ascii=False),
        "edge": json.dumps(edge_config, indent=1, ensure_ascii=False),
        "status": "equal" if equal else "diff",
    })
    return {"name": db_pm.plugin_name, "id": db_pm.plugin_name, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}


def compare_stream_targets(db_targets_json: Any, edge_nodes: Any) -> dict:
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


def compare_stream_proxy(db_sp: Any, edge_data: dict | None, rules: EquivalenceRules) -> dict:
    """对比四层代理配置（DB vs Edge）"""
    if not edge_data:
        return {"name": db_sp.name, "id": db_sp.edge_uuid, "status": "only_in_db", "fields": []}

    is_dns = getattr(db_sp, "proxy_type", None) == "dns"
    fields = []
    edge_upstream = edge_data.get("upstream", {})

    # listen_port → server_port
    db_v = db_sp.listen_port
    edge_v = edge_data.get("server_port")
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "listen_port", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # name
    db_v = db_sp.name or ""
    edge_v = edge_data.get("name", "") or ""
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "name", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    if is_dns:
        # DNS 模式：比较 dns_config.hosts ↔ plugins.dns_upstream.hosts
        edge_plugins = edge_data.get("plugins", {}) or {}
        edge_dns = edge_plugins.get("dns_upstream", {}) or {}
        edge_hosts = edge_dns.get("hosts", {}) or {}

        try:
            db_cfg = json.loads(db_sp.dns_config) if isinstance(db_sp.dns_config, str) else (db_sp.dns_config or {})
        except (json.JSONDecodeError, TypeError):
            db_cfg = {}
        db_hosts = db_cfg.get("hosts", {}) if isinstance(db_cfg, dict) else {}

        all_domains = set(list(db_hosts.keys()) + list(edge_hosts.keys()))
        for domain in sorted(all_domains):
            db_dom = db_hosts.get(domain) or {}
            edge_dom = edge_hosts.get(domain) or {}

            # 负载均衡 type
            db_type = db_dom.get("type", "")
            edge_type = edge_dom.get("type", "")
            t_eq = str(db_type) == str(edge_type)
            fields.append({
                "name": f"dns.hosts.{domain}.type",
                "db": db_type or "roundrobin",
                "edge": edge_type or "roundrobin",
                "status": "equal" if t_eq else "diff",
            })

            # 节点 nodes
            db_nodes = db_dom.get("nodes", {}) or {}
            edge_nodes = edge_dom.get("nodes", {}) or {}
            n_eq = json.dumps(db_nodes, sort_keys=True) == json.dumps(edge_nodes, sort_keys=True)
            fields.append({
                "name": f"dns.hosts.{domain}.nodes",
                "db": json.dumps(db_nodes, indent=1, ensure_ascii=False) if db_nodes else "{}",
                "edge": json.dumps(edge_nodes, indent=1, ensure_ascii=False) if edge_nodes else "{}",
                "status": "equal" if n_eq else "diff",
            })

        return {"name": db_sp.name, "id": db_sp.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}

    # load_balance → upstream.type
    db_v = db_sp.load_balance
    edge_v = edge_upstream.get("type", "")
    db_norm = rules.normalize_value("upstream", db_v, "load_balance") or db_v
    equal = str(db_norm) == str(edge_v)
    fields.append({"name": "load_balance", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # scheme（兼容旧数据中的 tcp_udp）
    db_v = db_sp.scheme
    edge_v = edge_upstream.get("scheme", "tcp")
    db_norm = "tcp" if db_v == "tcp_udp" else db_v
    equal = str(db_norm) == str(edge_v)
    fields.append({"name": "scheme", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # targets → upstream.nodes
    fields.append(compare_stream_targets(db_sp.targets, edge_upstream.get("nodes")))

    return {"name": db_sp.name, "id": db_sp.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}


def compare_ssl_certificate(db_cert: Any, edge_data: dict | None, rules: EquivalenceRules) -> dict:
    """对比 SSL 证书配置（DB vs Edge）"""
    if db_cert.is_ca:
        return {"name": db_cert.name, "id": db_cert.edge_uuid, "status": "expected_only_in_db", "reason": "CA 根证书无需发布到 Edge 节点", "fields": []}
    if db_cert.cert_type == "client":
        return {"name": db_cert.name, "id": db_cert.edge_uuid, "status": "expected_only_in_db", "reason": "客户端证书无需发布到 Edge 节点", "fields": []}
    if not edge_data:
        return {"name": db_cert.name, "id": db_cert.edge_uuid, "status": "only_in_db", "fields": []}
    fields = []

    # name — Edge 没有 name 时用 id 兜底
    db_v = db_cert.name or ""
    edge_v = edge_data.get("name", edge_data.get("id", "")) or ""
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "name", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # sni (DB 逗号分隔字符串 ↔ Edge sni/snis，归一化后对比)
    db_v = normalize_sni_csv(db_cert.sni or "")
    edge_v = normalize_edge_sni(edge_data)
    equal = db_v == edge_v
    fields.append({"name": "sni", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # cert_type → type
    ct_default = rules.get_field_default("ssl_certificate", "cert_type") or ""
    db_v = db_cert.cert_type or ct_default
    edge_v = edge_data.get("type", ct_default) or ""
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "cert_type", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # cert
    db_v = db_cert.cert or ""
    edge_v = edge_data.get("cert", "") or ""
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "cert", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # private_key → key
    db_v = db_cert.private_key or ""
    edge_v = edge_data.get("key", "") or ""
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "private_key", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # status
    s_default = rules.get_field_default("ssl_certificate", "status")
    db_v = db_cert.status if db_cert.status is not None else s_default
    edge_v = edge_data.get("status", s_default)
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "status", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # gm
    db_v = db_cert.gm or False
    edge_v = edge_data.get("gm", False)
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "gm", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # sign_cert ↔ Edge certs
    db_v = db_cert.sign_cert or ""
    edge_v = (edge_data.get("certs") or [None])[0] or ""
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "sign_cert", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # sign_key ↔ Edge keys
    db_v = db_cert.sign_key or ""
    edge_v = (edge_data.get("keys") or [None])[0] or ""
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "sign_key", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # mTLS client_ca ↔ Edge client.ca
    edge_client = edge_data.get("client") or {}
    db_v = db_cert.client_ca or ""
    edge_v = edge_client.get("ca", "") or ""
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "client_ca", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    # client_depth ↔ Edge client.depth
    db_v = db_cert.client_depth
    edge_v = edge_client.get("depth")
    equal = str(db_v or "") == str(edge_v or "")
    fields.append({"name": "client_depth", "db": str(db_v or ""), "edge": str(edge_v or ""), "status": "equal" if equal else "diff"})

    # skip_mtls_uri_regex ↔ Edge client.skip_mtls_uri_regex
    db_v = db_cert.skip_mtls_uri_regex or ""
    edge_v = edge_client.get("skip_mtls_uri_regex", "") or ""
    equal = str(db_v) == str(edge_v)
    fields.append({"name": "skip_mtls_uri_regex", "db": str(db_v), "edge": str(edge_v), "status": "equal" if equal else "diff"})

    return {"name": db_cert.name, "id": db_cert.edge_uuid, "status": "mismatch" if any(f["status"] == "diff" for f in fields) else "match", "fields": fields}


def find_only_in_edge(edge_dict: dict, db_items: list) -> list[dict]:
    """找出仅在 Edge 上存在、DB 中没有的项。

    身份键固定为 ``edge_uuid``，缺失该属性的模型回退 ``plugin_name``
    （PluginMetadata 只有 plugin_name）；原先的 ``id_attr`` 形参从未被函数体
    使用，属误导性空参数，2026-09-16 静态分析后移除。
    """
    db_ids = {getattr(d, "edge_uuid", getattr(d, "plugin_name", "")) for d in db_items}
    result = []
    for eid, edata in edge_dict.items():
        if eid and eid not in db_ids:
            # stream proxy 没有 uri，用 server_port 作为后备显示名
            name = edata.get("name") or (str(edata.get("server_port", eid)) if "server_port" in edata else edata.get("uri", eid))
            result.append({"name": name, "id": eid, "status": "only_in_edge", "fields": []})
    return result


def new_summary() -> dict:
    """空汇总计数器（与端点响应 summary 形状一致）。"""
    return {"total": 0, "match": 0, "mismatch": 0, "only_in_db": 0, "only_in_edge": 0, "expected_only_in_db": 0}


def add_group(groups: list, summary: dict, label: str, type_name: str, items: list) -> None:
    """追加一个资源分组并把各条目 status 计入 summary（原位修改两个入参）。"""
    groups.append({"type": type_name, "label": label, "items": items or []})
    for it in items or []:
        s = it["status"]
        summary["total"] += 1
        if s in summary:
            summary[s] += 1


def build_diff_groups(
    rules: EquivalenceRules,
    *,
    db_upstreams: list,
    edge_upstreams: dict,
    upstream_targets: dict[int, dict[str, int]],
    db_routes: list,
    edge_routes: dict,
    route_plugins: dict[int, dict[str, Any]],
    db_plugin_configs: list,
    edge_plugin_configs: dict,
    db_global_rules: list,
    edge_global_rules: dict,
    db_plugin_metadatas: list,
    edge_plugin_metadatas: dict,
    db_stream_proxies: list,
    edge_stream_proxies: dict,
    db_ssl_certificates: list,
    edge_ssl_certificates: dict,
) -> tuple[list, dict]:
    """逐资源对比并构建分组与汇总（端点响应的 groups/summary 部分）。"""
    groups: list = []
    summary = new_summary()

    # 上游
    upstream_items = [compare_upstream(u, edge_upstreams.get(u.edge_uuid), rules, upstream_targets.get(u.id)) for u in db_upstreams]
    upstream_items += find_only_in_edge(edge_upstreams, db_upstreams)
    add_group(groups, summary, "上游服务", "upstreams", upstream_items)

    # 路由
    route_items = [compare_route(r, edge_routes.get(r.edge_uuid), rules, route_plugins) for r in db_routes]
    route_items += find_only_in_edge(edge_routes, db_routes)
    add_group(groups, summary, "路由规则", "routes", route_items)

    # 插件组
    pc_items = [compare_plugin_config(p, edge_plugin_configs.get(p.edge_uuid), rules) for p in db_plugin_configs]
    pc_items += find_only_in_edge(edge_plugin_configs, db_plugin_configs)
    add_group(groups, summary, "插件组", "plugin_configs", pc_items)

    # 全局规则
    gr_items = [compare_global_rule(g, edge_global_rules.get(g.edge_uuid), rules) for g in db_global_rules]
    gr_items += find_only_in_edge(edge_global_rules, db_global_rules)
    add_group(groups, summary, "全局规则", "global_rules", gr_items)

    # 插件元数据
    pm_items = [compare_plugin_metadata(p, edge_plugin_metadatas.get(p.plugin_name), rules) for p in db_plugin_metadatas]
    pm_items += find_only_in_edge(edge_plugin_metadatas, db_plugin_metadatas)
    add_group(groups, summary, "插件元数据", "plugin_metadata", pm_items)

    # 四层代理
    sp_items = [compare_stream_proxy(sp, edge_stream_proxies.get(sp.edge_uuid), rules) for sp in db_stream_proxies]
    sp_items += find_only_in_edge(edge_stream_proxies, db_stream_proxies)
    add_group(groups, summary, "四层代理", "stream_proxies", sp_items)

    # SSL 证书
    ssl_items = [compare_ssl_certificate(c, edge_ssl_certificates.get(c.edge_uuid), rules) for c in db_ssl_certificates]
    ssl_items += find_only_in_edge(edge_ssl_certificates, db_ssl_certificates)
    add_group(groups, summary, "SSL 证书", "ssl_certificates", ssl_items)

    return groups, summary
