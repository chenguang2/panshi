"""Tests for DNS proxy (UDP) WAN/LAN separation plugin construction.

The pure function ``build_dns_plugins`` converts the internal ``dns_config``
(hosts with inline export_nodes + wan_enabled/wan_filter) into the Edge
``plugins`` payload, and validates mapping consistency before returning.
"""

import pytest

from app.services.dns_wan import build_dns_plugins

BASE_DNS_CFG = {
    "hosts": {
        "qcg.com": {
            "nodes": {
                "192.192.9.2:16610": [],
                "192.192.9.3:16610": [],
            },
            "type": "chash",
            "ttl_valid": 10,
        }
    }
}


class TestDnsPluginsWithoutWan:
    def test_plugins_contain_only_dns_upstream_when_wan_disabled(self):
        """wan not enabled: plugins must contain only dns_upstream (baseline)."""
        plugins = build_dns_plugins(BASE_DNS_CFG, {})
        assert set(plugins.keys()) == {"dns_upstream"}
        assert plugins["dns_upstream"] == {
            "disable": False,
            "hosts": BASE_DNS_CFG["hosts"],
        }

    def test_plugins_contain_only_dns_upstream_when_wan_missing(self):
        """wan_enabled missing entirely: same as disabled."""
        plugins = build_dns_plugins(BASE_DNS_CFG, {})
        assert "dns_upstream-ww" not in plugins

    def test_inline_export_nodes_removed_from_lan_plugin(self):
        """Inline export_nodes in hosts must be stripped from dns_upstream."""
        cfg = dict(BASE_DNS_CFG)
        cfg["hosts"]["qcg.com"]["export_nodes"] = {"192.192.9.2:16610": "10.158.40.51"}
        plugins = build_dns_plugins(cfg, {})
        assert "export_nodes" not in plugins["dns_upstream"]["hosts"]["qcg.com"]

    def test_log_process_preserved(self):
        """log_process in dns_cfg must appear in plugins as-is."""
        cfg = dict(BASE_DNS_CFG)
        cfg["log_process"] = {"logs": ["logs/process.stream.log"]}
        plugins = build_dns_plugins(cfg, {})
        assert plugins["log_process"] == {"logs": ["logs/process.stream.log"]}


