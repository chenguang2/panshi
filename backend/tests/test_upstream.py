import pytest
import json
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.cluster import Upstream, UpstreamTarget, Cluster
from app.schemas.cluster import UpstreamCreate, UpstreamUpdate, UpstreamTargetSchema


DEFAULT_CHECKS = {
    "passive": {"type": "http"},
    "active": {
        "type": "http",
        "unhealthy": {
            "timeouts": 3,
            "tcp_failures": 2,
            "interval": 1,
            "http_statuses": [429, 500, 501, 502, 503, 504, 505],
            "http_failures": 5
        },
        "https_verify_certificate": True,
        "http_path": "/",
        "concurrency": 10,
        "healthy": {
            "http_statuses": [200, 302, 403, 404],
            "successes": 2,
            "interval": 0
        },
        "timeout": 1
    }
}


class TestUpstreamTargetSchema:
    def test_valid_target_format(self):
        t = UpstreamTargetSchema(target="192.168.1.10:8080", weight=100)
        assert t.target == "192.168.1.10:8080"
        assert t.weight == 100

    def test_default_weight(self):
        t = UpstreamTargetSchema(target="192.168.1.10:8080")
        assert t.weight == 100

    def test_weight_range_valid(self):
        t = UpstreamTargetSchema(target="192.168.1.10:8080", weight=500)
        assert t.weight == 500


class TestUpstreamCreateWithTargets:
    def test_upstream_create_with_targets(self):
        upstream = UpstreamCreate(
            cluster_id=1,
            name="test-upstream",
            load_balance="roundrobin",
            targets=[
                UpstreamTargetSchema(target="192.168.1.10:8080", weight=100),
                UpstreamTargetSchema(target="192.168.1.11:8080", weight=100)
            ]
        )
        assert upstream.name == "test-upstream"
        assert len(upstream.targets) == 2
        assert upstream.targets[0].target == "192.168.1.10:8080"
        assert upstream.targets[1].target == "192.168.1.11:8080"

    def test_upstream_create_without_targets(self):
        upstream = UpstreamCreate(
            cluster_id=1,
            name="test-upstream",
            load_balance="roundrobin"
        )
        assert upstream.targets is None


class TestUpstreamUpdateWithTargets:
    def test_upstream_update_with_targets(self):
        update = UpstreamUpdate(
            name="updated-upstream",
            targets=[
                UpstreamTargetSchema(target="192.168.1.20:9090", weight=200)
            ]
        )
        assert update.name == "updated-upstream"
        assert len(update.targets) == 1
        assert update.targets[0].target == "192.168.1.20:9090"

    def test_upstream_update_targets_none(self):
        update = UpstreamUpdate(targets=None)
        assert update.targets is None


async def test_create_upstream(test_db):
    cluster_id = 1
    upstream = Upstream(
        cluster_id=cluster_id,
        name="test-upstream",
        load_balance="roundrobin",
        description="Test upstream"
    )
    test_db.add(upstream)
    await test_db.commit()
    await test_db.refresh(upstream)

    assert upstream.id is not None
    assert upstream.cluster_id == cluster_id
    assert upstream.load_balance == "roundrobin"


async def test_create_upstream_with_multiple_targets(test_db):
    upstream = Upstream(
        cluster_id=1,
        name="multi-target-upstream",
        load_balance="roundrobin"
    )
    test_db.add(upstream)
    await test_db.commit()
    await test_db.refresh(upstream)

    targets = [
        UpstreamTarget(upstream_id=upstream.id, target="192.168.1.10:8080", weight=100),
        UpstreamTarget(upstream_id=upstream.id, target="192.168.1.11:8080", weight=100),
        UpstreamTarget(upstream_id=upstream.id, target="192.168.1.12:9090", weight=200)
    ]
    for t in targets:
        test_db.add(t)
    await test_db.commit()

    from sqlalchemy import select
    result = await test_db.execute(
        select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream.id)
    )
    saved_targets = result.scalars().all()

    assert len(saved_targets) == 3
    assert saved_targets[0].target == "192.168.1.10:8080"
    assert saved_targets[2].weight == 200


async def test_create_upstream_target(test_db):
    upstream = Upstream(cluster_id=1, name="target-test", load_balance="roundrobin")
    test_db.add(upstream)
    await test_db.commit()
    await test_db.refresh(upstream)

    target = UpstreamTarget(
        upstream_id=upstream.id,
        target="127.0.0.1:8080",
        weight=100
    )
    test_db.add(target)
    await test_db.commit()
    await test_db.refresh(target)

    assert target.id is not None
    assert target.target == "127.0.0.1:8080"
    assert target.weight == 100


