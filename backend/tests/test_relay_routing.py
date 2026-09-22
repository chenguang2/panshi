"""三通道寻址路由测试（openspec: add-relay-gateway / relay-channel-routing）。

快照解析（relay_registry）：DB 单一事实源，TTL 缓存 + CRUD 即时失效。
覆盖：总开关关闭=现状、网关 URL/目标头、403 映射、禁用提示、SSH -J、注入/恢复、歧义防护。
"""
import asyncio

import pytest
import yaml

from app.core.database import get_db
from app.main import app
from app.models.cluster import Cluster, Node
from app.models.relay import RelayGateway
from app.models.user import User
from app.core.security import hash_password
from app.services import relay_registry
from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

GW = "http://10.10.1.1:8443"
JUMP = "tunnel@10.10.1.1:22"
NODE_IP = "10.1.1.1"
NODE_PORT = 9180


async def _seed_routing(test_db, *, region_status: str = "enabled", cluster2_region: str | None = None):
    """luju 区域 + 集群 1 挂接 + 节点 NODE_IP；可选第二集群同 IP 异区域制造歧义。"""
    if await test_db.get(RelayGateway, 1) is None:
        test_db.add(RelayGateway(id=1, code="luju", name="路局A", http_base_url=GW, ssh_jump=JUMP,
                                 status=region_status))
        g = await test_db.get(RelayGateway, 1)
        g.status = region_status
    if await test_db.get(Cluster, 1) is None:
        test_db.add(Cluster(id=1, name="seed-cluster-1", status=1))
    c1 = await test_db.get(Cluster, 1)
    c1.region_code = "luju"
    if await test_db.get(Node, 1) is None:
        test_db.add(Node(id=1, cluster_id=1, ip=NODE_IP, service_port=80, management_port=NODE_PORT,
                         edge_path="/usr/local/edge"))
    if cluster2_region is not None:
        c2 = await test_db.get(Cluster, 2)
        if c2 is None:
            c2 = Cluster(id=2, name="seed-cluster-2", status=1)
            test_db.add(c2)
        c2.region_code = cluster2_region  # conftest 可能已 seed 集群 2，原地写 region
        if await test_db.get(Node, 2) is None:
            test_db.add(Node(id=2, cluster_id=2, ip=NODE_IP, service_port=80, management_port=NODE_PORT,
                             edge_path="/usr/local/edge"))
    await test_db.commit()
    relay_registry.invalidate()


@pytest.fixture
def relay_env(monkeypatch):
    """开启总开关并隔离快照缓存（用例内自行 seed + ensure_fresh）。"""
    monkeypatch.setenv("EDGE_RELAY_ENABLED", "1")
    monkeypatch.setenv("EDGE_RELAY_SSH_KEY", "/tmp/relay_test_ed25519")
    relay_registry.invalidate()
    yield
    relay_registry.invalidate()


@pytest.fixture
def client(test_db, test_db_factory):
    async def override_get_db():
        async with test_db_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    import asyncio
    from app.models.user import User

    async def _seed():
        if await test_db.get(User, 1) is None:
            test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                            role="admin", status=1))
        await test_db.commit()
    asyncio.run(_seed())
    with isolated_app_lifespan(), AuthedTestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── 任务 2.1/2.4：总开关关闭 == 现状 ──────────────────────────

def test_switch_off_edgeclient_direct(test_db):
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
    asyncio.run(_seed())
    from app.services.edge_client import EdgeClient

    c = EdgeClient(1, node_ip=NODE_IP, node_port=NODE_PORT)
    assert c.edge_url == f"http://{NODE_IP}:{NODE_PORT}"
    assert c.relay_target is None


def test_switch_off_build_ssh_cmd_direct():
    from app.services.ansible_service import _build_ssh_cmd

    cmd = _build_ssh_cmd(NODE_IP, "ops", "echo hi", password="pw")
    assert "-J" not in cmd


# ── 任务 2.5：EdgeClient 网关模式 ─────────────────────────────

def test_gateway_url_and_target(test_db, test_db_factory, relay_env):
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())
    from app.services.edge_client import EdgeClient

    c = EdgeClient(1, node_ip=NODE_IP, node_port=NODE_PORT)
    assert c.edge_url == GW
    assert c.relay_target == f"{NODE_IP}:{NODE_PORT}"


