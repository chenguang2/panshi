"""Tests for node task hard-delete (single + batch endpoints, row deletion)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.node_task import NodeTask, NodeTaskItem
from app.services import task_log_store


@pytest.fixture
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


class TestDeleteRowUnit:
    @pytest.mark.asyncio
    async def test_delete_terminal_task_cascades_items_and_logs(self, test_db, tmp_path, monkeypatch):
        monkeypatch.setattr(task_log_store, "_log_dir", tmp_path)
        task = NodeTask(cluster_id=1, task_type="start", status="success", total_nodes=1)
        test_db.add(task)
        await test_db.flush()
        task_log_store.append_line(task.id, 1, "log line")
        item = NodeTaskItem(task_id=task.id, node_id=1, ip="10.0.0.1", status="success")
        test_db.add(item)
        await test_db.commit()

        assert task_log_store.read_log(task.id, 1) == "log line"

        from app.api.v1.node_tasks import _delete_task_row
        await _delete_task_row(test_db, task)

        remaining = (await test_db.execute(select(NodeTask).where(NodeTask.id == task.id))).scalar_one_or_none()
        assert remaining is None
        items = (await test_db.execute(select(NodeTaskItem).where(NodeTaskItem.task_id == task.id))).scalars().all()
        assert items == []
        assert task_log_store.read_log(task.id, 1) == ""

    @pytest.mark.asyncio
    async def test_delete_idempotent_when_logs_missing(self, test_db, tmp_path, monkeypatch):
        monkeypatch.setattr(task_log_store, "_log_dir", tmp_path)
        task = NodeTask(cluster_id=1, task_type="start", status="failed", total_nodes=1)
        test_db.add(task)
        await test_db.commit()

        from app.api.v1.node_tasks import _delete_task_row
        await _delete_task_row(test_db, task)

        assert (await test_db.execute(select(NodeTask).where(NodeTask.id == task.id))).scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_batch_delete_mixed_skips_non_terminal(self, test_db, tmp_path, monkeypatch):
        monkeypatch.setattr(task_log_store, "_log_dir", tmp_path)
        done = NodeTask(cluster_id=1, task_type="start", status="success", total_nodes=1)
        running = NodeTask(cluster_id=1, task_type="start", status="running", total_nodes=1)
        test_db.add_all([done, running])
        await test_db.commit()

        from app.api.v1.node_tasks import _delete_task_row
        await _delete_task_row(test_db, done)

        assert (await test_db.execute(select(NodeTask).where(NodeTask.id == done.id))).scalar_one_or_none() is None
        assert (await test_db.execute(select(NodeTask).where(NodeTask.id == running.id))).scalar_one_or_none() is not None


class TestDeleteEndpoint:
    def test_delete_missing_task_returns_404(self, client):
        resp = client.delete("/api/v1/node-tasks/999999")
        assert resp.status_code == 404

    def test_batch_delete_empty_ids_rejected(self, client):
        resp = client.post("/api/v1/node-tasks/batch-delete", json={"task_ids": []})
        assert resp.status_code == 422

    def test_batch_delete_missing_ids_all_skipped(self, client):
        resp = client.post("/api/v1/node-tasks/batch-delete", json={"task_ids": [999999, 888888]})
        assert resp.status_code == 200
        body = resp.json()
        assert body["deleted"] == []
        assert body["skipped"] == [999999, 888888]
