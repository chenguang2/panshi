"""测试上游批量删除端点（delete_upstreams_batch）的行为。"""

import pytest
from unittest.mock import MagicMock
from unittest.mock import patch as _patch
from fastapi import HTTPException
from app.models.cluster import Cluster, Upstream, UpstreamTarget, Route, Node, ConfigVersion
from app.schemas.cluster import BatchDeleteUpstreamsRequest

# EdgeClient 在 edge_sync.delete_on_nodes 内部使用（模块级绑定），patch 该引用点
EC_PATH = "app.services.edge_sync.EdgeClient"


def patch_ec(**kwargs):
    return _patch(EC_PATH, **kwargs)


class TestBatchDeleteUpstreamsRequest:

    def test_request_accepts_upstream_ids(self):
        """BatchDeleteUpstreamsRequest SHALL 继承 DeleteClusterRequest 并携带 upstream_ids。"""
        req = BatchDeleteUpstreamsRequest(upstream_ids=[1, 2], delete_db=True)
        assert req.upstream_ids == [1, 2]
        assert req.delete_db is True
        assert req.delete_edge is False
        assert req.node_ids is None


async def _setup_cluster_with_upstreams(test_db, with_edge_uuid=True):
    cluster = Cluster(name="batch-upstream-test-cluster")
    test_db.add(cluster)
    await test_db.flush()
    cid = cluster.id

    test_db.add_all([
        Upstream(cluster_id=cid, name="u1", load_balance="weighted_roundrobin",
                 edge_uuid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" if with_edge_uuid else ""),
        Upstream(cluster_id=cid, name="u2", load_balance="weighted_roundrobin",
                 edge_uuid="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" if with_edge_uuid else ""),
        Upstream(cluster_id=cid, name="u3", load_balance="weighted_roundrobin",
                 edge_uuid="cccccccc-cccc-cccc-cccc-cccccccccccc" if with_edge_uuid else ""),
    ])
    await test_db.flush()

    test_db.add(Node(cluster_id=cid, ip="10.0.0.1", edge_path="/edge", status=1))
    await test_db.commit()
    return cid


async def _get_upstream_ids(test_db, cid):
    from sqlalchemy import select
    result = await test_db.execute(select(Upstream.id).where(Upstream.cluster_id == cid).order_by(Upstream.id))
    return [u for u in result.scalars().all()]


class TestBatchDeleteUpstreamsEndpoint:

    async def test_delete_db_only_success(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstreams_batch

        upstream_ids = await _get_upstream_ids(test_db, cid)
        result = await delete_upstreams_batch(
            cid, BatchDeleteUpstreamsRequest(upstream_ids=upstream_ids, delete_db=True), test_db
        )

        assert result["results"][0]["upstream_id"] == upstream_ids[0]
        assert result["results"][0]["status"] == "success"
        assert len(result["results"]) == 3

        from sqlalchemy import select
        remaining = await test_db.execute(select(Upstream).where(Upstream.cluster_id == cid))
        assert remaining.scalars().all() == []

    async def test_delete_db_removes_targets_and_config_versions(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstreams_batch
        from sqlalchemy import select

        upstream_ids = await _get_upstream_ids(test_db, cid)
        test_db.add(UpstreamTarget(upstream_id=upstream_ids[0], target="10.0.0.2:80", weight=100))
        test_db.add(ConfigVersion(resource_type="upstream", resource_id=upstream_ids[0], version=1,
                                  config="{}", cluster_id=cid))
        await test_db.commit()

        result = await delete_upstreams_batch(
            cid, BatchDeleteUpstreamsRequest(upstream_ids=upstream_ids[:1], delete_db=True), test_db
        )
        assert result["results"][0]["status"] == "success"

        targets = (await test_db.execute(
            select(UpstreamTarget).where(UpstreamTarget.upstream_id == upstream_ids[0]))).scalars().all()
        versions = (await test_db.execute(
            select(ConfigVersion).where(ConfigVersion.resource_type == "upstream",
                                        ConfigVersion.resource_id == upstream_ids[0]))).scalars().all()
        assert targets == []
        assert versions == []

    async def test_empty_upstream_ids_rejected(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstreams_batch

        with pytest.raises(HTTPException) as exc_info:
            await delete_upstreams_batch(
                cid, BatchDeleteUpstreamsRequest(upstream_ids=[], delete_db=True), test_db
            )
        assert exc_info.value.status_code == 400

    async def test_neither_db_nor_edge_rejected(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstreams_batch

        upstream_ids = await _get_upstream_ids(test_db, cid)
        with pytest.raises(HTTPException) as exc_info:
            await delete_upstreams_batch(
                cid, BatchDeleteUpstreamsRequest(upstream_ids=upstream_ids,
                                                 delete_db=False, delete_edge=False), test_db
            )
        assert exc_info.value.status_code == 400

    async def test_missing_upstream_does_not_block_others(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstreams_batch

        upstream_ids = await _get_upstream_ids(test_db, cid)
        result = await delete_upstreams_batch(
            cid, BatchDeleteUpstreamsRequest(upstream_ids=upstream_ids + [99999], delete_db=True), test_db
        )

        failed = [r for r in result["results"] if r["status"] == "failed"]
        succeeded = [r for r in result["results"] if r["status"] == "success"]
        assert len(failed) == 1
        assert failed[0]["upstream_id"] == 99999
        assert "error" in failed[0]
        assert len(succeeded) == 3

    async def test_referenced_upstream_failed_regardless_of_db_edge(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstreams_batch
        from sqlalchemy import select

        upstream_ids = await _get_upstream_ids(test_db, cid)
        test_db.add(Route(cluster_id=cid, name="linked-route", uri="/x",
                          edge_uuid="dddddddd-dddd-dddd-dddd-dddddddddddd",
                          upstream_id=upstream_ids[0]))
        await test_db.commit()

        mock_client = MagicMock()
        mock_client.delete_upstream.return_value = {}

        with patch_ec(return_value=mock_client):
            result = await delete_upstreams_batch(
                cid, BatchDeleteUpstreamsRequest(upstream_ids=upstream_ids,
                                                 delete_db=False, delete_edge=True), test_db
            )

        by_id = {r["upstream_id"]: r for r in result["results"]}
        assert by_id[upstream_ids[0]]["status"] == "failed"
        assert "已被路由引用" in by_id[upstream_ids[0]]["error"]
        assert by_id[upstream_ids[1]]["status"] == "success"
        assert by_id[upstream_ids[2]]["status"] == "success"
        assert mock_client.delete_upstream.call_count == 2

    async def test_referenced_upstream_not_deleted_from_db(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstreams_batch
        from sqlalchemy import select

        upstream_ids = await _get_upstream_ids(test_db, cid)
        test_db.add(Route(cluster_id=cid, name="linked-route", uri="/x",
                          edge_uuid="dddddddd-dddd-dddd-dddd-dddddddddddd",
                          upstream_id=upstream_ids[0]))
        await test_db.commit()

        result = await delete_upstreams_batch(
            cid, BatchDeleteUpstreamsRequest(upstream_ids=upstream_ids, delete_db=True), test_db
        )

        remaining = (await test_db.execute(
            select(Upstream).where(Upstream.cluster_id == cid))).scalars().all()
        assert len(remaining) == 1
        assert remaining[0].id == upstream_ids[0]

    async def test_empty_edge_uuid_skips_edge_sync(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstreams_batch

        upstream_ids = await _get_upstream_ids(test_db, cid)
        from sqlalchemy import select
        u1 = (await test_db.execute(
            select(Upstream).where(Upstream.cluster_id == cid, Upstream.name == "u1"))).scalar_one()
        u1.edge_uuid = ""
        await test_db.commit()

        mock_client = MagicMock()
        mock_client.delete_upstream.return_value = {}

        with patch_ec(return_value=mock_client):
            result = await delete_upstreams_batch(
                cid, BatchDeleteUpstreamsRequest(upstream_ids=upstream_ids,
                                                 delete_db=True, delete_edge=True), test_db
            )

        edge_statuses = [
            r["results"][1]["status"]
            for r in result["results"]
            if any(x.get("scope") == "edge" for x in r["results"])
        ]
        skipped = [s for s in edge_statuses if s == "skipped"]
        assert len(skipped) == 1
        assert mock_client.delete_upstream.call_count == 2

    async def test_edge_sync_called_with_edge_uuid(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstreams_batch

        upstream_ids = await _get_upstream_ids(test_db, cid)
        mock_client = MagicMock()
        mock_client.delete_upstream.return_value = {}

        with patch_ec(return_value=mock_client):
            result = await delete_upstreams_batch(
                cid, BatchDeleteUpstreamsRequest(upstream_ids=upstream_ids,
                                                 delete_db=False, delete_edge=True), test_db
            )

        assert mock_client.delete_upstream.call_count == 3
        uuids = [call.args[0] for call in mock_client.delete_upstream.call_args_list]
        assert len(set(uuids)) == 3

    async def test_db_exception_does_not_cascade_pending_rollback(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstreams_batch

        upstream_ids = await _get_upstream_ids(test_db, cid)
        from sqlalchemy import select

        # 注入一条与 u1 相同 edge_uuid 的上游（违反 uq_upstream_cluster_edge 唯一约束），
        # 不 flush，让端点内部的第一次 commit 触发真实 IntegrityError
        u1 = (await test_db.execute(
            select(Upstream).where(Upstream.cluster_id == cid, Upstream.name == "u1"))).scalar_one()
        test_db.add(Upstream(cluster_id=cid, name="dup", load_balance="weighted_roundrobin",
                             edge_uuid=u1.edge_uuid))
        test_db.autoflush = False

        result = await delete_upstreams_batch(
            cid, BatchDeleteUpstreamsRequest(upstream_ids=upstream_ids, delete_db=True), test_db
        )

        test_db.autoflush = True
        failed = [r for r in result["results"] if r["status"] == "failed"]
        succeeded = [r for r in result["results"] if r["status"] == "success"]
        assert len(failed) == 1
        assert len(succeeded) == 2


class TestSingleDeleteUpstreamEdgeUuidGuard:

    async def test_single_delete_skips_empty_edge_uuid(self, test_db):
        cid = await _setup_cluster_with_upstreams(test_db)
        from app.api.v1.cluster_upstreams import delete_upstream
        from app.schemas.cluster import DeleteClusterRequest
        from sqlalchemy import select

        u1 = (await test_db.execute(
            select(Upstream).where(Upstream.cluster_id == cid, Upstream.name == "u1"))).scalar_one()
        u1.edge_uuid = ""
        await test_db.commit()

        mock_client = MagicMock()
        mock_client.delete_upstream.return_value = {}

        with patch_ec(return_value=mock_client):
            result = await delete_upstream(
                cid, u1.id, DeleteClusterRequest(delete_edge=True), test_db
            )

        edge_results = [r for r in result["results"] if r.get("scope") == "edge"]
        assert len(edge_results) == 1
        assert edge_results[0]["status"] == "skipped"
        assert mock_client.delete_upstream.call_count == 0
