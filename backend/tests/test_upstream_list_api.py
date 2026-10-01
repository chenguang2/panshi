"""Upstream 列表 API（GET /upstreams）——过滤用例一律带种子精确断言。

历史问题（docs/refactoring/test-case-audit-2026-10-01.md §3.5「空转假绿」）：
分组过滤 `for item in items: assert` 在无种子隔离库上零迭代直接通过。
现统一先种「2 个分组集群 + 1 个未分组集群、各 1 条 upstream」，
断言过滤后恰好只剩目标条目 + total 正确 + 未分组语义正确。
种子形状取自真实模型字段（app/models/cluster.py::Upstream）。
"""

from app.models.cluster import Cluster, Upstream

GROUP_WUQING = "机电-武清"
GROUP_CHENGDU = "机电-路局-成都局"


class TestUpstreamListAPI:

    async def _seed_grouped_clusters(self, isolated_session):
        """种 2 个分组集群 + 1 个未分组集群，各 1 条 upstream。

        返回 {"ups": {upstream名: (分组, 集群展示名)}, "clusters": {别名: 集群id}}。
        """
        async with isolated_session() as s:
            clusters = [
                Cluster(name="wuqing-cluster", display_name="武清集群", group_name=GROUP_WUQING),
                Cluster(name="chengdu-cluster", display_name="成都集群", group_name=GROUP_CHENGDU),
                Cluster(name="bare-cluster", display_name="无组集群", group_name=""),
            ]
            s.add_all(clusters)
            await s.flush()
            s.add_all([
                Upstream(cluster_id=clusters[0].id, name="up-in-wuqing"),
                Upstream(cluster_id=clusters[1].id, name="up-in-chengdu"),
                Upstream(cluster_id=clusters[2].id, name="up-ungrouped"),
            ])
            await s.commit()
            return {
                "ups": {
                    "up-in-wuqing": (GROUP_WUQING, "武清集群"),
                    "up-in-chengdu": (GROUP_CHENGDU, "成都集群"),
                    "up-ungrouped": ("", "无组集群"),
                },
                "clusters": {"wuqing": clusters[0].id, "chengdu": clusters[1].id},
            }

    async def test_list_all_upstreams_returns_data(self, async_isolated_client):
        """GET /api/v1/upstreams should return upstreams with pagination."""
        resp = await async_isolated_client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        assert resp.status_code == 200
        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        response = await async_isolated_client.get("/api/v1/upstreams", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert "page" in data
        assert "page_size" in data

    async def test_list_upstreams_contains_cluster_name(self, async_isolated_client, isolated_session):
        """Each upstream item should include cluster_name（有种子防空转）。"""
        resp = await async_isolated_client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        seed = await self._seed_grouped_clusters(isolated_session)
        response = await async_isolated_client.get("/api/v1/upstreams", headers=headers,
            params={"page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        by_name = {item["name"]: item for item in data["items"]}
        assert set(by_name) == set(seed["ups"])
        for name, (group, cluster_name) in seed["ups"].items():
            assert by_name[name]["cluster_name"] == cluster_name
            assert by_name[name]["cluster_group_name"] == group

    async def test_list_upstreams_cluster_filter(self, async_isolated_client, isolated_session):
        """cluster_id filter should return exactly the target cluster's upstreams."""
        resp = await async_isolated_client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        seed = await self._seed_grouped_clusters(isolated_session)
        cid = seed["clusters"]["wuqing"]
        response = await async_isolated_client.get("/api/v1/upstreams", headers=headers,
            params={"cluster_id": cid, "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["name"] for item in data["items"]] == ["up-in-wuqing"]
        for item in data["items"]:
            assert item["cluster_id"] == cid

    async def test_list_upstreams_group_filter(self, async_isolated_client, isolated_session):
        """group_name 过滤后恰好只剩目标分组的 upstream（有种子防空转假绿）。"""
        resp = await async_isolated_client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        await self._seed_grouped_clusters(isolated_session)
        response = await async_isolated_client.get("/api/v1/upstreams", headers=headers,
            params={"group_name": GROUP_WUQING, "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["name"] for item in data["items"]] == ["up-in-wuqing"]
        for item in data["items"]:
            assert item["cluster_group_name"] == GROUP_WUQING

    async def test_list_upstreams_group_filter_ungrouped(self, async_isolated_client, isolated_session):
        """group_name=__ung__ 只返回未分组集群的 upstream。"""
        resp = await async_isolated_client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        await self._seed_grouped_clusters(isolated_session)
        response = await async_isolated_client.get("/api/v1/upstreams", headers=headers,
            params={"group_name": "__ung__", "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["name"] for item in data["items"]] == ["up-ungrouped"]
        for item in data["items"]:
            assert not item["cluster_group_name"]

    async def test_list_upstreams_search(self, async_isolated_client, isolated_session):
        """Search filter should hit exactly the seeded upstream by name."""
        resp = await async_isolated_client.post("/api/v1/auth/login",
            json={"username": "admin", "password": "panshi123"})
        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        await self._seed_grouped_clusters(isolated_session)
        response = await async_isolated_client.get("/api/v1/upstreams", headers=headers,
            params={"search": "wuqing", "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["name"] for item in data["items"]] == ["up-in-wuqing"]

        miss = await async_isolated_client.get("/api/v1/upstreams", headers=headers,
            params={"search": "no-such-up", "page_size": 200})
        assert miss.status_code == 200
        assert miss.json()["total"] == 0
        assert miss.json()["items"] == []
