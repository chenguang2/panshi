"""测试节点批量创建端点（POST /clusters/{cluster_id}/nodes/batch）的行为。"""

import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException
from app.models.cluster import Cluster, Node
from app.schemas.cluster import BatchCreateNodesRequest, NodeCreate


def _node_create(ip: str, **overrides) -> NodeCreate:
    data = {
        "ip": ip,
        "service_port": 80,
        "management_port": 9180,
        "edge_path": f"/edge/{ip}",
    }
    data.update(overrides)
    return NodeCreate(**data)


async def _setup_cluster(test_db):
    cluster = Cluster(name="batch-node-test-cluster")
    test_db.add(cluster)
    await test_db.commit()
    return cluster.id


class TestBatchCreateNodesRequest:

    def test_request_accepts_nodes_list(self):
        req = BatchCreateNodesRequest(nodes=[_node_create("10.0.0.1"), _node_create("10.0.0.2")])
        assert len(req.nodes) == 2
        assert req.nodes[0].ip == "10.0.0.1"

    def test_request_rejects_more_than_1000_nodes(self):
        nodes = [_node_create(f"10.0.0.{i % 254 + 1}") for i in range(1001)]
        with pytest.raises(Exception):
            BatchCreateNodesRequest(nodes=nodes)

    def test_node_create_rejects_invalid_status(self):
        with pytest.raises(Exception):
            NodeCreate(ip="10.0.0.1", edge_path="/edge/n1", status=5)

    def test_node_create_accepts_status_zero_or_one(self):
        assert NodeCreate(ip="10.0.0.1", edge_path="/edge/n1", status=0).status == 0
        assert NodeCreate(ip="10.0.0.2", edge_path="/edge/n2", status=1).status == 1


class TestBatchCreateNodesEndpoint:

    async def test_create_multiple_nodes_success(self, test_db):
        cid = await _setup_cluster(test_db)
        from app.api.v1.cluster_nodes import create_nodes_batch
        from sqlalchemy import select

        result = await create_nodes_batch(
            cid,
            BatchCreateNodesRequest(nodes=[_node_create("10.0.0.1"), _node_create("10.0.0.2"), _node_create("10.0.0.3")]),
            test_db,
        )

        assert len(result["results"]) == 3
        assert all(r["status"] == "success" for r in result["results"])
        remaining = (await test_db.execute(select(Node).where(Node.cluster_id == cid))).scalars().all()
        assert len(remaining) == 3

    async def test_empty_nodes_rejected(self, test_db):
        cid = await _setup_cluster(test_db)
        from app.api.v1.cluster_nodes import create_nodes_batch

        with pytest.raises(HTTPException) as exc_info:
            await create_nodes_batch(cid, BatchCreateNodesRequest(nodes=[]), test_db)
        assert exc_info.value.status_code == 400

    async def test_cluster_not_found(self, test_db):
        from app.api.v1.cluster_nodes import create_nodes_batch

        with pytest.raises(HTTPException) as exc_info:
            await create_nodes_batch(
                99999,
                BatchCreateNodesRequest(nodes=[_node_create("10.0.0.1")]),
                test_db,
            )
        assert exc_info.value.status_code == 404

    async def test_duplicate_ip_fails_that_node_only(self, test_db):
        cid = await _setup_cluster(test_db)
        from app.api.v1.cluster_nodes import create_nodes_batch
        from sqlalchemy import select

        test_db.add(Node(cluster_id=cid, ip="10.0.0.1", edge_path="/edge/10.0.0.1"))
        await test_db.commit()

        result = await create_nodes_batch(
            cid,
            BatchCreateNodesRequest(nodes=[_node_create("10.0.0.1"), _node_create("10.0.0.2")]),
            test_db,
        )

        by_ip = {r["ip"]: r for r in result["results"]}
        assert by_ip["10.0.0.1"]["status"] == "failed"
        assert "error" in by_ip["10.0.0.1"]
        assert by_ip["10.0.0.2"]["status"] == "success"

    async def test_db_exception_does_not_cascade(self, test_db):
        cid = await _setup_cluster(test_db)
        from app.api.v1.cluster_nodes import create_nodes_batch

        real_commit = test_db.commit
        call_count = {"n": 0}

        async def flaky_commit(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RuntimeError("simulated db failure")
            return await real_commit(*args, **kwargs)

        test_db.commit = flaky_commit  # type: ignore[method-assign]

        result = await create_nodes_batch(
            cid,
            BatchCreateNodesRequest(nodes=[_node_create("10.0.0.1"), _node_create("10.0.0.2")]),
            test_db,
        )

        test_db.commit = real_commit  # type: ignore[method-assign]
        failed = [r for r in result["results"] if r["status"] == "failed"]
        succeeded = [r for r in result["results"] if r["status"] == "success"]
        assert len(failed) == 1
        assert "simulated db failure" in failed[0]["error"]
        assert len(succeeded) == 1

    async def test_same_ip_different_path_or_port_allowed(self, test_db):
        cid = await _setup_cluster(test_db)
        from app.api.v1.cluster_nodes import create_nodes_batch

        result = await create_nodes_batch(
            cid,
            BatchCreateNodesRequest(nodes=[
                _node_create("10.0.0.1", edge_path="/edge/a"),
                _node_create("10.0.0.1", edge_path="/edge/b"),
                _node_create("10.0.0.1", edge_path="/edge/a", service_port=8080),
            ]),
            test_db,
        )

        assert all(r["status"] == "success" for r in result["results"])
        assert len(result["results"]) == 3

    async def test_duplicate_same_combination_fails(self, test_db):
        cid = await _setup_cluster(test_db)
        from app.api.v1.cluster_nodes import create_nodes_batch

        result = await create_nodes_batch(
            cid,
            BatchCreateNodesRequest(nodes=[
                _node_create("10.0.0.1", edge_path="/edge/a"),
                _node_create("10.0.0.1", edge_path="/edge/a"),
            ]),
            test_db,
        )

        assert result["results"][0]["status"] == "success"
        assert result["results"][1]["status"] == "failed"
        assert "error" in result["results"][1]

    async def test_message_reports_success_and_failure_counts(self, test_db):
        cid = await _setup_cluster(test_db)
        from app.api.v1.cluster_nodes import create_nodes_batch

        test_db.add(Node(cluster_id=cid, ip="10.0.0.9", edge_path="/edge/10.0.0.9"))
        await test_db.commit()

        result = await create_nodes_batch(
            cid,
            BatchCreateNodesRequest(nodes=[
                _node_create("10.0.0.1"),
                _node_create("10.0.0.9"),  # 与预置节点同 IP+path+port → failed
                _node_create("10.0.0.2"),
            ]),
            test_db,
        )

        assert "成功创建 2 条" in result["message"]
        assert "失败 1 条" in result["message"]
