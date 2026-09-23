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
def relay_env(monkeypatch, tmp_path):
    """开启总开关（features.yaml 的 relay_gateway=true）并隔离快照缓存。

    总开关已从 EDGE_RELAY_ENABLED 环境变量迁移到 features.yaml（mtime 热加载）。
    """
    import app.core.features as fmod

    cfg = tmp_path / "features.yaml"
    cfg.write_text("features:\n  relay_gateway: true\n", encoding="utf-8")
    monkeypatch.setattr(fmod, "_FEATURES_PATH", cfg)
    monkeypatch.setattr(fmod, "_features", None)
    monkeypatch.setattr(fmod, "_features_mtime", 0.0)
    key = tmp_path / "relay_test_ed25519"
    key.write_text("dummy-relay-key", encoding="utf-8")  # 仅存在性，不用于真实连接
    monkeypatch.setenv("EDGE_RELAY_SSH_KEY", str(key))
    relay_registry.invalidate()
    yield str(key)
    monkeypatch.setattr(fmod, "_features", None)
    monkeypatch.setattr(fmod, "_features_mtime", 0.0)
    relay_registry.invalidate()


@pytest.fixture
def relay_feature_file(monkeypatch, tmp_path):
    """返回一个可写入临时 features.yaml 的 helper（用于总开关来源用例）。"""
    import app.core.features as fmod

    def _write(body: str):
        cfg = tmp_path / "features.yaml"
        cfg.write_text(body, encoding="utf-8")
        monkeypatch.setattr(fmod, "_FEATURES_PATH", cfg)
        monkeypatch.setattr(fmod, "_features", None)
        monkeypatch.setattr(fmod, "_features_mtime", 0.0)

    yield _write
    monkeypatch.setattr(fmod, "_features", None)
    monkeypatch.setattr(fmod, "_features_mtime", 0.0)


# ── 总开关来源：features.yaml.features.relay_gateway（显式 opt-in，默认关） ──

def test_relay_disabled_when_flag_absent(relay_feature_file):
    """未配置 relay_gateway 时默认关闭（不沿用 features.yaml 的 opt-out 约定）。"""
    relay_feature_file("features:\n  metrics: true\n")
    assert relay_registry.relay_enabled() is False


def test_relay_enabled_when_flag_true(relay_feature_file):
    relay_feature_file("features:\n  relay_gateway: true\n")
    assert relay_registry.relay_enabled() is True


# ── CRUD 后路由快照强制重载（回归：原先只 invalidate，需重启才生效） ──
#
# 注：不能"POST 后直接读快照断言"——测试夹具的 get_db(API) 与 relay_registry 内部
# 使用的 AsyncSessionLocal 是两个隔离库（conftest test_db vs 全局），快照读不到
# API 写入的数据。故断言"端点确实强制重载"（生产两者同库，重载即生效）。

def _spy_refresh(monkeypatch) -> list:
    calls: list[bool] = []

    async def _spy(force: bool = False, **kwargs):
        calls.append(force)
        return None

    monkeypatch.setattr(relay_registry, "ensure_fresh", _spy)
    return calls


def _create_gateway(client) -> dict:
    resp = client.post(
        "/api/v1/relay/gateways",
        json={"code": "newreg", "name": "新区域", "http_base_url": "http://10.9.9.9:8443"},
    )
    assert resp.status_code in (200, 201)
    return resp.json()


def test_create_gateway_force_refreshes_routing(client, monkeypatch):
    calls = _spy_refresh(monkeypatch)
    _create_gateway(client)
    assert calls == [True], "CREATE 后未强制重载路由快照（回归：变更需重启才生效）"


def test_update_gateway_force_refreshes_routing(client, monkeypatch):
    created = _create_gateway(client)
    calls = _spy_refresh(monkeypatch)
    resp = client.put(f"/api/v1/relay/gateways/{created['id']}", json={"name": "改名"})
    assert resp.status_code == 200
    assert calls == [True], "UPDATE 后未强制重载路由快照"


def test_update_status_force_refreshes_routing(client, monkeypatch):
    created = _create_gateway(client)
    calls = _spy_refresh(monkeypatch)
    resp = client.put(f"/api/v1/relay/gateways/{created['id']}/status", json={"status": "disabled"})
    assert resp.status_code == 200
    assert calls == [True], "status 更新后未强制重载路由快照"


