"""Tests for node task models (install_task / install_task_node)."""

import json
import pytest
from sqlalchemy import select, func

from app.core.database import Base
from app.models.node_task import NodeTask, NodeTaskItem


class TestNodeTaskModel:
    """Unit tests for NodeTask / NodeTaskItem models."""

    @pytest.mark.asyncio
    async def test_create_node_task_persists(self, test_db):
        """Creating a task should insert a record with all fields."""
        task = NodeTask(
            cluster_id=1,
            task_type="install_openresty",
            status="pending",
            total_nodes=2,
            success_nodes=0,
            failed_nodes=0,
            cancelled_nodes=0,
        )
        task.set_params({"openresty_file": "openresty-1.25.tar.gz"})
        test_db.add(task)
        await test_db.commit()
        await test_db.refresh(task)

        assert task.id is not None
        assert task.task_type == "install_openresty"
        assert task.status == "pending"
        assert task.get_params() == {"openresty_file": "openresty-1.25.tar.gz"}
        assert task.total_nodes == 2
        assert task.created_at is not None
        assert task.started_at is None
        assert task.finished_at is None

    @pytest.mark.asyncio
    async def test_create_node_task_item_persists(self, test_db):
        """Creating a task item should insert a record with snapshot fields."""
        task = NodeTask(cluster_id=1, task_type="start", status="pending", total_nodes=1)
        test_db.add(task)
        await test_db.flush()

        item = NodeTaskItem(
            task_id=task.id,
            node_id=5,
            ip="10.0.0.5",
            node_name="node-5",
            status="pending",
        )
        item.set_logs([])
        test_db.add(item)
        await test_db.commit()
        await test_db.refresh(item)

        assert item.id is not None
        assert item.task_id == task.id
        assert item.node_id == 5
        assert item.ip == "10.0.0.5"
        assert item.node_name == "node-5"
        assert item.status == "pending"
        assert item.get_logs() == []
        assert item.rc is None
        assert item.stdout is None

    @pytest.mark.asyncio
    async def test_task_item_cascade_delete_with_task(self, test_db):
        """Deleting a task should cascade-delete its items (task_id FK CASCADE)."""
        task = NodeTask(cluster_id=1, task_type="start", status="pending", total_nodes=1)
        test_db.add(task)
        await test_db.flush()
        item = NodeTaskItem(task_id=task.id, node_id=1, ip="10.0.0.1", status="pending")
        test_db.add(item)
        await test_db.commit()

        await test_db.delete(task)
        await test_db.commit()

        result = await test_db.execute(select(NodeTaskItem).where(NodeTaskItem.task_id == task.id))
        assert result.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_task_item_logs_json_roundtrip(self, test_db):
        """logs JSON column should round-trip structured log lines."""
        logs = [
            {"t": "2026-08-02T10:00:00", "level": "info", "line": "开始执行"},
            {"t": "2026-08-02T10:00:01", "level": "error", "line": "连接失败"},
        ]
        task = NodeTask(cluster_id=1, task_type="start", status="pending", total_nodes=1)
        test_db.add(task)
        await test_db.flush()

        item = NodeTaskItem(task_id=task.id, node_id=2, ip="10.0.0.2", status="running")
        item.set_logs(logs)
        test_db.add(item)
        await test_db.commit()
        await test_db.refresh(item)

        assert item.get_logs() == logs
        assert isinstance(item.get_logs(), list)
        assert item.get_logs()[1]["level"] == "error"

    @pytest.mark.asyncio
    async def test_models_registered_in_base_metadata(self):
        """Both models must be registered on Base.metadata (init_db create_all)."""
        tables = Base.metadata.tables
        assert "install_task" in tables
        assert "install_task_node" in tables
        # node_id must NOT be an FK (V4: plain int column, no cascade on node delete)
        item_table = tables["install_task_node"]
        assert "node_id" in item_table.columns
        node_id_fk = [fk for fk in item_table.c.node_id.foreign_keys]
        assert node_id_fk == [], f"node_id should have no FK, got {node_id_fk}"
        # task_id SHOULD have CASCADE FK
        task_fk = list(item_table.c.task_id.foreign_keys)
        assert len(task_fk) == 1
        assert task_fk[0].ondelete == "CASCADE"
        # cluster_id must NOT be an FK (V5: task history survives cluster deletion)
        task_table = tables["install_task"]
        cluster_fk = [fk for fk in task_table.c.cluster_id.foreign_keys]
        assert cluster_fk == [], f"cluster_id should have no FK, got {cluster_fk}"

    @pytest.mark.asyncio
    async def test_task_status_counters_update(self, test_db):
        """Status counters should be updatable after commit."""
        task = NodeTask(cluster_id=1, task_type="start", status="running", total_nodes=3)
        test_db.add(task)
        await test_db.commit()

        task.status = "partial"
        task.success_nodes = 2
        task.failed_nodes = 1
        await test_db.commit()
        await test_db.refresh(task)

        assert task.status == "partial"
        assert task.success_nodes == 2
        assert task.failed_nodes == 1