def test_disabled_region_falls_back_direct(test_db, test_db_factory, relay_env):
    import asyncio

    async def _seed():
        await _seed_routing(test_db, region_status="disabled")
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())
    from app.services.edge_client import EdgeClient

    c = EdgeClient(1, node_ip=NODE_IP, node_port=NODE_PORT)
    assert c.edge_url == f"http://{NODE_IP}:{NODE_PORT}"
    assert c.relay_target is None
    assert c.relay_state == "disabled"


def test_ambiguous_ip_falls_back_direct(test_db, test_db_factory, relay_env):
    import asyncio

    async def _seed():
        await _seed_routing(test_db, cluster2_region="tianjin")
        test_db.add(RelayGateway(id=2, code="tianjin", name="路局B"))
        await test_db.commit()
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())
    from app.services.edge_client import EdgeClient

    c = EdgeClient(1, node_ip=NODE_IP, node_port=NODE_PORT)
    assert c.relay_state == "ambiguous"
    assert c.relay_target is None
    assert c.edge_url == f"http://{NODE_IP}:{NODE_PORT}"


def test_request_carries_x_edge_target(test_db, test_db_factory, relay_env, monkeypatch):
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())
    from app.services.edge_client import EdgeClient

    captured = {}

    class FakeResp:
        status_code = 200
        text = ""

    def fake_get(url, headers=None, **kwargs):
        captured["url"] = url
        captured["headers"] = headers
        return FakeResp()

    monkeypatch.setattr("httpx.get", fake_get)
    c = EdgeClient(1, node_ip=NODE_IP, node_port=NODE_PORT)
    c._request("GET", "/edge/admin/upstreams")
    assert captured["url"].startswith(GW)
    assert captured["headers"]["X-Edge-Target"] == f"{NODE_IP}:{NODE_PORT}"


def test_gateway_403_mapped_to_whitelist_hint(test_db, test_db_factory, relay_env, monkeypatch):
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())
    from app.services.edge_client import EdgeClient, EdgeAPIError

    class FakeResp:
        status_code = 403
        text = "Forbidden"

    monkeypatch.setattr("httpx.post", lambda url, **kw: FakeResp())
    c = EdgeClient(1, node_ip=NODE_IP, node_port=NODE_PORT)
    with pytest.raises(EdgeAPIError) as ei:
        c._request("POST", "/edge/admin/routes", body={})
    assert "白名单" in str(ei.value.message)


def test_gateway_403_not_mapped_in_direct_mode(test_db, monkeypatch):
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
    asyncio.run(_seed())
    from app.services.edge_client import EdgeClient, EdgeAPIError

    class FakeResp:
        status_code = 403
        text = "Forbidden"

    monkeypatch.setattr("httpx.post", lambda url, **kw: FakeResp())
    c = EdgeClient(1, node_ip=NODE_IP, node_port=NODE_PORT)
    with pytest.raises(EdgeAPIError) as ei:
        c._request("POST", "/edge/admin/routes", body={})
    assert "白名单" not in str(ei.value.message)


# ── 任务 2.6：裸 SSH -J ──────────────────────────────────────

def test_build_ssh_cmd_with_jump(test_db, test_db_factory, relay_env):
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())
    from app.services.ansible_service import _build_ssh_cmd

    cmd = _build_ssh_cmd(NODE_IP, "ops", "echo hi", password="pw")
    assert "-J" in cmd
    assert JUMP in cmd
    assert "/tmp/relay_test_ed25519" in cmd


def test_build_ssh_cmd_ambiguous_no_jump(test_db, test_db_factory, relay_env):
    import asyncio

    async def _seed():
        await _seed_routing(test_db, cluster2_region="tianjin")
        test_db.add(RelayGateway(id=2, code="tianjin", name="路局B"))
        await test_db.commit()
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())
    from app.services.ansible_service import _build_ssh_cmd

    cmd = _build_ssh_cmd(NODE_IP, "ops", "echo hi", password="pw")
    assert "-J" not in cmd


# ── 任务 2.7：Ansible 运行期注入 / 恢复 ────────────────────────

