"""SEC-05 泛化 SQL 注入扫描：列表端点搜索/筛选参数的注入载荷回归。

契约：注入载荷必须按字面量进 LIKE 参数（SQLAlchemy 参数化），表现为
200 + 合法结构 + 空结果或按字面匹配；任何 500 / 表被删 / 全表泄露都是
注入证据。端点实现核对（2026-10-01）：
- GET /clusters          keyword → Cluster.name.contains()（clusters.py:85）
- GET /clusters/{id}/routes   search → ilike(f"%{search}%")（cluster_routes.py:71）
- GET /clusters/{id}/upstreams search → ilike(f"%{search}%")（cluster_upstreams.py:100）
均为参数化查询，无字符串拼接 raw SQL。
"""
import pytest

INJECTION_PAYLOADS = [
    "' OR 1=1 --",
    "'; DROP TABLE clusters--",
    "%",
    "_",
    "\\",
]


@pytest.fixture
async def seeded_targets(async_authed_client):
    """隔离库 cluster-1 下经 API 各造一条 route / upstream，供通配符类载荷计数。"""
    r = await async_authed_client.post(
        "/api/v1/clusters/1/routes",
        json={"name": "inj-scan-route", "uri": "/inj-scan/*"},
    )
    assert r.status_code == 201, r.text
    u = await async_authed_client.post(
        "/api/v1/clusters/1/upstreams",
        json={
            "name": "inj-scan-upstream",
            "targets": [{"target": "10.0.0.1:8080", "weight": 100}],
        },
    )
    assert u.status_code == 201, u.text


@pytest.mark.parametrize("payload", INJECTION_PAYLOADS)
@pytest.mark.usefixtures("seeded_targets")
async def test_cluster_list_keyword_injection_payload_is_literal(async_authed_client, payload):
    resp = await async_authed_client.get("/api/v1/clusters", params={"keyword": payload})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert set(data) >= {"total", "items"}
    assert isinstance(data["items"], list)
    if payload in ("%", "_"):
        # LIKE 通配符按字面语义匹配全部种子行（cluster-1 一条），不得泄露他表
        assert data["total"] >= 1
    else:
        # 引号注入 / DROP TABLE / 反斜杠：字面无匹配 → 空结果（拼接式注入会全表泄露）
        assert data["total"] == 0, f"payload={payload!r} leaked rows: {data['items'][:3]}"


@pytest.mark.parametrize("payload", INJECTION_PAYLOADS)
@pytest.mark.usefixtures("seeded_targets")
async def test_route_list_search_injection_payload_is_literal(async_authed_client, payload):
    resp = await async_authed_client.get(
        "/api/v1/clusters/1/routes", params={"search": payload}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert set(data) >= {"total", "items"}
    assert isinstance(data["items"], list)
    if payload in ("%", "_"):
        assert data["total"] == 1  # 仅本集群种子路由
    else:
        assert data["total"] == 0, f"payload={payload!r} leaked rows: {data['items'][:3]}"


@pytest.mark.parametrize("payload", INJECTION_PAYLOADS)
@pytest.mark.usefixtures("seeded_targets")
async def test_upstream_list_search_injection_payload_is_literal(async_authed_client, payload):
    resp = await async_authed_client.get(
        "/api/v1/clusters/1/upstreams", params={"search": payload}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert set(data) >= {"total", "items"}
    assert isinstance(data["items"], list)
    if payload in ("%", "_"):
        assert data["total"] == 1
    else:
        assert data["total"] == 0, f"payload={payload!r} leaked rows: {data['items'][:3]}"


@pytest.mark.usefixtures("seeded_targets")
async def test_drop_table_payload_leaves_clusters_intact(async_authed_client):
    """'; DROP TABLE clusters-- 打进 routes search 后，clusters 表必须完好可查。"""
    resp = await async_authed_client.get(
        "/api/v1/clusters/1/routes", params={"search": "'; DROP TABLE clusters--"}
    )
    assert resp.status_code == 200
    after = await async_authed_client.get("/api/v1/clusters", params={"keyword": ""})
    assert after.status_code == 200
    assert after.json()["total"] == 1  # cluster-1 仍在
