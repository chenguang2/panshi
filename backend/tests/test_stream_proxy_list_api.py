import pytest


class TestStreamProxyListAPI:

    async def test_list_all_stream_proxies_returns_data(self, async_authed_client):
        response = await async_authed_client.get("/api/v1/stream-proxies")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data

    async def test_list_stream_proxies_group_filter(self, async_authed_client):
        response = await async_authed_client.get(
            "/api/v1/stream-proxies",
            params={"group_name": "192.168.100.42", "page_size": 200}
        )
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["cluster_group_name"] == "192.168.100.42"
