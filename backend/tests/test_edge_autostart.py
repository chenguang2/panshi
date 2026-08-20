"""Tests for the Edge node autostart API (POST /nodes/{id}/autostart)."""

import asyncio
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.database import Base, get_db
from app.models.cluster import Node


@pytest.fixture
def db_env():
    """Create in-memory DB with a node, override get_db, return (app, sessionmaker)."""
    from app.main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with S() as s:
            s.add(Node(id=1, cluster_id=1, ip="192.168.0.24", edge_path="/data/uap-edge",
                      service_port=80, management_port=16620))
            await s.commit()
        return S

    S = asyncio.run(_setup())

    async def override_get_db():
        async with S() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    yield app, S

    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


def test_autostart_node_not_found(db_env):
    app, _ = db_env
    with TestClient(app) as c:
        resp = c.post("/api/v1/nodes/999/autostart", json={"action": "status"})
        assert resp.status_code == 404


def test_autostart_invalid_action(db_env):
    app, _ = db_env
    with TestClient(app) as c:
        resp = c.post("/api/v1/nodes/1/autostart", json={"action": "bogus"})
        assert resp.status_code == 422


def test_autostart_enable_requires_root_password(db_env):
    app, _ = db_env
    import app.api.v1.edge_autostart as mod

    with patch.object(mod, "is_node_in_inventory", return_value=True):
        with TestClient(app) as c:
            resp = c.post("/api/v1/nodes/1/autostart", json={"action": "enable"})
            assert resp.status_code == 422
            assert "root 密码" in resp.json()["detail"]


def test_autostart_node_not_in_inventory(db_env):
    app, _ = db_env
    import app.api.v1.edge_autostart as mod

    with patch.object(mod, "is_node_in_inventory", return_value=False):
        with TestClient(app) as c:
            resp = c.post("/api/v1/nodes/1/autostart", json={"action": "enable", "root_password": "x"})
            assert resp.status_code == 400
            assert "inventory" in resp.json()["detail"]


def test_autostart_status_uses_ssh_and_streams(db_env):
    app, _ = db_env
    import app.api.v1.edge_autostart as mod

    async def fake_autostart(ip, action, edge_service_content, ssh_user, ssh_pass, on_line):
        return {"rc": 0, "status": "successful", "stdout": "enabled", "stderr": ""}

    with (
        patch.object(mod, "is_node_in_inventory", return_value=True),
        patch.object(mod._ansible_service, "edge_autostart", side_effect=fake_autostart) as mock_ssh,
    ):
        with TestClient(app) as c:
            resp = c.post("/api/v1/nodes/1/autostart", json={"action": "status"})
            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]
            body = resp.text
            assert '"rc": 0' in body
            mock_ssh.assert_called_once()
            kwargs = mock_ssh.call_args
            # status 不需要 root 凭据
            assert kwargs.kwargs.get("ssh_pass") is None
            assert kwargs.kwargs.get("ssh_user") is None
            assert kwargs.kwargs["action"] == "status"
