"""Edge 数据导入三个端点 + EdgeImportService：节点执行路径标注（route / relay_via）。

契约：test-connection / preview / execute 响应新增 route（relay|direct），
经中继时带 relay_via=网关基址，直连时为 None；判定在 EdgeImportService.create()
内按该 client 实例完成（HTTP 腿，与发布同源），经 service.route_info 合入响应。
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.api.v1 import edge_import as edge_import_api
from app.models.cluster import Cluster, Node
from app.schemas.edge_import import (
    ImportExecuteRequest,
    ImportSelection,
    PreviewRequest,
    TestConnectionRequest,
    TestConnectionResponse,
)
from app.services import relay_registry
from app.services.edge_import_service import EdgeImportService
from app.services.relay_registry import RelayRoute

GW = "http://10.10.1.1:8443"


async def _seed(test_db):
    c = Cluster(name="import-cluster", status=1)
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


# ── EdgeImportService.create：route_info 判定 ────────────────

async def test_create_marks_relay_route(test_db, relay_active):
    c, n = await _seed(test_db)
    svc = await EdgeImportService.create(cluster_id=c.id, node_id=n.id, db_session=test_db)
    assert svc.route_info == {"route": "relay", "relay_via": GW}


async def test_create_marks_direct_route(test_db, relay_off):
    c, n = await _seed(test_db)
    svc = await EdgeImportService.create(cluster_id=c.id, node_id=n.id, db_session=test_db)
    assert svc.route_info == {"route": "direct"}
    assert "relay_via" not in svc.route_info


# ── 三个端点：route_info 合入响应 ────────────────────────────

async def test_test_connection_response_carries_route(test_db, relay_active):
    c, n = await _seed(test_db)
    body = TestConnectionRequest(cluster_id=c.id, node_id=n.id)
    with patch.object(EdgeImportService, "test_connection", return_value={"success": True}):
        resp = await edge_import_api.test_connection(body, db=test_db)
    assert resp["success"] is True
    assert resp["route"] == "relay"
    assert resp["relay_via"] == GW


async def test_test_connection_direct_omits_via(test_db, relay_off):
    c, n = await _seed(test_db)
    body = TestConnectionRequest(cluster_id=c.id, node_id=n.id)
    with patch.object(EdgeImportService, "test_connection", return_value={"success": True}):
        resp = await edge_import_api.test_connection(body, db=test_db)
    assert resp["route"] == "direct"
    assert "relay_via" not in resp


async def test_preview_response_carries_route(test_db, relay_active):
    c, n = await _seed(test_db)
    body = PreviewRequest(cluster_id=c.id, node_id=n.id)
    with patch.object(EdgeImportService, "preview_import", new_callable=AsyncMock,
                      return_value={"upstreams": []}):
        resp = await edge_import_api.preview_import(body, db=test_db)
    assert resp["route"] == "relay"
    assert resp["relay_via"] == GW


async def test_preview_direct_omits_via(test_db, relay_off):
    c, n = await _seed(test_db)
    body = PreviewRequest(cluster_id=c.id, node_id=n.id)
    with patch.object(EdgeImportService, "preview_import", new_callable=AsyncMock,
                      return_value={"upstreams": []}):
        resp = await edge_import_api.preview_import(body, db=test_db)
    assert resp["route"] == "direct"
    assert "relay_via" not in resp


async def test_execute_response_carries_route(test_db, relay_active):
    """execute 合并 route_info；enrich_audit/commit 语义不变。"""
    c, n = await _seed(test_db)
    body = ImportExecuteRequest(cluster_id=c.id, node_id=n.id, selections=ImportSelection())
    request = SimpleNamespace(state=SimpleNamespace())  # 无审计骨架 → enrich_audit 安全空操作
    with patch.object(EdgeImportService, "execute_import", new_callable=AsyncMock,
                      return_value={"success": True}):
        resp = await edge_import_api.execute_import(body, request, db=test_db)
    assert resp["success"] is True
    assert resp["route"] == "relay"
    assert resp["relay_via"] == GW


# ── 响应 schema 契约 ─────────────────────────────────────────

def test_test_connection_schema_accepts_route_fields():
    body = TestConnectionResponse(success=True, route="relay", relay_via=GW)
    assert body.route == "relay"
    assert body.relay_via == GW
    assert TestConnectionResponse(success=True).route is None
