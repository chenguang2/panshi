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

    async def test_list_routes_group_filter_机电_武清(self):
        """group_name filter should only return routes from that group."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get(
                "/api/v1/routes", headers=headers,
                params={"group_name": "机电-武清", "page_size": 200}
            )
            assert response.status_code == 200
            data = response.json()
            # Verify every returned route belongs to the requested group (relative
            # check, independent of which data exists in the DB).
            for item in data["items"]:
                assert item["cluster_group_name"] == "机电-武清", \
                    f"route {item['id']} cluster_group_name={item.get('cluster_group_name')} not in group 机电-武清"

    async def test_list_routes_group_filter_ungrouped(self):
        """group_name=__ung__ should return routes from clusters with no group."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            response = await client.get(
                "/api/v1/routes", headers=headers,
                params={"group_name": "__ung__", "page_size": 200}
            )
            assert response.status_code == 200
            data = response.json()
            for item in data["items"]:
                assert item["cluster_id"] == 30, \
                    f"route {item['id']} cluster_id={item['cluster_id']} not in ungrouped cluster"

    async def test_list_routes_group_filter_all(self):
        """group_name=__all__ should return all routes (no filter)."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await self._login(client)
            headers = {"Authorization": f"Bearer {token}"}
            all_resp = await client.get("/api/v1/routes", headers=headers, params={"page_size": 200})
            assert all_resp.status_code == 200
            all_total = all_resp.json()["total"]
            filtered_resp = await client.get("/api/v1/routes", headers=headers, params={"page_size": 200, "group_name": "__all__"})
            assert filtered_resp.status_code == 200
            assert filtered_resp.json()["total"] == all_total

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
                for p in item["plugins"]:
                    assert "config" in p, f"plugin {p['plugin_name']} missing config field"


class TestRouteListWebsocket:

    async def test_list_routes_includes_enable_websocket(self):
        """route_to_response 必须返回 enable_websocket，前端编辑回填依赖它。"""
        from app.api.v1.cluster_routes import route_to_response
        from app.models.cluster import Route

        # 用完整字段的 ORM 对象验证转换函数不丢字段
        route = Route(
            id=1, edge_uuid="uuid", cluster_id=1, name="ws-list-test",
            uri="/ws-list/*", priority=0, status=1, methods="GET",
            enable_websocket=True,
        )
        resp = route_to_response(route)
        assert resp.enable_websocket is True
