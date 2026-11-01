"""NodeTask 统计口径一致性（openspec node-task-ux-optimization D2）。

背景：``total_nodes`` 在创建时按入参写一次，而 ``success/failed/cancelled_nodes``
在收尾时按子项数结果计数，两者会漂移——实机任务 #1/#2/#3 主表 ``total_nodes=1``
而子项有 3 条，列表显示物理不可能的「2/1 成功」。

契约（D2）：
1. 统计算法单一实现 ``NodeTaskService._recompute_stats``（只改内存，不 commit）；
2. ``_finalize_task`` / ``create_task`` / ``_reset_failed_items_on`` /
   ``recover_interrupted_tasks`` 四处接线；
3. 新增 ``skipped_nodes`` 列并出现在列表/SSE 载荷里；
4. ``backfill_task_stats()`` 幂等回填历史脏数据（total 取子项数）。
"""

import asyncio
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.models.node_task import NodeTask, NodeTaskItem


def _session_factory(test_db):
    """与 test_db 同引擎的会话工厂（引擎服务各节点独立会话）。"""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    engine = test_db.bind
    return async_sessionmaker(engine, class_=type(test_db), expire_on_commit=False)


@pytest.fixture
def make_service(test_db):
    """构造绑定隔离库的 NodeTaskService（_ansible=None + 假 executor）。"""
    from app.services.node_task_service import NodeTaskService

    services = []

    def _make(executor):
        svc = NodeTaskService(
            _ansible=None,
            executor=executor,
            db_factory=lambda: _session_factory(test_db)(),
        )
        services.append(svc)
        return svc

    yield _make
    for svc in services:
        svc.shutdown_sync()


async def _load_items(db, task_id: int) -> list[NodeTaskItem]:
    return (
        await db.execute(
            select(NodeTaskItem)
            .where(NodeTaskItem.task_id == task_id)
            .order_by(NodeTaskItem.id)
            .execution_options(populate_existing=True)
        )
    ).scalars().all()


def _ok_executor():
    async def executor(node, item, params, cancel_event, on_log):
        return {"rc": 0, "status": "successful"}

    return executor


# ── 1. 统计算法单一实现 ────────────────────────────────────────────────


class TestRecomputeStats:
    def test_counts_each_status_and_total_from_items(self):
        """混合状态子项 → 五个计数正确，total_nodes == len(items)。"""
        from app.services.node_task_service import NodeTaskService

        task = NodeTask(cluster_id=1, task_type="start", status="running")
        items = [
            NodeTaskItem(task_id=1, node_id=1, ip="10.0.0.1", status="success"),
            NodeTaskItem(task_id=1, node_id=2, ip="10.0.0.2", status="success"),
            NodeTaskItem(task_id=1, node_id=3, ip="10.0.0.3", status="failed"),
            NodeTaskItem(task_id=1, node_id=4, ip="10.0.0.4", status="skipped"),
            NodeTaskItem(task_id=1, node_id=5, ip="10.0.0.5", status="cancelled"),
        ]

        NodeTaskService._recompute_stats(task, items)

        assert task.total_nodes == 5
        assert task.success_nodes == 2
        assert task.failed_nodes == 1
        assert task.skipped_nodes == 1
        assert task.cancelled_nodes == 1


# ── 2. 收尾一致性（total 取子项数，不再沿用创建时的陈旧值）─────────────────


class TestFinalizeConsistency:
    @pytest.mark.asyncio
    async def test_finalize_recomputes_total_from_items(self, test_db, make_service):
        """主表 total_nodes 陈旧（1）而子项 3 条 → 收尾后统计与子项一致。

        复刻实机任务 #1/#2/#3 形态：total_nodes=1、子项 3 条、列表显示 2/1 成功。
        """
        task = NodeTask(cluster_id=1, task_type="start", status="pending", total_nodes=1)
        task.set_params({})
        test_db.add(task)
        await test_db.flush()
        for node_id in (1, 2, 3):
            test_db.add(
                NodeTaskItem(task_id=task.id, node_id=node_id, ip=f"10.0.0.{node_id}", status="pending")
            )
        await test_db.commit()

        svc = make_service(_ok_executor())
        await svc._execute(task.id)

        await test_db.refresh(task)
        assert task.status == "success"
        assert task.total_nodes == 3, "total_nodes 必须取子项数（否则出现 3/1 成功）"
        assert task.success_nodes == 3
        assert task.failed_nodes == 0
        assert task.skipped_nodes == 0

    @pytest.mark.asyncio
    async def test_create_task_stats_consistent_immediately(self, test_db, make_service):
        """创建即一致：total_nodes == 子项数，其余计数为 0。"""
        svc = make_service(_ok_executor())
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1, 2, 3], params={},
        )
        await svc.wait_completed(task.id)

        await test_db.refresh(task)
        items = await _load_items(test_db, task.id)
        assert task.total_nodes == len(items) == 3


# ── 3. 重试重置后不残留上一次的计数 ──────────────────────────────────────


