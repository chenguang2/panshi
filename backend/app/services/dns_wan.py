"""WAN/LAN separation support for DNS (UDP) proxies.

Builds the Edge ``plugins`` payload from the internal ``dns_config`` format
(hosts with inline ``export_nodes`` + wan_enabled/wan_filter). Pure functions.
"""

import ipaddress
import re
from typing import Any

WAN_PRIORITY = 2110

_IPV4_OR_CIDR_RE = re.compile(
    r"^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}"
    r"(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:/(?:[0-9]|[12][0-9]|3[0-2]))?$"
)


def _is_valid_ip_or_cidr(value: str) -> bool:
    if not _IPV4_OR_CIDR_RE.match(value):
        return False
    try:
        ip = ipaddress.ip_network(value, strict=False)
        return ip.version == 4
    except ValueError:
        return False


def _export_nodes_with_port(export_nodes: dict) -> dict:
    """Append the LAN node's port to each bare WAN IP (port is shared)."""
    result = {}
    for lan, wan_ip in (export_nodes or {}).items():
        port = lan.rsplit(":", 1)[1] if ":" in lan else ""
        result[lan] = f"{wan_ip}:{port}" if port else wan_ip
    return result


def _strip_export_nodes(hosts: dict) -> dict:
    """Deep copy hosts without the inline export_nodes field."""
    return {
        domain: {k: v for k, v in cfg.items() if k != "export_nodes"}
        for domain, cfg in hosts.items()
    }


def _validate_export_nodes(hosts: dict) -> None:
    """Every domain must have export_nodes, and each mapping key must exist in nodes."""
    for domain, cfg in hosts.items():
        mapping = cfg.get("export_nodes")
        if not mapping:
            raise ValueError(
                f"每个域名必须配置 export_nodes 外网映射，缺少: {domain}"
            )
        nodes = cfg.get("nodes") or {}
        for key in mapping:
            if key not in nodes:
                raise ValueError(
                    f"外网映射的内网节点 {key} 不在域名 {domain} 的节点列表中"
                )


def build_dns_plugins(dns_cfg: dict, checks: dict) -> dict[str, Any]:
    """Convert internal dns_config to Edge plugins payload.

    Args:
        dns_cfg: Internal config (hosts with optional inline export_nodes,
                 log_process, wan_enabled/wan_filter).
        checks: Proxy-level health checks (merged into domains lacking checks).

    Returns:
        Edge plugins dict. When wan_enabled, includes ``dns_upstream-ww``.

    Raises:
        ValueError: wan_enabled with missing/mismatched export_nodes.
    """
    raw_hosts = dict(dns_cfg.get("hosts") or {})
    if checks and any(k in checks for k in ("active", "passive")):
        for domain_name in raw_hosts:
            if "checks" not in raw_hosts[domain_name]:
                raw_hosts[domain_name]["checks"] = checks

    lan_hosts = _strip_export_nodes(raw_hosts)
    plugins: dict[str, Any] = {
        "dns_upstream": {"disable": False, "hosts": lan_hosts},
    }
    log_process = dns_cfg.get("log_process")
    if log_process:
        plugins["log_process"] = log_process

    if not dns_cfg.get("wan_enabled"):
        return plugins

    _validate_export_nodes(raw_hosts)

    wan_filter = dns_cfg.get("wan_filter") or {}
    for kind in ("include", "exclude"):
        for ip in wan_filter.get(kind, []):
            if not _is_valid_ip_or_cidr(ip):
                raise ValueError(
                    f"外网访问来源过滤的{kind}含非法 IP/网段: {ip}"
                )

    ww_hosts: dict[str, Any] = {}
    for domain, cfg in raw_hosts.items():
        entry = _strip_export_nodes({domain: cfg})[domain]
        mapping = _export_nodes_with_port(cfg.get("export_nodes"))
        if mapping:
            entry["export_nodes"] = mapping
        ww_hosts[domain] = entry

    ww_filter: list[list] = []
    include = dns_cfg.get("wan_filter", {}).get("include", [])
    if include:
        ww_filter.append(["remote_addr", "ip~", list(include)])
    exclude = dns_cfg.get("wan_filter", {}).get("exclude", [])
    if exclude:
        ww_filter.append(["remote_addr", "!", "ip~", list(exclude)])

    plugins["dns_upstream-ww"] = {
        "hosts": ww_hosts,
        "_meta": {"priority": WAN_PRIORITY, "filter": ww_filter},
    }
    return plugins