def test_inventory_inject_relay_roundtrip(test_db, test_db_factory, relay_env, tmp_path, monkeypatch):
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())

    inv = tmp_path / "host"
    inv.write_text(yaml.safe_dump({
        "all": {"children": {"edge_cluster": {"hosts": {
            NODE_IP: {"ansible_ssh_user": "ops", "ansible_ssh_pass": "pw"},
        }}}}
    }), encoding="utf-8")
    monkeypatch.setattr("app.services.ansible_service._INVENTORY_PATH", inv)

    from app.services import ansible_service

    previous = ansible_service._inventory_inject_relay(NODE_IP)
    assert previous is None
    data = yaml.safe_load(inv.read_text(encoding="utf-8"))
    host = data["all"]["children"]["edge_cluster"]["hosts"][NODE_IP]
    assert "ProxyCommand" in host.get("ansible_ssh_common_args", "")
    assert "tunnel@10.10.1.1" in host["ansible_ssh_common_args"]

    ansible_service._inventory_restore_relay(NODE_IP)
    data = yaml.safe_load(inv.read_text(encoding="utf-8"))
    host = data["all"]["children"]["edge_cluster"]["hosts"][NODE_IP]
    assert "ansible_ssh_common_args" not in host
    assert host["ansible_ssh_pass"] == "pw"  # 红线 #10：其余字段不动


def test_relay_args_for_ips(test_db, test_db_factory, relay_env):
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())
    from app.services import ansible_service

    args = ansible_service._relay_ssh_common_args([NODE_IP])
    assert args is not None and "ProxyCommand" in args and "tunnel@10.10.1.1" in args


# ── 任务 2.9：禁用提示 ───────────────────────────────────────

def test_disabled_connection_hint(test_db, test_db_factory, relay_env):
    import asyncio

    async def _seed():
        await _seed_routing(test_db, region_status="disabled")
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())
    from app.services.ansible_service import _append_relay_hint

    out = _append_relay_hint(NODE_IP, rc=1, stderr="timeout")
    assert "中继已禁用" in out
    ok = _append_relay_hint(NODE_IP, rc=0, stderr="")
    assert ok == ""


# ── 任务 2.8：连接类失败立即重试（档 1） ──────────────────────

def test_ssh_conn_failure_retried_once_when_relay_on(test_db, relay_env, monkeypatch):
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
        await relay_registry.ensure_fresh()
    asyncio.run(_seed())
    from app.services import ansible_service

    key_calls = {"n": 0}
    pass_calls = {"n": 0}

    async def fake_run_subprocess(cmd):
        if cmd[0] == "sshpass":
            pass_calls["n"] += 1
            return 255, "", "Permission denied"
        key_calls["n"] += 1
        if key_calls["n"] == 1:
            return 255, "", "ssh: connect to host 10.1.1.1 port 22: Connection refused"
        return 0, "ok", ""

    monkeypatch.setattr(ansible_service, "_run_subprocess", fake_run_subprocess)
    rc, stdout, stderr = asyncio.run(
        ansible_service._run_ssh_with_fallback(NODE_IP, "ops", "echo hi", password="pw")
    )
    # 中继开启：连接类失败立即重试一次 key 认证（不走密码回退）
    assert rc == 0 and stdout == "ok"
    assert key_calls["n"] == 2 and pass_calls["n"] == 0


def test_ssh_conn_failure_no_retry_when_relay_off(monkeypatch):
    from app.services import ansible_service

    key_calls = {"n": 0}
    pass_calls = {"n": 0}

    async def fake_run_subprocess(cmd):
        if cmd[0] == "sshpass":
            pass_calls["n"] += 1
            return 255, "", "Permission denied"
        key_calls["n"] += 1
        return 255, "", "ssh: connect to host 10.1.1.1 port 22: Connection refused"

    monkeypatch.setattr(ansible_service, "_run_subprocess", fake_run_subprocess)
    rc, stdout, stderr = asyncio.run(
        ansible_service._run_ssh_with_fallback("10.5.5.5", "ops", "echo hi", password="pw")
    )
    # 中继关闭：现状语义（key 失败 → 密码回退一次），无额外重试
    assert rc != 0
    assert key_calls["n"] == 1 and pass_calls["n"] == 1
