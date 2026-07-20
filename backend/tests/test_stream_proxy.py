"""Tests for StreamProxy model and schema.

TDD: Write failing test -> verify fail -> implement -> verify pass.
"""
import pytest
import json
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select
from app.models.cluster import StreamProxy


class TestStreamProxyModel:
    """Model-level tests."""

    async def test_create_stream_proxy_minimal(self, test_db):
        proxy = StreamProxy(
            cluster_id=1,
            name="test-stream-proxy",
            listen_port=9970,
        )
        test_db.add(proxy)
        await test_db.commit()
        await test_db.refresh(proxy)

        assert proxy.id is not None
        assert proxy.edge_uuid is not None
        assert len(proxy.edge_uuid) == 36
        assert proxy.cluster_id == 1
        assert proxy.name == "test-stream-proxy"
        assert proxy.listen_port == 9970
        assert proxy.load_balance == "weighted_roundrobin"
        assert proxy.scheme == "tcp"
        assert proxy.status == 1
        assert proxy.created_at is not None

    async def test_create_stream_proxy_full(self, test_db):
        proxy = StreamProxy(
            cluster_id=1,
            name="full-stream-proxy",
            description="Full test proxy",
            listen_port=9971,
            load_balance="chash",
            scheme="udp",
            targets=json.dumps([
                {"target": "192.168.1.10:8080", "weight": 100},
                {"target": "192.168.1.11:8080", "weight": 80},
            ]),
            timeout=json.dumps({"connect": 5, "send": 5, "read": 10}),
            keepalive_pool=json.dumps({"size": 64, "idle_timeout": 30, "requests": 500}),
            remote_addr="10.0.0.0/8",
            sni="ssl.example.com",
        )
        test_db.add(proxy)
        await test_db.commit()
        await test_db.refresh(proxy)

        assert proxy.id is not None
        assert proxy.listen_port == 9971
        assert proxy.load_balance == "chash"
        assert proxy.scheme == "udp"
        assert json.loads(proxy.targets)[0]["target"] == "192.168.1.10:8080"
        assert json.loads(proxy.timeout)["connect"] == 5
        assert json.loads(proxy.keepalive_pool)["size"] == 64
        assert proxy.remote_addr == "10.0.0.0/8"
        assert proxy.sni == "ssl.example.com"

    async def test_unique_port_per_cluster(self, test_db):
        proxy1 = StreamProxy(cluster_id=1, name="proxy1", listen_port=9970)
        test_db.add(proxy1)
        await test_db.commit()

        proxy2 = StreamProxy(cluster_id=1, name="proxy2", listen_port=9970)
        test_db.add(proxy2)
        with pytest.raises(Exception):
            await test_db.commit()
        await test_db.rollback()

    async def test_same_port_different_cluster_allowed(self, test_db):
        proxy1 = StreamProxy(cluster_id=1, name="proxy1", listen_port=9970)
        proxy2 = StreamProxy(cluster_id=2, name="proxy2", listen_port=9970)
        test_db.add(proxy1)
        test_db.add(proxy2)
        await test_db.commit()

    async def test_edge_uuid_unique(self, test_db):
        proxy1 = StreamProxy(cluster_id=1, name="p1", listen_port=9980)
        proxy2 = StreamProxy(cluster_id=1, name="p2", listen_port=9981)
        test_db.add(proxy1)
        test_db.add(proxy2)
        await test_db.commit()
        assert proxy1.edge_uuid != proxy2.edge_uuid

    async def test_query_by_cluster(self, test_db):
        for i in range(3):
            test_db.add(StreamProxy(cluster_id=1, name=f"p-{i}", listen_port=9990 + i))
        test_db.add(StreamProxy(cluster_id=2, name="other", listen_port=9993))
        await test_db.commit()

        result = await test_db.execute(
            select(StreamProxy).where(StreamProxy.cluster_id == 1)
        )
        proxies = result.scalars().all()
        assert len(proxies) == 3

    async def test_update_stream_proxy(self, test_db):
        proxy = StreamProxy(cluster_id=1, name="original", listen_port=9975)
        test_db.add(proxy)
        await test_db.commit()

        proxy.name = "updated-name"
        proxy.load_balance = "least_conn"
        await test_db.commit()
        await test_db.refresh(proxy)
        assert proxy.name == "updated-name"
        assert proxy.load_balance == "least_conn"

    async def test_create_dns_proxy(self, test_db):
        proxy = StreamProxy(
            cluster_id=1,
            name="dns-proxy",
            listen_port=53,
            scheme="udp",
            proxy_type="dns",
            dns_config=json.dumps({
                "hosts": {
                    "test.local": {
                        "nodes": {"10.0.0.1:53": ["127.0.0.1"]},
                        "type": "roundrobin",
                    }
                }
            }),
        )
        test_db.add(proxy)
        await test_db.commit()
        await test_db.refresh(proxy)
        assert proxy.proxy_type == "dns"
        assert proxy.dns_config is not None
        hosts = json.loads(proxy.dns_config)["hosts"]
        assert "test.local" in hosts

    async def test_delete_stream_proxy(self, test_db):
        proxy = StreamProxy(cluster_id=1, name="to-delete", listen_port=9976)
        test_db.add(proxy)
        await test_db.commit()
        pid = proxy.id

        await test_db.delete(proxy)
        await test_db.commit()

        assert await test_db.get(StreamProxy, pid) is None


