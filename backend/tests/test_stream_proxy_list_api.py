import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


class TestStreamProxyListAPI:

    async def _login(self, client):
        resp = await client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        return resp.json()["access_token"]

    async def test_list_all_stream_proxies_returns_data(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get("/api/v1/stream-proxies", headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert "total" in data
            assert "items" in data

    async def test_list_stream_proxies_group_filter(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get("/api/v1/stream-proxies", headers=headers,
                params={"group_name": "192.168.100.42", "page_size": 200})
            assert response.status_code == 200
            data = response.json()
            assert data["total"] > 0
            for item in data["items"]:
                assert item["cluster_id"] in (31, 32)