class TestUpstreamChecksAPI:
    """Test upstream API endpoints with checks field (health check config)."""

    async def test_create_upstream_with_checks(self):
        """Test creating upstream with checks dict - should store as JSON string in DB."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.post(
                "/api/v1/clusters/1/upstreams",
                headers=headers,
                json={
                    "name": "test-checks-upstream",
                    "load_balance": "weighted_roundrobin",
                    "checks": DEFAULT_CHECKS,
                    "targets": [{"target": "192.168.1.10:8080", "weight": 100}]
                }
            )
            assert response.status_code == 201, f"Failed: {response.text}"
            data = response.json()
            assert data["name"] == "test-checks-upstream"
            assert data["checks"] is not None
            assert data["checks"]["passive"]["type"] == "http"
            assert data["checks"]["active"]["type"] == "http"

    async def test_create_upstream_without_checks(self):
        """Test creating upstream without checks - checks should be None."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.post(
                "/api/v1/clusters/1/upstreams",
                headers=headers,
                json={
                    "name": "test-no-checks-upstream",
                    "load_balance": "weighted_roundrobin",
                    "targets": [{"target": "192.168.1.10:8080", "weight": 100}]
                }
            )
            assert response.status_code == 201, f"Failed: {response.text}"
            data = response.json()
            assert data["checks"] is None

    async def test_update_upstream_add_checks(self):
        """Test adding checks to existing upstream via update."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.post(
                "/api/v1/clusters/1/upstreams",
                headers=headers,
                json={
                    "name": "test-update-checks-upstream",
                    "load_balance": "weighted_roundrobin",
                    "targets": [{"target": "192.168.1.10:8080", "weight": 100}]
                }
            )
            assert response.status_code == 201
            upstream_id = response.json()["id"]

            response = await client.put(
                f"/api/v1/clusters/1/upstreams/{upstream_id}",
                headers=headers,
                json={"checks": DEFAULT_CHECKS}
            )
            assert response.status_code == 200, f"Failed: {response.text}"
            data = response.json()
            assert data["checks"] is not None
            assert data["checks"]["passive"]["type"] == "http"
            assert data["checks"]["active"]["healthy"]["http_statuses"] == [200, 302, 403, 404]

    async def test_update_upstream_modify_checks(self):
        """Test modifying existing checks via update."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"}
            )
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.post(
                "/api/v1/clusters/1/upstreams",
                headers=headers,
                json={
                    "name": "test-modify-checks-upstream",
                    "load_balance": "weighted_roundrobin",
                    "checks": DEFAULT_CHECKS,
                    "targets": [{"target": "192.168.1.10:8080", "weight": 100}]
                }
            )
            assert response.status_code == 201
            upstream_id = response.json()["id"]

            modified_checks = DEFAULT_CHECKS.copy()
            modified_checks["active"]["http_path"] = "/health"

            response = await client.put(
                f"/api/v1/clusters/1/upstreams/{upstream_id}",
                headers=headers,
                json={"checks": modified_checks}
            )
            assert response.status_code == 200, f"Failed: {response.text}"
            data = response.json()
            assert data["checks"]["active"]["http_path"] == "/health"
            assert data["checks"]["active"]["healthy"]["http_statuses"] == [200, 302, 403, 404]

# ── B4 lane A 新增边界卡片（docs/refactoring/test-case-audit-2026-10-01 §5.3）──
# B1-NEW-10（upstreams 半）：名称长度边界、特殊字符保真、跨集群同名允许。


class TestUpstreamNameBoundary:

    async def _create(self, client, name):
        return await client.post(
            "/api/v1/clusters/1/upstreams",
            json={
                "name": name,
                "targets": [{"target": "192.168.1.10:8080", "weight": 100}],
            },
        )

    @pytest.mark.parametrize("name, expected_status", [("u" * 100, 201), ("u" * 101, 422), ("", 422)])
    async def test_name_length_boundary(self, async_authed_client, name, expected_status):
        """UpstreamCreate.name min_length=1/max_length=100：100 放行、101/空 422。"""
        resp = await self._create(async_authed_client, name)
        assert resp.status_code == expected_status, resp.text
        if expected_status == 201:
            assert resp.json()["name"] == name

    @pytest.mark.parametrize(
        "name", ["中文-上游 & <池>", "name with spaces", "a-b_c.d~!@#$%^&*()"]
    )
    async def test_name_special_chars_stored_verbatim(self, async_authed_client, name):
        """特殊字符名称逐字存储与回显（无 pattern 约束、无转义改写）。"""
        resp = await self._create(async_authed_client, name)
        assert resp.status_code == 201, resp.text
        assert resp.json()["name"] == name

        got = await async_authed_client.get(f"/api/v1/clusters/1/upstreams/{resp.json()['id']}")
        assert got.status_code == 200
        assert got.json()["name"] == name

    async def test_same_name_across_clusters_allowed(self, async_authed_client, isolated_session):
        """Upstream 唯一约束仅在 (cluster_id, edge_uuid)：名称跨集群可重复。"""
        async with isolated_session() as s:
            s.add(Cluster(id=21003, name="upstream-name-second-cluster"))
            await s.commit()

        r1 = await self._create(async_authed_client, "cross-cluster-dup-upstream")
        r2 = await async_authed_client.post(
            "/api/v1/clusters/21003/upstreams",
            json={
                "name": "cross-cluster-dup-upstream",
                "targets": [{"target": "192.168.1.20:8080", "weight": 100}],
            },
        )
        assert r1.status_code == 201, r1.text
        assert r2.status_code == 201, r2.text
        assert r1.json()["cluster_id"] == 1
        assert r2.json()["cluster_id"] == 21003


class TestUpstreamTargetWeightBoundaryAPI:
    """UPS-07：target weight 边界经真实 API 验证（schema ge=1/le=1000，cluster.py:97）。

    既有 TestUpstreamTargetSchema 仅覆盖合法值（100/500），无边界拒绝用例；
    本类走 POST /clusters/{id}/upstreams 补 API 侧闭环。
    """

    @pytest.mark.parametrize(
        "weight, expected",
        [(0, 422), (-1, 422), (1001, 422), (1, 201), (1000, 201)],
        ids=["zero", "negative", "above-max", "min-ok", "max-ok"],
    )
    async def test_weight_boundary(self, async_authed_client, weight, expected):
        resp = await async_authed_client.post(
            "/api/v1/clusters/1/upstreams",
            json={
                "name": f"ups07-weight-{weight}",
                "targets": [{"target": "10.0.0.1:8080", "weight": weight}],
            },
        )
        assert resp.status_code == expected, resp.text
        if expected == 201:
            assert resp.json()["targets"][0]["weight"] == weight
