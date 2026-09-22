"""网关配置下发测试（openspec: add-relay-gateway / relay-config-push）。"""
import pytest

from app.models.cluster import Cluster, Node
from app.models.relay import RelayGateway
from app.services import relay_push


async def _seed_region(test_db):
    test_db.add(RelayGateway(id=1, code="luju", name="路局A",
                             http_base_url="http://10.10.1.1:8443", ssh_jump="tunnel@10.10.1.1:22"))
    c1 = await test_db.get(Cluster, 1)
    if c1 is None:
        c1 = Cluster(id=1, name="c1", status=1)
        test_db.add(c1)
    c1.region_code = "luju"  # conftest 预 seed 集群 1，原地写 region
    test_db.add(Cluster(id=9, name="other", status=1, region_code="tianjin"))
    test_db.add(Node(id=1, cluster_id=1, ip="10.1.1.1", service_port=80, management_port=9180,
                     ssh_port=22, edge_path="/e"))
    test_db.add(Node(id=2, cluster_id=1, ip="10.1.2.2", service_port=80, management_port=9181,
                     ssh_port=2222, edge_path="/e"))
    test_db.add(Node(id=3, cluster_id=9, ip="10.2.2.2", service_port=80, management_port=9180,
                     ssh_port=22, edge_path="/e"))
    await test_db.commit()


def test_render_nginx_map_region_scoped(test_db):
    import asyncio

    asyncio.run(_seed_region(test_db))
    conf = asyncio.run(relay_push.render_nginx_map("luju", session_factory=None, db=test_db))
    # 仅本局节点
    assert '"10.1.1.1:9180"' in conf
    assert '"10.1.2.2:9181"' in conf
    assert "10.2.2.2" not in conf
    # 结构：map + default 拒绝
    assert "map $http_x_edge_target $edge_upstream" in conf
    assert 'default' in conf


def test_render_permit_open_region_scoped(test_db):
    import asyncio

    asyncio.run(_seed_region(test_db))
    conf = asyncio.run(relay_push.render_permit_open("luju", db=test_db))
    assert "PermitOpen 10.1.1.1:22" in conf
    assert "PermitOpen 10.1.2.2:2222" in conf  # 节点自定义 SSH 端口
    assert "10.2.2.2" not in conf


def test_push_requires_gateway_inventory(test_db, monkeypatch):
    import asyncio

    asyncio.run(_seed_region(test_db))
    monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", "/nonexistent/gateways")
    with pytest.raises(relay_push.RelayPushError) as ei:
        asyncio.run(relay_push.push_region("luju", db=test_db))
    assert "网关清单" in str(ei.value)


def test_push_success_reports_hosts(test_db, test_db_factory, monkeypatch, tmp_path):
    import asyncio

    asyncio.run(_seed_region(test_db))
    monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", str(tmp_path / "gateways"))
    (tmp_path / "gateways").write_text("[gateways_luju]\n10.10.1.1\n", encoding="utf-8")

    captured = {}

    def fake_run(private_data_dir, inventory, playbook, extravars):
        captured["playbook"] = playbook
        captured["extravars"] = extravars
        captured["inventory"] = inventory
        return {"rc": 0, "status": "successful"}

    monkeypatch.setattr(relay_push, "_run_ansible_push", fake_run)
    result = asyncio.run(relay_push.push_region("luju", db=test_db))
    assert result["ok"] is True
    assert "gateways_luju" in captured["extravars"]["hosts_pattern"]
    assert "10.1.1.1:9180" in captured["extravars"]["edge_targets_conf"]
    assert "PermitOpen 10.1.2.2:2222" in captured["extravars"]["relay_sshd_conf"]


def test_push_failure_marks_region_failed(test_db, monkeypatch, tmp_path):
    import asyncio

    asyncio.run(_seed_region(test_db))
    monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", str(tmp_path / "gateways"))
    (tmp_path / "gateways").write_text("[gateways_luju]\n10.10.1.1\n", encoding="utf-8")

    def fake_run(**kwargs):
        return {"rc": 2, "status": "failed"}

    monkeypatch.setattr(relay_push, "_run_ansible_push", lambda **kw: fake_run(**kw))
    result = asyncio.run(relay_push.push_region("luju", db=test_db))
    assert result["ok"] is False
