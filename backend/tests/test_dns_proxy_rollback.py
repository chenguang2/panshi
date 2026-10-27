"""DNS 代理回滚完整性（2026-10-26 用户报告：恢复历史版本后发布的是最新内容）。

根因：rollback_dns_proxy._restore 白名单缺 dns_config/checks——快照含这两列
（StreamProxyResponse 全量序列化），发布从存活行读 dns_config/checks 构建载荷，
回滚后两列仍是最新内容 → 发布推「最新版本」。

本文件钉死：DNS 代理回滚 SHALL 全量恢复（含 dns_config/checks）；发布载荷
SHALL 基于恢复后的行构建。四层代理的部分恢复语义（stream-proxy-ux D3 已批）
不在本文件范围。
"""
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.models.cluster import Node
from app.services.edge_client import EdgeClient

FAKE_EDGE_OK = {"route_id": "ok"}

DNS_CFG_A = {
    "hosts": {
        "app-v1.example.com": {"type": "roundrobin", "nodes": {"10.0.0.1": ["10.0.0.0/8"]}, "ttl_valid": 15}
    }
}
DNS_CFG_B = {
    "hosts": {
        "app-v2.example.com": {"type": "chash", "nodes": {"10.0.0.9": []}, "ttl_valid": 30}
    }
}
CHECKS_A = {"active": {"healthy": {"interval": 2}}}
CHECKS_B = {"active": {"healthy": {"interval": 9}}}


async def _create(client, name: str, port: int, dns_cfg, checks) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/dns-proxies",
        json={
            "name": name,
            "listen_port": port,
            "scheme": "udp",
            "proxy_type": "dns",
            "load_balance": "roundrobin",
            "targets": [{"target": "10.0.0.1:53", "weight": 100}],
            "cluster_id": 1,
            "dns_config": dns_cfg,
            "checks": checks,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _add_node(session, ip: str) -> None:
    async with session() as s:
        s.add(Node(cluster_id=1, ip=ip, service_port=80, management_port=9180, edge_path="/edge", status=1))
        await s.commit()


def _publish_patch():
    return patch.object(EdgeClient, "api", MagicMock(return_value=FAKE_EDGE_OK)), patch(
        "app.services.edge_sync.get_edge_logger", return_value=MagicMock()
    )


@pytest.mark.asyncio
async def test_rollback_restores_dns_config_and_checks(async_authed_client, isolated_session):
    """回滚到 v1 后：存活行的 dns_config/checks SHALL 回到 v1 内容（而非停留在最新）。"""
    pid = await _create(async_authed_client, "zz-dns-rb", 19801, DNS_CFG_A, CHECKS_A)
    await _add_node(isolated_session, "10.9.0.41")

    p1, p2 = _publish_patch()
    with p1, p2:
        pub1 = await async_authed_client.post(f"/api/v1/clusters/1/dns-proxies/{pid}/publish", json={})
        assert pub1.status_code == 200, pub1.text

    # 编辑为 B 并发布（产生 v2，且行内容为 B）
    ed = await async_authed_client.put(
        f"/api/v1/clusters/1/dns-proxies/{pid}",
        json={"name": "zz-dns-rb", "dns_config": DNS_CFG_B, "checks": CHECKS_B},
    )
    assert ed.status_code == 200, ed.text
    with p1, p2:
        pub2 = await async_authed_client.post(f"/api/v1/clusters/1/dns-proxies/{pid}/publish", json={})
        assert pub2.status_code == 200, pub2.text

    # 回滚到 v1
    rb = await async_authed_client.post(f"/api/v1/clusters/1/dns-proxies/{pid}/rollback/1")
    assert rb.status_code == 200, rb.text

    detail = await async_authed_client.get(f"/api/v1/clusters/1/dns-proxies/{pid}")
    assert detail.status_code == 200, detail.text
    row = detail.json()

    # 核心断言：dns_config / checks 恢复到 v1（历史），不再是 B（最新）
    assert row["dns_config"]["hosts"], row["dns_config"]
    assert "app-v1.example.com" in row["dns_config"]["hosts"], row["dns_config"]
    assert "app-v2.example.com" not in row["dns_config"]["hosts"]
    assert row["checks"] == CHECKS_A, row["checks"]


@pytest.mark.asyncio
async def test_publish_after_rollback_pushes_restored_config(async_authed_client, isolated_session):
    """回滚后再发布：Edge 载荷 SHALL 基于恢复后的 dns_config 构建（推历史内容而非最新）。"""
    pid = await _create(async_authed_client, "zz-dns-rb-pub", 19802, DNS_CFG_A, CHECKS_A)
    await _add_node(isolated_session, "10.9.0.42")

    p1, p2 = _publish_patch()
    with p1, p2:
        await async_authed_client.post(f"/api/v1/clusters/1/dns-proxies/{pid}/publish", json={})

    ed = await async_authed_client.put(
        f"/api/v1/clusters/1/dns-proxies/{pid}",
        json={"name": "zz-dns-rb-pub", "dns_config": DNS_CFG_B},
    )
    assert ed.status_code == 200, ed.text
    with p1, p2:
        await async_authed_client.post(f"/api/v1/clusters/1/dns-proxies/{pid}/publish", json={})

    # 回滚到 v1，再发布——捕获 Edge 载荷
    rb = await async_authed_client.post(f"/api/v1/clusters/1/dns-proxies/{pid}/rollback/1")
    assert rb.status_code == 200, rb.text

    edge_mock = MagicMock(return_value=FAKE_EDGE_OK)
    with patch.object(EdgeClient, "api", edge_mock), patch(
        "app.services.edge_sync.get_edge_logger", return_value=MagicMock()
    ):
        pub = await async_authed_client.post(f"/api/v1/clusters/1/dns-proxies/{pid}/publish", json={})
        assert pub.status_code == 200, pub.text

    # EdgeClient.api("stream_route", "update", uuid, edge_body)——检查 body 的 plugins
    assert edge_mock.called
    call_args = edge_mock.call_args
    edge_body = call_args.args[3] if call_args.args and len(call_args.args) >= 4 else call_args[0][3]
    lan_hosts = edge_body["plugins"]["dns_upstream"]["hosts"]
    assert "app-v1.example.com" in lan_hosts, lan_hosts
    assert "app-v2.example.com" not in lan_hosts
