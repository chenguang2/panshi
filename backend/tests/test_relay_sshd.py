"""网关 sshd 跳板转发配置测试（openspec: add-relay-gateway / relay-sshd-permit）。

覆盖：drop-in 渲染（AllowTcpForwarding + PermitOpen）、root 凭据注入/还原、SSE 端点。
"""
import asyncio
import json

import pytest

from app.main import app
from app.core.database import get_db
from app.models.relay import RelayGateway
from app.services import relay_push, relay_sshd

GATEWAYS_YAML = """\
# 中继网关机清单
gateways_aoh:
  hosts:
    192.168.0.13:
      ansible_user: jboss
      ansible_ssh_pass: jboss-secret
      ansible_python_interpreter: /work/jboss/anaconda3/bin/python3
  vars:
    ansible_user: jboss
"""


@pytest.fixture
def gateways_inv(tmp_path, monkeypatch):
    """隔离网关清单：返回其路径并把 relay_push 的常量指向它。"""
    path = tmp_path / "gateways"
    path.write_text(GATEWAYS_YAML, encoding="utf-8")
    monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", str(path))
    return path


def _seed_region(test_db):
    async def _run():
        from app.models.cluster import Cluster, Node

        test_db.add(RelayGateway(id=1, code="aoh", name="上海局",
                                 http_base_url="http://192.168.0.13:8443",
                                 ssh_jump="jboss@192.168.0.13", status="enabled"))
        c1 = await test_db.get(Cluster, 1)
        if c1 is None:
            test_db.add(Cluster(id=1, name="c1", status=1))
            c1 = await test_db.get(Cluster, 1)
        c1.region_code = "aoh"
        test_db.add(Node(id=1, cluster_id=1, ip="192.168.0.15", service_port=80,
                         management_port=16620, ssh_port=22, edge_path="/e", status=1))
        await test_db.commit()

    asyncio.run(_run())


# ── drop-in 渲染 ─────────────────────────────────────────────

def test_render_sshd_dropin_has_forwarding_and_permit(test_db):
    _seed_region(test_db)
    content = asyncio.run(relay_push.render_sshd_dropin("aoh", db=test_db))
    assert "AllowTcpForwarding yes" in content
    assert "PermitOpen 192.168.0.15:22" in content
    assert content.startswith("# 由磐石平台自动生成")


def test_render_permit_open_single_comma_separated_directive(test_db):
    """回归：PermitOpen 必须一条指令逗号分隔（多行时 sshd 只认首条 → 其余节点被拒）。"""
    _seed_region(test_db)

    async def _add_node():
        from app.models.cluster import Node

        test_db.add(Node(id=2, cluster_id=1, ip="192.168.0.16", service_port=80,
                         management_port=16620, ssh_port=2222, edge_path="/e", status=1))
        await test_db.commit()

    asyncio.run(_add_node())
    content = asyncio.run(relay_push.render_sshd_dropin("aoh", db=test_db))
    assert content.count("PermitOpen ") == 1
    assert "PermitOpen 192.168.0.15:22,192.168.0.16:2222" in content


def test_render_permit_open_stays_permit_only(test_db):
    """push 的 sshd 腿仍只写 PermitOpen（不含 AllowTcpForwarding）。"""
    _seed_region(test_db)
    content = asyncio.run(relay_push.render_permit_open("aoh", db=test_db))
    assert "PermitOpen 192.168.0.15:22" in content
    assert "AllowTcpForwarding" not in content


# ── root 凭据注入 / 还原 ─────────────────────────────────────

def test_gateway_hosts(gateways_inv):
    assert relay_sshd._gateway_hosts("gateways_aoh") == ["192.168.0.13"]
    assert relay_sshd._gateway_hosts("gateways_none") == []


def test_inject_then_restore_is_byte_identical(gateways_inv):
    original = gateways_inv.read_text(encoding="utf-8")

    assert relay_sshd.inject_gateway_creds("192.168.0.13", "root", "p@ss!w0rd#") is True
    injected = gateways_inv.read_text(encoding="utf-8")
    assert "ansible_user: root" in injected
    assert "ansible_ssh_pass:" in injected and "jboss-secret" not in injected
    # 注释与解释器设置不得被破坏
    assert "# 中继网关机清单" in injected
    assert "/work/jboss/anaconda3/bin/python3" in injected

    relay_sshd.restore_gateway_creds("192.168.0.13")
    assert gateways_inv.read_text(encoding="utf-8") == original


def test_inject_missing_host_is_noop(gateways_inv):
    original = gateways_inv.read_text(encoding="utf-8")
    assert relay_sshd.inject_gateway_creds("10.9.9.9", "root", "x") is False
    assert gateways_inv.read_text(encoding="utf-8") == original