class TestDnsPluginsWithWan:
    def test_plugins_add_dns_upstream_ww_when_enabled(self):
        """wan_enabled=True: plugins must include dns_upstream-ww."""
        cfg = dict(BASE_DNS_CFG)
        cfg["wan_enabled"] = True
        cfg["hosts"]["qcg.com"]["export_nodes"] = {
            "192.192.9.2:16610": "10.158.40.51",
            "192.192.9.3:16610": "10.158.40.52",
        }
        plugins = build_dns_plugins(cfg, {})
        assert "dns_upstream-ww" in plugins
        ww = plugins["dns_upstream-ww"]
        assert "192.192.9.2:16610" in ww["hosts"]["qcg.com"]["nodes"]
        assert ww["hosts"]["qcg.com"]["export_nodes"] == {
            "192.192.9.2:16610": "10.158.40.51:16610",
            "192.192.9.3:16610": "10.158.40.52:16610",
        }

    def test_export_nodes_value_gets_port_appended(self):
        """WAN value is bare IP; port must be appended from the LAN key."""
        cfg = dict(BASE_DNS_CFG)
        cfg["wan_enabled"] = True
        cfg["hosts"]["qcg.com"]["export_nodes"] = {
            "192.192.9.2:16610": "10.158.40.51",
        }
        plugins = build_dns_plugins(cfg, {})
        ww_host = plugins["dns_upstream-ww"]["hosts"]["qcg.com"]
        assert ww_host["export_nodes"] == {
            "192.192.9.2:16610": "10.158.40.51:16610",
        }

    def test_lan_plugin_has_no_export_nodes_when_enabled(self):
        """dns_upstream must never carry export_nodes even when wan enabled."""
        cfg = dict(BASE_DNS_CFG)
        cfg["wan_enabled"] = True
        cfg["hosts"]["qcg.com"]["export_nodes"] = {
            "192.192.9.2:16610": "10.158.40.51",
        }
        plugins = build_dns_plugins(cfg, {})
        assert "export_nodes" not in plugins["dns_upstream"]["hosts"]["qcg.com"]
        assert "export_nodes" in plugins["dns_upstream-ww"]["hosts"]["qcg.com"]

    def test_ww_hosts_copy_inner_nodes_and_export_nodes(self):
        """ww hosts must copy the inner domain config and add export_nodes."""
        cfg = dict(BASE_DNS_CFG)
        cfg["wan_enabled"] = True
        cfg["hosts"]["qcg.com"]["export_nodes"] = {
            "192.192.9.2:16610": "10.158.40.51",
        }
        plugins = build_dns_plugins(cfg, {})
        ww_host = plugins["dns_upstream-ww"]["hosts"]["qcg.com"]
        assert ww_host["type"] == "chash"
        assert ww_host["ttl_valid"] == 10
        assert ww_host["nodes"] == BASE_DNS_CFG["hosts"]["qcg.com"]["nodes"]

    def test_filter_include_exclude_generated(self):
        """wan_filter include/exclude become remote_addr conditions; priority fixed 2110."""
        cfg = dict(BASE_DNS_CFG)
        cfg["wan_enabled"] = True
        cfg["hosts"]["qcg.com"]["export_nodes"] = {
            "192.192.9.2:16610": "10.158.40.51",
        }
        cfg["wan_filter"] = {
            "include": ["10.158.40.51", "10.0.0.0/8"],
            "exclude": ["192.168.0.3", "127.0.0.1/8"],
        }
        plugins = build_dns_plugins(cfg, {})
        meta = plugins["dns_upstream-ww"]["_meta"]
        assert meta["priority"] == 2110
        assert ["remote_addr", "ip~", ["10.158.40.51", "10.0.0.0/8"]] in meta["filter"]
        assert ["remote_addr", "!", "ip~", ["192.168.0.3", "127.0.0.1/8"]] in meta["filter"]


class TestDnsWanValidation:
    def test_enabled_requires_export_nodes_for_every_domain(self):
        """wan_enabled with a domain lacking export_nodes must raise."""
        cfg = dict(BASE_DNS_CFG)
        cfg["wan_enabled"] = True
        cfg["hosts"]["qcg.com"].pop("export_nodes", None)
        with pytest.raises(ValueError, match="export_nodes"):
            build_dns_plugins(cfg, {})

    def test_mapping_key_must_exist_in_nodes(self):
        """Mapping key not present in the domain nodes must raise."""
        cfg = dict(BASE_DNS_CFG)
        cfg["wan_enabled"] = True
        cfg["hosts"]["qcg.com"]["export_nodes"] = {
            "192.192.9.99:16610": "10.158.40.99",
        }
        with pytest.raises(ValueError, match="不在"):
            build_dns_plugins(cfg, {})

    def test_invalid_wan_filter_ip_rejected(self):
        """wan_filter with a malformed IP (e.g. 127..0.0.1) must be rejected
        to prevent the Edge dns_upstream-ww plugin from crashing (502)."""
        cfg = dict(BASE_DNS_CFG)
        cfg["wan_enabled"] = True
        cfg["hosts"]["qcg.com"]["export_nodes"] = {
            "192.192.9.2:16610": "10.158.40.51",
        }
        cfg["wan_filter"] = {
            "include": ["1.2.3.4"],
            "exclude": ["127..0.0.1"],
        }
        with pytest.raises(ValueError, match="127..0.0.1"):
            build_dns_plugins(cfg, {})

    def test_valid_wan_filter_cidr_accepted(self):
        """CIDR entries in wan_filter must be accepted."""
        cfg = dict(BASE_DNS_CFG)
        cfg["wan_enabled"] = True
        cfg["hosts"]["qcg.com"]["export_nodes"] = {
            "192.192.9.2:16610": "10.158.40.51",
        }
        cfg["wan_filter"] = {
            "include": ["10.0.0.0/8", "192.168.1.1"],
            "exclude": ["127.0.0.1/8"],
        }
        plugins = build_dns_plugins(cfg, {})
        assert "dns_upstream-ww" in plugins