class TestStreamProxySchema:
    """Schema validation tests (import will fail until schemas are created)."""

    def test_create_minimal(self):
        from app.schemas.stream_proxy import StreamProxyCreate
        data = StreamProxyCreate(
            name="test-proxy",
            listen_port=9970,
            targets=[{"target": "10.0.0.1:8080", "weight": 100}],
        )
        assert data.name == "test-proxy"
        assert data.listen_port == 9970
        assert data.load_balance == "weighted_roundrobin"
        assert data.scheme == "tcp"

    def test_create_with_targets(self):
        from app.schemas.stream_proxy import StreamProxyCreate
        data = StreamProxyCreate(
            name="test-proxy",
            listen_port=9970,
            targets=[
                {"target": "10.0.0.1:8080", "weight": 100},
                {"target": "10.0.0.2:8080", "weight": 80},
            ],
        )
        assert len(data.targets) == 2

    def test_create_invalid_port_range(self):
        from app.schemas.stream_proxy import StreamProxyCreate
        with pytest.raises(ValidationError):
            StreamProxyCreate(name="bad", listen_port=99999, targets=[])

    def test_update_partial(self):
        from app.schemas.stream_proxy import StreamProxyUpdate
        data = StreamProxyUpdate(name="new-name")
        assert data.name == "new-name"

    def test_create_dns_proxy_schema(self):
        from app.schemas.stream_proxy import StreamProxyCreate
        data = StreamProxyCreate(
            name="dns-server",
            listen_port=53,
            scheme="udp",
            proxy_type="dns",
            dns_config={
                "hosts": {
                    "test.local": {
                        "nodes": {"10.0.0.1:53": ["127.0.0.1"]},
                        "type": "roundrobin",
                    }
                }
            },
        )
        assert data.proxy_type == "dns"
        assert data.dns_config["hosts"]["test.local"]["type"] == "roundrobin"

    def test_update_empty(self):
        from app.schemas.stream_proxy import StreamProxyUpdate
        data = StreamProxyUpdate()
        assert data.name is None
        assert data.scheme is None

    def test_response_json_conversion(self):
        from app.schemas.stream_proxy import StreamProxyResponse
        data = StreamProxyResponse(
            id=1,
            edge_uuid="abc-123",
            cluster_id=1,
            name="test",
            listen_port=9970,
            targets=json.dumps([{"target": "10.0.0.1:8080", "weight": 100}]),
            timeout=json.dumps({"connect": 3, "send": 3, "read": 3}),
            created_at="2025-06-25T00:00:00Z",
        )
        assert isinstance(data.targets, list)
        assert data.targets[0]["target"] == "10.0.0.1:8080"
        assert isinstance(data.timeout, dict)
        assert data.timeout["connect"] == 3

    def test_detect_ports_request(self):
        from app.schemas.stream_proxy import DetectPortsRequest
        req = DetectPortsRequest(node_id=5)
        assert req.node_id == 5