# ── SSE 流：执行期注入、结束后还原 ────────────────────────────

def test_stream_injects_root_creds_then_restores(gateways_inv, monkeypatch):
    original = gateways_inv.read_text(encoding="utf-8")
    seen: dict[str, str] = {}

    def fake_run(**kwargs):
        # 执行瞬间：清单里应是 root 凭据（且不在命令行/日志里）
        seen["inventory"] = gateways_inv.read_text(encoding="utf-8")
        assert "ansible_user: root" in seen["inventory"]
        assert kwargs["extravars"]["sshd_conf"].startswith("# 由磐石平台自动生成")
        assert "root_password" not in json.dumps(kwargs["extravars"])
        return {"rc": 0, "status": "successful"}

    monkeypatch.setattr(relay_sshd, "_run_ansible_sshd", fake_run)

    async def _collect():
        return [e async for e in relay_sshd.stream_sshd_setup(
            region_code="aoh", hosts_pattern="gateways_aoh",
            root_user="root", root_password="p@ss!w0rd#",
            sshd_conf="# 由磐石平台自动生成（region: aoh），勿手改\nAllowTcpForwarding yes\n",
        )]

    events = asyncio.run(_collect())
    assert seen.get("inventory")
    last = events[-1]
    assert '"rc": 0' in last and '"status": "successful"' in last
    # 流结束后必须已还原（凭据不留存）
    assert gateways_inv.read_text(encoding="utf-8") == original


# ── API：SSE 端点 ────────────────────────────────────────────

def _client(test_db, test_db_factory):
    from app.core.security import hash_password
    from app.models.cluster import Cluster
    from app.models.user import User
    from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

    async def override_get_db():
        async with test_db_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async def _seed():
        if await test_db.get(User, 1) is None:
            test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                             role="admin", status=1))
        await test_db.commit()

    asyncio.run(_seed())
    return AuthedTestClient(app), isolated_app_lifespan()


def test_sshd_setup_endpoint_streams(test_db, test_db_factory, gateways_inv, monkeypatch):
    from app.api.v1 import relay

    _seed_region(test_db)
    relay._INFLIGHT.clear()

    monkeypatch.setattr(
        relay_sshd, "_run_ansible_sshd",
        lambda **kw: {"rc": 0, "status": "successful"},
    )
    client, lifespan = _client(test_db, test_db_factory)
    with lifespan, client as c:
        resp = c.post("/api/v1/relay/gateways/1/sshd-setup",
                      json={"root_user": "root", "root_password": "pw"})
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        assert '"rc": 0' in resp.text
    app.dependency_overrides.clear()
    relay._INFLIGHT.clear()


def test_sshd_setup_missing_group_400(test_db, test_db_factory, gateways_inv):
    from app.api.v1 import relay

    _seed_region(test_db)
    # 建一个没有网关清单组的区域
    async def _add():
        test_db.add(RelayGateway(id=2, code="nogrp", name="无组局"))
        await test_db.commit()

    asyncio.run(_add())
    relay._INFLIGHT.clear()
    client, lifespan = _client(test_db, test_db_factory)
    with lifespan, client as c:
        resp = c.post("/api/v1/relay/gateways/2/sshd-setup",
                      json={"root_user": "root", "root_password": "pw"})
        assert resp.status_code == 400
        assert "gateways_nogrp" in resp.text
    app.dependency_overrides.clear()
    relay._INFLIGHT.clear()


def test_sshd_setup_requires_password(test_db, test_db_factory, gateways_inv):
    _seed_region(test_db)
    client, lifespan = _client(test_db, test_db_factory)
    with lifespan, client as c:
        resp = c.post("/api/v1/relay/gateways/1/sshd-setup", json={"root_user": "root"})
        assert resp.status_code == 422
    app.dependency_overrides.clear()


# ── 厂商 sshd 不支持多目标 PermitOpen 时的回退（LinxOS 实测 bad port number） ──

def test_render_sshd_dropin_fallback_without_permitopen(test_db):
    _seed_region(test_db)
    content = asyncio.run(
        relay_push.render_sshd_dropin("aoh", db=test_db, include_permitopen=False)
    )
    assert "AllowTcpForwarding yes" in content
    assert "PermitOpen" not in content


def test_sshd_playbook_falls_back_when_permitopen_unsupported():
    """守卫：首选格式校验失败时必须回退为仅放行转发，而不是直接失败。"""
    from pathlib import Path

    text = (
        Path(relay_push.__file__).resolve().parents[2] / "ansible" / "relay_sshd.yml"
    ).read_text(encoding="utf-8")
    assert "sshd_conf_fallback" in text
    assert "sshd_check_preferred.rc != 0" in text
    # 仍然保留回滚保护
    assert "回滚 drop-in" in text
