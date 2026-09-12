"""Tests for the node-task-center API endpoints."""

import pytest
from unittest.mock import AsyncMock, patch
from tests.api_helpers import AuthedTestClient, isolated_app_lifespan
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.core.database import get_db
from app.models.cluster import Node


async def _seed_nodes(session: AsyncSession):
    """Ensure nodes 1 and 2 exist in cluster 1 for task creation tests."""
    for nid, ip in [(1, "127.0.0.1"), (2, "127.0.0.2")]:
        existing = await session.get(Node, nid)
        if existing is None:
            session.add(Node(
                id=nid,
                cluster_id=1,
                ip=ip,
                service_port=80,
                management_port=9180,
                edge_path="/data/openresty",
                status=1,
            ))
    await session.commit()


class TestNodeTaskApi:
    @pytest.fixture
    def client(self, test_db):
        """Override get_db to use test_db session and seed required nodes + api user."""
        async def override_get_db():
            yield test_db

        app.dependency_overrides[get_db] = override_get_db
        # Seed nodes + auth user before tests run
        import asyncio
        from app.models.user import User
        from app.core.security import hash_password
        asyncio.run(_seed_nodes(test_db))

        async def _seed_user():
            if await test_db.get(User, 1) is None:
                test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                                 role="admin", status=1))
                await test_db.commit()
        asyncio.run(_seed_user())

        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            yield c
        app.dependency_overrides.clear()

    @pytest.fixture
    def mock_service(self):
        """Patch the module-level node_task_service with an AsyncMock engine."""
        svc = AsyncMock()
        svc.create_task = AsyncMock()
        svc.cancel_task = AsyncMock()
        svc.retry_task = AsyncMock()
        with patch("app.services.node_task_service.get_node_task_service", return_value=svc), \
             patch("app.api.v1.node_tasks.get_node_task_service", return_value=svc):
            yield svc

    def test_create_task_endpoint(self, client, mock_service):
        """POST /clusters/1/node-tasks should call engine and return task id."""
        from datetime import datetime
        from types import SimpleNamespace

        fake_task = SimpleNamespace(
            id=42, cluster_id=1, task_type="start", status="pending",
            params={}, total_nodes=2, success_nodes=0, failed_nodes=0,
            cancelled_nodes=0, created_by=None,
            created_at=datetime.utcnow(), started_at=None, finished_at=None,
        )
        fake_task.get_params = lambda: {}
        mock_service.create_task.return_value = fake_task

        resp = client.post("/api/v1/clusters/1/node-tasks", json={
            "task_type": "start",
            "node_ids": [1, 2],
            "params": {"prefix": "/data/openresty"},
        })

        assert resp.status_code in (200, 201)
        assert mock_service.create_task.await_count == 1
        call = mock_service.create_task.await_args
        assert call.kwargs["cluster_id"] == 1
        assert call.kwargs["task_type"] == "start"
        assert call.kwargs["node_ids"] == [1, 2]

    def test_create_task_rejects_unknown_type(self, client, mock_service):
        """POST with unknown task_type should return 422."""
        resp = client.post("/api/v1/clusters/1/node-tasks", json={
            "task_type": "nonsense",
            "node_ids": [1],
        })
        assert resp.status_code == 422
        mock_service.create_task.assert_not_awaited()

    def test_create_cmd_exec_task_accepts_cmd_params(self, client, mock_service):
        """cmd_exec 类型 + cmd 参数应被接受（TaskType 需包含 cmd_exec）."""
        from datetime import datetime
        from types import SimpleNamespace

        fake_task = SimpleNamespace(
            id=43, cluster_id=1, task_type="cmd_exec", status="pending",
            params={"cmd": "ls -la /tmp"}, total_nodes=1, success_nodes=0,
            failed_nodes=0, cancelled_nodes=0, created_by=None,
            created_at=datetime.utcnow(), started_at=None, finished_at=None,
        )
        fake_task.get_params = lambda: fake_task.params
        mock_service.create_task.return_value = fake_task

        resp = client.post("/api/v1/clusters/1/node-tasks", json={
            "task_type": "cmd_exec",
            "node_ids": [1],
            "params": {"cmd": "ls -la /tmp", "security": "blacklist", "timeout": 30},
        })
        assert resp.status_code in (200, 201)
        assert mock_service.create_task.await_count == 1
        call = mock_service.create_task.await_args
        assert call.kwargs["task_type"] == "cmd_exec"
        assert call.kwargs["params"]["cmd"] == "ls -la /tmp"

    def test_create_task_rejects_empty_nodes(self, client, mock_service):
        """POST with empty node_ids should return 422."""
        resp = client.post("/api/v1/clusters/1/node-tasks", json={
            "task_type": "start",
            "node_ids": [],
        })
        assert resp.status_code == 422
        mock_service.create_task.assert_not_awaited()

    def test_list_tasks_endpoint(self, client):
        """GET /node-tasks should return a list shape."""
        resp = client.get("/api/v1/node-tasks")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list) or "items" in data

    def test_cluster_tasks_endpoint(self, client):
        """GET /clusters/1/node-tasks should return a list shape."""
        resp = client.get("/api/v1/clusters/1/node-tasks")
        assert resp.status_code == 200

    def test_task_detail_not_found(self, client):
        """GET /node-tasks/999999 should return 404."""
        resp = client.get("/api/v1/node-tasks/999999")
        assert resp.status_code == 404

    def test_cancel_task_endpoint(self, client, mock_service):
        """POST /node-tasks/1/cancel should call engine cancel_task."""
        resp = client.post("/api/v1/node-tasks/1/cancel")
        assert resp.status_code in (200, 202)
        assert mock_service.cancel_task.await_count == 1
        assert mock_service.cancel_task.await_args.args[0] == 1

    def test_retry_task_endpoint(self, client, mock_service):
        """POST /node-tasks/1/retry should call engine retry_task."""
        resp = client.post("/api/v1/node-tasks/1/retry", json={"node_ids": [2]})
        assert resp.status_code in (200, 202)
        assert mock_service.retry_task.await_count == 1


