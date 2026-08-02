"""Tests for NodeTaskService execution engine."""

import asyncio
import pytest
from sqlalchemy import select

from app.models.node_task import NodeTask, NodeTaskItem


@pytest.fixture
def make_service(test_db):
    """Build a NodeTaskService bound to a fresh event loop and a fake executor."""
    from app.services.node_task_service import NodeTaskService

    services = []

    def _make(executor, semaphore=None):
        svc = NodeTaskService(
            _ansible=None,  # engine must not touch real ansible in these tests
            executor=executor,
            semaphore=semaphore,
            db_factory=lambda: _session_factory(test_db)(),
        )
        services.append(svc)
        return svc

    yield _make

    for svc in services:
        svc.shutdown_sync()


def _session_factory(test_db):
    """Return a session factory bound to the same engine as the test_db."""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    engine = test_db.bind
    maker = async_sessionmaker(engine, class_=type(test_db), expire_on_commit=False)
    return maker


class TestStateMachine:
    @pytest.mark.asyncio
    async def test_task_runs_to_success(self, test_db, make_service):
        """A task with all nodes succeeding should end in success state."""
        calls = []

        async def executor(node, item, params, cancel_event, on_log):
            calls.append((node, item))
            return {"rc": 0, "status": "successful"}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db,
            cluster_id=1,
            task_type="start",
            node_ids=[1, 2],
            params={},
        )

        assert task.status == "pending"
        await svc.wait_completed(task.id)

        await test_db.refresh(task)
        assert task.status == "success"
        assert task.success_nodes == 2
        assert task.failed_nodes == 0
        assert task.finished_at is not None

        items = (await test_db.execute(select(NodeTaskItem).where(NodeTaskItem.task_id == task.id))).scalars().all()
        assert len(items) == 2
        assert all(i.status == "success" for i in items)

    @pytest.mark.asyncio
    async def test_partial_failure_marks_partial(self, test_db, make_service):
        """A task with some failing nodes should end in partial state."""
        async def executor(node, item, params, cancel_event, on_log):
            if node == 1:
                return {"rc": 1, "status": "failed"}
            return {"rc": 0, "status": "successful"}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1, 2], params={},
        )
        await svc.wait_completed(task.id)

        await test_db.refresh(task)
        assert task.status == "partial"
        assert task.success_nodes == 1
        assert task.failed_nodes == 1

    @pytest.mark.asyncio
    async def test_all_fail_marks_failed(self, test_db, make_service):
        """A task with all nodes failing should end in failed state."""
        async def executor(node, item, params, cancel_event, on_log):
            raise RuntimeError("boom")

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1], params={},
        )
        await svc.wait_completed(task.id)

        await test_db.refresh(task)
        assert task.status == "failed"
        assert task.failed_nodes == 1

    @pytest.mark.asyncio
    async def test_snapshot_fields_persisted(self, test_db, make_service):
        """Node task items should store ip/node_name snapshots at creation."""
        async def executor(node, item, params, cancel_event, on_log):
            return {"rc": 0}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start",
            node_ids=[10, 20],
            params={},
            node_snapshots={10: ("10.0.0.10", "n10"), 20: ("10.0.0.20", "n20")},
        )
        await svc.wait_completed(task.id)

        items = (await test_db.execute(select(NodeTaskItem).where(NodeTaskItem.task_id == task.id))).scalars().all()
        snapshots = {(i.node_id, i.ip, i.node_name) for i in items}
        assert (10, "10.0.0.10", "n10") in snapshots
        assert (20, "10.0.0.20", "n20") in snapshots


