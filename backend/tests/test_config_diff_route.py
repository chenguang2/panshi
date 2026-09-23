"""配置对比端点：节点执行路径标注 + Edge 拉取 offload 到线程。

契约：响应新增 route（relay|direct），经中继时带 relay_via=网关基址，直连不带；
6 次同步 Edge 拉取在一次性线程跳转中执行（不阻塞事件循环）。
"""
import threading
from unittest.mock import patch

import pytest

from app.api.v1.cluster_nodes import diff_cluster_config
from app.models.cluster import Cluster, Node
from app.services import relay_registry
from app.services.edge_client import EdgeClient
from app.services.relay_registry import RelayRoute

GW = "http://10.10.1.1:8443"

_EDGE_METHODS = (
    "list_upstreams", "list_routes", "list_plugin_configs",
    "list_global_rules", "list_plugin_metadata", "list_stream_routes", "list_ssl",
)


async def _seed(test_db):
    c = Cluster(name="diff-cluster", status=1)
    test_db.add(c)
    await test_db.commit()
    await test_db.refresh(c)
    n = Node(cluster_id=c.id, ip="10.1.1.1", service_port=80,
             management_port=9180, edge_path="/edge", status=1)
    test_db.add(n)
    await test_db.commit()
    await test_db.refresh(n)
    return c, n


def _patch_edge_empty():
    from contextlib import ExitStack

    stack = ExitStack()
    for m in _EDGE_METHODS:
        stack.enter_context(patch.object(EdgeClient, m, return_value=[]))
    return stack


@pytest.fixture
def relay_active(monkeypatch):
    route = RelayRoute(code="luju", http_base_url=GW, ssh_jump=None, status="enabled")
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: True)
    monkeypatch.setattr(relay_registry, "route_for_ip", lambda ip: (route, "active"))


@pytest.fixture
def relay_off(monkeypatch):
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: False)


async def test_diff_relay_marks_route(test_db, relay_active):
    c, n = await _seed(test_db)
    with _patch_edge_empty():
        resp = await diff_cluster_config(cluster_id=c.id, node_id=n.id, db=test_db)
    assert resp["route"] == "relay"
    assert resp["relay_via"] == GW


async def test_diff_direct_omits_via(test_db, relay_off):
    c, n = await _seed(test_db)
    with _patch_edge_empty():
        resp = await diff_cluster_config(cluster_id=c.id, node_id=n.id, db=test_db)
    assert resp["route"] == "direct"
    assert "relay_via" not in resp


async def test_diff_edge_fetch_runs_off_event_loop_thread(test_db, relay_off):
    """6 次同步 Edge 拉取必须跑在 worker 线程（证明未阻塞事件循环）。"""
    c, n = await _seed(test_db)
    seen: list[threading.Thread] = []

    def _record(*args, **kwargs):
        seen.append(threading.current_thread())
        return []

    with _patch_edge_empty():
        with patch.object(EdgeClient, "list_routes", side_effect=_record):
            await diff_cluster_config(cluster_id=c.id, node_id=n.id, db=test_db)

    assert seen, "list_routes 未被调用"
    assert seen[0] is not threading.main_thread(), "Edge 拉取仍在主线程（未 offload）"


async def test_diff_existing_groups_summary_unchanged(test_db, relay_off):
    c, n = await _seed(test_db)
    with _patch_edge_empty():
        resp = await diff_cluster_config(cluster_id=c.id, node_id=n.id, db=test_db)
    assert set(resp) >= {"node", "summary", "groups", "route"}
    for key in ("total", "match", "mismatch", "only_in_db", "only_in_edge", "expected_only_in_db"):
        assert key in resp["summary"]
    assert [g["type"] for g in resp["groups"]] == [
        "upstreams", "routes", "plugin_configs", "global_rules",
        "plugin_metadata", "stream_proxies", "ssl_certificates",
    ]
