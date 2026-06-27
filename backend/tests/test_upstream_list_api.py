import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


class TestUpstreamListAPI:

    async def test_list_all_upstreams_returns_data(self):
        """GET /api/v1/upstreams should return upstreams with pagination."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"})
            assert resp.status_code == 200
            token = resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get("/api/v1/upstreams", headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert "total" in data
            assert "items" in data
            assert "page" in data
            assert "page_size" in data

    async def test_list_upstreams_contains_cluster_name(self):
        """Each upstream item should include cluster_name."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"})
            token = resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get("/api/v1/upstreams", headers=headers)
            data = response.json()
            if data["items"]:
                assert "cluster_name" in data["items"][0]

    async def test_list_upstreams_cluster_filter(self):
        """cluster_id filter should work."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"})
            token = resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get("/api/v1/upstreams", headers=headers, params={"cluster_id": 1})
            assert response.status_code == 200
            data = response.json()
            for item in data["items"]:
                assert item["cluster_id"] == 1

    async def test_list_upstreams_group_filter(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"})
            token = resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get("/api/v1/upstreams", headers=headers,
                params={"group_name": "机电-武清", "page_size": 200})
            assert response.status_code == 200
            data = response.json()
            assert data["total"] > 0
            for item in data["items"]:
                assert item["cluster_id"] in (28, 29)

    async def test_list_upstreams_search(self):
        """Search filter should work."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/auth/login",
                json={"username": "admin", "password": "panshi123"})
            token = resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = await client.get("/api/v1/upstreams", headers=headers, params={"search": "test"})
            assert response.status_code == 200
