import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


class TestGlobalRuleListAPI:

    async def _login(self, client):
        resp = await client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        return resp.json()["access_token"]

    async def test_list_all_global_rules_returns_data(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get("/api/v1/global_rules", headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert "total" in data
            assert "items" in data

    async def test_list_global_rules_contains_cluster_name(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get("/api/v1/global_rules", headers=headers)
            data = response.json()
            if data["items"]:
                assert "cluster_name" in data["items"][0]

    async def test_list_global_rules_group_filter(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get("/api/v1/global_rules", headers=headers,
                params={"group_name": "机电-路局-成都局", "page_size": 200})
            assert response.status_code == 200
            data = response.json()
            assert data["total"] > 0
            for item in data["items"]:
                assert item["cluster_id"] in (4,5,6,7,8,9,10,11,12,13,14,15)
