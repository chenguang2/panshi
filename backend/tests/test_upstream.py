import pytest
import json
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.models.cluster import Upstream, UpstreamTarget
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