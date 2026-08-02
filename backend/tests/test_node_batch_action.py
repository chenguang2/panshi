"""测试节点批量操作端点（POST /clusters/{cluster_id}/nodes/action）的增强行为。"""

import pytest
from fastapi import HTTPException
from app.models.cluster import Cluster, Node


async def _setup_cluster_with_nodes(test_db):
    cluster = Cluster(name="batch-action-test-cluster")
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


class TestBatchNodeActionEnhanced:

    async def test_batch_start_returns_stdout_stderr_command(self, test_db, monkeypatch):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1 import cluster_nodes
        from app.api.v1.cluster_nodes import batch_node_action, NodeActionRequest

        node_ids = await _get_node_ids(test_db, cid)

        async def fake_run(*args, **kwargs):
            return {"rc": 0, "stdout": "started ok", "stderr": "", "command": "ansible-playbook ..."}

        monkeypatch.setattr(cluster_nodes, "_run_and_update", fake_run)
        result = await batch_node_action(
            cid, NodeActionRequest(action="start", node_ids=node_ids), test_db
        )

        assert len(result["results"]) == 3
        for r in result["results"]:
            assert r["status"] == "success"
            assert r["stdout"] == "started ok"
            assert r["stderr"] == ""
            assert "command" in r

    async def test_batch_reload_maps_to_nginx_reload(self, test_db, monkeypatch):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1 import cluster_nodes
        from app.api.v1.cluster_nodes import batch_node_action, NodeActionRequest as NAR

        node_ids = await _get_node_ids(test_db, cid)
        captured = {}

        async def fake_run(db, node, tag, extravars):
            captured["tag"] = tag
            captured["nginx_cmd"] = extravars.get("nginx_cmd")
            return {"rc": 0, "stdout": "reloaded", "stderr": "", "command": "..."}

        monkeypatch.setattr(cluster_nodes, "_run_and_update", fake_run)
        await batch_node_action(cid, NAR(action="reload", node_ids=node_ids), test_db)

        assert captured["tag"] == "nginx_cmd_run"
        assert captured["nginx_cmd"] == "nginx_reload"

    async def test_batch_statistic_returns_statistic_field(self, test_db, monkeypatch):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1 import cluster_nodes
        from app.api.v1.cluster_nodes import batch_node_action, NodeActionRequest as NAR

        node_ids = await _get_node_ids(test_db, cid)
        real_build = cluster_nodes._ansible_service.build_status_detail

        def fake_build(tag, result):
            return {
                "statistic": {"edge_version": "v1.2.3", "nginx_running": True},
                "nginx": {"nginx_running": True, "nginx_status": "running"},
            }

        async def fake_run(db, node, tag, extravars):
            return {"rc": 0, "stdout": "stats", "stderr": "", "command": "..."}

        monkeypatch.setattr(cluster_nodes, "_run_and_update", fake_run)
        monkeypatch.setattr(cluster_nodes._ansible_service, "build_status_detail", fake_build)
        result = await batch_node_action(cid, NAR(action="statistic", node_ids=node_ids), test_db)

        for r in result["results"]:
            assert r["status"] == "success"
            assert r["statistic"]["edge_version"] == "v1.2.3"

    async def test_empty_node_ids_rejected(self, test_db):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1.cluster_nodes import batch_node_action, NodeActionRequest as NAR

        with pytest.raises(HTTPException) as exc_info:
            await batch_node_action(cid, NAR(action="start", node_ids=[]), test_db)
        assert exc_info.value.status_code == 400
        assert "node_ids" in exc_info.value.detail

    async def test_missing_node_does_not_block_others(self, test_db, monkeypatch):
        cid = await _setup_cluster_with_nodes(test_db)
        from app.api.v1 import cluster_nodes
        from app.api.v1.cluster_nodes import batch_node_action, NodeActionRequest as NAR

        node_ids = await _get_node_ids(test_db, cid)
        node_ids.append(99999)

        async def fake_run(*args, **kwargs):
            return {"rc": 0, "stdout": "", "stderr": "", "command": ""}

        monkeypatch.setattr(cluster_nodes, "_run_and_update", fake_run)
        result = await batch_node_action(cid, NAR(action="start", node_ids=node_ids), test_db)

        # 端点只对存在的节点操作（99999 不存在则不计入 results，不阻塞其余）
        assert len(result["results"]) == 3
        assert all(r["status"] == "success" for r in result["results"])
