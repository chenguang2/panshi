import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


class TestRouteListAPI:

    async def _login(self, client):
        resp = await client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        return resp.json()["access_token"]

    async def test_list_all_routes_returns_data(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get("/api/v1/routes", headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert "total" in data
            assert "items" in data
            assert "page" in data

    async def test_list_routes_contains_cluster_name(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get("/api/v1/routes", headers=headers)
            data = response.json()
            if data["items"]:
                assert "cluster_name" in data["items"][0]

    async def test_list_routes_cluster_filter(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get("/api/v1/routes", headers=headers, params={"cluster_id": 1})
            assert response.status_code == 200
            data = response.json()
            for item in data["items"]:
                assert item["cluster_id"] == 1

    async def test_list_routes_method_filter(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get("/api/v1/routes", headers=headers, params={"method": "GET"})
            assert response.status_code == 200

    async def test_list_routes_plugin_filter_reduces_count(self):
        """plugin filter should reduce total count vs unfiltered list."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            # Get total without filter
            all_resp = await client.get("/api/v1/routes", headers=headers, params={"page_size": 100})
            assert all_resp.status_code == 200
            all_total = all_resp.json()["total"]
            # Get with plugin filter
            filtered_resp = await client.get("/api/v1/routes", headers=headers, params={"page_size": 100, "plugin": "proxy_rewrite"})
            assert filtered_resp.status_code == 200
            data = filtered_resp.json()
            assert data["total"] < all_total
            for item in data["items"]:
                plugin_names = [p["plugin_name"] for p in item.get("plugins", [])]
                assert "proxy_rewrite" in plugin_names, f"route {item['name']} missing proxy_rewrite"
