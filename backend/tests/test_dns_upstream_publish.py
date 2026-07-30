"""Tests: dns_upstream route publish handles missing upstream correctly."""

import json
from app.services.edge_client import EdgeClient


class TestDnsUpstreamPublish:
    """Routes with dns_upstream plugin but no upstream_id should still
    produce valid Edge payload with a dummy upstream."""

    def test_convert_route_websocket_default_not_in_output(self):
        """enable_websocket not passed: not in output."""
        edge_data = EdgeClient.convert_route_to_edge_format(
            edge_uuid="test-uuid", name="test", uri="/test",
            methods=None, hosts=None,
            upstream_edge_uuid=None, priority=0,
            vars_json=None, plugins=None, status=1,
        )
        assert "enable_websocket" not in edge_data

    def test_convert_route_websocket_true_in_output(self):
        """enable_websocket=True: included in output."""
        edge_data = EdgeClient.convert_route_to_edge_format(
            edge_uuid="test-uuid", name="ws-test", uri="/ws",
            methods=None, hosts=None,
            upstream_edge_uuid=None, priority=0,
            vars_json=None, plugins=None, status=1,
            enable_websocket=True,
        )
        assert edge_data.get("enable_websocket") is True

    def test_convert_route_websocket_false_not_in_output(self):
        """enable_websocket=False: not in output (Edge defaults to false)."""
        edge_data = EdgeClient.convert_route_to_edge_format(
            edge_uuid="test-uuid", name="no-ws", uri="/no-ws",
            methods=None, hosts=None,
            upstream_edge_uuid=None, priority=0,
            vars_json=None, plugins=None, status=1,
            enable_websocket=False,
        )
        assert "enable_websocket" not in edge_data
    """Routes with dns_upstream plugin but no upstream_id should still
    produce valid Edge payload with a dummy upstream."""

    def test_convert_route_no_upstream_no_plugin_produces_no_upstream(self):
        """Route without upstream AND without plugin: no upstream in edge format."""
        edge_data = EdgeClient.convert_route_to_edge_format(
            edge_uuid="test-uuid", name="test", uri="/test",
            methods=None, hosts=None,
            upstream_edge_uuid=None, priority=0,
            vars_json=None, plugins=None, status=1,
        )
        assert "upstream_id" not in edge_data
        assert "upstream" not in edge_data

    def test_convert_route_dns_upstream_no_upstream_has_dummy_upstream(self):
        """Route with dns_upstream plugin but no upstream_id should get dummy upstream."""
        plugins = [
            type("RoutePlugin", (), {
                "plugin_name": "dns_upstream",
                "config": json.dumps({"hosts": {"example.com": {"nodes": {"10.0.0.1:80": []}}}})
            })()
        ]
        edge_data = EdgeClient.convert_route_to_edge_format(
            edge_uuid="test-uuid", name="dns-test", uri="/dns-query",
            methods=None, hosts=None,
            upstream_edge_uuid=None, priority=0,
            vars_json=None, plugins=plugins, status=1,
            plugin_config_ids=None,
        )
        assert "upstream_id" not in edge_data
        assert "upstream" in edge_data
        assert "nodes" in edge_data["upstream"]
        assert "127.0.0.1:1" in edge_data["upstream"]["nodes"]
