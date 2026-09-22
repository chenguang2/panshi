"""网关白名单下发测试（openspec: add-relay-gateway / relay-config-push）。

覆盖：白名单渲染（区域隔离）、网关清单前置校验、push SSE 事件流、playbook 非特权
守卫（网关机非特权用户 + sshd 腿暂缓）。
"""
import asyncio
import json

import pytest

from app.models.cluster import Cluster, Node
from app.models.relay import RelayGateway
from app.services import relay_push


def _collect(agen) -> list[dict]:
    async def _run():
        return [json.loads(event.removeprefix("data: ").strip()) async for event in agen]

    return asyncio.run(_run())


def _lines(events: list[dict]) -> list[str]:
    return [e["line"] for e in events if "line" in e]


async def _seed_region(test_db):
    test_db.add(RelayGateway(id=1, code="luju", name="路局A",
                             http_base_url="http://10.10.1.1:8443", ssh_jump="tunnel@10.10.1.1:22",
                             openresty_prefix="/work/openresty/nginx"))
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
    asyncio.run(_seed_region(test_db))
    conf = asyncio.run(relay_push.render_permit_open("luju", db=test_db))
    # 必须是单条逗号分隔指令：sshd 对重复 PermitOpen 只取首条，写成多行只有第一个节点生效
    assert "PermitOpen 10.1.1.1:22,10.1.2.2:2222" in conf
    assert conf.count("PermitOpen ") == 1
    assert "10.2.2.2" not in conf


def test_disabled_node_in_sshd_whitelist_but_not_nginx_map(test_db):
    """禁用节点仍需 SSH 管理（进 PermitOpen），但不承载流量（不进 nginx map）。"""
    asyncio.run(_seed_region(test_db))

    async def _disable():
        node = await test_db.get(Node, 1)
        node.status = 0
        await test_db.commit()

    asyncio.run(_disable())
    sshd_conf = asyncio.run(relay_push.render_permit_open("luju", db=test_db))
    nginx_map = asyncio.run(relay_push.render_nginx_map("luju", db=test_db))
    assert "10.1.1.1:22" in sshd_conf  # 禁用节点仍可被管理
    assert "10.1.1.1:9180" not in nginx_map  # 但不进流量白名单
    assert '"10.1.2.2:9181"' in nginx_map  # 启用节点照常


def test_ensure_gateway_inventory_missing(monkeypatch):
    monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", "/nonexistent/gateways")
    with pytest.raises(relay_push.RelayPushError) as ei:
        relay_push.ensure_gateway_inventory()
    assert "网关清单" in str(ei.value)


def test_push_stream_emits_lines_and_final(monkeypatch, tmp_path):
    inv = tmp_path / "gateways"
    inv.write_text("[gateways_luju]\n10.10.1.1\n", encoding="utf-8")
    monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", str(inv))

    captured: dict = {}

    def fake_run(**kw):
        captured.update(kw)
        handler = kw.get("event_handler")
        assert handler is not None, "流式执行必须传 event_handler"
        handler({"stdout": "TASK [写入白名单 map（edge_targets.conf）]"})
        handler({"event_data": {"res": {"stdout": "ok: [10.10.1.1]"}}})
        return {"rc": 0, "status": "successful"}

    monkeypatch.setattr(relay_push, "_run_ansible_push", fake_run)
    events = _collect(
        relay_push.stream_push_region(
            region_code="luju",
            openresty_prefix="/work/openresty/nginx",
            edge_targets_conf='map $http_x_edge_target $edge_upstream { "10.1.1.1:9180"; }',
            relay_sshd_conf="PermitOpen 10.1.1.1:22",
        )
    )
    joined = _lines(events)
    assert "TASK [写入白名单 map（edge_targets.conf）]" in joined

    final = events[-1]
    assert final["rc"] == 0
    assert final["status"] == "successful"
    assert final["percent"] == 100
    assert final["hosts_pattern"] == "gateways_luju"

    # extravars：前缀（nginx 路径推导）+ 白名单 + sshd 变量（暂缓保留）
    assert captured["extravars"]["openresty_prefix"] == "/work/openresty/nginx"
    assert "10.1.1.1:9180" in captured["extravars"]["edge_targets_conf"]
    assert "PermitOpen 10.1.1.1:22" in captured["extravars"]["relay_sshd_conf"]
    assert captured["inventory"] == str(inv)


def test_push_stream_reports_failure(monkeypatch, tmp_path):
    inv = tmp_path / "gateways"
    inv.write_text("[gateways_luju]\n10.10.1.1\n", encoding="utf-8")
    monkeypatch.setattr(relay_push, "_GATEWAYS_INVENTORY", str(inv))
    monkeypatch.setattr(relay_push, "_run_ansible_push", lambda **kw: {"rc": 2, "status": "failed"})

    events = _collect(
        relay_push.stream_push_region(
            region_code="luju", openresty_prefix="/opt/nginx",
            edge_targets_conf="", relay_sshd_conf="",
        )
    )
    assert events[-1]["rc"] == 2


def test_push_playbook_is_unprivileged_and_defers_sshd():
    """源码模式守卫：网关机为非特权用户，push playbook 不得 become/gather_facts，
    nginx 路径须由 openresty_prefix 推导，且 sshd 腿默认关闭（AGENTS #29 同类）。"""
    from pathlib import Path

    playbook = (
        Path(relay_push.__file__).resolve().parents[2] / "ansible" / "relay_push.yml"
    ).read_text(encoding="utf-8")
    assert "become: false" in playbook
    assert "gather_facts: false" in playbook
    assert "become: true" not in playbook
    assert "relay_sshd_enabled: false" in playbook
    # nginx 路径由 openresty_prefix 推导（conf_dir ← prefix；edge_targets ← conf_dir）
    assert 'conf_dir: "{{ openresty_prefix }}/conf"' in playbook
    assert 'edge_targets_path: "{{ conf_dir }}/edge_targets.conf"' in playbook
    assert "/etc/openresty" not in playbook  # 不得硬编码需 root 的系统路径