class TestRetryStats:
    @pytest.mark.asyncio
    async def test_reset_recomputes_stats_then_rerun_not_accumulated(self, test_db, make_service):
        """1 success + 1 failed → 重置后 failed 计数归零，重跑再失败仍为 1/1。"""
        attempts = {}

        async def executor(node, item, params, cancel_event, on_log):
            attempts[node] = attempts.get(node, 0) + 1
            if node == 2:
                return {"rc": 1, "status": "failed"}
            return {"rc": 0, "status": "successful"}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1, 2], params={},
        )
        await svc.wait_completed(task.id)
        await test_db.refresh(task)
        assert (task.success_nodes, task.failed_nodes) == (1, 1)

        # 重置腿：failed 子项改回 pending，任务统计须同步（不得残留 failed_nodes=1）
        await svc._reset_failed_items_on(task.id, None, test_db)
        await test_db.refresh(task)
        assert task.success_nodes == 1
        assert task.failed_nodes == 0, "重置后统计未同步（残留上一次结果）"
        assert task.total_nodes == 2

        # 重试：第二次执行仍失败 → 1/1，绝不累加为 2/2
        await svc.retry_task(task.id, db=test_db)
        await svc.wait_completed(task.id)
        await test_db.refresh(task)
        assert attempts[2] == 2
        assert (task.success_nodes, task.failed_nodes) == (1, 1)
        assert task.total_nodes == 2


# ── 4. 历史脏数据回填（幂等）────────────────────────────────────────────


class TestBackfill:
    @pytest.mark.asyncio
    async def test_backfill_fixes_stale_total_and_is_idempotent(self, test_db, test_db_factory):
        """手工造 total_nodes=1 + 3 条子项 → 回填后 total==3，再跑返回 0。"""
        from app.services.node_task_service import backfill_task_stats

        task = NodeTask(cluster_id=1, task_type="start", status="partial", total_nodes=1)
        task.set_params({})
        test_db.add(task)
        await test_db.flush()
        for node_id, status in ((1, "success"), (2, "success"), (3, "failed")):
            test_db.add(
                NodeTaskItem(
                    task_id=task.id, node_id=node_id, ip=f"10.0.0.{node_id}", status=status
                )
            )
        await test_db.commit()

        # 内部自建会话（from app.core.database import AsyncSessionLocal），指向隔离库
        with patch("app.core.database.AsyncSessionLocal", test_db_factory):
            fixed = await backfill_task_stats()

        assert fixed == 1, f"应修正 1 个任务，实际 {fixed}"
        await test_db.refresh(task)
        assert task.total_nodes == 3
        assert task.success_nodes == 2
        assert task.failed_nodes == 1
        assert task.skipped_nodes == 0
        assert task.cancelled_nodes == 0

        with patch("app.core.database.AsyncSessionLocal", test_db_factory):
            again = await backfill_task_stats()
        assert again == 0, "回填必须幂等，第二次修正数为 0"


# ── 5. 重启恢复后统计同步 ───────────────────────────────────────────────


class TestRecoverStats:
    @pytest.mark.asyncio
    async def test_recover_syncs_task_stats(self, test_db, test_db_factory):
        """running 任务 + 2 running 子项 + 1 success 子项 → failed=2/success=1/total=3。"""
        from app.services.node_task_service import recover_interrupted_tasks

        task = NodeTask(cluster_id=1, task_type="start", status="running", total_nodes=1)
        task.set_params({})
        test_db.add(task)
        await test_db.flush()
        test_db.add_all([
            NodeTaskItem(task_id=task.id, node_id=1, ip="10.0.0.1", status="running"),
            NodeTaskItem(task_id=task.id, node_id=2, ip="10.0.0.2", status="running"),
            NodeTaskItem(task_id=task.id, node_id=3, ip="10.0.0.3", status="success", rc=0),
        ])
        await test_db.commit()

        with patch("app.core.database.AsyncSessionLocal", test_db_factory):
            await recover_interrupted_tasks()

        await test_db.refresh(task)
        assert task.failed_nodes == 2
        assert task.success_nodes == 1
        assert task.total_nodes == 3

        # 幂等：再跑一次不改变结果
        with patch("app.core.database.AsyncSessionLocal", test_db_factory):
            await recover_interrupted_tasks()
        await test_db.refresh(task)
        assert (task.total_nodes, task.success_nodes, task.failed_nodes) == (3, 1, 2)


# ── 6. 对外载荷 ────────────────────────────────────────────────────────


class TestPayload:
    def test_to_task_dict_has_skipped_nodes(self):
        from app.api.v1.node_tasks import _to_task_dict

        task = NodeTask(
            id=1, cluster_id=1, task_type="start", status="partial",
            total_nodes=4, success_nodes=2, failed_nodes=1,
            skipped_nodes=1, cancelled_nodes=0,
        )
        task.set_params({})
        data = _to_task_dict(task)
        assert data["skipped_nodes"] == 1
        assert data["total_nodes"] == 4

    def test_list_endpoint_returns_skipped_nodes(self, test_db, test_db_factory):
        """GET /api/v1/node-tasks 的条目须带 skipped_nodes 键。"""
        from app.core.database import get_db
        from app.core.security import hash_password
        from app.main import app
        from app.models.user import User
        from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

        async def _seed():
            if await test_db.get(User, 1) is None:
                test_db.add(
                    User(
                        id=1, username="stats_user",
                        password_hash=hash_password("password123"),
                        role="admin", status=1,
                    )
                )
            task = NodeTask(
                cluster_id=1, task_type="start", status="partial",
                total_nodes=3, success_nodes=1, failed_nodes=1, skipped_nodes=1,
            )
            task.set_params({})
            test_db.add(task)
            await test_db.commit()

        asyncio.run(_seed())

        async def override_get_db():
            async with test_db_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        try:
            with isolated_app_lifespan(), AuthedTestClient(app) as client:
                resp = client.get("/api/v1/node-tasks")
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 200, resp.text
        row = resp.json()["items"][0]
        assert row["skipped_nodes"] == 1
        assert row["total_nodes"] == 3
