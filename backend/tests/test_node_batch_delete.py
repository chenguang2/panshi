"""测试节点批量删除端点（DELETE /clusters/{cluster_id}/nodes）的行为。"""

import pytest
from fastapi import HTTPException
from app.models.cluster import Cluster, Node
from app.schemas.cluster import BatchDeleteNodesRequest


async def _setup_cluster_with_nodes(test_db):
    cluster = Cluster(name="batch-delete-node-test-cluster")
    test_db.add(cluster)
    await test_db.flush()
    cid = cluster.id

    test_db.add_all([
        Node(cluster_id=cid, ip="10.0.0.1", edge_path="/edge/n1"),
        Node(cluster_id=cid, ip="10.0.0.2", edge_path="/edge/n2"),
        Node(cluster_id=cid, ip="10.0.0.3", edge_path="/edge/n3"),
    ])
    await test_db.commit()
    return cid


async def _get_node_ids(test_db, cid):
    from sqlalchemy import select
    result = await test_db.execute(select(Node.id).where(Node.cluster_id == cid).order_by(Node.id))
    return [n for n in result.scalars().all()]


class TestBatchDeleteNodesRequest:

    def test_request_accepts_node_ids(self):
        req = BatchDeleteNodesRequest(node_ids=[1, 2], delete_db=True)
        assert req.node_ids == [1, 2]
        assert req.delete_db is True
        assert req.delete_edge is False
        assert req.node_ids is not None


class TestBatchDeleteNodesEndpoint:

    async def test_delete_db_only_success(self, test_db):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1.cluster_nodes import delete_nodes_batch
        from sqlalchemy import select

        node_ids = await _get_node_ids(test_db, cid)
        result = await delete_nodes_batch(
            cid, BatchDeleteNodesRequest(node_ids=node_ids, delete_db=True), test_db
        )

        assert len(result["results"]) == 3
        assert all(r["status"] == "success" for r in result["results"])
        assert all("node_ip" in r for r in result["results"])
        remaining = (await test_db.execute(select(Node).where(Node.cluster_id == cid))).scalars().all()
        assert remaining == []

    async def test_empty_node_ids_rejected(self, test_db):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1.cluster_nodes import delete_nodes_batch

        with pytest.raises(HTTPException) as exc_info:
            await delete_nodes_batch(cid, BatchDeleteNodesRequest(node_ids=[], delete_db=True), test_db)
        assert exc_info.value.status_code == 400

    async def test_neither_db_nor_edge_rejected(self, test_db):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1.cluster_nodes import delete_nodes_batch

        node_ids = await _get_node_ids(test_db, cid)
        with pytest.raises(HTTPException) as exc_info:
            await delete_nodes_batch(
                cid, BatchDeleteNodesRequest(node_ids=node_ids, delete_db=False, delete_edge=False), test_db
            )
        assert exc_info.value.status_code == 400

    async def test_missing_node_does_not_block_others(self, test_db):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1.cluster_nodes import delete_nodes_batch

        node_ids = await _get_node_ids(test_db, cid)
        result = await delete_nodes_batch(
            cid, BatchDeleteNodesRequest(node_ids=node_ids + [99999], delete_db=True), test_db
        )

        failed = [r for r in result["results"] if r["status"] == "failed"]
        succeeded = [r for r in result["results"] if r["status"] == "success"]
        assert len(failed) == 1
        assert failed[0]["node_id"] == 99999
        assert "error" in failed[0]
        assert len(succeeded) == 3

    async def test_edge_phase_always_skipped(self, test_db):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1.cluster_nodes import delete_nodes_batch

        node_ids = await _get_node_ids(test_db, cid)
        result = await delete_nodes_batch(
            cid, BatchDeleteNodesRequest(node_ids=node_ids, delete_db=True, delete_edge=True), test_db
        )

        for r in result["results"]:
            edge_entries = [sub for sub in r["results"] if sub.get("scope") == "edge"]
            assert len(edge_entries) == 1
            assert edge_entries[0]["status"] == "skipped"

    async def test_db_exception_does_not_cascade(self, test_db):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1.cluster_nodes import delete_nodes_batch

        real_commit = test_db.commit
        call_count = {"n": 0}

        async def flaky_commit(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RuntimeError("simulated db failure")
            return await real_commit(*args, **kwargs)

        test_db.commit = flaky_commit  # type: ignore[method-assign]

        result = await delete_nodes_batch(
            cid, BatchDeleteNodesRequest(node_ids=await _get_node_ids(test_db, cid), delete_db=True), test_db
        )

        test_db.commit = real_commit  # type: ignore[method-assign]
        failed = [r for r in result["results"] if r["status"] == "failed"]
        succeeded = [r for r in result["results"] if r["status"] == "success"]
        assert len(failed) == 1
        assert "simulated db failure" in failed[0]["error"]
        assert len(succeeded) == 2

    async def test_message_uses_total_count(self, test_db):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1.cluster_nodes import delete_nodes_batch

        node_ids = await _get_node_ids(test_db, cid)
        result = await delete_nodes_batch(
            cid, BatchDeleteNodesRequest(node_ids=node_ids + [99999], delete_db=True), test_db
        )

        assert "批量删除完成" in result["message"]
        assert "4" in result["message"]
