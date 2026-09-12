import pytest


class TestPluginConfigListAPI:

    async def test_list_all_plugin_configs_returns_data(self, async_authed_client):
        response = await async_authed_client.get("/api/v1/plugin_configs")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data

    async def test_list_plugin_configs_contains_cluster_name(self, async_authed_client):
        response = await async_authed_client.get("/api/v1/plugin_configs")
        data = response.json()
        if data["items"]:
            assert "cluster_name" in data["items"][0]

    async def test_list_plugin_configs_group_filter(self, async_authed_client):
        response = await async_authed_client.get(
            "/api/v1/plugin_configs",
            params={"group_name": "机电-路局-成都局", "page_size": 200}
        )
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["cluster_group_name"] == "机电-路局-成都局"
