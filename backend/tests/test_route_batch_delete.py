"""测试路由批量删除端点（delete_routes_batch）的行为。"""

import pytest
from unittest.mock import MagicMock
from unittest.mock import patch as _patch
from fastapi import HTTPException
from app.models.cluster import Cluster, Route, RoutePlugin, Node, ConfigVersion
from app.schemas.cluster import BatchDeleteRoutesRequest

# EdgeClient 在 edge_sync.delete_on_nodes 内部使用（模块级绑定），patch 该引用点
EC_PATH = "app.services.edge_sync.EdgeClient"
def patch_ec(**kwargs):
    return _patch(EC_PATH, **kwargs)


async def _setup_cluster_with_routes(test_db, with_edge_uuid=True):
    cluster = Cluster(name="batch-test-cluster")
    test_db.add(cluster)
    await test_db.flush()
    cid = cluster.id

    test_db.add_all([
        Route(cluster_id=cid, name="r1", uri="/a",
              edge_uuid="11111111-1111-1111-1111-111111111111" if with_edge_uuid else ""),
        Route(cluster_id=cid, name="r2", uri="/b",
              edge_uuid="22222222-2222-2222-2222-222222222222" if with_edge_uuid else ""),
        Route(cluster_id=cid, name="r3", uri="/c",
              edge_uuid="33333333-3333-3333-3333-333333333333" if with_edge_uuid else ""),
    ])
    await test_db.flush()

    test_db.add(Node(cluster_id=cid, ip="10.0.0.1", edge_path="/edge", status=1))
    await test_db.commit()
    return cid


async def _get_route_ids(test_db, cid):
    from sqlalchemy import select
    result = await test_db.execute(select(Route.id).where(Route.cluster_id == cid).order_by(Route.id))
    return [r for r in result.scalars().all()]


class TestBatchDeleteRoutes:

    async def test_delete_db_only_success(self, test_db):
        cid = await _setup_cluster_with_routes(test_db)
        from app.api.v1.cluster_routes import delete_routes_batch

        route_ids = await _get_route_ids(test_db, cid)
        result = await delete_routes_batch(
            cid, BatchDeleteRoutesRequest(route_ids=route_ids, delete_db=True), test_db
        )

        assert result["results"][0]["route_id"] == route_ids[0]
        assert result["results"][0]["status"] == "success"
        assert len(result["results"]) == 3

        # 数据库记录应已删除
        from sqlalchemy import select
        remaining = await test_db.execute(select(Route).where(Route.cluster_id == cid))
        assert remaining.scalars().all() == []

    async def test_empty_route_ids_rejected(self, test_db):
        cid = await _setup_cluster_with_routes(test_db)
        from app.api.v1.cluster_routes import delete_routes_batch

        with pytest.raises(HTTPException) as exc_info:
            await delete_routes_batch(
                cid, BatchDeleteRoutesRequest(route_ids=[], delete_db=True), test_db
            )
        assert exc_info.value.status_code == 400

    async def test_neither_db_nor_edge_rejected(self, test_db):
        cid = await _setup_cluster_with_routes(test_db)
        from app.api.v1.cluster_routes import delete_routes_batch

        route_ids = await _get_route_ids(test_db, cid)
        with pytest.raises(HTTPException) as exc_info:
            await delete_routes_batch(
                cid, BatchDeleteRoutesRequest(route_ids=route_ids, delete_db=False, delete_edge=False), test_db
            )
        assert exc_info.value.status_code == 400

    async def test_missing_route_does_not_block_others(self, test_db):
        cid = await _setup_cluster_with_routes(test_db)
        from app.api.v1.cluster_routes import delete_routes_batch

        route_ids = await _get_route_ids(test_db, cid)
        # 混入一个不存在的 id（其他集群的或已删除的）
        result = await delete_routes_batch(
            cid, BatchDeleteRoutesRequest(route_ids=route_ids + [99999], delete_db=True), test_db
        )

        # 不存在的路由计入失败，其余成功
        failed = [r for r in result["results"] if r["status"] == "failed"]
        succeeded = [r for r in result["results"] if r["status"] == "success"]
        assert len(failed) == 1
        assert failed[0]["route_id"] == 99999
        assert "error" in failed[0]
        assert len(succeeded) == 3

    async def test_empty_edge_uuid_skips_edge_sync(self, test_db):
        cid = await _setup_cluster_with_routes(test_db)
        from app.api.v1.cluster_routes import delete_routes_batch

        route_ids = await _get_route_ids(test_db, cid)
        # r1 的 edge_uuid 为空
        from sqlalchemy import select
        r1 = (await test_db.execute(select(Route).where(Route.cluster_id == cid, Route.name == "r1"))).scalar_one()
        r1.edge_uuid = ""
        await test_db.commit()

        mock_client = MagicMock()
        mock_client.delete_route.return_value = {}

        with patch_ec(return_value=mock_client):
            result = await delete_routes_batch(
                cid, BatchDeleteRoutesRequest(route_ids=route_ids, delete_db=True, delete_edge=True), test_db
            )

        # 空 edge_uuid 的路由内层 results 含 skipped 的 edge 结果，其余正常调用 delete_route
        edge_statuses = [
            r["results"][1]["status"]
            for r in result["results"]
            if any(x.get("scope") == "edge" for x in r["results"])
        ]
        skipped = [s for s in edge_statuses if s == "skipped"]
        assert len(skipped) == 1
        # delete_route 调用次数 = 非 skipped 的路由数（3 - 1 = 2）
        assert mock_client.delete_route.call_count == 2

    async def test_edge_sync_called_with_edge_uuid(self, test_db):
        cid = await _setup_cluster_with_routes(test_db)
        from app.api.v1.cluster_routes import delete_routes_batch

        route_ids = await _get_route_ids(test_db, cid)
        mock_client = MagicMock()
        mock_client.delete_route.return_value = {}

        with patch_ec(return_value=mock_client):
            result = await delete_routes_batch(
                cid, BatchDeleteRoutesRequest(route_ids=route_ids, delete_db=False, delete_edge=True), test_db
            )

        assert mock_client.delete_route.call_count == 3
        # 每个路由的 edge_uuid 应被传入
        uuids = [call.args[0] for call in mock_client.delete_route.call_args_list]
        assert len(set(uuids)) == 3