def test_delete_gateway_force_refreshes_routing(client, monkeypatch):
    created = _create_gateway(client)
    calls = _spy_refresh(monkeypatch)
    resp = client.delete(f"/api/v1/relay/gateways/{created['id']}")
    assert resp.status_code == 200
    assert calls == [True], "DELETE 后未强制重载路由快照"


# ── 集群 / 节点变更后路由快照强制重载 ──
#
# 路由快照的 node_region/cluster_region 派生自 ps_cluster.region_code 与 ps_node；
# 仅网关 CRUD 会重载是不够的：集群绑定区域、增删节点同样改变路由，却不重载
# → 同步读取方（run_playbook 的跳板注入）仍用旧快照，绑定区域后不重启不生效
# （2026-09-23 实测：demo-cluster 绑定 aoh 后 192.168.0.14 仍直连）。

def _create_cluster(client, name: str = "reg-cluster") -> dict:
    resp = client.post("/api/v1/clusters", json={"name": name})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _create_node(client, cluster_id: int, ip: str = "10.1.1.1") -> dict:
    resp = client.post(
        f"/api/v1/clusters/{cluster_id}/nodes",
        json={"ip": ip, "edge_path": "/opt/edge", "service_port": 80, "management_port": 9180},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def test_create_cluster_force_refreshes_routing(client, monkeypatch):
    calls = _spy_refresh(monkeypatch)
    _create_cluster(client)
    assert calls == [True], "集群创建后未强制重载路由快照"


def test_update_cluster_region_force_refreshes_routing(client, monkeypatch):
    cluster = _create_cluster(client)
    calls = _spy_refresh(monkeypatch)
    resp = client.put(f"/api/v1/clusters/{cluster['id']}", json={"region_code": None})
    assert resp.status_code == 200
    assert calls == [True], "集群区域变更后未强制重载路由快照（回归：绑定区域不重启不生效）"


def test_delete_cluster_force_refreshes_routing(client, monkeypatch):
    cluster = _create_cluster(client)
    calls = _spy_refresh(monkeypatch)
    resp = client.request(
        "DELETE", f"/api/v1/clusters/{cluster['id']}", json={"delete_db": True}
    )
    assert resp.status_code == 200
    assert calls == [True], "集群删除后未强制重载路由快照"


def test_create_node_force_refreshes_routing(client, monkeypatch):
    cluster = _create_cluster(client)
    calls = _spy_refresh(monkeypatch)
    _create_node(client, cluster["id"])
    assert calls == [True], "节点创建后未强制重载路由快照"


def test_update_node_force_refreshes_routing(client, monkeypatch):
    cluster = _create_cluster(client)
    node = _create_node(client, cluster["id"])
    calls = _spy_refresh(monkeypatch)
    resp = client.put(f"/api/v1/clusters/{cluster['id']}/nodes/{node['id']}", json={"service_port": 8080})
    assert resp.status_code == 200
    assert calls == [True], "节点更新后未强制重载路由快照"


def test_delete_node_force_refreshes_routing(client, monkeypatch):
    cluster = _create_cluster(client)
    node = _create_node(client, cluster["id"])
    calls = _spy_refresh(monkeypatch)
    resp = client.request(
        "DELETE",
        f"/api/v1/clusters/{cluster['id']}/nodes/{node['id']}",
        json={"delete_db": True},
    )
    assert resp.status_code == 200
    assert calls == [True], "节点删除后未强制重载路由快照"


def test_relay_refresh_loop_periodically_reloads(monkeypatch):
    """30s TTL 兜底：覆盖导入/还原、切换活动数据库等非端点改动。"""
    import asyncio

    from app import main as app_main

    calls: list[int] = []

    async def _spy(**kwargs):
        calls.append(1)

    monkeypatch.setattr(relay_registry, "ensure_fresh", _spy)

    async def _run():
        task = asyncio.create_task(app_main._relay_refresh_loop(interval=0.01))
        await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(_run())
    assert calls, "周期兜底未调用 ensure_fresh（TTL 形同虚设）"




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


# ── 自跳守卫：网关机同时是该集群业务节点（跳板 == 目标）→ 跳过中继直连 ──
#
# 实测事故：aoh 网关是 jboss@192.168.0.13，而同一集群的业务节点也是 192.168.0.13。
# 开启总开关后 ansible 注入 ProxyCommand 经"自己"跳板去连"自己"，ssh 报
# jumphost loop → 连接被关闭（rc=4，Connection closed by UNKNOWN port 65535）。

SELF_IP = "10.2.2.2"


def test_self_jump_host_is_skipped(test_db, test_db_factory, relay_env):
    import asyncio

    from app.services.ansible_service import _relay_ssh_common_args

    async def _seed():
        test_db.add(RelayGateway(id=9, code="selfreg", name="自跳局",
                                 http_base_url="http://10.2.2.2:8443",
                                 ssh_jump="jboss@10.2.2.2:22", status="enabled"))
        test_db.add(Cluster(id=9, name="self-cluster", region_code="selfreg", status=1))
        test_db.add(Node(id=9, cluster_id=9, ip=SELF_IP, service_port=80,
                         management_port=9180, edge_path="/usr/local/edge"))
        await test_db.commit()
        await relay_registry.ensure_fresh(session_factory=test_db_factory)

    asyncio.run(_seed())

    # 路由本身仍活跃、配置里的 jump 仍在
    route, state = relay_registry.route_for_ip(SELF_IP)
    assert state == "active"
    assert route is not None and route.ssh_jump == "jboss@10.2.2.2:22"
    # 但 SSH 腿必须跳过自跳（回退直连）
    assert relay_registry.ssh_jump_for_ip(SELF_IP) is None
    assert _relay_ssh_common_args([SELF_IP]) is None


def test_non_self_jump_still_proxies(test_db, test_db_factory, relay_env):
    """对照：跳板与目标不同主机时守卫不得误伤。"""
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
        await relay_registry.ensure_fresh(session_factory=test_db_factory)

    asyncio.run(_seed())
    assert relay_registry.ssh_jump_for_ip(NODE_IP) == JUMP


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
    assert relay_env in cmd  # 专用密钥存在 → 注入 -i


# ── 当前实况：未部署专用跳板密钥 → 不注入 -i，回退平台默认 SSH 身份 ──
#
# 设计要求（专用 tunnel 账号 + relay_ed25519 + PermitOpen）是建议；现实部署常用普通
# 账号 + 平台默认密钥。缺密钥文件时必须省略 -i，否则 ssh 会打印
# 「Identity file ... not accessible」告警并污染命令回显。

def _seed_relay(test_db, test_db_factory):
    import asyncio

    async def _seed():
        await _seed_routing(test_db)
        await relay_registry.ensure_fresh(session_factory=test_db_factory)
    asyncio.run(_seed())


def test_relay_key_args_omitted_when_file_missing(tmp_path, monkeypatch):
    from app.services.ansible_service import _relay_key_args

    monkeypatch.setenv("EDGE_RELAY_SSH_KEY", str(tmp_path / "nope"))
    assert _relay_key_args() == []


def test_relay_key_args_present_when_file_exists(tmp_path, monkeypatch):
    from app.services.ansible_service import _relay_key_args

    key = tmp_path / "relay_ed25519"
    key.write_text("x", encoding="utf-8")
    monkeypatch.setenv("EDGE_RELAY_SSH_KEY", str(key))
    assert _relay_key_args() == ["-i", str(key)]


def test_build_ssh_cmd_without_key_uses_default_identity(test_db, test_db_factory, relay_env, tmp_path, monkeypatch):
    monkeypatch.setenv("EDGE_RELAY_SSH_KEY", str(tmp_path / "nope"))
    _seed_relay(test_db, test_db_factory)
    from app.services.ansible_service import _build_ssh_cmd

    cmd = _build_ssh_cmd(NODE_IP, "ops", "echo hi", password="pw")
    assert "-J" in cmd and JUMP in cmd  # 跳板仍在
    assert "nope" not in cmd            # 但不引用不存在的密钥
    assert "-i" not in cmd


def test_proxy_command_without_key_omits_identity(test_db, test_db_factory, relay_env, tmp_path, monkeypatch):
    monkeypatch.setenv("EDGE_RELAY_SSH_KEY", str(tmp_path / "nope"))
    _seed_relay(test_db, test_db_factory)
    from app.services.ansible_service import _relay_ssh_common_args

    args = _relay_ssh_common_args([NODE_IP])
    assert args is not None and "ProxyCommand" in args and "tunnel@10.10.1.1" in args
    assert "nope" not in args
    assert "-i " not in args  # 不注入 -i


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
    from app.services import ansible_service, relay_registry

    # 用例前提=总开关关闭；显式钉住，避免依赖部署 features.yaml 的取值
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: False)

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
