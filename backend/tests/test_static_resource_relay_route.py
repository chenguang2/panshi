"""静态资源 zip 发布：逐节点 route 标注 + 413 友好提示。

契约：publish_static_resource 的成功/失败逐节点结果都带 route（relay|direct），
经中继时另带 relay_via（网关基址），判定复用 edge_sync.mark_route。
"""
import zipfile
from unittest.mock import MagicMock, patch

import pytest

from app.api.v1.cluster_static_resources import publish_static_resource
from app.models.cluster import Cluster, Node, Route
from app.models.static_resource import StaticResource
from app.services import edge_sync, relay_registry
from app.services.edge_client import EdgeAPIError, EdgeClient, EdgeConnectionError
from app.services.relay_registry import RelayRoute

GW = "http://10.10.1.1:8443"


async def _seed(test_db, tmp_path):
    cluster = Cluster(name="sr-cluster", display_name="sr", status=1)
    test_db.add(cluster)
    await test_db.commit()
    await test_db.refresh(cluster)

    route = Route(cluster_id=cluster.id, name="sr-route", uri="/static/*", status=1)
    test_db.add(route)
    await test_db.commit()
    await test_db.refresh(route)

    node = Node(cluster_id=cluster.id, ip="10.1.1.1", service_port=80,
                management_port=9180, edge_path="/edge", status=1)
    test_db.add(node)
    await test_db.commit()
    await test_db.refresh(node)

    zip_path = tmp_path / "sr.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("index.html", "<h1>x</h1>")

    sr = StaticResource(cluster_id=cluster.id, route_id=route.id, name="sr",
                        url_path="/static/*", storage_path=str(zip_path),
                        file_size=zip_path.stat().st_size)
    test_db.add(sr)
    await test_db.commit()
    await test_db.refresh(sr)
    return cluster, sr


def _patch_logger():
    return patch("app.api.v1.cluster_static_resources.get_edge_logger",
                 return_value=MagicMock())


@pytest.fixture
def relay_on(monkeypatch):
    route = RelayRoute(code="luju", http_base_url=GW, ssh_jump=None, status="enabled")
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: True)
    monkeypatch.setattr(relay_registry, "route_for_ip", lambda ip: (route, "active"))


@pytest.fixture
def relay_off(monkeypatch):
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: False)


async def test_publish_success_marks_relay(test_db, tmp_path, relay_on):
    cluster, sr = await _seed(test_db, tmp_path)
    with _patch_logger(), patch.object(EdgeClient, "raw_put", lambda self, p, d: {"ok": True}):
        result = await publish_static_resource(
            cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    assert result["success"] is True
    assert result["results"][0]["status"] == "success"
    assert result["results"][0]["route"] == "relay"
    assert result["results"][0]["relay_via"] == GW


async def test_publish_success_marks_direct(test_db, tmp_path, relay_off):
    cluster, sr = await _seed(test_db, tmp_path)
    with _patch_logger(), patch.object(EdgeClient, "raw_put", lambda self, p, d: {"ok": True}):
        result = await publish_static_resource(
            cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    assert result["success"] is True
    assert result["results"][0]["route"] == "direct"
    assert "relay_via" not in result["results"][0]


async def test_publish_failed_node_still_carries_relay(test_db, tmp_path, relay_on):
    cluster, sr = await _seed(test_db, tmp_path)

    def boom(self, p, d):
        raise EdgeAPIError(500, "edge down")

    with _patch_logger(), patch.object(EdgeClient, "raw_put", boom):
        result = await publish_static_resource(
            cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    assert result["success"] is False
    assert result["results"][0]["status"] == "failed"
    assert result["results"][0]["route"] == "relay"
    assert result["results"][0]["relay_via"] == GW


async def test_publish_conn_error_failure_carries_direct(test_db, tmp_path, relay_off):
    cluster, sr = await _seed(test_db, tmp_path)

    def boom(self, p, d):
        raise EdgeConnectionError("connect failed")

    with _patch_logger(), patch.object(EdgeClient, "raw_put", boom):
        result = await publish_static_resource(
            cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    assert result["results"][0]["status"] == "failed"
    assert result["results"][0]["route"] == "direct"
    assert "relay_via" not in result["results"][0]


async def test_publish_413_has_friendly_hint(test_db, tmp_path, relay_off):
    cluster, sr = await _seed(test_db, tmp_path)

    def boom(self, p, d):
        raise EdgeAPIError(413, "Request Entity Too Large")

    with _patch_logger(), patch.object(EdgeClient, "raw_put", boom):
        result = await publish_static_resource(
            cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    err = result["results"][0]["error"]
    assert "client_max_body_size" in err
    assert "32m" in err
    assert "413" in err


async def test_publish_non_413_error_unchanged(test_db, tmp_path, relay_off):
    cluster, sr = await _seed(test_db, tmp_path)

    def boom(self, p, d):
        raise EdgeAPIError(500, "edge down")

    with _patch_logger(), patch.object(EdgeClient, "raw_put", boom):
        result = await publish_static_resource(
            cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    err = result["results"][0]["error"]
    assert err == "Edge API error 500: edge down"
    assert "client_max_body_size" not in err


# ── mark_route（公开语义） ─────────────────────────────────────

def test_mark_route_relay():
    node_result = {}
    client = MagicMock(relay_target="10.1.1.1:9180", edge_url=GW)
    edge_sync.mark_route(node_result, client)
    assert node_result == {"route": "relay", "relay_via": GW}


def test_mark_route_direct():
    node_result = {}
    client = MagicMock(relay_target=None, edge_url="http://10.1.1.1:9180")
    edge_sync.mark_route(node_result, client)
    assert node_result == {"route": "direct"}
