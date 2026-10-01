"""测试集群删除时 Edge 同步的调用顺序和错误处理。"""

import pytest
from sqlalchemy import select
from unittest.mock import MagicMock
from unittest.mock import patch as _patch
from app.models.cluster import Cluster, Upstream, Route, PluginConfig, GlobalRule, PluginMetadata, Node, ConfigVersion
from app.schemas.cluster import DeleteClusterRequest

# EdgeClient 在 clusters.py 模块顶层 import（from app.services.edge_client import EdgeClient），
# 因此必须 patch 生产代码绑定的位置 app.api.v1.clusters.EdgeClient，patch 源模块不生效。
EC_PATH = "app.api.v1.clusters.EdgeClient"
def patch_ec(**kwargs):
    return _patch(EC_PATH, **kwargs)


async def _setup_test_cluster(test_db):
    cluster = Cluster(name="test-cluster")
    test_db.add(cluster)
    await test_db.flush()
    cid = cluster.id

    u1 = Upstream(cluster_id=cid, name="u1")
    u2 = Upstream(cluster_id=cid, name="u2")
    test_db.add_all([u1, u2])
    await test_db.flush()

    test_db.add_all([
        Route(cluster_id=cid, name="r1", uri="/a", upstream_id=u1.id),
        Route(cluster_id=cid, name="r2", uri="/b", upstream_id=u2.id),
    ])
    await test_db.flush()

    test_db.add_all([
        PluginConfig(cluster_id=cid, name="pc1"),
        GlobalRule(cluster_id=cid, name="gr1"),
        PluginMetadata(cluster_id=cid, plugin_name="pm1"),
        Node(cluster_id=cid, ip="10.0.0.1", edge_path="/edge", status=1),
    ])
    await test_db.commit()
    return cid


class TestClusterDeleteEdgeSync:

    async def test_delete_calls_all_methods(self, test_db):
        cid = await _setup_test_cluster(test_db)
        from app.api.v1.clusters import delete_cluster

        mock_client = MagicMock()
        for m in ["delete_route", "delete_upstream", "delete_plugin_config",
                   "delete_global_rule", "delete_plugin_metadata"]:
            getattr(mock_client, m).return_value = {}

        with patch_ec(return_value=mock_client):
            result = await delete_cluster(cid, DeleteClusterRequest(delete_db=True, delete_edge=True), test_db)

        assert len(result["results"]) == 2
        assert result["results"][0]["scope"] == "edge"
        assert result["results"][0]["status"] == "success"
        assert result["results"][1]["scope"] == "database"
        assert result["results"][1]["status"] == "success"
        assert mock_client.delete_route.call_count == 2
        assert mock_client.delete_upstream.call_count == 2
        assert mock_client.delete_plugin_config.call_count == 1
        assert mock_client.delete_global_rule.call_count == 1
        assert mock_client.delete_plugin_metadata.call_count == 1

    async def test_delete_order_routes_before_upstreams(self, test_db):
        cid = await _setup_test_cluster(test_db)
        from app.api.v1.clusters import delete_cluster
        seq = []

        class T:
            def delete_route(self, eu): seq.append("route"); return {}
            def delete_upstream(self, eu): seq.append("upstream"); return {}
            def delete_plugin_config(self, eu): seq.append("pc"); return {}
            def delete_global_rule(self, eu): seq.append("gr"); return {}
            def delete_plugin_metadata(self, pn): seq.append("pm"); return {}

        with patch_ec(return_value=T()):
            await delete_cluster(cid, DeleteClusterRequest(delete_db=True, delete_edge=True), test_db)

        ri = [i for i, x in enumerate(seq) if x == "route"]
        ui = [i for i, x in enumerate(seq) if x == "upstream"]
        assert ri and ui
        assert max(ri) < min(ui), f"routes {ri} should be before upstreams {ui}"

    async def test_partial_failure_continues(self, test_db):
        cid = await _setup_test_cluster(test_db)
        from app.api.v1.clusters import delete_cluster
        cnt = {"r": 0, "u": 0}

        class F:
            def delete_route(self, eu):
                cnt["r"] += 1
                if cnt["r"] == 1:
                    raise Exception("模拟失败")
                return {}
            def delete_upstream(self, eu): cnt["u"] += 1; return {}
            def delete_plugin_config(self, eu): return {}
            def delete_global_rule(self, eu): return {}
            def delete_plugin_metadata(self, pn): return {}

        with patch_ec(return_value=F()):
            result = await delete_cluster(cid, DeleteClusterRequest(delete_db=True, delete_edge=True), test_db)

        assert result["results"][0]["status"] == "failed"
        assert "route" in result["results"][0]["error"]
        assert cnt["r"] == 2
        assert cnt["u"] == 2

    async def test_all_fail_returns_failed(self, test_db):
        cid = await _setup_test_cluster(test_db)
        from app.api.v1.clusters import delete_cluster

        class F:
            def delete_route(self, eu): raise Exception("err")
            def delete_upstream(self, eu): raise Exception("err")
            def delete_plugin_config(self, eu): raise Exception("err")
            def delete_global_rule(self, eu): raise Exception("err")
            def delete_plugin_metadata(self, pn): raise Exception("err")

        with patch_ec(return_value=F()):
            result = await delete_cluster(cid, DeleteClusterRequest(delete_db=True, delete_edge=True), test_db)

        assert result["results"][0]["status"] == "failed"


class TestDeleteUnpublishedClusterNoOrphans:
    """CLU-14：未发布集群删除（delete_db）后无孤儿残留。

    夹具播种 Node(status=0 禁用) + Route + ConfigVersion（发布尝试曾产生的
    版本快照）——删除端点对 Edge 侧零依赖（无活跃节点），纯库内清理。
    """

    async def test_delete_db_removes_all_cluster_scoped_rows(
        self, async_authed_client, isolated_session
    ):
        resp = await async_authed_client.post(
            "/api/v1/clusters", json={"name": "clu14-unpublished"}
        )
        assert resp.status_code == 201, resp.text
        cid = resp.json()["id"]

        # 播种该集群的节点 / 路由 / 版本快照（含另一个集群的对照行）
        async with isolated_session() as s:
            s.add(Node(cluster_id=cid, ip="10.77.0.14", edge_path="/edge", status=0))
            route = Route(cluster_id=cid, name="clu14-route", uri="/clu14/*")
            s.add(route)
            await s.flush()
            s.add(ConfigVersion(
                cluster_id=cid, resource_type="route", resource_id=route.id,
                version=1, config='{"name": "clu14-route"}',
            ))
            keeper = Route(cluster_id=1, name="clu14-keeper", uri="/keeper/*")
            s.add(keeper)
            await s.commit()
            route_id, keeper_id = route.id, keeper.id

        resp = await async_authed_client.request(
            "DELETE", f"/api/v1/clusters/{cid}", json={"delete_db": True}
        )
        assert resp.status_code == 200, resp.text
        db_result = next(
            r for r in resp.json()["results"] if r["scope"] == "database"
        )
        assert db_result["status"] == "success"

        async with isolated_session() as s:
            assert await s.get(Cluster, cid) is None
            for model in (Node, Route, ConfigVersion):
                left = (
                    await s.execute(select(model).where(model.cluster_id == cid))
                ).scalars().all()
                assert left == [], f"{model.__name__} 存在孤儿残留: {left}"
            # 对照：其他集群数据不受牵连
            keeper = await s.get(Route, keeper_id)
            assert keeper is not None and keeper.id == keeper_id

        # API 视角同样不可见
        resp = await async_authed_client.get(f"/api/v1/clusters/{cid}")
        assert resp.status_code == 404
