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

# ── 集群上下文消解歧义（edge-direct-relay-cluster-context 批 1）─────────────


@pytest.fixture
def relay_ambiguous_ip(monkeypatch):
    """IP 映射歧义（回退直连）+ 集群上下文可解析到 active 区域。"""
    route = RelayRoute(code="luju", http_base_url=GW, ssh_jump=None, status="enabled")
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: True)
    monkeypatch.setattr(relay_registry, "route_for_ip", lambda ip: (None, "ambiguous"))
    monkeypatch.setattr(relay_registry, "route_conflict_for_ip", lambda ip: "seed-cluster-1/luju、seed-cluster-2/tianjin")
    monkeypatch.setattr(relay_registry, "route_for_cluster", lambda cid: (route, "active"))
    return route


async def test_ambiguous_ip_without_cluster_falls_back_direct_with_reason(relay_ambiguous_ip):
    """缺省（不传 cluster_id）：歧义回退直连，响应带 route_state/route_detail 原因（行为零变化）。"""
    with patch.object(EdgeClient, "list_routes", return_value=[]):
        resp = await list_routes(NODE, PORT, None)
    assert resp["route"] == "direct"
    assert resp["route_state"] == "ambiguous"
    assert "seed-cluster-1/luju" in resp["route_detail"]


async def test_cluster_context_resolves_ambiguity(relay_ambiguous_ip):
    """传 cluster_id → 集群上下文优先：歧义 IP 经所选集群挂接区域网关（消解）。"""
    with patch.object(EdgeClient, "list_routes", return_value=[]):
        resp = await list_routes(NODE, PORT, None, cluster_id=1)
    assert resp["route"] == "relay"
    assert resp["relay_via"] == GW


async def test_query_endpoints_default_cluster_id_zero_all_handlers(relay_active):
    """全部列表端点缺省 cluster_id=0：不传参数时行为与既有完全一致（IP 映射 active → 经中继）。"""
    for handler, edge_method, key in _CASES:
        with patch.object(EdgeClient, edge_method, return_value=[]):
            resp = await handler(NODE, PORT, None)
        assert resp["route"] == "relay", f"{handler.__name__} 缺省行为变化"
        assert resp[key] == []


async def test_ip_info_reports_ownership_and_conflict(async_authed_client, isolated_session):
    """ip-info：DB 直查归属集群列表 + 快照歧义状态与冲突明细 + 管理端口。"""
    from app.models.cluster import Cluster, Node
    from app.models.relay import RelayGateway

    async with isolated_session() as s:
        s.add(RelayGateway(id=81, code="qqq", name="QQQ局", http_base_url="http://10.9.8.1:8443", status="enabled"))
        s.add(RelayGateway(id=82, code="tianjin", name="天津局", http_base_url="http://10.9.8.2:8443", status="enabled"))
        s.add(Cluster(id=91, name="ipinfo-a", region_code="qqq", status=1))
        s.add(Cluster(id=92, name="ipinfo-b", region_code="tianjin", status=1))
        s.add(Node(id=91, cluster_id=91, ip="10.7.7.14", service_port=80, management_port=9180, edge_path="/edge"))
        s.add(Node(id=92, cluster_id=92, ip="10.7.7.14", service_port=80, management_port=9181, edge_path="/edge"))
        await s.commit()
        # lifespan 启动已建空快照：必须 force 重载（TTL 缓存会返回种子前的空映射）
        # 快照必须读隔离库：async_isolated_client 的 get_db override 用自己的
        # 内存库工厂（挂 client._session_factory），全局 AsyncSessionLocal 是另一份数据
        snap = await relay_registry.ensure_fresh(
            session_factory=async_authed_client._session_factory, force=True
        )

    resp = await async_authed_client.get("/api/v1/edge-client/ip-info", params={"ip": "10.7.7.14"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    names = {c["cluster_name"] for c in data["clusters"]}
    assert names == {"ipinfo-a", "ipinfo-b"}
    regions = {c["region_code"] for c in data["clusters"]}
    assert regions == {"qqq", "tianjin"}
    assert data["relay_state"] == "ambiguous"
    assert "ipinfo-a/qqq" in data["conflict_detail"]
    assert sorted(data["management_ports"]) == [9180, 9181]

    # 未登记 IP：clusters 为空、状态 none
    resp2 = await async_authed_client.get("/api/v1/edge-client/ip-info", params={"ip": "10.99.99.99"})
    assert resp2.status_code == 200
    assert resp2.json()["clusters"] == []
    assert resp2.json()["relay_state"] == "none"
