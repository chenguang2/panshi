"""全局节点列表 API（GET /nodes）——过滤用例一律带种子精确断言。

历史问题（docs/refactoring/test-case-audit-2026-10-01.md §3.5「空转假绿」）：
group/cluster/status 过滤 `for item in items: assert` 与 `if data["items"]:` 守卫
在无种子隔离库上零迭代直接通过。现统一先种「2 个分组集群 + 1 个未分组集群、
各 1 节点（跨集群节点 + 集群关联）」，断言过滤结果精确。
种子形状取自真实模型字段（app/models/cluster.py::Node）。
"""

from app.models.cluster import Cluster, Node

GROUP_WUQING = "机电-武清"
GROUP_CHENGDU = "机电-路局-成都局"


class TestGlobalNodeListAPI:

    async def _login(self, client, username="admin", password="panshi123"):
        resp = await client.post("/api/v1/auth/login",
            json={"username": username, "password": password})
        assert resp.status_code == 200
        token = resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    async def _seed_nodes(self, isolated_session):
        """种 2 个分组集群 + 1 个未分组集群，各 1 节点。

        返回 {"nodes": {ip: (分组, 集群展示名, status)}, "clusters": {别名: 集群id}}。
        """
        async with isolated_session() as s:
            clusters = [
                Cluster(name="wuqing-cluster", display_name="武清集群", group_name=GROUP_WUQING),
                Cluster(name="chengdu-cluster", display_name="成都集群", group_name=GROUP_CHENGDU),
                Cluster(name="bare-cluster", display_name="无组集群", group_name=""),
            ]
            s.add_all(clusters)
            await s.flush()
            nodes = [
                Node(cluster_id=clusters[0].id, ip="10.1.0.11", edge_path="/usr/local/edge",
                     service_port=80, management_port=9181, status=1),
                Node(cluster_id=clusters[1].id, ip="10.1.0.12", edge_path="/usr/local/edge",
                     service_port=81, management_port=9182, status=1),
                Node(cluster_id=clusters[2].id, ip="10.1.0.13", edge_path="/usr/local/edge",
                     service_port=82, management_port=9183, status=0),
            ]
            s.add_all(nodes)
            await s.commit()
            return {
                "nodes": {
                    "10.1.0.11": (GROUP_WUQING, "武清集群", 1),
                    "10.1.0.12": (GROUP_CHENGDU, "成都集群", 1),
                    "10.1.0.13": ("", "无组集群", 0),
                },
                "clusters": {"wuqing": clusters[0].id, "chengdu": clusters[1].id},
            }

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

    async def test_list_nodes_contains_cluster_name(self, async_isolated_client, isolated_session):
        """Each node item should carry cluster_name/cluster_group_name matching its cluster（有种子防空转）。"""
        headers = await self._login(async_isolated_client)
        seed = await self._seed_nodes(isolated_session)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers,
            params={"page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        by_ip = {item["ip"]: item for item in data["items"]}
        assert set(by_ip) == set(seed["nodes"])
        for ip, (group, cluster_name, _status) in seed["nodes"].items():
            assert by_ip[ip]["cluster_name"] == cluster_name
            assert by_ip[ip]["cluster_group_name"] == group

    async def test_list_nodes_cluster_filter(self, async_isolated_client, isolated_session):
        """cluster_id filter should return exactly the target cluster's node."""
        headers = await self._login(async_isolated_client)
        seed = await self._seed_nodes(isolated_session)
        cid = seed["clusters"]["wuqing"]
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers,
            params={"cluster_id": cid, "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["ip"] for item in data["items"]] == ["10.1.0.11"]
        for item in data["items"]:
            assert item["cluster_id"] == cid

    async def test_list_nodes_status_filter(self, async_isolated_client, isolated_session):
        """status=1 should return exactly the two enabled seeded nodes."""
        headers = await self._login(async_isolated_client)
        await self._seed_nodes(isolated_session)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers,
            params={"status": 1, "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert {item["ip"] for item in data["items"]} == {"10.1.0.11", "10.1.0.12"}
        for item in data["items"]:
            assert item["status"] == 1

    async def test_list_nodes_group_filter(self, async_isolated_client, isolated_session):
        """group_name filter should return exactly the node whose cluster is in that group（有种子防空转假绿）。"""
        headers = await self._login(async_isolated_client)
        await self._seed_nodes(isolated_session)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers,
            params={"group_name": GROUP_CHENGDU, "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["ip"] for item in data["items"]] == ["10.1.0.12"]
        for item in data["items"]:
            assert item["cluster_group_name"] == GROUP_CHENGDU

    async def test_list_nodes_group_filter_ungrouped(self, async_isolated_client, isolated_session):
        """group_name=__ung__ should return exactly the node of the ungrouped cluster."""
        headers = await self._login(async_isolated_client)
        await self._seed_nodes(isolated_session)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers,
            params={"group_name": "__ung__", "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["ip"] for item in data["items"]] == ["10.1.0.13"]
        for item in data["items"]:
            assert not item["cluster_group_name"]

    async def test_list_nodes_search(self, async_isolated_client, isolated_session):
        """search filter should hit exactly the seeded node by IP."""
        headers = await self._login(async_isolated_client)
        await self._seed_nodes(isolated_session)
        response = await async_isolated_client.get("/api/v1/nodes", headers=headers,
            params={"search": "10.1.0.12", "page_size": 200})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert [item["ip"] for item in data["items"]] == ["10.1.0.12"]

    async def test_find_node_by_ip_port_backward_compat(self, async_isolated_client, isolated_session):
        """Existing ?ip=&management_port= lookup should return the seeded node（有种子防空转）。"""
        headers = await self._login(async_isolated_client)
        await self._seed_nodes(isolated_session)
        resp = await async_isolated_client.get(
            "/api/v1/nodes",
            headers=headers,
            params={"ip": "10.1.0.11", "management_port": 9181}
        )
        assert resp.status_code == 200
        found = resp.json()
        assert found["ip"] == "10.1.0.11"
        assert found["management_port"] == 9181
        assert found["cluster_name"] == "武清集群"
        assert found["cluster_group_name"] == GROUP_WUQING

    async def test_unauthorized_access_returns_401(self, async_isolated_client):
        """Requests without auth token should return 401."""
        response = await async_isolated_client.get("/api/v1/nodes")
        assert response.status_code == 401
