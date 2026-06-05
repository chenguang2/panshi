"""Tests for global node list API (GET /nodes)."""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


class TestGlobalNodeListAPI:

    async def _login(self, client, username="admin", password="panshi123"):
        resp = await client.post("/api/v1/auth/login",
            json={"username": username, "password": password})
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    async def test_list_all_nodes_returns_paginated(self):
        """GET /api/v1/nodes should return paginated node list."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            response = await client.get("/api/v1/nodes", headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert "total" in data
            assert "page" in data
            assert "page_size" in data
            assert "items" in data

    async def test_list_nodes_contains_cluster_name(self):
        """Each node item should include cluster_name."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            response = await client.get("/api/v1/nodes", headers=headers)
            data = response.json()
            if data["items"]:
                assert "cluster_name" in data["items"][0]

    async def test_list_nodes_cluster_filter(self):
        """cluster_id filter should work."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            response = await client.get("/api/v1/nodes", headers=headers, params={"cluster_id": 1})
            assert response.status_code == 200
            data = response.json()
            for item in data["items"]:
                assert item["cluster_id"] == 1

    async def test_list_nodes_status_filter(self):
        """status filter should work."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            response = await client.get("/api/v1/nodes", headers=headers, params={"status": 1})
            assert response.status_code == 200
            data = response.json()
            for item in data["items"]:
                assert item["status"] == 1

    async def test_list_nodes_search(self):
        """search filter should work on IP and name."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            response = await client.get("/api/v1/nodes", headers=headers, params={"search": "10.0"})
            assert response.status_code == 200

    async def test_find_node_by_ip_port_backward_compat(self):
        """Existing ?ip=&management_port= lookup should still work."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await self._login(client)
            # First get a node to find a valid IP/port combo
            list_resp = await client.get("/api/v1/nodes", headers=headers)
            list_data = list_resp.json()
            if list_data["items"]:
                node = list_data["items"][0]
                resp = await client.get(
                    "/api/v1/nodes",
                    headers=headers,
                    params={"ip": node["ip"], "management_port": node["management_port"]}
                )
                assert resp.status_code == 200
                found = resp.json()
                assert found["ip"] == node["ip"]
                assert found["management_port"] == node["management_port"]

    async def test_unauthorized_access_returns_401(self):
        """Requests without auth token should return 401."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/nodes")
            assert response.status_code == 401