class TestCancel:
    @pytest.mark.asyncio
    async def test_cancel_skips_not_started_nodes(self, test_db, make_service):
        """Cancel should mark not-yet-started nodes as skipped."""
        started = asyncio.Event()
        release = asyncio.Event()

        async def executor(node, item, params, cancel_event, on_log):
            if node == 1:
                started.set()
                await release.wait()
                return {"rc": 0}
            # nodes 2,3: respond to cancel_event like run_playbook's cancel_callback
            for _ in range(100):
                if cancel_event is not None and cancel_event.is_set():
                    return {"rc": -1, "status": "cancelled"}
                await asyncio.sleep(0.02)
            return {"rc": 0}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1, 2, 3], params={},
        )
        await started.wait()
        await svc.cancel_task(task.id)
        release.set()
        await svc.wait_completed(task.id)

        await test_db.refresh(task)
        assert task.status in ("cancelled", "partial")

        items = (await test_db.execute(select(NodeTaskItem).where(NodeTaskItem.task_id == task.id))).scalars().all()
        statuses = {i.node_id: i.status for i in items}
        assert statuses[1] == "success"
        assert statuses[2] in ("cancelled", "failed")
        assert statuses[3] in ("cancelled", "failed")

    @pytest.mark.asyncio
    async def test_cancel_is_idempotent(self, test_db, make_service):
        """Cancel on a completed task should not error."""
        async def executor(node, item, params, cancel_event, on_log):
            return {"rc": 0}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1], params={},
        )
        await svc.wait_completed(task.id)
        await svc.cancel_task(task.id)
        await svc.cancel_task(task.id)

        await test_db.refresh(task)
        assert task.status == "success"


class TestRetry:
    @pytest.mark.asyncio
    async def test_retry_resets_failed_nodes(self, test_db, make_service):
        """Retry should re-run failed nodes and skip successful ones."""
        attempts = {}

        async def executor(node, item, params, cancel_event, on_log):
            attempts[node] = attempts.get(node, 0) + 1
            if node == 1 and attempts[node] == 1:
                return {"rc": 1, "status": "failed"}
            return {"rc": 0, "status": "successful"}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1, 2], params={},
        )
        await svc.wait_completed(task.id)
        await test_db.refresh(task)
        assert task.status == "partial"

        await svc.retry_task(task.id)
        await svc.wait_completed(task.id)
        await test_db.refresh(task)

        assert task.status == "success"
        assert task.success_nodes == 2
        # node 2 succeeded on first pass and should NOT have been re-run
        assert attempts[2] == 1
        assert attempts[1] == 2


class TestConcurrency:
    @pytest.mark.asyncio
    async def test_per_node_mutex_serializes_same_node(self, test_db, make_service):
        """Two tasks targeting the same node must not run its items concurrently."""
        active = 0
        max_active = 0
        lock = asyncio.Lock()

        async def executor(node, item, params, cancel_event, on_log):
            nonlocal active, max_active
            async with lock:
                active += 1
                max_active = max(max_active, active)
                await asyncio.sleep(0.05)
                active -= 1
            return {"rc": 0}

        svc = make_service(executor)
        t1 = await svc.create_task(db=test_db, cluster_id=1, task_type="start", node_ids=[1], params={})
        t2 = await svc.create_task(db=test_db, cluster_id=1, task_type="stop", node_ids=[1], params={})
        await asyncio.gather(svc.wait_completed(t1.id), svc.wait_completed(t2.id))

        assert max_active <= 1, f"same-node items ran concurrently (max_active={max_active})"

    @pytest.mark.asyncio
    async def test_semaphore_limits_parallel_nodes(self, test_db, make_service):
        """Distinct nodes should run in parallel up to the semaphore limit."""
        active = 0
        max_active = 0

        async def executor(node, item, params, cancel_event, on_log):
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.05)
            active -= 1
            return {"rc": 0}

        sem = asyncio.Semaphore(2)
        svc = make_service(executor, semaphore=sem)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1, 2, 3, 4], params={},
        )
        await svc.wait_completed(task.id)

        assert max_active <= 2, f"semaphore not honored (max_active={max_active})"
        assert max_active >= 2, "expected parallelism across distinct nodes"
