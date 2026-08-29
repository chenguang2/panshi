"""Tests for node task hard-delete (single + batch endpoints, row deletion)."""

import pytest
from tests.api_helpers import AuthedTestClient
from sqlalchemy import select

from app.models.node_task import NodeTask, NodeTaskItem
from app.services import task_log_store


@pytest.fixture
def client():
    from app.main import app
    with AuthedTestClient(app) as c:
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


class TestDeleteRowExplicitItems:
    @pytest.mark.asyncio
    async def test_delete_row_explicitly_removes_items_without_fk(self, tmp_path, monkeypatch):
        """_delete_task_row must remove items explicitly even when FK cascade is OFF
        (production SQLite may not cascade; residual items caused UNIQUE conflicts)."""
        monkeypatch.setattr(task_log_store, "_log_dir", tmp_path)

        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from sqlalchemy.pool import StaticPool

        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        # NOTE: no PRAGMA foreign_keys=ON -> FK cascade NOT active
        async with engine.begin() as conn:
            from app.core.database import Base
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False)

        from app.api.v1.node_tasks import _delete_task_row

        async with factory() as db:
            task = NodeTask(cluster_id=1, task_type="start", status="success", total_nodes=1)
            db.add(task)
            await db.flush()
            db.add(NodeTaskItem(task_id=task.id, node_id=1, ip="10.0.0.1", status="success"))
            await db.commit()

            await _delete_task_row(db, task)

            items = (await db.execute(select(NodeTaskItem).where(NodeTaskItem.task_id == task.id))).scalars().all()
            assert items == [], f"items must be explicitly deleted, got {[i.node_id for i in items]}"

        await engine.dispose()
