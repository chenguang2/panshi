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


def test_status_with_root_creds_uses_root_user():
    """查询状态传 root_user/root_password 时，edge_autostart 应以 root 凭据连接。"""
    import asyncio
    from unittest.mock import AsyncMock, patch
    from app.services.ansible_service import AnsibleRunnerService

    svc = AnsibleRunnerService(private_data_dir="/tmp/runner-ut")
    called = {}

    async def fake_run_ssh(ip, user, cmd, password="", on_line=None, port=None):
        called["user"] = user
        called["password"] = password
        return (1, "", "Failed to get unit file state for edge.service: No such file or directory")

    with patch("app.services.ansible_service._run_ssh_with_fallback", side_effect=fake_run_ssh):
        result = asyncio.run(svc.edge_autostart(
            ip="192.168.0.13", action="status", edge_service_content=None,
            ssh_user="root", ssh_pass="secret-root-pw",
        ))
    assert called["user"] == "root"
    assert called["password"] == "secret-root-pw"
    assert result["rc"] == 1

    # 未传 root 凭据 → 回退 inventory 用户
    called.clear()
    with patch("app.services.ansible_service._run_ssh_with_fallback", side_effect=fake_run_ssh):
        with patch("app.services.ansible_service.get_ssh_user", return_value="jboss"):
            with patch("app.services.ansible_service.get_ssh_password", return_value="jbosspw"):
                asyncio.run(svc.edge_autostart(
                    ip="192.168.0.13", action="status", edge_service_content=None,
                ))
    assert called["user"] == "jboss"
    assert called["password"] == "jbosspw"


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


# ── fix-autostart-perm-status：统一持久化规则（以内容为准 + 失败不覆盖）──────────

def _seed_autostart_row(S, status, node_id=1, cluster_id=1):
    """预置 ps_node_autostart 行。"""
    from app.models.autostart import NodeAutostart

    async def _s():
        async with S() as s:
            s.add(NodeAutostart(node_id=node_id, cluster_id=cluster_id, status=status,
                                action="enable", command="sshpass -p ***** ssh ...", rc=0))
            await s.commit()
    asyncio.run(_s())


def _fetch_autostart_rows(S):
    from sqlalchemy import select
    from app.models.autostart import NodeAutostart

    async def _f():
        async with S() as s:
            return (await s.execute(select(NodeAutostart))).scalars().all()
    return asyncio.run(_f())


def _fake_ssh_result(**kw):
    async def fake_autostart(ip, action, edge_service_content, ssh_user, ssh_pass, on_line):
        return {"status": "successful" if kw.get("rc", -1) == 0 else "failed",
                "command": f"ssh root@{ip} systemctl is-enabled edge", **kw}
    return fake_autostart


def test_failed_status_query_preserves_last_known_state(db_env):
    """1.1 无权限查询（permission_denied）不得覆盖库中最后已知真实态。"""
    from app.api.v1 import edge_autostart as mod

    app, S, AUTH = db_env
    _seed_autostart_row(S, "disabled")

    with (
        patch.object(mod, "is_node_in_inventory", return_value=True),
        patch.object(mod._ansible_service, "edge_autostart",
                     side_effect=_fake_ssh_result(rc=126, stdout="",
                                                  stderr="bash: /usr/bin/systemctl: 权限不够")),
    ):
        with AuthedTestClient(app, headers=AUTH) as c:
            resp = c.post("/api/v1/nodes/1/autostart", json={"action": "status"})
            assert resp.status_code == 200

    rows = _fetch_autostart_rows(S)
    assert len(rows) == 1
    row = rows[0]
    assert row.status == "disabled", f"失败查询覆盖了最后已知真实态: {row.status}"
    assert row.action == "status"
    assert row.rc == 126


def test_failed_enable_preserves_last_known_state(db_env):
    """1.2 enable 失败（SSH rc=255 无有效输出）不得把已知真实态抹成 unknown。"""
    from app.api.v1 import edge_autostart as mod

    app, S, AUTH = db_env
    _seed_autostart_row(S, "enabled")

    with (
        patch.object(mod, "is_node_in_inventory", return_value=True),
        patch.object(mod._ansible_service, "edge_autostart",
                     side_effect=_fake_ssh_result(rc=255, stdout="",
                                                  stderr="Permission denied (publickey,password).")),
    ):
        with AuthedTestClient(app, headers=AUTH) as c:
            resp = c.post("/api/v1/nodes/1/autostart",
                          json={"action": "enable", "root_password": "secret123"})
            assert resp.status_code == 200

    row = _fetch_autostart_rows(S)[0]
    assert row.status == "enabled", f"失败的 enable 抹掉了已知状态: {row.status}"
    assert row.action == "enable"
    assert row.rc == 255


def test_disable_false_success_records_actual_state(db_env):
    """1.3 disable 命令因 || true 恒 rc=0，但 is-enabled 实际输出 enabled 时，
    库必须记录实际值（不得写操作期望值 disabled）。"""
    from app.api.v1 import edge_autostart as mod

    app, S, AUTH = db_env
    _seed_autostart_row(S, "enabled")

    with (
        patch.object(mod, "is_node_in_inventory", return_value=True),
        patch.object(mod._ansible_service, "edge_autostart",
                     side_effect=_fake_ssh_result(rc=0, stdout="enabled", stderr="")),
    ):
        with AuthedTestClient(app, headers=AUTH) as c:
            resp = c.post("/api/v1/nodes/1/autostart",
                          json={"action": "disable", "root_password": "secret123"})
            assert resp.status_code == 200

    row = _fetch_autostart_rows(S)[0]
    assert row.status == "enabled", f"写入了操作期望值而非实际输出: {row.status}"
    assert row.action == "disable"


def test_status_query_real_output_updates_despite_rc1(db_env):
    """1.4 判据是输出内容而非 rc：is-enabled 对 disabled 合法返回 rc=1，
    推导出真实态必须正常刷新（重构中不得回退此行为）。"""
    from app.api.v1 import edge_autostart as mod

    app, S, AUTH = db_env
    _seed_autostart_row(S, "enabled")

    with (
        patch.object(mod, "is_node_in_inventory", return_value=True),
        patch.object(mod._ansible_service, "edge_autostart",
                     side_effect=_fake_ssh_result(rc=1, stdout="disabled", stderr="")),
    ):
        with AuthedTestClient(app, headers=AUTH) as c:
            resp = c.post("/api/v1/nodes/1/autostart", json={"action": "status"})
            assert resp.status_code == 200

    row = _fetch_autostart_rows(S)[0]
    assert row.status == "disabled", f"rc=1 的真实输出未刷新: {row.status}"