class TestRetrySessionThreading:
    """retry 端点必须把请求会话贯穿到 service 写库（同一事务）。

    根因（2026-09-12，详见 docs/refactoring/test-suite-consolidation-2026-09-12.md）：
    audit_start 依赖在 get_db 会话 A 上 add(audit) 骨架 → get_current_user 在 A 上
    SELECT 触发 autoflush → A 持 SQLite 写锁直到请求结束；handler 内 service 再用
    自建会话 B 写库（reset）即被 A 阻塞至 busy_timeout →
    OperationalError "database is locked" → 500。
    """

    @pytest.fixture
    def file_db_env(self, tmp_path):
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from app.core.database import Base

        async def _make():
            url = f"sqlite+aiosqlite:///{tmp_path / 'retry_lock.db'}"
            e1 = create_async_engine(url)
            e2 = create_async_engine(url)
            async with e1.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return e1, e2, async_sessionmaker(e1, expire_on_commit=False), async_sessionmaker(e2, expire_on_commit=False)

        import asyncio
        return asyncio.run(_make())

    def test_retry_with_flushed_audit_session_does_not_deadlock(self, file_db_env, monkeypatch):
        """audit 骨架已 flush（持写锁）时，retry 仍必须成功（写库走同一会话）。"""
        import asyncio
        from sqlalchemy import select
        from sqlalchemy.ext.asyncio import AsyncSession
        from app.main import app
        from app.core.database import get_db
        from app.models.user import User
        from app.models.node_task import NodeTask, NodeTaskItem
        from app.core.security import hash_password
        from app.api.v1 import node_tasks as node_tasks_mod
        from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

        e1, e2, mk1, mk2 = file_db_env

        async def _seed():
            async with mk1() as s:
                if await s.get(User, 1) is None:
                    s.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                               role="admin", status=1))
                task = NodeTask(cluster_id=1, task_type="start", status="failed")
                s.add(task)
                await s.flush()
                for node_id in (1, 2):
                    s.add(NodeTaskItem(task_id=task.id, node_id=node_id,
                                       ip=f"10.0.0.{node_id}", status="failed", rc=1))
                await s.commit()
                return task.id

        task_id = asyncio.run(_seed())

        async def override_get_db():
            async with mk1() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db

        class _E2ResetService:
            """模拟生产 wiring：service 用自建会话（E2）写库，除非请求会话被贯穿进来。"""

            def __init__(self):
                self._db_factory = mk2

            async def retry_task(self, task_id, node_ids=None, db: AsyncSession | None = None):
                if db is not None:
                    await self._reset(task_id, db)
                else:
                    async with self._db_factory() as s:
                        await self._reset(task_id, s)

            async def _reset(self, task_id, s):
                items = (await s.execute(
                    select(NodeTaskItem).where(NodeTaskItem.task_id == task_id)
                )).scalars().all()
                for i in items:
                    i.status = "pending"
                    i.rc = None
                    i.finished_at = None
                await s.commit()

        monkeypatch.setattr(node_tasks_mod, "get_node_task_service", lambda: _E2ResetService())

        try:
            with isolated_app_lifespan(), AuthedTestClient(app) as c:
                resp = c.post(f"/api/v1/node-tasks/{task_id}/retry", json={})
            assert resp.status_code == 200, (
                f"retry 自锁复现（audit 会话持写锁 vs service 第二会话写库）: {resp.status_code} {resp.text}"
            )
            async def _check():
                async with mk1() as s:
                    items = (await s.execute(
                        select(NodeTaskItem).where(NodeTaskItem.task_id == task_id)
                    )).scalars().all()
                return [i.status for i in items]
            assert asyncio.run(_check()) == ["pending", "pending"]
        finally:
            app.dependency_overrides.clear()

            async def _dispose():
                await e1.dispose()
                await e2.dispose()
            asyncio.run(_dispose())
