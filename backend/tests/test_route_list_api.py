"""路由列表 API（GET /routes）——分组/集群/方法过滤一律带种子精确断言。

历史问题（docs/refactoring/test-case-audit-2026-10-01.md §3.5「空转假绿」）：
`for item in data["items"]: assert ...` 在无种子隔离库上零迭代直接通过，
过滤逻辑从未被执行。现统一先种「2 个分组集群 + 1 个未分组集群、各 1 条路由」，
断言过滤后恰好只剩目标条目 + total 正确 + 未分组语义正确。
"""

from app.main import app
from app.models.cluster import Cluster, Route, RoutePlugin

GROUP_WUQING = "机电-武清"
GROUP_CHENGDU = "机电-路局-成都局"


class TestRouteListAPI:

    async def _login(self, client):
        resp = await client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        return resp.json()["access_token"]

    async def _seed_grouped_clusters(self, isolated_session):
        """种 2 个分组集群 + 1 个未分组集群，各 1 条路由（防空转假绿）。

        返回 {"routes": {路由名: 分组}, "clusters": {别名: 集群id}}。
        """
        async with isolated_session() as s:
            clusters = [
                Cluster(name="wuqing-cluster", display_name="武清集群", group_name=GROUP_WUQING),
                Cluster(name="chengdu-cluster", display_name="成都集群", group_name=GROUP_CHENGDU),
                Cluster(name="bare-cluster", display_name="无组集群", group_name=""),
            ]
            s.add_all(clusters)
            await s.flush()
            routes = [
                Route(cluster_id=clusters[0].id, name="route-in-wuqing", uri="/wuqing/*"),
                Route(cluster_id=clusters[1].id, name="route-in-chengdu", uri="/chengdu/*"),
                Route(cluster_id=clusters[2].id, name="route-ungrouped", uri="/bare/*"),
            ]
            s.add_all(routes)
            await s.commit()
            return {
                "routes": {
                    "route-in-wuqing": GROUP_WUQING,
                    "route-in-chengdu": GROUP_CHENGDU,
                    "route-ungrouped": "",
                },
                "clusters": {"wuqing": clusters[0].id, "chengdu": clusters[1].id},
            }

    async def test_list_all_routes_returns_data(self, async_isolated_client):
        token = await self._login(async_isolated_client)
        headers = {"Authorization": f"Bearer {token}"}
        response = await async_isolated_client.get("/api/v1/routes", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert "page" in data

    async def test_list_routes_contains_cluster_name(self, async_isolated_client, isolated_session):
        """每条路由须带 cluster_name/cluster_group_name 标注，且与种子集群对应（有种子防空转）。"""
        token = await self._login(async_isolated_client)
        headers = {"Authorization": f"Bearer {token}"}
        seed = await self._seed_grouped_clusters(isolated_session)
        response = await async_isolated_client.get("/api/v1/routes", headers=headers, params={"page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        by_name = {item["name"]: item for item in data["items"]}
        assert set(by_name) == set(seed["routes"])
        assert by_name["route-in-wuqing"]["cluster_name"] == "武清集群"
        for name, group in seed["routes"].items():
            assert by_name[name]["cluster_group_name"] == group

    async def test_list_routes_cluster_filter(self, async_isolated_client, isolated_session):
        """cluster_id 过滤后恰好只剩目标集群的路由。"""
        token = await self._login(async_isolated_client)
        headers = {"Authorization": f"Bearer {token}"}
        seed = await self._seed_grouped_clusters(isolated_session)
        cid = seed["clusters"]["wuqing"]
        response = await async_isolated_client.get("/api/v1/routes", headers=headers,
            params={"cluster_id": cid, "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["name"] for item in data["items"]] == ["route-in-wuqing"]
        for item in data["items"]:
            assert item["cluster_id"] == cid

    async def test_list_routes_method_filter(self, async_isolated_client, isolated_session):
        """method 过滤精确命中（有种子，防只断 200 的弱覆盖）。"""
        token = await self._login(async_isolated_client)
        headers = {"Authorization": f"Bearer {token}"}
        async with isolated_session() as s:
            s.add_all([
                Route(cluster_id=1, name="m-get", uri="/m-get/*", methods="GET"),
                Route(cluster_id=1, name="m-post", uri="/m-post/*", methods="POST"),
            ])
            await s.commit()
        response = await async_isolated_client.get("/api/v1/routes", headers=headers,
            params={"method": "GET", "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["name"] for item in data["items"]] == ["m-get"]

    async def test_list_routes_group_filter_机电_武清(self, async_isolated_client, isolated_session):
        """group_name 过滤后恰好只剩目标分组的路由 + total 正确（有种子防空转假绿）。"""
        token = await self._login(async_isolated_client)
        headers = {"Authorization": f"Bearer {token}"}
        seed = await self._seed_grouped_clusters(isolated_session)
        response = await async_isolated_client.get(
            "/api/v1/routes", headers=headers,
            params={"group_name": GROUP_WUQING, "page_size": 200}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["name"] for item in data["items"]] == ["route-in-wuqing"]
        for item in data["items"]:
            assert item["cluster_group_name"] == GROUP_WUQING, \
                f"route {item['id']} cluster_group_name={item.get('cluster_group_name')} not in group {GROUP_WUQING}"

    async def test_list_routes_group_filter_ungrouped(self, async_isolated_client, isolated_session):
        """group_name=__ung__ 只返回未分组集群（group_name 为 NULL/空串）的路由。"""
        token = await self._login(async_isolated_client)
        headers = {"Authorization": f"Bearer {token}"}
        await self._seed_grouped_clusters(isolated_session)
        response = await async_isolated_client.get(
            "/api/v1/routes", headers=headers,
            params={"group_name": "__ung__", "page_size": 200}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["name"] for item in data["items"]] == ["route-ungrouped"]
        for item in data["items"]:
            assert not item.get("cluster_group_name"), \
                f"route {item['id']} cluster_group_name={item.get('cluster_group_name')} not empty for ungrouped"

    async def test_list_routes_group_filter_all(self, async_isolated_client, isolated_session):
        """group_name=__all__ 不过滤：total 与无过滤一致且等于种子总数。"""
        token = await self._login(async_isolated_client)
        headers = {"Authorization": f"Bearer {token}"}
        await self._seed_grouped_clusters(isolated_session)
        all_resp = await async_isolated_client.get("/api/v1/routes", headers=headers, params={"page_size": 200})
        assert all_resp.status_code == 200
        all_total = all_resp.json()["total"]
        assert all_total == 3
        filtered_resp = await async_isolated_client.get("/api/v1/routes", headers=headers, params={"page_size": 200, "group_name": "__all__"})
        assert filtered_resp.status_code == 200
        assert filtered_resp.json()["total"] == all_total

    async def test_list_routes_plugin_filter_reduces_count(self, async_isolated_client, isolated_session):
        """plugin filter should reduce total count vs unfiltered list.

        自给自足种子（隔离库不依赖真实数据）：一条带 proxy_rewrite 的路由 +
        一条不带，过滤后 total 必须严格减少。
        """
        import json

        async with isolated_session() as s:
            if not await s.get(Route, 1):
                s.add(Route(id=1, cluster_id=1, name="with-pr", uri="/with-pr/*", priority=0, status=1))
                s.add(Route(id=2, cluster_id=1, name="without-pr", uri="/without-pr/*", priority=0, status=1))
                s.add(
                    RoutePlugin(
                        route_id=1,
                        plugin_name="proxy_rewrite",
                        config=json.dumps({"regex_uri": ["^/a", "/b"]}),
                    )
                )
                await s.commit()

        token = await self._login(async_isolated_client)
        headers = {"Authorization": f"Bearer {token}"}
        all_resp = await async_isolated_client.get("/api/v1/routes", headers=headers, params={"page_size": 100})
        assert all_resp.status_code == 200
        all_total = all_resp.json()["total"]
        filtered_resp = await async_isolated_client.get("/api/v1/routes", headers=headers, params={"page_size": 100, "plugin": "proxy_rewrite"})
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
