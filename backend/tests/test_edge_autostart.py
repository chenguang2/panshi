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


def test_autostart_status_does_not_inject_root_and_streams(db_env):
    app, _ = db_env
    import app.api.v1.edge_autostart as mod

    async def fake_stream(runner, ip, tag, extravars, ssh_port):
        yield 'data: {"line": "checking", "percent": 0}\n\n'
        yield 'data: {"rc": 0, "status": "successful", "percent": 100}\n\n'

    with (
        patch.object(mod, "is_node_in_inventory", return_value=True),
        patch.object(mod, "_run_ansible_stream", side_effect=fake_stream) as mock_stream,
        patch.object(mod, "_inventory_inject_ssh") as mock_inject,
        patch.object(mod, "_inventory_restore_ssh") as mock_restore,
    ):
        with TestClient(app) as c:
            resp = c.post("/api/v1/nodes/1/autostart", json={"action": "status"})
            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]
            body = resp.text
            assert '"rc": 0' in body
            mock_inject.assert_not_called()
            mock_restore.assert_not_called()
            mock_stream.assert_called_once()
            # status 不注入 root → extravars 只有 action
            kwargs = mock_stream.call_args.kwargs
            assert kwargs["extravars"] == {"action": "status"}
