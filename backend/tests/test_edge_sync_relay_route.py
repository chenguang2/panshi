"""逐节点发布/删除结果的中继路由标记（route / relay_via）。

契约：node_result["route"] ∈ {"relay","direct"}，实际判定来自该节点使用的
EdgeClient 实例（_apply_relay 改写后的 relay_target / edge_url），而非另行查
注册表。失败节点也必须带 route（最有用的场景：失败时想知道走没走中继）。
"""
import pytest

from app.models.cluster import Node
from app.services import relay_registry
from app.services.edge_client import EdgeAPIError
from app.services.edge_sync import delete_on_nodes, publish_to_nodes
from app.services.relay_registry import RelayRoute

GW = "http://10.10.1.1:8443"


def _node(ip: str, port: int = 9180) -> Node:
    return Node(ip=ip, management_port=port)


@pytest.fixture
def relay_active(monkeypatch):
    """总开关开 + 该 IP 解析到 active 区域（真实 EdgeClient 会改写 edge_url）。"""
    route = RelayRoute(code="luju", http_base_url=GW, ssh_jump=None, status="enabled")
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: True)
    monkeypatch.setattr(relay_registry, "route_for_ip", lambda ip: (route, "active"))
    return route


@pytest.fixture
def relay_disabled(monkeypatch):
    route = RelayRoute(code="luju", http_base_url=GW, ssh_jump=None, status="disabled")
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: True)
    monkeypatch.setattr(relay_registry, "route_for_ip", lambda ip: (route, "disabled"))


@pytest.fixture
def relay_none(monkeypatch):
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: True)
    monkeypatch.setattr(relay_registry, "route_for_ip", lambda ip: (None, "none"))


# ── publish_to_nodes ──────────────────────────────────────────

async def test_publish_success_marks_relay(relay_active):
    results, ok, fail = await publish_to_nodes(
        1, [_node("10.1.1.1")], {"a": 1}, publish_fn=lambda c: {"ok": True}
    )
    assert (ok, fail) == (1, 0)
    assert results[0]["route"] == "relay"
    assert results[0]["relay_via"] == GW


async def test_publish_success_marks_direct_when_no_region(relay_none):
    results, ok, fail = await publish_to_nodes(
        1, [_node("10.1.1.1")], {"a": 1}, publish_fn=lambda c: {"ok": True}
    )
    assert (ok, fail) == (1, 0)
    assert results[0]["route"] == "direct"
    assert "relay_via" not in results[0]


async def test_publish_success_marks_direct_when_region_disabled(relay_disabled):
    results, ok, fail = await publish_to_nodes(
        1, [_node("10.1.1.1")], {"a": 1}, publish_fn=lambda c: {"ok": True}
    )
    assert (ok, fail) == (1, 0)
    assert results[0]["route"] == "direct"
    assert "relay_via" not in results[0]


async def test_publish_failed_node_still_carries_relay(relay_active):
    """失败节点也要带 route：证明赋值在 publish_fn 抛错之前完成。"""

    def boom(client):
        raise EdgeAPIError(403, "目标不在该局网关白名单，请执行配置下发")

    results, ok, fail = await publish_to_nodes(1, [_node("10.1.1.1")], {"a": 1}, publish_fn=boom)
    assert (ok, fail) == (0, 1)
    assert results[0]["status"] == "failed"
    assert results[0]["route"] == "relay"
    assert results[0]["relay_via"] == GW
    assert "error" in results[0]


async def test_publish_failed_node_still_carries_direct(relay_none):
    def boom(client):
        raise EdgeAPIError(500, "edge down")

    results, ok, fail = await publish_to_nodes(1, [_node("10.1.1.1")], {"a": 1}, publish_fn=boom)
    assert (ok, fail) == (0, 1)
    assert results[0]["route"] == "direct"
    assert "relay_via" not in results[0]


async def test_publish_route_is_per_node(monkeypatch):
    """同一请求内不同节点可分别判定（按各自 EdgeClient 实际路径）。"""
    gw_route = RelayRoute(code="luju", http_base_url=GW, ssh_jump=None, status="enabled")

    def _route_for_ip(ip):
        return (gw_route, "active") if ip == "10.1.1.1" else (None, "none")

    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: True)
    monkeypatch.setattr(relay_registry, "route_for_ip", _route_for_ip)

    results, ok, fail = await publish_to_nodes(
        1, [_node("10.1.1.1"), _node("10.2.2.2")], {"a": 1}, publish_fn=lambda c: {"ok": True}
    )
    by_ip = {r["node"].split(":")[0]: r for r in results}
    assert by_ip["10.1.1.1"]["route"] == "relay"
    assert by_ip["10.1.1.1"]["relay_via"] == GW
    assert by_ip["10.2.2.2"]["route"] == "direct"
    assert "relay_via" not in by_ip["10.2.2.2"]


# ── delete_on_nodes ───────────────────────────────────────────

async def test_delete_success_marks_relay(relay_active):
    results = await delete_on_nodes(1, [_node("10.1.1.1")], "uuid-1", lambda c, u: {})
    assert results[0]["status"] == "success"
    assert results[0]["route"] == "relay"
    assert results[0]["relay_via"] == GW


async def test_delete_success_marks_direct(relay_none):
    results = await delete_on_nodes(1, [_node("10.1.1.1")], "uuid-1", lambda c, u: {})
    assert results[0]["status"] == "success"
    assert results[0]["route"] == "direct"
    assert "relay_via" not in results[0]


async def test_delete_failed_node_still_carries_relay(relay_active):
    def boom(client, uid):
        raise EdgeAPIError(403, "forbidden")

    results = await delete_on_nodes(1, [_node("10.1.1.1")], "uuid-1", boom)
    assert results[0]["status"] == "failed"
    assert results[0]["route"] == "relay"
    assert results[0]["relay_via"] == GW


async def test_delete_skipped_result_has_no_route_field():
    """无活跃节点时返回单条 skipped，不涉及任何 Edge 请求，不应携带 route。"""
    results = await delete_on_nodes(1, [], "uuid-1", lambda c, u: {})
    assert results[0]["status"] == "skipped"
    assert "route" not in results[0]