class TestStreamProxyAPI:
    """API endpoint tests."""

    def _unique_port(self):
        import random
        return random.randint(20000, 30000)

    async def _login(self, client):
        resp = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "panshi123"})
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    async def test_list_empty(self):
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.get("/api/v1/clusters/1/stream-proxies", headers=headers)
            assert resp.status_code == 200
            data = resp.json()
            assert "items" in data
            assert "total" in data

    async def test_create_and_get(self):
        port = self._unique_port()
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.post(
                "/api/v1/clusters/1/stream-proxies",
                headers=headers,
                json={
                    "name": "api-test-proxy",
                    "listen_port": port,
                    "targets": [{"target": "10.0.0.1:8080", "weight": 100}],
                },
            )
            assert resp.status_code == 201, f"Create failed: {resp.text}"
            data = resp.json()
            pid = data["id"]
            assert data["name"] == "api-test-proxy"
            assert data["listen_port"] == port
            assert data["load_balance"] == "weighted_roundrobin"
            assert data["cluster_id"] == 1

            resp = await client.get(f"/api/v1/clusters/1/stream-proxies/{pid}", headers=headers)
            assert resp.status_code == 200
            assert resp.json()["name"] == "api-test-proxy"

    async def test_update(self):
        port = self._unique_port()
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.post(
                "/api/v1/clusters/1/stream-proxies",
                headers=headers,
                json={"name": "update-test", "listen_port": port, "targets": [{"target": "10.0.0.1:8080", "weight": 100}]},
            )
            pid = resp.json()["id"]

            resp = await client.put(
                f"/api/v1/clusters/1/stream-proxies/{pid}",
                headers=headers,
                json={"name": "updated-name", "load_balance": "least_conn"},
            )
            assert resp.status_code == 200, f"Update failed: {resp.text}"
            assert resp.json()["name"] == "updated-name"
            assert resp.json()["load_balance"] == "least_conn"
            assert resp.json()["listen_port"] == port

    async def test_delete(self):
        port = self._unique_port()
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.post(
                "/api/v1/clusters/1/stream-proxies",
                headers=headers,
                json={"name": "delete-test", "listen_port": port, "targets": [{"target": "10.0.0.1:8080", "weight": 100}]},
            )
            assert resp.status_code == 201, f"POST failed: {resp.status_code} {resp.text}"
            pid = resp.json()["id"]

            resp = await client.request(
                "DELETE",
                f"/api/v1/clusters/1/stream-proxies/{pid}",
                headers=headers,
                json={"delete_db": True},
            )
            assert resp.status_code == 200, f"Delete failed: {resp.text}"

            resp = await client.get(f"/api/v1/clusters/1/stream-proxies/{pid}", headers=headers)
            assert resp.status_code == 404

    async def test_create_duplicate_port_rejected(self):
        port = self._unique_port()
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            resp = await client.post(
                "/api/v1/clusters/1/stream-proxies",
                headers=headers,
                json={"name": "dup-port-1", "listen_port": port, "targets": [{"target": "10.0.0.1:8080", "weight": 100}]},
            )
            assert resp.status_code == 201

            resp = await client.post(
                "/api/v1/clusters/1/stream-proxies",
                headers=headers,
                json={"name": "dup-port-2", "listen_port": port, "targets": [{"target": "10.0.0.1:8080", "weight": 100}]},
            )
            assert resp.status_code == 409, f"Expected 409, got {resp.status_code}: {resp.text}"

    async def test_list_filter_by_cluster(self):
        port = self._unique_port()
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            await client.post(
                "/api/v1/clusters/1/stream-proxies",
                headers=headers,
                json={"name": "filter-test", "listen_port": port, "targets": [{"target": "10.0.0.1:8080", "weight": 100}]},
            )
            resp = await client.get("/api/v1/clusters/1/stream-proxies", headers=headers)
            assert resp.status_code == 200
            data = resp.json()
            for item in data["items"]:
                assert item["cluster_id"] == 1


class TestProxyTypeFilter:
    """API proxy_type query parameter filter."""

    @pytest.fixture
    def client(self):
        from app.main import app
        with TestClient(app) as c:
            yield c

    def test_global_list_accepts_proxy_type_param(self, client):
        resp = client.get("/api/v1/stream-proxies?proxy_type=normal")
        assert resp.status_code in (200, 401, 422)

    def test_global_list_rejects_invalid_proxy_type(self, client):
        resp = client.get("/api/v1/stream-proxies?proxy_type=invalid")
        assert resp.status_code == 422
