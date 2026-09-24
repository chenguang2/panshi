"""EdgeClient.vue 查询按钮触发的 8 个列表端点：节点执行路径标注（route / relay_via）。

契约：响应新增 route（relay|direct），经中继时带 relay_via=网关基址，直连不带；
判定与发布同源（edge_sync.mark_route 按该请求的 EdgeClient 实例，请求发起前调用）。
手工输入的 IP 不在 ps_node（无区域映射）→ fail-open 直连。
"""
from unittest.mock import patch

import pytest

from app.api.v1.edge_client import (
    list_available_plugins,
    list_global_rules,
    list_plugin_configs,
    list_plugin_metadata,
    list_routes,
    list_ssl_certificates,
    list_stream_routes,
    list_upstreams,
)
from app.services import relay_registry
from app.services.edge_client import EdgeClient
from app.services.relay_registry import RelayRoute

GW = "http://10.10.1.1:8443"
NODE = "10.1.1.1"
PORT = 9180


@pytest.fixture
def relay_active(monkeypatch):
    route = RelayRoute(code="luju", http_base_url=GW, ssh_jump=None, status="enabled")
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: True)
    monkeypatch.setattr(relay_registry, "route_for_ip", lambda ip: (route, "active"))


@pytest.fixture
def relay_off(monkeypatch):
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: False)


# (handler, 被 mock 的 EdgeClient 方法, 响应键) —— 查询按钮触发的 8 个列表端点
_CASES = [
    (list_upstreams, "list_upstreams", "upstreams"),
    (list_routes, "list_routes", "routes"),
    (list_global_rules, "list_global_rules", "global_rules"),
    (list_plugin_configs, "list_plugin_configs", "plugin_configs"),
    (list_plugin_metadata, "list_plugin_metadata", "plugin_metadata"),
    (list_ssl_certificates, "api", "ssl_certificates"),
    (list_available_plugins, "list_available_plugins", "plugins"),
    (list_stream_routes, "list_stream_routes", "stream_routes"),
]


@pytest.mark.parametrize("handler,edge_method,key", _CASES)
async def test_query_endpoints_mark_relay(handler, edge_method, key, relay_active):
    with patch.object(EdgeClient, edge_method, return_value=[]):
        resp = await handler(NODE, PORT, None)
    assert resp[key] == []
    assert resp["route"] == "relay"
    assert resp["relay_via"] == GW


@pytest.mark.parametrize("handler,edge_method,key", _CASES)
async def test_query_endpoints_direct_omit_via(handler, edge_method, key, relay_off):
    with patch.object(EdgeClient, edge_method, return_value=[]):
        resp = await handler(NODE, PORT, None)
    assert resp["route"] == "direct"
    assert "relay_via" not in resp


async def test_manual_ip_not_in_registry_falls_open_direct(monkeypatch):
    """手工输入的 IP 不在 ps_node（无区域映射）→ fail-open 直连。

    注册快照解析不到该 IP（state=none）时保持直连，不做 fail-fast
    （与 EdgeClient._apply_relay 的直连回退语义一致）。
    """
    route = RelayRoute(code="luju", http_base_url=GW, ssh_jump=None, status="enabled")
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: True)
    monkeypatch.setattr(
        relay_registry, "route_for_ip",
        lambda ip: (route, "active") if ip == NODE else (None, "none"),
    )
    with patch.object(EdgeClient, "list_routes", return_value=[]):
        resp = await list_routes("10.99.99.99", PORT, None)
    assert resp["route"] == "direct"
    assert "relay_via" not in resp
