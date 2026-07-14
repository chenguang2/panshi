"""
Edge Data Import Service

Handles importing upstreams, routes, plugin configs, and global rules
from an PANSHI Edge node into the panshi admin database.
"""

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

from sqlalchemy import select

from app.services.edge_client import EdgeClient, EdgeConnectionError, EdgeAPIError
from app.models.cluster import (
    Cluster,
    Upstream,
    UpstreamTarget,
    Route,
    RoutePlugin,
    PluginConfig,
    GlobalRule,
    PluginMetadata,
    ConfigVersion,
    Node,
    StreamProxy,
)
from app.models.edge_import import ImportLog
from app.models.ssl import SslCertificate


def _load_builtin_names() -> set:
    global _BUILTIN_PLUGIN_NAMES
    if _BUILTIN_PLUGIN_NAMES is None:
        from app.config.plugin_definitions import BUILTIN_PLUGINS

        _BUILTIN_PLUGIN_NAMES = set(p["name"] for p in BUILTIN_PLUGINS)
    return _BUILTIN_PLUGIN_NAMES


_BUILTIN_PLUGIN_NAMES: Optional[set] = None


class EdgeImportService:

    _UPSTREAM_TYPE_MAP = {
        "roundrobin": "weighted_roundrobin",
        "chash": "chash",
        "least_conn": "least_conn",
        "ewma": "ewma",
    }

    def __init__(
        self,
        cluster_id: int,
        node_id: int,
        db_session: Any,
        ip: str,
        port: int,
        edge_path: str,
        client: EdgeClient,
    ):
        self.cluster_id = cluster_id
        self.node_id = node_id
        self.db_session = db_session
        self.ip = ip
        self.port = port
        self.edge_path = edge_path
        self.client = client

    @classmethod
    async def create(
        cls,
        cluster_id: int,
        node_id: int,
        db_session: Any,
        admin_key: str | None = None,
    ) -> "EdgeImportService":
        node_row = (
            await db_session.execute(
                select(
                    Node.ip,
                    Node.management_port,
                    Node.edge_path,
                ).where(
                    Node.id == node_id,
                    Node.cluster_id == cluster_id,
                )
            )
        ).first()

        if not node_row:
            raise ValueError(
                f"Node id={node_id} not found in cluster {cluster_id}"
            )

        ip, port, edge_path = node_row.tuple()

        if not admin_key:
            cluster_row = (
                await db_session.execute(
                    select(Cluster.admin_key).where(Cluster.id == cluster_id)
                )
            ).first()

            if cluster_row is not None and cluster_row[0] is not None:
                admin_key = cluster_row[0]
            if not admin_key:
                admin_key = os.getenv("EDGE_ADMIN_KEY", "f9357106bff442f89d4de7169c37c61e")

        client = EdgeClient(
            cluster_id=cluster_id,
            node_ip=ip,
            node_port=port,
        )
        client.api_key = admin_key

        return cls(cluster_id, node_id, db_session, ip, port, edge_path, client)

    def _count_list(self, items: list | None) -> int:
        return len(items) if isinstance(items, list) else 0

    def test_connection(self) -> dict:
        import time
        try:
            start = time.time()
            routes_data = self.client.list_routes()
            route_count = self._count_list(routes_data)

            raw_upstreams = self.client.list_upstreams()
            upstream_nodes = self._parse_resource_list(raw_upstreams)
            upstream_list = self._unwrap_panshi_items(upstream_nodes)
            upstream_count = len(upstream_list)

            try:
                plugins_list = self.client.list_available_plugins()
                plugin_count = self._count_list(plugins_list)
            except Exception:
                plugin_count = 0

            try:
                pc_data = self.client.list_plugin_configs()
                plugin_config_count = self._count_list(pc_data)
            except Exception:
                plugin_config_count = 0

            try:
                gr_data = self.client.list_global_rules()
                global_rule_count = self._count_list(gr_data)
            except Exception:
                global_rule_count = 0

            try:
                pm_data = self.client.list_plugin_metadata()
                plugin_metadata_count = self._count_list(pm_data)
            except Exception:
                plugin_metadata_count = 0

            try:
                sp_data = self.client.list_stream_routes()
                sp_list = self._unwrap_panshi_items(sp_data)
                stream_proxy_count = len(sp_list)
            except Exception:
                stream_proxy_count = 0

            version = "unknown"
            try:
                raw = self.client._request("GET", "/edge/server_info")
                if isinstance(raw, dict):
                    version = raw.get("version", "unknown")
            except Exception:
                pass

            elapsed = int((time.time() - start) * 1000)

            return {
                "success": True,
                "version": str(version),
                "plugin_count": plugin_count,
                "route_count": route_count,
                "upstream_count": upstream_count,
                "plugin_config_count": plugin_config_count,
                "global_rule_count": global_rule_count,
                "plugin_metadata_count": plugin_metadata_count,
                "stream_proxy_count": stream_proxy_count,
                "node": f"{self.ip}:{self.port}",
                "response_time_ms": elapsed,
            }
        except Exception as e:
            return {"success": False, "message": str(e)}

    @staticmethod
    def _unwrap_panshi_items(items: list) -> list:
        result = []
        for item in items:
            if isinstance(item, dict):
                if "value" in item:
                    result.append(item["value"])
                else:
                    result.append(item)
            elif isinstance(item, list):
                result.extend(
                    sub.get("value", sub) if isinstance(sub, dict) else sub
                    for sub in item
                )
        return result

    @staticmethod
    def _parse_resource_list(raw_response: Any) -> list:
        if isinstance(raw_response, list):
            return raw_response
        if not isinstance(raw_response, dict):
            return []
        nodes = raw_response.get("node", {})
        if isinstance(nodes, dict) and nodes.get("dir"):
            items = nodes.get("nodes", [])
            if isinstance(items, dict):
                return [items] if items else []
            return items if isinstance(items, list) else []
        if "list" in raw_response:
            items = raw_response["list"]
            return items if isinstance(items, list) else []
        if "nodes" in raw_response:
            items = raw_response["nodes"]
            return items if isinstance(items, list) else []
        return []

    def fetch_edge_data(self) -> dict:
        upstreams: list = []
        routes: list = []
        plugin_configs: list = []
        global_rules: list = []
        plugin_metadata: list = []
        ssl_certificates: list = []
        stream_proxies: list = []
        warnings: list[str] = []

        try:
            raw_upstreams = self.client.list_upstreams()
            upstreams = self._unwrap_panshi_items(
                self._parse_resource_list(raw_upstreams)
            )
        except Exception as e:
            logger.warning("fetch_edge_data: upstreams failed — %s", e)
            warnings.append(f"上游获取失败: {e}")

        try:
            raw_routes = self.client.list_routes()
            if isinstance(raw_routes, list):
                routes = self._unwrap_panshi_items(raw_routes)
        except Exception as e:
            logger.warning("fetch_edge_data: routes failed — %s", e)
            warnings.append(f"路由获取失败: {e}")

        try:
            raw_pc = self.client.list_plugin_configs()
            plugin_configs = self._parse_resource_list(raw_pc)
        except Exception as e:
            logger.warning("fetch_edge_data: plugin_configs failed — %s", e)
            warnings.append(f"插件组获取失败: {e}")

        try:
            raw_gr = self.client.list_global_rules()
            global_rules = self._parse_resource_list(raw_gr)
        except Exception as e:
            logger.warning("fetch_edge_data: global_rules failed — %s", e)
            warnings.append(f"全局规则获取失败: {e}")

        try:
            raw_pm = self.client.list_plugin_metadata()
            plugin_metadata = self._parse_resource_list(raw_pm)
        except Exception as e:
            logger.warning("fetch_edge_data: plugin_metadata failed — %s", e)
            warnings.append(f"插件元数据获取失败: {e}")

        try:
            raw_ssl = self.client._request("GET", "/edge/admin/ssl")
            ssl_certificates = self._parse_resource_list(raw_ssl)
        except Exception as e:
            logger.warning("fetch_edge_data: ssl failed — %s", e)
            warnings.append(f"SSL 证书获取失败: {e}")

        try:
            raw_sp = self.client.list_stream_routes()
            if isinstance(raw_sp, list):
                stream_proxies = self._unwrap_panshi_items(raw_sp)
        except Exception as e:
            logger.warning("fetch_edge_data: stream_routes failed — %s", e)
            warnings.append(f"四层代理获取失败: {e}")

        return {
            "upstreams": upstreams,
            "routes": routes,
            "plugin_configs": plugin_configs,
            "global_rules": global_rules,
            "plugin_metadata": plugin_metadata,
            "ssl_certificates": ssl_certificates,
            "stream_proxies": stream_proxies,
            "warnings": warnings,
        }

    def classify_plugins(self, plugins_dict: dict) -> dict:
        known: list[dict] = []
        unknown: list[dict] = []
        unknown_names: list[str] = []

        for name, config in plugins_dict.items():
            is_known = name in _load_builtin_names()
            entry = {"name": name, "config": config, "is_known": is_known}
            if is_known:
                known.append(entry)
            else:
                unknown.append(entry)
                unknown_names.append(name)

        return {
            "known": known,
            "unknown": unknown,
            "known_count": len(known),
            "unknown_count": len(unknown),
            "unknown_names": unknown_names,
        }

    @staticmethod
    def _ensure_json(value: Any) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False)

    def convert_upstream(self, edge_upstream: dict) -> dict:
        edge_nodes = edge_upstream.get("nodes") or {}

        upstream_data = {
            "name": edge_upstream.get("name") or edge_upstream.get("id", ""),
            "edge_uuid": edge_upstream.get("id", ""),
            "cluster_id": self.cluster_id,
            "load_balance": self._UPSTREAM_TYPE_MAP.get(
                edge_upstream.get("type", "roundrobin"), "weighted_roundrobin"
            ),
            "description": edge_upstream.get("desc"),
            "hash_on": edge_upstream.get("hash_on"),
            "key": edge_upstream.get("key"),
            "checks": self._ensure_json(edge_upstream.get("checks")),
            "retries": edge_upstream.get("retries"),
            "retry_timeout": edge_upstream.get("retry_timeout"),
            "timeout": self._ensure_json(edge_upstream.get("timeout")),
            "pass_host": edge_upstream.get("pass_host", "pass"),
            "upstream_host": edge_upstream.get("upstream_host"),
            "scheme": edge_upstream.get("scheme", "http"),
            "keepalive_pool": self._ensure_json(edge_upstream.get("keepalive_pool")),
            "current_version": None,
        }

        targets_data: list[dict] = []
        if isinstance(edge_nodes, dict):
            for host_port, weight in edge_nodes.items():
                targets_data.append({
                    "target": host_port,
                    "weight": weight if isinstance(weight, int) else 1,
                })

        return {"upstream": upstream_data, "targets": targets_data}

    _STREAM_PROXY_TYPE_MAP = {
        "roundrobin": "weighted_roundrobin",
        "chash": "chash",
        "least_conn": "least_conn",
        "ewma": "ewma",
    }

    def convert_stream_proxy(self, edge_stream: dict) -> dict:
        edge_nodes = (edge_stream.get("upstream") or {}).get("nodes") or {}

        targets_data: list[dict] = []
        if isinstance(edge_nodes, dict):
            for host_port, weight in edge_nodes.items():
                targets_data.append({
                    "target": host_port,
                    "weight": weight if isinstance(weight, int) else 1,
                })

        timeout_raw = (edge_stream.get("upstream") or {}).get("timeout")
        keepalive_raw = (edge_stream.get("upstream") or {}).get("keepalive_pool")

        proxy_data = {
            "name": edge_stream.get("name") or edge_stream.get("id", ""),
            "edge_uuid": edge_stream.get("id", ""),
            "cluster_id": self.cluster_id,
            "listen_port": edge_stream.get("server_port", 0),
            "load_balance": self._STREAM_PROXY_TYPE_MAP.get(
                (edge_stream.get("upstream") or {}).get("type", "roundrobin"), "weighted_roundrobin"
            ),
            "scheme": (edge_stream.get("upstream") or {}).get("scheme", "tcp"),
            "description": edge_stream.get("desc"),
            "remote_addr": edge_stream.get("remote_addr"),
            "sni": edge_stream.get("sni"),
            "targets": self._ensure_json(targets_data) if targets_data else None,
            "timeout": self._ensure_json(timeout_raw) if timeout_raw and isinstance(timeout_raw, dict) else None,
            "keepalive_pool": self._ensure_json(keepalive_raw) if keepalive_raw and isinstance(keepalive_raw, dict) else None,
            "current_version": None,
        }

        return {
            "stream_proxy": proxy_data,
            "targets": targets_data,
            "timeout": timeout_raw if isinstance(timeout_raw, dict) else None,
            "keepalive_pool": keepalive_raw if isinstance(keepalive_raw, dict) else None,
        }

    def convert_route(self, edge_route: dict, upstream_uuid_map: dict) -> dict:
        methods = edge_route.get("methods", [])
        if isinstance(methods, list):
            methods_str = ",".join(methods) or None
        elif isinstance(methods, str):
            methods_str = methods or None
        else:
            methods_str = None

        hosts = edge_route.get("hosts", [])
        if isinstance(hosts, list):
            hosts_str = ",".join(hosts) or None
        elif isinstance(hosts, str):
            hosts_str = hosts or None
        else:
            hosts_str = None

        edge_upstream_id = edge_route.get("upstream_id")
        panshi_upstream_id = (
            upstream_uuid_map.get(edge_upstream_id) if edge_upstream_id else None
        )

        uri = edge_route.get("uri")
        uris = edge_route.get("uris")
        if not uri and isinstance(uris, list) and len(uris) > 0:
            uri = uris[0]

        edge_plugin_config_single = edge_route.get("plugin_config_id")
        edge_plugin_config_list = edge_route.get("plugin_config_ids")
        plugin_config_ids = None
        if edge_plugin_config_list and isinstance(edge_plugin_config_list, list):
            plugin_config_ids = json.dumps(edge_plugin_config_list, ensure_ascii=False)
        elif edge_plugin_config_single:
            plugin_config_ids = json.dumps([edge_plugin_config_single], ensure_ascii=False)

        remote_addrs = edge_route.get("remote_addrs", [])
        if isinstance(remote_addrs, list):
            remote_addrs_str = ",".join(remote_addrs) or None
        elif isinstance(remote_addrs, str):
            remote_addrs_str = remote_addrs or None
        else:
            remote_addrs_str = None

        edge_vars = edge_route.get("vars")
        vars_json = json.dumps(edge_vars, ensure_ascii=False) if edge_vars else None
        advanced_enabled = 1 if (edge_vars and isinstance(edge_vars, list) and len(edge_vars) > 0) else 0

        route_data = {
            "name": edge_route.get("name", ""),
            "edge_uuid": edge_route.get("id", ""),
            "cluster_id": self.cluster_id,
            "upstream_id": panshi_upstream_id,
            "uri": uri or "",
            "methods": methods_str,
            "hosts": hosts_str,
            "remote_addrs": remote_addrs_str,
            "vars": vars_json,
            "advanced_match_enabled": advanced_enabled,
            "priority": edge_route.get("priority", 0),
            "status": edge_route.get("status", 1),
            "description": edge_route.get("desc"),
            "current_version": None,
            "plugin_config_ids": plugin_config_ids,
        }

        edge_plugins = edge_route.get("plugins") or {}
        plugins_data: list[dict] = []
        plugin_summary = self.classify_plugins(edge_plugins)

        for p in plugin_summary["known"] + plugin_summary["unknown"]:
            plugins_data.append({
                "plugin_name": p["name"],
                "config": self._ensure_json(p["config"]),
            })

        return {
            "route": route_data,
            "plugins": plugins_data,
            "plugin_summary": plugin_summary,
        }

    def convert_plugin_config(self, edge_pc: dict) -> dict:
        raw_value = edge_pc.get("value", edge_pc) if isinstance(edge_pc, dict) else edge_pc
        raw_key = edge_pc.get("key", "") if isinstance(edge_pc, dict) else ""
        pc_id = raw_value.get("id") if isinstance(raw_value, dict) else None
        if not pc_id:
            pc_id = raw_key.rsplit("/", 1)[-1] if raw_key else ""
        edge_plugins = raw_value.get("plugins") if isinstance(raw_value, dict) else {}
        plugin_summary = self.classify_plugins(edge_plugins)

        return {
            "plugin_config": {
                "edge_uuid": pc_id,
                "cluster_id": self.cluster_id,
                "name": (raw_value.get("name") if isinstance(raw_value, dict) else None) or pc_id,
                "description": raw_value.get("desc") if isinstance(raw_value, dict) else None,
                "plugins": self._ensure_json(edge_plugins),
                "current_version": None,
            },
            "plugin_summary": plugin_summary,
        }

    def convert_global_rule(self, edge_gr: dict) -> dict:
        raw_value = edge_gr.get("value", edge_gr) if isinstance(edge_gr, dict) else edge_gr
        raw_key = edge_gr.get("key", "") if isinstance(edge_gr, dict) else ""
        gr_id = raw_value.get("id") if isinstance(raw_value, dict) else None
        if not gr_id:
            gr_id = raw_key.rsplit("/", 1)[-1] if raw_key else ""
        edge_plugins = raw_value.get("plugins") if isinstance(raw_value, dict) else {}
        plugin_summary = self.classify_plugins(edge_plugins)

        return {
            "global_rule": {
                "edge_uuid": gr_id,
                "cluster_id": self.cluster_id,
                "name": gr_id,
                "description": raw_value.get("desc") if isinstance(raw_value, dict) else None,
                "plugins": self._ensure_json(edge_plugins),
                "current_version": None,
            },
            "plugin_summary": plugin_summary,
        }

    def convert_plugin_metadata(self, edge_pm: dict) -> dict:
        value = edge_pm.get("value", edge_pm) if isinstance(edge_pm, dict) else edge_pm
        raw_data = value if isinstance(value, dict) else {}
        key = edge_pm.get("key", "") if isinstance(edge_pm, dict) else ""
        plugin_name = key.rsplit("/", 1)[-1] if key else raw_data.get("id", "")
        return {
            "plugin_metadata": {
                "plugin_name": plugin_name,
                "cluster_id": self.cluster_id,
                "config_data": self._ensure_json(raw_data),
                "current_version": None,
            },
            "raw_plugins": raw_data,
        }

    def convert_ssl_certificate(self, edge_ssl: dict) -> dict:
        value = edge_ssl.get("value", edge_ssl) if isinstance(edge_ssl, dict) else edge_ssl
        raw_data = value if isinstance(value, dict) else {}
        key = edge_ssl.get("key", "") if isinstance(edge_ssl, dict) else ""
        ssl_id = key.rsplit("/", 1)[-1] if key else raw_data.get("id", "")
        snis = raw_data.get("snis", [])
        sni_str = ", ".join(snis) if isinstance(snis, list) else str(snis) if snis else ""

        ssl_protocols = None
        sp = raw_data.get("ssl_protocols")
        if sp:
            import json as _json
            ssl_protocols = _json.dumps(sp) if isinstance(sp, list) else str(sp)

        return {
            "ssl_certificate": {
                "edge_uuid": ssl_id,
                "cluster_id": self.cluster_id,
                "name": ssl_id,
                "sni": sni_str,
                "cert": raw_data.get("cert", ""),
                "private_key": raw_data.get("key", ""),
                "cert_type": raw_data.get("type", "server"),
                "ssl_protocols": ssl_protocols,
                "status": raw_data.get("status", 1),
                "current_version": None,
            },
        }

    async def detect_conflicts(self, preview_data: dict) -> list[dict]:
        conflicts: list[dict] = []
        db = self.db_session

        upstream_uuids = [
            u["upstream"]["edge_uuid"]
            for u in preview_data.get("converted_upstreams", [])
        ]
        if upstream_uuids:
            result = await db.execute(
                select(Upstream.edge_uuid).where(
                    Upstream.cluster_id == self.cluster_id,
                    Upstream.edge_uuid.in_(upstream_uuids),
                )
            )
            existing_uuids = set(row[0] for row in result.all())
            for u in preview_data.get("converted_upstreams", []):
                euuid = u["upstream"]["edge_uuid"]
                if euuid in existing_uuids:
                    conflicts.append({
                        "type": "uuid_conflict",
                        "resource_type": "upstream",
                        "resource_name": u["upstream"]["name"],
                        "reason": f"上游 '{u['upstream']['name']}' (uuid: {euuid}) 已存在于数据库中",
                        "resolution": "将跳过该记录",
                    })

        route_uuids = [
            r["route"]["edge_uuid"]
            for r in preview_data.get("converted_routes", [])
        ]
        if route_uuids:
            result = await db.execute(
                select(Route.edge_uuid).where(
                    Route.cluster_id == self.cluster_id,
                    Route.edge_uuid.in_(route_uuids),
                )
            )
            existing_uuids = set(row[0] for row in result.all())
            for r in preview_data.get("converted_routes", []):
                euuid = r["route"]["edge_uuid"]
                if euuid in existing_uuids:
                    conflicts.append({
                        "type": "uuid_conflict",
                        "resource_type": "route",
                        "resource_name": r["route"]["name"],
                        "reason": f"路由 '{r['route']['name']}' (uuid: {euuid}) 已存在于数据库中",
                        "resolution": "将跳过该路由",
                    })

        pc_uuids = [
            pc["plugin_config"]["edge_uuid"]
            for pc in preview_data.get("converted_plugin_configs", [])
        ]
        if pc_uuids:
            result = await db.execute(
                select(PluginConfig.edge_uuid).where(
                    PluginConfig.cluster_id == self.cluster_id,
                    PluginConfig.edge_uuid.in_(pc_uuids),
                )
            )
            existing_uuids = set(row[0] for row in result.all())
            for pc in preview_data.get("converted_plugin_configs", []):
                euuid = pc["plugin_config"]["edge_uuid"]
                if euuid in existing_uuids:
                    conflicts.append({
                        "type": "uuid_conflict",
                        "resource_type": "plugin_config",
                        "resource_name": pc["plugin_config"]["name"],
                        "reason": f"插件组 '{pc['plugin_config']['name']}' (uuid: {euuid}) 已存在于数据库中",
                        "resolution": "将跳过该记录",
                    })

        gr_uuids = [
            gr["global_rule"]["edge_uuid"]
            for gr in preview_data.get("converted_global_rules", [])
        ]
        if gr_uuids:
            result = await db.execute(
                select(GlobalRule.edge_uuid).where(
                    GlobalRule.cluster_id == self.cluster_id,
                    GlobalRule.edge_uuid.in_(gr_uuids),
                )
            )
            existing_uuids = set(row[0] for row in result.all())
            for gr in preview_data.get("converted_global_rules", []):
                euuid = gr["global_rule"]["edge_uuid"]
                if euuid in existing_uuids:
                    conflicts.append({
                        "type": "uuid_conflict",
                        "resource_type": "global_rule",
                        "resource_name": gr["global_rule"]["name"],
                        "reason": f"全局规则 '{gr['global_rule']['name']}' (uuid: {euuid}) 已存在于数据库中",
                        "resolution": "将跳过该记录",
                    })

        pm_names = [
            pm["plugin_metadata"]["plugin_name"]
            for pm in preview_data.get("converted_plugin_metadata", [])
        ]
        if pm_names:
            result = await db.execute(
                select(PluginMetadata.plugin_name).where(
                    PluginMetadata.cluster_id == self.cluster_id,
                    PluginMetadata.plugin_name.in_(pm_names),
                )
            )
            existing_pm_names = set(row[0] for row in result.all())
            for pm in preview_data.get("converted_plugin_metadata", []):
                pname = pm["plugin_metadata"]["plugin_name"]
                if pname in existing_pm_names:
                    conflicts.append({
                        "type": "uuid_conflict",
                        "resource_type": "plugin_metadata",
                        "resource_name": pname,
                        "reason": f"插件元数据 '{pname}' 已存在于数据库中",
                        "resolution": "将跳过该记录",
                    })

        sp_ports = [
            sp["stream_proxy"]["listen_port"]
            for sp in preview_data.get("converted_stream_proxies", [])
        ]
        if sp_ports:
            result = await db.execute(
                select(StreamProxy.listen_port).where(
                    StreamProxy.cluster_id == self.cluster_id,
                    StreamProxy.listen_port.in_(sp_ports),
                )
            )
            existing_ports = set(row[0] for row in result.all())
            for sp in preview_data.get("converted_stream_proxies", []):
                port = sp["stream_proxy"]["listen_port"]
                if port in existing_ports:
                    conflicts.append({
                        "type": "uuid_conflict",
                        "resource_type": "stream_proxy",
                        "resource_name": sp["stream_proxy"]["name"],
                        "reason": f"四层代理 '{sp['stream_proxy']['name']}' (端口: {port}) 已存在于数据库中",
                        "resolution": "将跳过该记录",
                    })

        ssl_uuids = [
            sc["ssl_certificate"]["edge_uuid"]
            for sc in preview_data.get("converted_ssl_certificates", [])
        ]
        if ssl_uuids:
            result = await db.execute(
                select(SslCertificate.edge_uuid).where(
                    SslCertificate.cluster_id == self.cluster_id,
                    SslCertificate.edge_uuid.in_(ssl_uuids),
                )
            )
            existing_ssl_uuids = set(row[0] for row in result.all())
            for sc in preview_data.get("converted_ssl_certificates", []):
                euuid = sc["ssl_certificate"]["edge_uuid"]
                if euuid in existing_ssl_uuids:
                    conflicts.append({
                        "type": "uuid_conflict",
                        "resource_type": "ssl_certificate",
                        "resource_name": sc["ssl_certificate"]["name"],
                        "reason": f"SSL 证书 '{sc['ssl_certificate']['name']}' (uuid: {euuid}) 已存在于数据库中",
                        "resolution": "将跳过该记录",
                    })

        return conflicts

    async def preview_import(self) -> dict:
        edge_data = self.fetch_edge_data()

        converted_upstreams = [
            self.convert_upstream(eu)
            for eu in edge_data.get("upstreams", [])
        ]

        converted_routes = [
            self.convert_route(er, {})
            for er in edge_data.get("routes", [])
        ]

        converted_plugin_configs = [
            self.convert_plugin_config(epc)
            for epc in edge_data.get("plugin_configs", [])
        ]

        converted_global_rules = [
            self.convert_global_rule(egr)
            for egr in edge_data.get("global_rules", [])
        ]

        converted_plugin_metadata = [
            self.convert_plugin_metadata(epm)
            for epm in edge_data.get("plugin_metadata", [])
        ]

        converted_stream_proxies = [
            self.convert_stream_proxy(esp)
            for esp in edge_data.get("stream_proxies", [])
        ]

        converted_ssl_certificates = [
            self.convert_ssl_certificate(esc)
            for esc in edge_data.get("ssl_certificates", [])
        ]

        preview_data = {
            "converted_upstreams": converted_upstreams,
            "converted_routes": converted_routes,
            "converted_plugin_configs": converted_plugin_configs,
            "converted_global_rules": converted_global_rules,
            "converted_plugin_metadata": converted_plugin_metadata,
            "converted_stream_proxies": converted_stream_proxies,
            "converted_ssl_certificates": converted_ssl_certificates,
        }

        conflicts = await self.detect_conflicts(preview_data)

        all_known_count = 0
        all_unknown_names: set = set()
        all_unknown_count = 0

        for groups in [
            [cr.get("plugin_summary", {}) for cr in converted_routes],
            [cp.get("plugin_summary", {}) for cp in converted_plugin_configs],
            [cg.get("plugin_summary", {}) for cg in converted_global_rules],
        ]:
            for s in groups:
                all_known_count += s.get("known_count", 0)
                all_unknown_count += s.get("unknown_count", 0)
                for name in s.get("unknown_names", []):
                    all_unknown_names.add(name)

        plugin_summary = {
            "known_count": all_known_count,
            "unknown_count": all_unknown_count,
            "unknown_plugin_names": sorted(all_unknown_names),
        }

        upstreams_preview = []
        for cu in converted_upstreams:
            u = cu["upstream"]
            eu = next(
                (e for e in edge_data.get("upstreams", []) if e.get("id") == u["edge_uuid"]),
                None,
            )
            if eu:
                upstreams_preview.append({
                    "name": u["name"],
                    "type": eu.get("type", "roundrobin"),
                    "nodes": eu.get("nodes"),
                    "hash_on": u.get("hash_on"),
                    "key": u.get("key"),
                    "pass_host": u.get("pass_host"),
                    "scheme": u.get("scheme"),
                    "retries": u.get("retries"),
                    "timeout": eu.get("timeout"),
                    "checks": eu.get("checks"),
                    "keepalive_pool": eu.get("keepalive_pool"),
                    "edge_uuid": u["edge_uuid"],
                })

        routes_preview = []
        for cr in converted_routes:
            r = cr["route"]
            er = next(
                (e for e in edge_data.get("routes", []) if e.get("id") == r["edge_uuid"]),
                None,
            )
            plugins_preview_list = []
            if er:
                edge_plugins = er.get("plugins") or {}
                for pname, pconfig in edge_plugins.items():
                    plugins_preview_list.append({
                        "name": pname,
                        "config": pconfig,
                        "is_known": pname in _load_builtin_names(),
                    })
            routes_preview.append({
                "name": r["name"],
                "uri": r.get("uri"),
                "uris": er.get("uris") if er else None,
                "methods": er.get("methods") if er else None,
                "hosts": er.get("hosts") if er else None,
                "remote_addrs": er.get("remote_addrs") if er else None,
                "vars": er.get("vars") if er else None,
                "priority": r.get("priority", 0),
                "upstream_id": er.get("upstream_id") if er else None,
                "plugins": plugins_preview_list if plugins_preview_list else None,
                "plugin_config_id": er.get("plugin_config_id") if er else None,
                "status": r.get("status", 1),
                "edge_uuid": r["edge_uuid"],
            })

        pc_preview = []
        for cp in converted_plugin_configs:
            pc = cp["plugin_config"]
            epc = next(
                (e for e in edge_data.get("plugin_configs", []) if e.get("id") == pc["edge_uuid"]),
                None,
            )
            plugins_preview_list = []
            if epc:
                edge_plugins = epc.get("plugins") or {}
                for pname, pconfig in edge_plugins.items():
                    plugins_preview_list.append({
                        "name": pname,
                        "config": pconfig,
                        "is_known": pname in _load_builtin_names(),
                    })
            pc_preview.append({
                "name": pc["name"],
                "description": pc.get("description"),
                "plugins": plugins_preview_list if plugins_preview_list else None,
                "edge_uuid": pc["edge_uuid"],
            })

        gr_preview = []
        for cg in converted_global_rules:
            gr = cg["global_rule"]
            egr = next(
                (e for e in edge_data.get("global_rules", []) if e.get("id") == gr["edge_uuid"]),
                None,
            )
            plugins_preview_list = []
            if egr:
                edge_plugins = egr.get("plugins") or {}
                for pname, pconfig in edge_plugins.items():
                    plugins_preview_list.append({
                        "name": pname,
                        "config": pconfig,
                        "is_known": pname in _load_builtin_names(),
                    })
            gr_preview.append({
                "name": gr["name"],
                "description": gr.get("description"),
                "plugins": plugins_preview_list if plugins_preview_list else None,
                "edge_uuid": gr["edge_uuid"],
            })

        pm_preview = [
            {"plugin_name": pm["plugin_metadata"]["plugin_name"], "config_data": pm.get("raw_plugins", {})}
            for pm in converted_plugin_metadata
        ]

        ssl_preview = [
            {"name": sc["ssl_certificate"]["name"], "sni": sc["ssl_certificate"]["sni"], "cert_type": sc["ssl_certificate"]["cert_type"], "edge_uuid": sc["ssl_certificate"]["edge_uuid"]}
            for sc in converted_ssl_certificates
        ]

        sp_preview = []
        for csp in converted_stream_proxies:
            sp = csp["stream_proxy"]
            sp_preview.append({
                "name": sp["name"],
                "listen_port": sp["listen_port"],
                "load_balance": sp["load_balance"],
                "scheme": sp["scheme"],
                "targets": csp.get("targets"),
                "timeout": csp.get("timeout"),
                "keepalive_pool": csp.get("keepalive_pool"),
                "remote_addr": sp.get("remote_addr"),
                "sni": sp.get("sni"),
                "edge_uuid": sp["edge_uuid"],
            })

        return {
            "upstreams": upstreams_preview,
            "routes": routes_preview,
            "plugin_configs": pc_preview,
            "global_rules": gr_preview,
            "plugin_metadata": pm_preview,
            "ssl_certificates": ssl_preview,
            "stream_proxies": sp_preview,
            "conflicts": conflicts,
            "plugin_summary": plugin_summary,
            "warnings": edge_data.get("warnings", []),
        }

    async def execute_import(
        self,
        selections: Any,
        session: Any,
    ) -> dict:
        try:
            edge_data = self.fetch_edge_data()

            # Convert all data first (no DB queries)
            converted_plugin_metadata = [
                self.convert_plugin_metadata(epm)
                for epm in edge_data.get("plugin_metadata", [])
            ]
            converted_plugin_configs = [
                self.convert_plugin_config(epc)
                for epc in edge_data.get("plugin_configs", [])
            ]
            converted_global_rules = [
                self.convert_global_rule(egr)
                for egr in edge_data.get("global_rules", [])
            ]
            converted_upstreams = [
                self.convert_upstream(eu)
                for eu in edge_data.get("upstreams", [])
            ]

            converted_stream_proxies = [
                self.convert_stream_proxy(esp)
                for esp in edge_data.get("stream_proxies", [])
            ]

            converted_ssl_certificates = [
                self.convert_ssl_certificate(esc)
                for esc in edge_data.get("ssl_certificates", [])
            ]

            upstream_uuid_map: dict = {}
            plugin_config_uuid_map: dict = {}

            imported_counts: dict[str, int] = {
                "upstreams": 0, "routes": 0,
                "plugin_configs": 0, "global_rules": 0,
                "plugin_metadata": 0, "stream_proxies": 0,
                "ssl_certificates": 0,
            }
            skipped_counts: dict[str, int] = {
                "upstreams": 0, "routes": 0,
                "plugin_configs": 0, "global_rules": 0,
                "plugin_metadata": 0, "stream_proxies": 0,
                "ssl_certificates": 0,
            }

            known_plugin_count = 0
            unknown_plugin_count = 0
            unknown_plugin_names: set = set()

            # ── Phase 1: Load existing identifiers from DB (one query per type) ──
            existing_upstream_uuids = set(
                row[0] for row in (
                    await session.execute(
                        select(Upstream.edge_uuid).where(Upstream.cluster_id == self.cluster_id)
                    )
                ).all()
            )
            existing_route_uuids = set(
                row[0] for row in (
                    await session.execute(
                        select(Route.edge_uuid).where(Route.cluster_id == self.cluster_id)
                    )
                ).all()
            )
            existing_pc_uuids = set(
                row[0] for row in (
                    await session.execute(
                        select(PluginConfig.edge_uuid).where(PluginConfig.cluster_id == self.cluster_id)
                    )
                ).all()
            )
            existing_gr_uuids = set(
                row[0] for row in (
                    await session.execute(
                        select(GlobalRule.edge_uuid).where(GlobalRule.cluster_id == self.cluster_id)
                    )
                ).all()
            )
            existing_pm_names = set(
                row[0] for row in (
                    await session.execute(
                        select(PluginMetadata.plugin_name).where(
                            PluginMetadata.cluster_id == self.cluster_id
                        )
                    )
                ).all()
            )
            existing_sp_ports = set(
                row[0] for row in (
                    await session.execute(
                        select(StreamProxy.listen_port).where(
                            StreamProxy.cluster_id == self.cluster_id
                        )
                    )
                ).all()
            )
            existing_ssl_uuids = set(
                row[0] for row in (
                    await session.execute(
                        select(SslCertificate.edge_uuid).where(
                            SslCertificate.cluster_id == self.cluster_id
                        )
                    )
                ).all()
            )

            # ── Phase 2: Insert (conflict check only against DB, not within Edge batch) ──

            if selections.plugin_metadata:
                for cpm in converted_plugin_metadata:
                    pm_data = cpm["plugin_metadata"]
                    if pm_data["plugin_name"] in existing_pm_names:
                        skipped_counts["plugin_metadata"] += 1
                        continue
                    existing_pm_names.add(pm_data["plugin_name"])
                    pm_data["current_version"] = 1
                    session.add(PluginMetadata(**pm_data))
                    await session.flush()
                    pm_id = (await session.execute(
                        select(PluginMetadata.id).where(
                            PluginMetadata.cluster_id == self.cluster_id,
                            PluginMetadata.plugin_name == pm_data["plugin_name"],
                        )
                    )).scalar_one()
                    session.add(ConfigVersion(
                        cluster_id=self.cluster_id, resource_type="plugin_metadata",
                        resource_id=pm_id, version=1,
                        config=json.dumps(cpm.get("raw_plugins", {}), ensure_ascii=False),
                        created_by="system",
                    ))
                    imported_counts["plugin_metadata"] += 1
                await session.flush()

            if selections.stream_proxy:
                for csp in converted_stream_proxies:
                    sp_data = csp["stream_proxy"]
                    port = sp_data["listen_port"]
                    if port in existing_sp_ports:
                        skipped_counts["stream_proxies"] += 1
                        continue
                    existing_sp_ports.add(port)
                    sp_data["current_version"] = 1
                    session.add(StreamProxy(**sp_data))
                    await session.flush()
                    sp_id = (await session.execute(
                        select(StreamProxy.id).where(
                            StreamProxy.cluster_id == self.cluster_id,
                            StreamProxy.listen_port == port,
                        )
                    )).scalar_one()
                    sp_config = {
                        "name": sp_data["name"],
                        "listen_port": port,
                        "load_balance": sp_data["load_balance"],
                        "scheme": sp_data["scheme"],
                        "targets": csp.get("targets"),
                        "timeout": csp.get("timeout"),
                        "keepalive_pool": csp.get("keepalive_pool"),
                    }
                    session.add(ConfigVersion(
                        cluster_id=self.cluster_id, resource_type="stream_proxy",
                        resource_id=sp_id, version=1,
                        config=json.dumps(sp_config, ensure_ascii=False),
                        created_by="system",
                    ))
                    imported_counts["stream_proxies"] += 1
                await session.flush()

            if selections.ssl_certificates:
                for csc in converted_ssl_certificates:
                    sc_data = csc["ssl_certificate"]
                    if sc_data["edge_uuid"] in existing_ssl_uuids:
                        skipped_counts["ssl_certificates"] += 1
                        continue
                    existing_ssl_uuids.add(sc_data["edge_uuid"])
                    sc_data["current_version"] = 1
                    sc_data.pop("edge_uuid", None)
                    ssl_obj = SslCertificate(**sc_data)
                    session.add(ssl_obj)
                    await session.flush()
                    session.add(ConfigVersion(
                        cluster_id=self.cluster_id, resource_type="ssl",
                        resource_id=ssl_obj.id, version=1,
                        config=json.dumps(csc.get("ssl_certificate", {}), ensure_ascii=False),
                        created_by="system",
                    ))
                    imported_counts["ssl_certificates"] += 1
                await session.flush()

            if selections.plugin_configs:
                for cp in converted_plugin_configs:
                    pc_data = cp["plugin_config"]
                    if pc_data["edge_uuid"] in existing_pc_uuids:
                        skipped_counts["plugin_configs"] += 1
                        continue
                    new_pc = PluginConfig(**pc_data)
                    session.add(new_pc)
                    await session.flush()
                    new_pc.current_version = 1
                    plugin_config_uuid_map[pc_data["edge_uuid"]] = new_pc.id
                    edge_raw = next(
                        (e for e in edge_data.get("plugin_configs", [])
                         if (e.get("value", e).get("id") if isinstance(e, dict) else e.get("id")) == pc_data["edge_uuid"]),
                        None,
                    )
                    if edge_raw:
                        session.add(ConfigVersion(
                            cluster_id=self.cluster_id, resource_type="plugin_config",
                            resource_id=new_pc.id, version=1,
                            config=json.dumps(
                                edge_raw.get("value", edge_raw) if isinstance(edge_raw, dict) else edge_raw,
                                ensure_ascii=False
                            ), created_by="system",
                        ))
                    imported_counts["plugin_configs"] += 1
                    ps = cp.get("plugin_summary", {})
                    known_plugin_count += ps.get("known_count", 0)
                    unknown_plugin_count += ps.get("unknown_count", 0)
                    for name in ps.get("unknown_names", []):
                        unknown_plugin_names.add(name)
                await session.flush()

            if selections.global_rules:
                for cg in converted_global_rules:
                    gr_data = cg["global_rule"]
                    if gr_data["edge_uuid"] in existing_gr_uuids:
                        skipped_counts["global_rules"] += 1
                        continue
                    new_gr = GlobalRule(**gr_data)
                    session.add(new_gr)
                    await session.flush()
                    new_gr.current_version = 1
                    edge_raw = next(
                        (e for e in edge_data.get("global_rules", [])
                         if (e.get("value", e).get("id") if isinstance(e, dict) else e.get("id")) == gr_data["edge_uuid"]),
                        None,
                    )
                    if edge_raw:
                        session.add(ConfigVersion(
                            cluster_id=self.cluster_id, resource_type="global_rule",
                            resource_id=new_gr.id, version=1,
                            config=json.dumps(
                                edge_raw.get("value", edge_raw) if isinstance(edge_raw, dict) else edge_raw,
                                ensure_ascii=False
                            ), created_by="system",
                        ))
                    imported_counts["global_rules"] += 1
                    ps = cg.get("plugin_summary", {})
                    known_plugin_count += ps.get("known_count", 0)
                    unknown_plugin_count += ps.get("unknown_count", 0)
                    for name in ps.get("unknown_names", []):
                        unknown_plugin_names.add(name)
                await session.flush()

            if selections.upstreams:
                for cu in converted_upstreams:
                    u_data = cu["upstream"]

                    if u_data["edge_uuid"] in existing_upstream_uuids:
                        skipped_counts["upstreams"] += 1
                        continue

                    new_upstream = Upstream(**u_data)
                    session.add(new_upstream)
                    await session.flush()
                    new_upstream.current_version = 1
                    edge_raw = next(
                        (e for e in edge_data.get("upstreams", [])
                         if (e.get("value", e).get("id") if isinstance(e, dict) else e.get("id")) == u_data["edge_uuid"]),
                        None,
                    )
                    if edge_raw:
                        config_json = json.dumps(
                            edge_raw.get("value", edge_raw) if isinstance(edge_raw, dict) else edge_raw,
                            ensure_ascii=False
                        )
                        session.add(ConfigVersion(
                            cluster_id=self.cluster_id, resource_type="upstream",
                            resource_id=new_upstream.id, version=1,
                            config=config_json, created_by="system",
                        ))
                    upstream_uuid_map[u_data["edge_uuid"]] = new_upstream.id
                    imported_counts["upstreams"] += 1
                    for t_data in cu["targets"]:
                        t_data["upstream_id"] = new_upstream.id
                        session.add(UpstreamTarget(**t_data))
                await session.flush()

            if selections.routes:
                # Routes depend on upstream_uuid_map, so they're converted here (after upstreams are in the map)
                routes_data = edge_data.get("routes", [])
                if not isinstance(routes_data, list):
                    routes_data = []
                converted_routes = [
                    self.convert_route(er, upstream_uuid_map)
                    for er in routes_data
                ]
                for cr in converted_routes:
                    r_data = cr["route"]
                    if r_data["edge_uuid"] in existing_route_uuids:
                        skipped_counts["routes"] += 1
                        continue

                    new_route = Route(**r_data)
                    session.add(new_route)
                    await session.flush()
                    new_route.current_version = 1
                    edge_raw = next(
                        (e for e in routes_data
                         if (e.get("value", e).get("id") if isinstance(e, dict) else e.get("id")) == r_data["edge_uuid"]),
                        None,
                    )
                    if edge_raw:
                        session.add(ConfigVersion(
                            cluster_id=self.cluster_id, resource_type="route",
                            resource_id=new_route.id, version=1,
                            config=json.dumps(
                                edge_raw.get("value", edge_raw) if isinstance(edge_raw, dict) else edge_raw,
                                ensure_ascii=False
                            ), created_by="system",
                        ))
                    imported_counts["routes"] += 1
                    for p_data in cr["plugins"]:
                        p_data["route_id"] = new_route.id
                        session.add(RoutePlugin(**p_data))
                    ps = cr.get("plugin_summary", {})
                    known_plugin_count += ps.get("known_count", 0)
                    unknown_plugin_count += ps.get("unknown_count", 0)
                    for name in ps.get("unknown_names", []):
                        unknown_plugin_names.add(name)

            import_log = ImportLog(
                cluster_id=self.cluster_id,
                node_ip=self.ip,
                node_port=self.port,
                edge_path=self.edge_path,
                status="success",
                upstream_count=imported_counts["upstreams"],
                route_count=imported_counts["routes"],
                plugin_config_count=imported_counts["plugin_configs"],
                global_rule_count=imported_counts["global_rules"],
                stream_proxy_count=imported_counts["stream_proxies"],
                known_plugin_count=known_plugin_count,
                unknown_plugin_count=unknown_plugin_count,
                unknown_plugin_names=json.dumps(
                    sorted(unknown_plugin_names), ensure_ascii=False
                ),
                conflict_details=json.dumps([], ensure_ascii=False),
            )
            session.add(import_log)
            await session.flush()

            await session.commit()

            return {
                "success": True,
                "import_log_id": import_log.id,
                "imported_counts": imported_counts,
                "skipped_counts": skipped_counts,
                "plugin_summary": {
                    "known_count": known_plugin_count,
                    "unknown_count": unknown_plugin_count,
                    "unknown_plugin_names": sorted(unknown_plugin_names),
                },
                "message": "导入成功",
            }

        except Exception as e:
            await session.rollback()

            try:
                error_log = ImportLog(
                    cluster_id=self.cluster_id,
                    node_ip=self.ip,
                    node_port=self.port,
                    edge_path=self.edge_path,
                    status="failed",
                    upstream_count=0,
                    route_count=0,
                    plugin_config_count=0,
                    global_rule_count=0,
                    known_plugin_count=0,
                    unknown_plugin_count=0,
                    error_message=str(e),
                )
                session.add(error_log)
                await session.flush()
                await session.commit()

                return {
                    "success": False,
                    "import_log_id": error_log.id,
                    "imported_counts": dict.fromkeys(
                        ["upstreams", "routes", "plugin_configs", "global_rules"], 0
                    ),
                    "skipped_counts": dict.fromkeys(
                        ["upstreams", "routes", "plugin_configs", "global_rules"], 0
                    ),
                    "plugin_summary": {
                        "known_count": 0,
                        "unknown_count": 0,
                        "unknown_plugin_names": [],
                    },
                    "message": str(e),
                }
            except Exception:
                await session.rollback()
                return {
                    "success": False,
                    "import_log_id": None,
                    "imported_counts": dict.fromkeys(
                        ["upstreams", "routes", "plugin_configs", "global_rules"], 0
                    ),
                    "skipped_counts": dict.fromkeys(
                        ["upstreams", "routes", "plugin_configs", "global_rules"], 0
                    ),
                    "plugin_summary": {
                        "known_count": 0,
                        "unknown_count": 0,
                        "unknown_plugin_names": [],
                    },
                    "message": str(e),
                }
