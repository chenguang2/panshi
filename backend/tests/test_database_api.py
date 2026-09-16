"""Integration tests for database management API (connections CRUD / status / test)."""

import json
import pytest

from app.core import db_config
from app.core.db_config import DbConfig, ConnectionConfig, encrypt_password


@pytest.fixture(autouse=True)
def _isolate_config(tmp_path, monkeypatch):
    monkeypatch.setattr(db_config, "CONFIG_PATH", str(tmp_path / "db_config.json"))
    monkeypatch.setattr(db_config, "CONFIG_BAK_PATH", str(tmp_path / "db_config.json.bak"))
    # seed a default config so endpoints have something to read
    cfg = DbConfig(version=1, active="local_sqlite", connections=[
        ConnectionConfig(id="local_sqlite", type="sqlite", name="本地 SQLite", path=str(tmp_path / "panshi.db")),
    ])
    db_config.save_config(cfg, path=str(tmp_path / "db_config.json"))
    yield


class TestDatabaseAPI:
    async def test_status_returns_active_connection(self, async_authed_client):
        resp = await async_authed_client.get("/api/v1/database/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["active"]["type"] == "sqlite"
        assert "password_enc" not in data["active"]
        assert data["active"]["password_set"] is False

    async def test_list_connections_masked(self, async_authed_client):
        resp = await async_authed_client.get("/api/v1/database/connections")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        conn = data[0]
        assert "password_enc" not in conn
        assert "password" not in conn

    async def test_create_postgres_connection(self, async_authed_client):
        resp = await async_authed_client.post("/api/v1/database/connections", json={
            "type": "postgres", "name": "生产 PG", "host": "192.168.1.10",
            "port": 5432, "database": "panshi", "username": "panshi", "password": "secret",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "postgres"
        assert data["password_set"] is True
        assert "password_enc" not in data
        # persisted encrypted in config
        stored = db_config.load_config()
        pg = stored.get_connection(data["id"])
        assert pg is not None
        assert db_config.decrypt_password(pg.password_enc) == "secret"

    async def test_create_sqlite_connection(self, async_authed_client):
        resp = await async_authed_client.post("/api/v1/database/connections", json={
            "type": "sqlite", "name": "备份 SQLite", "path": "./data/backup.db",
        })
        assert resp.status_code == 200
        assert resp.json()["type"] == "sqlite"
        assert resp.json()["password_set"] is False

    async def test_update_connection(self, async_authed_client):
        created = await async_authed_client.post("/api/v1/database/connections", json={
            "type": "postgres", "name": "PG1", "host": "h1", "database": "d1",
            "username": "u", "password": "p1",
        })
        conn_id = created.json()["id"]
        resp = await async_authed_client.put(f"/api/v1/database/connections/{conn_id}", json={
            "name": "PG Renamed", "host": "h2", "database": "d2",
            "username": "u2", "password": "p2",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "PG Renamed"
        assert data["host"] == "h2"
        stored = db_config.load_config().get_connection(conn_id)
        assert db_config.decrypt_password(stored.password_enc) == "p2"

    async def test_delete_non_active_connection(self, async_authed_client):
        created = await async_authed_client.post("/api/v1/database/connections", json={
            "type": "postgres", "name": "PG", "host": "h", "database": "d", "username": "u",
        })
        conn_id = created.json()["id"]
        resp = await async_authed_client.delete(f"/api/v1/database/connections/{conn_id}")
        assert resp.status_code == 200
        assert db_config.load_config().get_connection(conn_id) is None

    async def test_delete_active_connection_refused(self, async_authed_client):
        resp = await async_authed_client.delete("/api/v1/database/connections/local_sqlite")
        assert resp.status_code == 400

    async def test_test_connection_sqlite_success(self, async_authed_client):
        resp = await async_authed_client.post("/api/v1/database/connections/local_sqlite/test")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    async def test_non_admin_forbidden(self, async_authed_client):
        import uuid
        username = f"db_noadmin_{uuid.uuid4().hex[:6]}"
        created = await async_authed_client.post("/api/v1/admin/users", json={
            "username": username, "password": "pass123", "role": "user", "status": 1,
        })
        assert created.status_code in (200, 201), created.text
        login = await async_authed_client.post("/api/v1/auth/login",
            json={"username": username, "password": "pass123"})
        assert login.status_code == 200
        user_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        resp = await async_authed_client.get("/api/v1/database/connections", headers=user_headers)
        assert resp.status_code == 403
        uid = created.json()["id"]
        await async_authed_client.delete(f"/api/v1/admin/users/{uid}")

    async def test_unauthorized_returns_401(self, async_isolated_client):
        resp = await async_isolated_client.get("/api/v1/database/connections")
        assert resp.status_code == 401

    async def test_switch_to_reachable_sqlite(self, async_authed_client):
        import tempfile, os
        path = os.path.join(tempfile.gettempdir(), "switch_target.db")
        created = await async_authed_client.post("/api/v1/database/connections", json={
            "type": "sqlite", "name": "切换目标", "path": path,
        })
        conn_id = created.json()["id"]
        resp = await async_authed_client.post("/api/v1/database/switch",
            json={"connection_id": conn_id})
        assert resp.status_code == 200
        data = resp.json()
        assert "重启" in data["message"]
        assert db_config.load_config().active == conn_id

    async def test_switch_to_unreachable_pg_rejected(self, async_authed_client):
        created = await async_authed_client.post("/api/v1/database/connections", json={
            "type": "postgres", "name": "坏PG", "host": "127.0.0.1", "port": 1,
            "database": "x", "username": "u",
        })
        conn_id = created.json()["id"]
        resp = await async_authed_client.post("/api/v1/database/switch",
            json={"connection_id": conn_id})
        assert resp.status_code == 400
        assert "不可达" in resp.json()["detail"]

class TestMigrationEndpoints:
    async def _add_sqlite(self, client, name, path):
        resp = await client.post("/api/v1/database/connections", json={
            "type": "sqlite", "name": name, "path": path,
        })
        return resp.json()["id"]

    async def test_migrate_same_source_target_400(self, async_authed_client):
        import tempfile, os
        conn_id = await self._add_sqlite(async_authed_client, "X", os.path.join(tempfile.gettempdir(), "mig1.db"))
        resp = await async_authed_client.post("/api/v1/database/migrate-stream", json={
            "source_id": conn_id, "target_id": conn_id, "mode": "replace",
        })
        assert resp.status_code == 400
        assert "相同" in resp.json()["detail"]

    async def test_migrate_to_active_400(self, async_authed_client):
        resp = await async_authed_client.post("/api/v1/database/migrate-stream", json={
            "source_id": "local_sqlite", "target_id": "local_sqlite", "mode": "replace",
        })
        assert resp.status_code == 400

    async def test_migrate_unsupported_mode_400(self, async_authed_client):
        import tempfile, os
        conn_id = await self._add_sqlite(async_authed_client, "T", os.path.join(tempfile.gettempdir(), "mode_t.db"))
        resp = await async_authed_client.post("/api/v1/database/migrate-stream", json={
            "source_id": "local_sqlite", "target_id": conn_id, "mode": "merge",
        })
        assert resp.status_code == 400
        assert "仅支持替换模式" in resp.json()["detail"]

    async def test_history_returns_200(self, async_authed_client):
        resp = await async_authed_client.get("/api/v1/database/history")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_export_creates_archive(self, async_authed_client):
        import tempfile, os
        from sqlalchemy import create_engine
        from app.core.database import Base
        from app.models.cluster import Cluster
        from sqlalchemy.orm import Session
        path = os.path.join(tempfile.gettempdir(), "export_src.db")
        if os.path.exists(path):
            os.remove(path)  # 固定路径残留会使重复运行时 id=1 插入撞唯一约束
        engine = create_engine(f"sqlite:///{path}")
        Base.metadata.create_all(engine)
        with Session(engine) as s:
            s.add(Cluster(id=1, name="a"))
            s.commit()
        engine.dispose()
        conn_id = await self._add_sqlite(async_authed_client, "src", path)
        resp = await async_authed_client.post("/api/v1/database/export", json={"source_id": conn_id})
        assert resp.status_code == 200
        data = resp.json()
        assert os.path.exists(data["archive_path"])

    async def test_import_missing_archive_400(self, async_authed_client):
        import tempfile, os
        conn_id = await self._add_sqlite(async_authed_client, "tgt", os.path.join(tempfile.gettempdir(), "imp.db"))
        resp = await async_authed_client.post("/api/v1/database/import", json={
            "archive_path": os.path.join(tempfile.gettempdir(), "nope.zip"),
            "target_id": conn_id,
        })
        assert resp.status_code == 400


class TestMigrateResultAndBackup:
    """任务 3.6/4.5/5.2：迁移返回每表明细 + 清空前自动备份与保留策略。"""

    async def _add_sqlite(self, client, name, path):
        resp = await client.post("/api/v1/database/connections", json={
            "type": "sqlite", "name": name, "path": path,
        })
        return resp.json()["id"]

    async def test_backup_retention_keeps_recent_ten(self, tmp_path):
        """3.6 保留策略：超过 10 份时删除最旧的备份。"""
        from app.api.v1.database import _cleanup_old_backups
        backup_dir = tmp_path / "data" / "backups"
        backup_dir.mkdir(parents=True)
        import os
        for i in range(12):
            p = backup_dir / f"migration_a_to_b_2026010{i % 10}{i // 10}0000_{i}.zip"
            p.write_bytes(b"x")
            os.utime(p, (1_000_000 + i, 1_000_000 + i))  # 递增 mtime
        _cleanup_old_backups(backup_dir, keep=10)
        remaining = sorted(p.name for p in backup_dir.glob("migration_*.zip"))
        assert len(remaining) == 10
        assert "migration_a_to_b_2026010100000_1.zip" not in remaining  # 最旧的 0、1 已删
        assert "migration_a_to_b_2026010110000_11.zip" in remaining  # 最新的保留


class TestRunningTasksEndpoint:
    """Task 2.1-2.3: GET /database/running-tasks aggregates MigrationState + NodeTasks."""

    async def test_empty_tasks_returns_empty_list(self, async_authed_client):
        resp = await async_authed_client.get("/api/v1/database/running-tasks")
        assert resp.status_code == 200
        data = resp.json()
        assert "migration" in data
        assert data["migration"]["in_progress"] is False
        assert data["tasks"] == []

    async def test_migration_lock_returns_state_with_metadata(self, async_authed_client):
        from app.core import maintenance
        maintenance.set_migration_in_progress(True, source_id="src_abc", target_id="tgt_xyz")
        try:
            resp = await async_authed_client.get("/api/v1/database/running-tasks")
            assert resp.status_code == 200
            data = resp.json()
            mig = data["migration"]
            assert mig["in_progress"] is True
            assert mig["source_id"] == "src_abc"
            assert mig["target_id"] == "tgt_xyz"
            assert mig["started_at"] is not None
        finally:
            maintenance.set_migration_in_progress(False)

    async def test_running_node_tasks_returned(self, async_authed_client, isolated_session):
        from app.models.node_task import NodeTask
        async with isolated_session() as s:
            task = NodeTask(
                cluster_id=1, task_type="cmd_exec", status="running",
                total_nodes=3, success_nodes=1, failed_nodes=0,
            )
            s.add(task)
            await s.commit()
            task_id = task.id

        resp = await async_authed_client.get("/api/v1/database/running-tasks")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["tasks"]) >= 1
        t = next(t for t in data["tasks"] if t["id"] == task_id)
        assert t["task_type"] == "cmd_exec"
        assert t["status"] == "running"
        assert t["cluster_name"] == "test-cluster"

    async def test_pending_node_tasks_returned(self, async_authed_client, isolated_session):
        from app.models.node_task import NodeTask
        async with isolated_session() as s:
            task = NodeTask(
                cluster_id=1, task_type="distribute_file", status="pending",
                total_nodes=2, success_nodes=0, failed_nodes=0,
            )
            s.add(task)
            await s.commit()

        resp = await async_authed_client.get("/api/v1/database/running-tasks")
        assert resp.status_code == 200
        tasks = resp.json()["tasks"]
        assert any(t["status"] == "pending" for t in tasks)

    async def test_interrupted_node_tasks_returned(self, async_authed_client, isolated_session):
        from app.models.node_task import NodeTask
        async with isolated_session() as s:
            task = NodeTask(
                cluster_id=1, task_type="cmd_exec", status="interrupted",
                total_nodes=2, success_nodes=1, failed_nodes=0,
            )
            s.add(task)
            await s.commit()

        resp = await async_authed_client.get("/api/v1/database/running-tasks")
        assert resp.status_code == 200
        tasks = resp.json()["tasks"]
        assert any(t["status"] == "interrupted" for t in tasks)

    async def test_completed_tasks_excluded(self, async_authed_client, isolated_session):
        from app.models.node_task import NodeTask
        async with isolated_session() as s:
            s.add(NodeTask(
                cluster_id=1, task_type="cmd_exec", status="success",
                total_nodes=3, success_nodes=3,
            ))
            await s.commit()

        resp = await async_authed_client.get("/api/v1/database/running-tasks")
        assert resp.status_code == 200
        tasks = resp.json()["tasks"]
        assert all(t["status"] not in ("success", "failed") for t in tasks)

    async def test_unauthenticated_returns_401(self, async_isolated_client):
        resp = await async_isolated_client.get("/api/v1/database/running-tasks")
        assert resp.status_code == 401

    async def test_non_admin_forbidden(self, async_authed_client):
        import uuid
        username = f"db_rt_noadmin_{uuid.uuid4().hex[:6]}"
        created = await async_authed_client.post("/api/v1/admin/users", json={
            "username": username, "password": "pass123", "role": "user", "status": 1,
        })
        assert created.status_code in (200, 201), created.text
        login = await async_authed_client.post("/api/v1/auth/login",
            json={"username": username, "password": "pass123"})
        user_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        resp = await async_authed_client.get("/api/v1/database/running-tasks", headers=user_headers)
        assert resp.status_code == 403
        uid = created.json()["id"]
        await async_authed_client.delete(f"/api/v1/admin/users/{uid}")


class TestMigrationHistoryCleanup:
    """迁移历史清理（openspec/changes/add-migration-history-cleanup）。"""

    @staticmethod
    async def _seed(session_factory, count: int, *, running: int = 0):
        from app.models.db_migration import DbMigrationLog

        async with session_factory() as s:
            for i in range(count):
                s.add(
                    DbMigrationLog(
                        direction="sqlite_to_postgres",
                        source_connection=f"src{i}",
                        target_connection="prod_pg",
                        mode="replace",
                        status="running" if i < running else "success",
                    )
                )
            await s.commit()

    @staticmethod
    async def _logs(session_factory):
        from sqlalchemy import select
        from app.models.db_migration import DbMigrationLog

        async with session_factory() as s:
            return (await s.execute(select(DbMigrationLog).order_by(DbMigrationLog.id))).scalars().all()

    @staticmethod
    async def _audit(session_factory, action: str):
        from sqlalchemy import select
        from app.models.system import AuditLog

        async with session_factory() as s:
            rows = (await s.execute(select(AuditLog).order_by(AuditLog.id))).scalars().all()
        return [r for r in rows if r.action == action]

    async def test_keep_last_must_be_positive(self, async_authed_client, isolated_session):
        await self._seed(isolated_session, 3)
        resp = await async_authed_client.post("/api/v1/database/history/cleanup", json={"keep_last": 0})
        assert resp.status_code in (400, 422)
        assert len(await self._logs(isolated_session)) == 3

    async def test_cleanup_keeps_newest_n(self, async_authed_client, isolated_session):
        await self._seed(isolated_session, 6)

        resp = await async_authed_client.post("/api/v1/database/history/cleanup", json={"keep_last": 2})

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"deleted": 4, "remaining": 2}
        rows = await self._logs(isolated_session)
        assert [r.source_connection for r in rows] == ["src4", "src5"]

    async def test_cleanup_never_deletes_running(self, async_authed_client, isolated_session):
        await self._seed(isolated_session, 5, running=1)  # 最旧一条 running

        resp = await async_authed_client.post("/api/v1/database/history/cleanup", json={"keep_last": 1})

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"deleted": 3, "remaining": 2}
        rows = await self._logs(isolated_session)
        assert [r.status for r in rows] == ["running", "success"]

    async def test_cleanup_noop_when_keep_last_exceeds_count(self, async_authed_client, isolated_session):
        await self._seed(isolated_session, 2)

        resp = await async_authed_client.post("/api/v1/database/history/cleanup", json={"keep_last": 10})

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"deleted": 0, "remaining": 2}
        assert len(await self._logs(isolated_session)) == 2

    async def test_cleanup_writes_audit_detail(self, async_authed_client, isolated_session):
        await self._seed(isolated_session, 4)

        await async_authed_client.post("/api/v1/database/history/cleanup", json={"keep_last": 1})

        logs = await self._audit(isolated_session, "db_migration_log_cleanup")
        assert len(logs) == 1
        assert "删除 3 条" in logs[0].detail and "保留最近 1 条" in logs[0].detail
        assert logs[0].username == "admin"

    async def test_delete_single_row(self, async_authed_client, isolated_session):
        await self._seed(isolated_session, 3)
        target = (await self._logs(isolated_session))[0]

        resp = await async_authed_client.delete(f"/api/v1/database/history/{target.id}")

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"deleted": 1, "remaining": 2}
        ids = [r.id for r in await self._logs(isolated_session)]
        assert target.id not in ids
        logs = await self._audit(isolated_session, "db_migration_log_delete")
        assert len(logs) == 1 and logs[0].resource_id == target.id

    async def test_delete_missing_row_404(self, async_authed_client):
        resp = await async_authed_client.delete("/api/v1/database/history/999999")
        assert resp.status_code == 404
        # 必须由本端点返回，而非 main.py 的未知 /api 兜底路由（两者都是 404，detail 不同）
        assert resp.json()["detail"] == "迁移历史记录不存在"

    async def test_delete_running_row_409(self, async_authed_client, isolated_session):
        await self._seed(isolated_session, 2, running=1)
        running_row = (await self._logs(isolated_session))[0]
        assert running_row.status == "running"

        resp = await async_authed_client.delete(f"/api/v1/database/history/{running_row.id}")

        assert resp.status_code == 409
        assert len(await self._logs(isolated_session)) == 2

    async def test_cleanup_preview_reports_exact_counts(self, async_authed_client, isolated_session):
        await self._seed(isolated_session, 6)

        resp = await async_authed_client.get("/api/v1/database/history/cleanup-preview?keep_last=2")

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"total": 6, "will_delete": 4, "will_keep": 2}
        # 预览必须只读：不得动数据
        assert len(await self._logs(isolated_session)) == 6

    async def test_cleanup_preview_excludes_running(self, async_authed_client, isolated_session):
        await self._seed(isolated_session, 5, running=1)

        resp = await async_authed_client.get("/api/v1/database/history/cleanup-preview?keep_last=1")

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"total": 5, "will_delete": 3, "will_keep": 2}

    async def test_cleanup_preview_keep_last_must_be_positive(self, async_authed_client):
        resp = await async_authed_client.get("/api/v1/database/history/cleanup-preview?keep_last=0")
        assert resp.status_code in (400, 422)
