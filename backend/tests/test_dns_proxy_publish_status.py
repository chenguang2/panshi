"""DNS 代理域内端点四态接线（dns-udp-proxy-ux-parity 批 1 / design D1）。

照 test_stream_proxy_publish_status.py 模式，验证对象换成 /clusters/{cid}/dns-proxies
端点族（DNS 页唯一数据源）：列表与详情携带 pending_publish（derive_pending_publish
单点推导）与 last_publish_status；publish/rollback 侧零改动。
"""
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.models.cluster import Node
from app.services.edge_client import EdgeClient

FAKE_EDGE_OK = {"route_id": "ok"}


async def _create_dns_proxy(client, name: str, port: int) -> int:
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
            "dns_config": {"hosts": {"app.example.com": {"type": "roundrobin", "nodes": {"10.0.0.1": ["10.0.0.0/8"]}, "ttl_valid": 15}}},
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _add_node(session, ip: str) -> None:
    async with session() as s:
        s.add(Node(cluster_id=1, ip=ip, service_port=80, management_port=9180, edge_path="/edge", status=1))
        await s.commit()


async def _fetch(client, proxy_id: int | None):
    """返回 (列表首条, 详情)——列表取域名内列表端点。"""
    lst = await client.get("/api/v1/clusters/1/dns-proxies")
    assert lst.status_code == 200, lst.text
    items = lst.json()["items"]
    target = next((i for i in items if i["id"] == proxy_id), items[0] if items else None)
    detail = await client.get(f"/api/v1/clusters/1/dns-proxies/{proxy_id}")
    assert detail.status_code == 200, detail.text
    return target, detail.json()


@pytest.mark.asyncio
async def test_unpublished_pending_false(async_authed_client):
    """未发布代理：pending_publish=false、last_publish_status 为 null。"""
    pid = await _create_dns_proxy(async_authed_client, "zz-dns-unpub", 19701)
    _, detail = await _fetch(async_authed_client, pid)
    assert detail["pending_publish"] is False
    assert detail["last_publish_status"] is None
    m1, _ = await _fetch(async_authed_client, pid)
    assert m1["pending_publish"] is False


@pytest.mark.asyncio
async def test_edit_after_publish_pending_true(async_authed_client, isolated_session):
    """发布后编辑：列表与详情均 pending_publish=true（待发布态数据面）。"""
    pid = await _create_dns_proxy(async_authed_client, "zz-dns-edit", 19702)
    await _add_node(isolated_session, "10.9.0.31")

    with patch.object(EdgeClient, "api", MagicMock(return_value=FAKE_EDGE_OK)), patch(
        "app.services.edge_sync.get_edge_logger", return_value=MagicMock()
    ):
        pub = await async_authed_client.post(f"/api/v1/clusters/1/dns-proxies/{pid}/publish", json={})
    assert pub.status_code == 200, pub.text

    ed = await async_authed_client.put(
        f"/api/v1/clusters/1/dns-proxies/{pid}",
        json={"name": "zz-dns-edit", "description": "edited"},
    )
    assert ed.status_code == 200, ed.text

    m1, detail = await _fetch(async_authed_client, pid)
    assert m1["pending_publish"] is True, m1
    assert detail["pending_publish"] is True
    assert m1["current_version"] is not None


@pytest.mark.asyncio
async def test_detail_and_list_carry_last_publish_status_field(async_authed_client):
    """响应契约：两字段在列表条目与详情均存在（None 合法）。"""
    pid = await _create_dns_proxy(async_authed_client, "zz-dns-contract", 19703)
    m1, detail = await _fetch(async_authed_client, pid)
    assert "pending_publish" in m1 and "last_publish_status" in m1
    assert "pending_publish" in detail and "last_publish_status" in detail
