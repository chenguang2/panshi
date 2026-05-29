"""测试集群删除时 Edge 同步的调用顺序和错误处理。"""

import pytest
from unittest.mock import MagicMock
from unittest.mock import patch as _patch
from app.models.cluster import Cluster, Upstream, Route, PluginConfig, GlobalRule, PluginMetadata, Node
from app.schemas.cluster import DeleteClusterRequest

# EdgeClient 是函数内导入的，patch 它的原始定义位置
EC_PATH = "app.services.edge_client.EdgeClient"
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
