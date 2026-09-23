"""集群连接测试走实际管理路径（中继感知）并输出 route/relay_via。

契约：results[] 每项带 route（relay|direct），经中继时带 relay_via=网关基址；
失败节点也带 route。ok = 管理面在该路径上拿到 HTTP 响应（含 Edge 自身 4xx）。
"""
from unittest.mock import MagicMock, patch

import pytest

from app.api.v1.clusters import TestConnectionRequest as ConnReq, test_connection as _test_connection
from app.models.cluster import Cluster, Node
from app.services import relay_registry
from app.services.edge_client import EdgeAPIError, EdgeClient, EdgeConnectionError
from app.services.relay_registry import RelayRoute

GW = "http://10.10.1.1:8443"


async def _seed(test_db):
    c = Cluster(name="conn-cluster", status=1)
    test_db.add(c)
    await test_db.commit()
    await test_db.refresh(c)
    n = Node(cluster_id=c.id, ip="10.1.1.1", service_port=80,
             management_port=9180, edge_path="/edge", status=1)
    test_db.add(n)
    await test_db.commit()
    await test_db.refresh(n)
    return c, n


@pytest.fixture
def relay_active(monkeypatch):
    route = RelayRoute(code="luju", http_base_url=GW, ssh_jump=None, status="enabled")
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: True)
    monkeypatch.setattr(relay_registry, "route_for_ip", lambda ip: (route, "active"))


@pytest.fixture
def relay_off(monkeypatch):
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: False)


async def _call(test_db, c, n):
    return await _test_connection(
        cluster_id=c.id,
        req=ConnReq(node_ids=[n.id]),
        db=test_db,
        current_user=MagicMock(),
    )


async def test_relay_success_marks_route(test_db, relay_active):
    c, n = await _seed(test_db)
    with patch.object(EdgeClient, "list_available_plugins", return_value=[]):
        resp = await _call(test_db, c, n)
    r = resp["results"][0]
    assert r["ok"] is True
    assert r["route"] == "relay"
    assert r["relay_via"] == GW


async def test_direct_success_omits_via(test_db, relay_off):
    c, n = await _seed(test_db)
    with patch.object(EdgeClient, "list_available_plugins", return_value=[]):
        resp = await _call(test_db, c, n)
    r = resp["results"][0]
    assert r["ok"] is True
    assert r["route"] == "direct"
    assert "relay_via" not in r


async def test_conn_error_failed_still_has_route(test_db, relay_active):
    c, n = await _seed(test_db)
    with patch.object(EdgeClient, "list_available_plugins",
                      side_effect=EdgeConnectionError("Failed to connect")):
        resp = await _call(test_db, c, n)
    r = resp["results"][0]
    assert r["ok"] is False
    assert r["route"] == "relay"
    assert r["relay_via"] == GW
    assert "Failed to connect" in r["msg"]


async def test_whitelist_403_not_ok_with_hint(test_db, relay_active):
    c, n = await _seed(test_db)
    with patch.object(EdgeClient, "list_available_plugins",
                      side_effect=EdgeAPIError(403, "目标不在该局网关白名单，请执行配置下发")):
        resp = await _call(test_db, c, n)
    r = resp["results"][0]
    assert r["ok"] is False
    assert "白名单" in r["msg"]
    assert r["route"] == "relay"
    assert r["relay_via"] == GW


async def test_404_is_ok_with_response(test_db, relay_off):
    """有 HTTP 响应即通（Edge 自身 404 也算可达）。"""
    c, n = await _seed(test_db)
    with patch.object(EdgeClient, "list_available_plugins",
                      side_effect=EdgeAPIError(404, "not found")):
        resp = await _call(test_db, c, n)
    r = resp["results"][0]
    assert r["ok"] is True
    assert r["route"] == "direct"
    assert "relay_via" not in r


async def test_missing_node_has_no_route(test_db, relay_active):
    c, n = await _seed(test_db)
    resp = await _test_connection(
        cluster_id=c.id,
        req=ConnReq(node_ids=[99999]),
        db=test_db,
        current_user=MagicMock(),
    )
    r = resp["results"][0]
    assert r["ok"] is False
    assert r["msg"] == "节点不存在"
    assert "route" not in r
