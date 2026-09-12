"""Tests for global node list API (GET /nodes)."""

import pytest


class TestGlobalNodeListAPI:

    async def _login(self, client, username="admin", password="panshi123"):
        resp = await client.post("/api/v1/auth/login",
            json={"username": username, "password": password})
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    async def test_list_all_nodes_returns_paginated(self, async_isolated_client):
        """GET /api/v1/nodes should return paginated node list."""
        headers = await self._login(async_isolated_client)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "items" in data

    async def test_list_nodes_contains_cluster_name(self, async_isolated_client):
        """Each node item should include cluster_name."""
        headers = await self._login(async_isolated_client)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers)
        data = response.json()
        if data["items"]:
            assert "cluster_name" in data["items"][0]

    async def test_list_nodes_cluster_filter(self, async_isolated_client):
        """cluster_id filter should work."""
        headers = await self._login(async_isolated_client)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers, params={"cluster_id": 1})
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["cluster_id"] == 1

    async def test_list_nodes_status_filter(self, async_isolated_client):
        """status filter should work."""
        headers = await self._login(async_isolated_client)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers, params={"status": 1})
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["status"] == 1

    async def test_list_nodes_group_filter(self, async_isolated_client):
        """group_name filter should only return nodes whose cluster is in that group."""
        headers = await self._login(async_isolated_client)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers,
            params={"group_name": "机电-路局-成都局", "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["cluster_group_name"] == "机电-路局-成都局"

    async def test_list_nodes_search(self, async_isolated_client):
        """search filter should work on IP and name."""
        headers = await self._login(async_isolated_client)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers, params={"search": "10.0"})
        assert response.status_code == 200

    async def test_find_node_by_ip_port_backward_compat(self, async_isolated_client):
        """Existing ?ip=&management_port= lookup should still work."""
        headers = await self._login(async_isolated_client)
        list_resp = await async_isolated_client.get("/api/v1/nodes", headers=headers)
        list_data = list_resp.json()
        if list_data["items"]:
            node = list_data["items"][0]
            resp = await async_isolated_client.get(
                "/api/v1/nodes",
                headers=headers,
                params={"ip": node["ip"], "management_port": node["management_port"]}
            )
            assert resp.status_code == 200
            found = resp.json()
            assert found["ip"] == node["ip"]
            assert found["management_port"] == node["management_port"]

    async def test_unauthorized_access_returns_401(self, async_isolated_client):
        """Requests without auth token should return 401."""
        response = await async_isolated_client.get("/api/v1/nodes")
        assert response.status_code == 401
