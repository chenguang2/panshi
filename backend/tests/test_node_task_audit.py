"""节点任务审计支撑测试（任务详情页审计历史）。

两组行为：
1. create 审计补 resource_id：POST 创建任务后 sys_audit_log 对应行必须带
   任务 id 与中文 detail（修复前 "(batch)" 分支 resource_id=NULL）。
   复刻生产时序：svc.create_task 内部已 commit（骨架行以 resource_id=NULL
   落库），此后 handler enrich 同会话骨架再显式 commit → UPDATE 生效。
   断言落库终态而非函数调用。
2. 审计历史查询端点：GET /api/v1/node-tasks/{task_id}/audit 按时间升序返回
   该任务的审计行，不混入其它任务；未知任务 404。
"""

import asyncio
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.core.database import get_db
from app.models.cluster import Node
from tests.api_helpers import AuthedTestClient, isolated_app_lifespan


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


@pytest.fixture
def client(test_db, test_db_factory):
    """Override get_db 用 test_db 同库会话工厂（每请求新会话），seed nodes + user 1。"""
    async def override_get_db():
        async with test_db_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    from app.core.security import hash_password
    from app.models.user import User

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
def mock_service():
    """Patch 节点任务引擎为 AsyncMock（create_task 由用例自定义 side_effect）。"""
    svc = AsyncMock()
    svc.create_task = AsyncMock()
    with patch("app.services.node_task_service.get_node_task_service", return_value=svc), \
         patch("app.api.v1.node_tasks.get_node_task_service", return_value=svc):
        yield svc


def _fake_task(task_id: int) -> SimpleNamespace:
    fake = SimpleNamespace(
        id=task_id, cluster_id=1, task_type="start", status="pending",
        params={}, total_nodes=2, success_nodes=0, failed_nodes=0,
        skipped_nodes=0, cancelled_nodes=0, created_by=1,
        created_at=datetime.utcnow(), started_at=None, finished_at=None,
    )
    fake.get_params = lambda: {}
    return fake


class TestCreateTaskAuditResourceId:
    def test_create_task_audit_row_gets_resource_id(self, client, mock_service, test_db):
        """RED-1：创建任务后 sys_audit_log 该行 resource_id=任务 id、detail 含「创建节点任务」。"""
        async def _fake_create(*args, **kwargs):
            # 复刻生产时序：node_task_service.create_task 内部先 commit
            # （审计骨架行已以 resource_id=NULL 落库），enrich 只能靠 UPDATE 生效
            await kwargs["db"].commit()
            return _fake_task(42)

        mock_service.create_task.side_effect = _fake_create

        resp = client.post("/api/v1/clusters/1/node-tasks", json={
            "task_type": "start",
            "node_ids": [1, 2],
            "params": {"prefix": "/data/openresty"},
        })
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["id"] == 42

        async def _query():
            from app.models.system import AuditLog
            return (await test_db.execute(
                select(AuditLog).where(AuditLog.resource == "node_task")
            )).scalars().all()

        rows = asyncio.run(_query())
        # 恰好 1 条 node_task_create 行：enrich 复用骨架，不得另起新行
        assert len(rows) == 1, f"expect 1 node_task audit row, got {len(rows)}"
        row = rows[0]
        assert row.action == "node_task_create"
        assert row.resource_id == 42, f"resource_id 应为任务 id 42，实际 {row.resource_id!r}"
        assert "创建节点任务" in (row.detail or ""), f"detail 缺中文说明，实际 {row.detail!r}"


class TestTaskAuditEndpoint:
    @pytest.fixture
    def seeded_tasks(self, test_db):
        """任务 101（含 create/cancel/retry 审计行）与任务 102（干扰行）。"""
        from app.models.node_task import NodeTask
        from app.models.system import AuditLog

        async def _seed():
            task_ids = []
            for tid in (101, 102):
                task = NodeTask(cluster_id=1, task_type="start", status="cancelled", total_nodes=2)
                task.set_params({})
                test_db.add(task)
                await test_db.flush()
                task_ids.append(task.id)
            rows = [
                AuditLog(username="admin", action="node_task_create", resource="node_task",
                         resource_id=task_ids[0], detail=f"创建节点任务 #{task_ids[0]}（start，2 节点）",
                         ip_address="192.168.1.9", created_at=datetime(2026, 1, 1, 8, 0, 0)),
                AuditLog(username="admin", action="node_task_cancel", resource="node_task",
                         resource_id=task_ids[0], detail=f"取消节点任务 #{task_ids[0]}",
                         ip_address="192.168.1.9", created_at=datetime(2026, 1, 1, 8, 5, 0)),
                AuditLog(username="admin", action="node_task_retry", resource="node_task",
                         resource_id=task_ids[0], detail=f"重试节点任务 #{task_ids[0]}",
                         ip_address="192.168.1.9", created_at=datetime(2026, 1, 1, 8, 10, 0)),
                # 第二个任务的行：按时间落在 101 的 create 与 cancel 之间，混入即可被识破
                AuditLog(username="admin", action="node_task_create", resource="node_task",
                         resource_id=task_ids[1], detail=f"创建节点任务 #{task_ids[1]}（stop，1 节点）",
                         ip_address="192.168.1.9", created_at=datetime(2026, 1, 1, 8, 1, 0)),
            ]
            test_db.add_all(rows)
            await test_db.commit()
            return task_ids, [r.id for r in rows[:3]]

        return asyncio.run(_seed())

    def test_audit_history_ordered_and_scoped(self, client, seeded_tasks):
        """RED-2：GET /{task_id}/audit 返回该任务 create/cancel/retry 升序，不混入第二任务。"""
        task_ids, audit_row_ids = seeded_tasks
        task_id = task_ids[0]
        resp = client.get(f"/api/v1/node-tasks/{task_id}/audit")
        assert resp.status_code == 200, resp.text
        rows = resp.json()
        assert [r["action"] for r in rows] == [
            "node_task_create", "node_task_cancel", "node_task_retry",
        ]
        # 只含本任务审计行（第二任务的 create 行时间上介于其间，混入即暴露）
        assert sorted(r["id"] for r in rows) == sorted(audit_row_ids)
        # 响应形状契约：恰好这 6 个字段
        assert set(rows[0].keys()) == {"id", "username", "action", "detail", "ip_address", "created_at"}
        assert rows[0]["username"] == "admin"
        assert rows[0]["ip_address"] == "192.168.1.9"
        assert "创建节点任务" in rows[0]["detail"]
        # created_at 为 naive UTC isoformat（无时区后缀，全站约定）
        assert rows[0]["created_at"] == "2026-01-01T08:00:00"

    def test_audit_history_unknown_task_404(self, client):
        """RED-3：未知任务 id → 404 detail=「任务不存在」。"""
        resp = client.get("/api/v1/node-tasks/999999/audit")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "任务不存在"
