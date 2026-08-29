"""Tests for the Edge node autostart API (POST /nodes/{id}/autostart)."""

import asyncio
import pytest
from unittest.mock import patch
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.database import Base, get_db
from app.core.security import hash_password
from app.models.cluster import Node
from app.models.user import User
from tests.api_helpers import AuthedTestClient, auth_headers_for


@pytest.fixture
def db_env():
    """Create in-memory DB with a node + user, override get_db, return (app, sessionmaker, auth_headers)."""
    from app.main import app

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with S() as s:
            s.add(Node(id=1, cluster_id=1, ip="192.168.0.24", edge_path="/data/uap-edge",
                      service_port=80, management_port=16620))
            s.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                      role="admin", status=1))
            await s.commit()
        return S

    S = asyncio.run(_setup())

    async def override_get_db():
        async with S() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    yield app, S, auth_headers_for(1)

    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


def test_infer_status_uses_stderr_for_not_configured():
    """未配置服务的 systemctl 报错在 stderr（rc≠0）——must 判为 not_configured 而非 unknown。

    回归：此前只读 stdout，前端（解析 stdout+stderr）显示"未配置"而库存"unknown"，
    刷新页面后状态回退"未知"。
    """
    from app.api.v1.edge_autostart import _infer_status
    assert _infer_status(1, "", "Failed to get unit file state for edge.service: No such file or directory") == "not_configured"
    assert _infer_status(0, "enabled\n", "") == "enabled"
    assert _infer_status(1, "disabled\n", "") == "disabled"
    assert _infer_status(126, "", "Failed to get unit file state for edge.service: Permission denied") == "permission_denied"
    assert _infer_status(126, "", "bash: /usr/bin/systemctl: 权限不够") == "permission_denied"
    assert _infer_status(1, "", "") == "unknown"


def test_autostart_node_not_found(db_env):
    app, _, AUTH = db_env
    with AuthedTestClient(app, headers=AUTH) as c:
        resp = c.post("/api/v1/nodes/999/autostart", json={"action": "status"})
        assert resp.status_code == 404


def test_autostart_invalid_action(db_env):
    app, _, AUTH = db_env
    with AuthedTestClient(app, headers=AUTH) as c:
        resp = c.post("/api/v1/nodes/1/autostart", json={"action": "bogus"})
        assert resp.status_code == 422


def test_autostart_enable_requires_root_password(db_env):
    app, _, AUTH = db_env
    import app.api.v1.edge_autostart as mod

    with patch.object(mod, "is_node_in_inventory", return_value=True):
        with AuthedTestClient(app, headers=AUTH) as c:
            resp = c.post("/api/v1/nodes/1/autostart", json={"action": "enable"})
            assert resp.status_code == 422
            assert "root 密码" in resp.json()["detail"]


def test_autostart_node_not_in_inventory(db_env):
    app, _, AUTH = db_env
    import app.api.v1.edge_autostart as mod

    with patch.object(mod, "is_node_in_inventory", return_value=False):
        with AuthedTestClient(app, headers=AUTH) as c:
            resp = c.post("/api/v1/nodes/1/autostart", json={"action": "enable", "root_password": "x"})
            assert resp.status_code == 400
            assert "inventory" in resp.json()["detail"]


def test_autostart_status_uses_ssh_and_streams(db_env):
    app, _, AUTH = db_env
    import app.api.v1.edge_autostart as mod

    async def fake_autostart(ip, action, edge_service_content, ssh_user, ssh_pass, on_line):
        return {"rc": 0, "status": "successful", "stdout": "enabled", "stderr": ""}

    with (
        patch.object(mod, "is_node_in_inventory", return_value=True),
        patch.object(mod._ansible_service, "edge_autostart", side_effect=fake_autostart) as mock_ssh,
    ):
        with AuthedTestClient(app, headers=AUTH) as c:
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


def test_autostart_writes_record(db_env):
    """操作成功后应写入 ps_node_autostart 记录（脱敏命令）。"""
    import asyncio
    from app.api.v1 import edge_autostart as mod
    from app.models.autostart import NodeAutostart

    app, S, AUTH = db_env

    async def fake_autostart(ip, action, edge_service_content, ssh_user, ssh_pass, on_line):
        return {"rc": 0, "status": "successful", "stdout": "disabled",
                "stderr": "", "command": f"sshpass -p secret123 ssh root@{ip} systemctl disable edge"}

    with (
        patch.object(mod, "is_node_in_inventory", return_value=True),
        patch.object(mod._ansible_service, "edge_autostart", side_effect=fake_autostart),
    ):
        with AuthedTestClient(app, headers=AUTH) as c:
            resp = c.post("/api/v1/nodes/1/autostart", json={"action": "disable", "root_password": "secret123"})
            assert resp.status_code == 200

    async def _check():
        async with S() as s:
            from sqlalchemy import select
            rows = (await s.execute(select(NodeAutostart))).scalars().all()
            assert len(rows) == 1
            assert rows[0].status == "disabled"
            assert "secret123" not in (rows[0].command or "")
            assert "*****" in (rows[0].command or "")
    asyncio.run(_check())


def test_autostart_records_read(db_env):
    """GET /nodes/autostart/records 应返回记录（读库）。"""
    import asyncio
    from app.api.v1 import edge_autostart as mod
    from app.models.autostart import NodeAutostart

    app, S, AUTH = db_env

    async def _seed():
        async with S() as s:
            s.add(NodeAutostart(node_id=1, cluster_id=1, status="enabled", action="enable",
                                command="sshpass -p ***** ssh ...", rc=0))
            await s.commit()
    asyncio.run(_seed())

    with patch.object(mod, "is_node_in_inventory", return_value=True):
        with AuthedTestClient(app, headers=AUTH) as c:
            resp = c.get("/api/v1/nodes/autostart/records")
            assert resp.status_code == 200
            items = resp.json() if isinstance(resp.json(), list) else resp.json().get("items", [])
            assert any(it["node_id"] == 1 and it["status"] == "enabled" for it in items)
