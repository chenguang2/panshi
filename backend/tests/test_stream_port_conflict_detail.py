"""重复端口 409 错误文案带占用者（stream-proxy-ux-review-fixes 4.1 / P2-1）。

之前仅「端口已被占用」——用户不知道被谁占用、下一步该做什么。
现契约：detail 携带占用代理名，前端据此给出换端口引导。
"""

import pytest


async def _create(client, name: str, port: int) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/stream-proxies",
        json={
            "name": name,
            "listen_port": port,
            "scheme": "tcp",
            "proxy_type": "normal",
            "load_balance": "roundrobin",
            "targets": [{"target": "10.0.0.1:80", "weight": 100}],
            "cluster_id": 1,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_conflict_detail_carries_occupier_name(async_authed_client):
    """创建重名端口：409 detail 含占用代理名。"""
    await _create(async_authed_client, "occupier-alpha", 19500)

    resp = await client_dup(async_authed_client, "second-proxy", 19500)
    assert resp.status_code == 409, resp.text
    assert "occupier-alpha" in resp.json()["detail"]
    assert "19500" in resp.json()["detail"]


async def client_dup(client, name: str, port: int):
    return await client.post(
        "/api/v1/clusters/1/stream-proxies",
        json={
            "name": name,
            "listen_port": port,
            "scheme": "tcp",
            "proxy_type": "normal",
            "load_balance": "roundrobin",
            "targets": [{"target": "10.0.0.1:80", "weight": 100}],
            "cluster_id": 1,
        },
    )
