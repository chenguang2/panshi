"""网关初始化测试（openspec: add-relay-gateway / relay-gateway-init）。

覆盖：relay 服务器配置渲染、init 前置（网关清单）、init 推送参数、init API 端点。
init 职责 = 首次装机写入 8443 server 块 + 空/现有白名单 + 起服务；
push 职责 = 后续白名单/sshd 更新（见 test_relay_push.py）。
"""
import pytest

from app.models.cluster import Cluster, Node
from app.models.relay import RelayGateway
from app.services import relay_init


async def _seed_region(test_db):
    test_db.add(RelayGateway(id=1, code="luju", name="路局A",
                             http_base_url="http://10.10.1.1:8443", ssh_jump="tunnel@10.10.1.1:22"))
    c1 = await test_db.get(Cluster, 1)
    if c1 is None:
        c1 = Cluster(id=1, name="c1", status=1)
        test_db.add(c1)
    c1.region_code = "luju"
    test_db.add(Node(id=1, cluster_id=1, ip="10.1.1.1", service_port=80, management_port=9180,
                     ssh_port=22, edge_path="/e"))
    await test_db.commit()


def test_render_relay_server_conf_structure():
    """8443 server 块：listen、map include、X-Edge-Target 反代、白名单外 403。"""
    conf = relay_init.render_relay_server_conf(listen_port=8443, region_code="luju")
    assert "listen 8443" in conf
    assert "include edge_targets.conf;" in conf
    assert "X-Edge-Target" not in conf  # map 键即头名，server 不重复写
    assert "proxy_pass http://$edge_upstream;" in conf
    assert 'return 403' in conf
    assert "proxy_buffering off" in conf  # SSE 依赖
    assert "region: luju" in conf


def test_render_relay_server_conf_port_parametrized():
    conf = relay_init.render_relay_server_conf(listen_port=9443, region_code="aoh")
    assert "listen 9443" in conf


def test_init_requires_gateway_inventory(test_db, monkeypatch):
    import asyncio

    asyncio.run(_seed_region(test_db))
    monkeypatch.setattr(relay_init, "_GATEWAYS_INVENTORY", "/nonexistent/gateways")
    with pytest.raises(relay_init.RelayInitError) as ei:
        asyncio.run(relay_init.init_region("luju", openresty_prefix="/opt/nginx", db=test_db))
    assert "网关清单" in str(ei.value)


def test_init_success_reports_hosts(test_db, monkeypatch, tmp_path):
    import asyncio

    asyncio.run(_seed_region(test_db))
    monkeypatch.setattr(relay_init, "_GATEWAYS_INVENTORY", str(tmp_path / "gateways"))
    (tmp_path / "gateways").write_text("[gateways_luju]\n10.10.1.1\n", encoding="utf-8")

    captured = {}

    def fake_run(**kw):
        captured.update(kw)
        return {"rc": 0, "status": "successful"}

    monkeypatch.setattr(relay_init, "_run_ansible_init", fake_run)
    result = asyncio.run(relay_init.init_region(
        "luju", openresty_prefix="/work/openresty/nginx", db=test_db))
    assert result["ok"] is True
    assert "gateways_luju" in captured["extravars"]["hosts_pattern"]
    assert captured["extravars"]["openresty_prefix"] == "/work/openresty/nginx"
    assert "listen 8443" in captured["extravars"]["relay_server_conf"]
    # 初始化应带上当前节点白名单（或空 map），与 push 同源渲染
    assert "map $http_x_edge_target $edge_upstream" in captured["extravars"]["edge_targets_conf"]


def test_init_failure_marks_not_ok(test_db, monkeypatch, tmp_path):
    import asyncio

    asyncio.run(_seed_region(test_db))
    monkeypatch.setattr(relay_init, "_GATEWAYS_INVENTORY", str(tmp_path / "gateways"))
    (tmp_path / "gateways").write_text("[gateways_luju]\n10.10.1.1\n", encoding="utf-8")
    monkeypatch.setattr(relay_init, "_run_ansible_init",
                        lambda **kw: {"rc": 2, "status": "failed"})
    result = asyncio.run(relay_init.init_region(
        "luju", openresty_prefix="/opt/nginx", db=test_db))
    assert result["ok"] is False
