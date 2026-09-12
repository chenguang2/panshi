import pytest


class TestStaticResourceListAPI:

    async def test_list_all_returns_data(self, async_authed_client):
        response = await async_authed_client.get("/api/v1/static_resources")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data

    async def test_list_contains_cluster_name(self, async_authed_client):
        response = await async_authed_client.get("/api/v1/static_resources")
        data = response.json()
        if data["items"]:
            assert "cluster_name" in data["items"][0]

    async def test_list_static_resources_group_filter_works(self, async_authed_client):
        response = await async_authed_client.get(
            "/api/v1/static_resources",
            params={"group_name": "机电-路局-成都局", "page_size": 200}
        )
        assert response.status_code == 200
