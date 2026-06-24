"""Tests for cluster_edge_env API router with mocked ansible."""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from app.api.v1.cluster_edge_env import router
from app.core.database import get_db
from app.models.cluster import Cluster, Node
from app.services.ansible_service import AnsibleRunnerService


@pytest.fixture
def mock_ansible():
    svc = MagicMock(spec=AnsibleRunnerService)
    svc.run_playbook = AsyncMock(return_value={"rc": 0, "stdout": "deploy:\n  prefix: edge\n", "stderr": ""})
    svc.generic_run = AsyncMock(return_value={"rc": 0, "stdout": "init OK.", "stderr": ""})
    with patch("app.api.v1.cluster_edge_env._ansible_service", svc):
        yield svc



def _make_app(db_session):
    app = FastAPI()
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    app.include_router(router, prefix="/api/v1")
    return app


class TestEdgeEnvDeploy:

    async def test_invalid_yaml_returns_422(self, test_db):
        app = _make_app(test_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/clusters/1/edge-env/deploy", json={"content": "key:\n\tval\n"})
            assert resp.status_code == 422

    async def test_empty_content_returns_422(self, test_db):
        app = _make_app(test_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/clusters/1/edge-env/deploy", json={"content": ""})
            assert resp.status_code == 422

    async def test_nonexistent_cluster_returns_404(self, test_db):
        app = _make_app(test_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/clusters/9999/edge-env/deploy", json={"content": "k: v\n"})
            assert resp.status_code == 404

    async def test_deploy_creates_version_record(self, mock_ansible, test_db):
        c = Cluster(name="test-cluster", status=1)
        test_db.add(c)
        await test_db.commit()
        await test_db.refresh(c)
        n = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        test_db.add(n)
        await test_db.commit()
        app = _make_app(test_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as cl:
            async with cl.stream("POST", f"/api/v1/clusters/{c.id}/edge-env/deploy", json={"content": "k: v\n"}) as resp:
                assert resp.status_code == 200
                found_complete = False
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            import json
                            data = json.loads(line[6:])
                            if data.get("type") == "complete":
                                assert data["version_id"] > 0
                                assert data["status"] in ("all_success", "partial", "all_failed")
                                found_complete = True
                        except json.JSONDecodeError:
                            pass
                assert found_complete, "Should have received a 'complete' event"


class TestEdgeEnvRead:

    async def test_read_nonexistent_cluster_returns_404(self, test_db):
        app = _make_app(test_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/clusters/9999/edge-env?node_id=1")
            assert resp.status_code == 404

    async def test_read_nonexistent_node_returns_404(self, test_db):
        c = Cluster(name="tc", status=1)
        test_db.add(c)
        await test_db.commit()
        await test_db.refresh(c)
        app = _make_app(test_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as cl:
            resp = await cl.get(f"/api/v1/clusters/{c.id}/edge-env?node_id=9999")
            assert resp.status_code == 404

    async def test_read_success(self, mock_ansible, test_db):
        c = Cluster(name="tc", status=1)
        test_db.add(c)
        await test_db.commit()
        await test_db.refresh(c)
        n = Node(cluster_id=c.id, ip="192.168.1.1", service_port=80, management_port=9990, edge_path="/data/edge", status=1)
        test_db.add(n)
        await test_db.commit()
        await test_db.refresh(n)
        app = _make_app(test_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as cl:
            resp = await cl.get(f"/api/v1/clusters/{c.id}/edge-env?node_id={n.id}")
            assert resp.status_code == 200
            body = resp.json()
            assert "content" in body
            assert body["node_id"] == n.id


class TestEdgeEnvVersions:

    async def test_list_empty(self, test_db):
        c = Cluster(name="tc", status=1)
        test_db.add(c)
        await test_db.commit()
        await test_db.refresh(c)
        app = _make_app(test_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as cl:
            resp = await cl.get(f"/api/v1/clusters/{c.id}/edge-env/versions")
            assert resp.status_code == 200
            assert resp.json()["total"] == 0

    async def test_list_nonexistent_cluster_returns_404(self, test_db):
        app = _make_app(test_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/clusters/9999/edge-env/versions")
            assert resp.status_code == 404

    async def test_get_nonexistent_version_returns_404(self, test_db):
        c = Cluster(name="tc", status=1)
        test_db.add(c)
        await test_db.commit()
        await test_db.refresh(c)
        app = _make_app(test_db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as cl:
            resp = await cl.get(f"/api/v1/clusters/{c.id}/edge-env/versions/9999")
            assert resp.status_code == 404
