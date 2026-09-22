"""网关初始化测试（openspec: add-relay-gateway / relay-gateway-init）。

覆盖：relay 服务器配置渲染、监听端口提取、网关清单前置校验、init SSE 事件流
（实时 stdout 行 + 终态 fields）。init 职责 = 首次装机写入 8443 server 块 + 白名单
+ 起服务；push 职责 = 后续白名单更新（见 test_relay_push.py）。
"""
import asyncio
import json

import pytest

from app.services import relay_init


def _collect(agen) -> list[dict]:
    async def _run():
        return [json.loads(event.removeprefix("data: ").strip()) async for event in agen]

    return asyncio.run(_run())


def _lines(events: list[dict]) -> list[str]:
    return [e["line"] for e in events if "line" in e]


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


def test_listen_port_of():
    """端口提取：显式端口优先；缺省回退 8443（沿用原 init 行为）。"""
    assert relay_init.listen_port_of("http://10.10.1.1:8443") == 8443
    assert relay_init.listen_port_of("http://10.10.1.1:9443") == 9443
    assert relay_init.listen_port_of("https://10.10.1.1") == 8443
    assert relay_init.listen_port_of(None) == 8443


def test_ensure_gateway_inventory_missing(monkeypatch):
    monkeypatch.setattr(relay_init, "_GATEWAYS_INVENTORY", "/nonexistent/gateways")
    with pytest.raises(relay_init.RelayInitError) as ei:
        relay_init.ensure_gateway_inventory()
    assert "网关清单" in str(ei.value)


def test_ensure_gateway_inventory_ok(monkeypatch, tmp_path):
    inv = tmp_path / "gateways"
    inv.write_text("[gateways_luju]\n10.10.1.1\n", encoding="utf-8")
    monkeypatch.setattr(relay_init, "_GATEWAYS_INVENTORY", str(inv))
    relay_init.ensure_gateway_inventory()  # 不抛


def test_init_stream_emits_lines_and_final(monkeypatch, tmp_path):
    inv = tmp_path / "gateways"
    inv.write_text("[gateways_luju]\n10.10.1.1\n", encoding="utf-8")
    monkeypatch.setattr(relay_init, "_GATEWAYS_INVENTORY", str(inv))

    captured: dict = {}

    def fake_run(**kw):
        captured.update(kw)
        handler = kw.get("event_handler")
        assert handler is not None, "流式执行必须传 event_handler"
        handler({"stdout": "PLAY [初始化中继网关]"})
        handler({"event_data": {"res": {"stdout": "ok: [10.10.1.1]"}}})
        return {"rc": 0, "status": "successful"}

    monkeypatch.setattr(relay_init, "_run_ansible_init", fake_run)
    events = _collect(
        relay_init.stream_init_region(
            region_code="luju",
            listen_port=8443,
            openresty_prefix="/work/openresty/nginx",
            edge_targets_conf="map $http_x_edge_target $edge_upstream {}",
        )
    )
    joined = _lines(events)
    assert "PLAY [初始化中继网关]" in joined
    assert "ok: [10.10.1.1]" in joined

    final = events[-1]
    assert final["rc"] == 0
    assert final["status"] == "successful"
    assert final["percent"] == 100
    assert final["hosts_pattern"] == "gateways_luju"
    assert final["listen_port"] == 8443

    # extravars：服务骨架 + 当前白名单 + 前缀（推送参数断言）
    assert captured["extravars"]["openresty_prefix"] == "/work/openresty/nginx"
    assert "listen 8443" in captured["extravars"]["relay_server_conf"]
    assert "map $http_x_edge_target $edge_upstream" in captured["extravars"]["edge_targets_conf"]
    assert captured["inventory"] == str(inv)


def test_init_stream_reports_failure(monkeypatch, tmp_path):
    inv = tmp_path / "gateways"
    inv.write_text("[gateways_luju]\n10.10.1.1\n", encoding="utf-8")
    monkeypatch.setattr(relay_init, "_GATEWAYS_INVENTORY", str(inv))
    monkeypatch.setattr(relay_init, "_run_ansible_init", lambda **kw: {"rc": 2, "status": "failed"})

    events = _collect(
        relay_init.stream_init_region(
            region_code="luju", listen_port=8443, openresty_prefix="/opt/nginx",
            edge_targets_conf="",
        )
    )
    assert events[-1]["rc"] == 2
