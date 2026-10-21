"""ssl-ux-review-fixes 8.1：POST /clusters/{id}/ssl 创建契约。

URL 中的 cluster_id 是唯一权威来源：
- body 不带 cluster_id SHALL 201（当前缺省必 422 Field required）；
- body 与 URL 不一致 SHALL 422，detail 指明「cluster_id 与 URL 中的集群不一致」；
- body 与 URL 一致行为不变。
"""

import pytest

pytestmark = pytest.mark.asyncio

PEM_CERT = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n"
PEM_KEY = "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n"


import uuid


async def _create_cluster(client) -> int:
    suffix = uuid.uuid4().hex[:8]
    resp = client.post("/api/v1/clusters", json={"name": f"ssl-contract-{suffix}", "display_name": "ssl-contract"})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def test_create_without_body_cluster_id_returns_201(global_engine_client):
    client = global_engine_client
    cid = await _create_cluster(client)
    resp = client.post(
        f"/api/v1/clusters/{cid}/ssl",
        json={"name": "no-body-cid", "sni": "a.example.com", "cert": PEM_CERT, "private_key": PEM_KEY},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["cluster_id"] == cid


async def test_create_with_mismatched_body_cluster_id_returns_422(global_engine_client):
    client = global_engine_client
    cid = await _create_cluster(client)
    resp = client.post(
        f"/api/v1/clusters/{cid}/ssl",
        json={
            "name": "mismatch",
            "cluster_id": cid + 1,
            "sni": "a.example.com",
            "cert": PEM_CERT,
            "private_key": PEM_KEY,
        },
    )
    assert resp.status_code == 422
    assert "cluster_id 与 URL 中的集群不一致" in resp.json()["detail"]


async def test_create_with_matching_body_cluster_id_still_201(global_engine_client):
    client = global_engine_client
    cid = await _create_cluster(client)
    resp = client.post(
        f"/api/v1/clusters/{cid}/ssl",
        json={
            "name": "match",
            "cluster_id": cid,
            "sni": "a.example.com",
            "cert": PEM_CERT,
            "private_key": PEM_KEY,
        },
    )
    assert resp.status_code == 201, resp.text
