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


class TestDistributeBatch:
    """distribute_file 批量分发：run_playbook 的 extravars 必须覆盖全部节点。

    edge 角色 master_copy_to_slaves 用 with_together 对
    ips.split(',') / srcpath.split(',') / destpath.split(',') 按位 zip，
    并以 when: inventory_hostname == item.0 匹配节点 —— 任一列表偏短都会
    截断（zip 语义），导致只有第一个节点收到文件。
    """

    @pytest.fixture
    def batch_env(self, test_db, tmp_path, monkeypatch):
        import asyncio
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        from app.services import node_task_service as nts_mod

        monkeypatch.setattr(nts_mod, "TASK_SCRIPTS_DIR", tmp_path)

        def _make(task_type, items_spec, params):
            mock_ansible = SimpleNamespace(
                run_playbook=AsyncMock(return_value={
                    "rc": 0, "status": "successful",
                    "stdout": "ok: [10.0.0.10]\nok: [10.0.0.20]",
                    "stderr": "",
                }),
            )
            svc = nts_mod.NodeTaskService(
                _ansible=mock_ansible,
                db_factory=lambda: _session_factory(test_db)(),
            )
            return svc, mock_ansible

        return _make

    async def _seed_task(self, test_db, items_spec, params):
        import json

        task = NodeTask(
            cluster_id=1, task_type="distribute_file", status="pending",
            params=json.dumps(params, ensure_ascii=False), total_nodes=len(items_spec),
        )
        test_db.add(task)
        await test_db.flush()
        items = []
        for node_id, ip in items_spec:
            item = NodeTaskItem(task_id=task.id, node_id=node_id, ip=ip, status="pending")
            test_db.add(item)
            items.append(item)
        await test_db.commit()
        return task, items

    @pytest.mark.asyncio
    async def test_batch_extravars_cover_every_node(self, test_db, batch_env, tmp_path):
        """ips 为全部节点；srcpath/destpath 必须按节点数重复，避免 with_together 截断。

        dest 落地为「destpath + 原始文件名」（srcfilename 优先，缺省回退存储名）。
        """
        items_spec = [(10, "10.0.0.10"), (20, "10.0.0.20")]
        params = {"srcpath": "temp/abc-uuid", "destpath": "/tmp/", "srcfilename": "3.csv"}
        task, items = await self._seed_task(test_db, items_spec, params)

        # 预置已迁移的分发文件：TASK_SCRIPTS_DIR/{task_id}/{file_name}
        src_file = tmp_path / str(task.id) / "abc-uuid"
        src_file.parent.mkdir(parents=True)
        src_file.write_text("hello", encoding="utf-8")

        svc, mock_ansible = batch_env("distribute_file", items_spec, params)
        await svc._execute_distribute_batch(test_db, task, items, params, None)

        mock_ansible.run_playbook.assert_called_once()
        args, kwargs = mock_ansible.run_playbook.call_args
        ip_arg, tag, ev = args[0], args[1], args[2]

        assert ip_arg == ""
        assert tag == "edge_master_copy_to_slaves"
        assert ev["ips"] == "10.0.0.10,10.0.0.20"

        src_parts = ev["srcpath"].split(",")
        dest_parts = ev["destpath"].split(",")
        assert src_parts == [str(src_file)] * 2, (
            f"srcpath 必须按节点数重复（with_together 截断防护），got {src_parts!r}"
        )
        assert dest_parts == ["/tmp/3.csv"] * 2, (
            f"dest 必须按节点数重复且以原始文件名落地，got {dest_parts!r}"
        )

        # 执行后全部节点标记成功（rc=0）
        for item in items:
            assert item.status == "success"

    @pytest.mark.asyncio
    async def test_batch_dest_falls_back_to_stored_name_without_srcfilename(self, test_db, batch_env, tmp_path):
        """params 无 srcfilename 时（旧任务兼容），dest 回退为存储名（UUID）。"""
        items_spec = [(10, "10.0.0.10")]
        params = {"srcpath": "temp/abc-uuid", "destpath": "/tmp/"}
        task, items = await self._seed_task(test_db, items_spec, params)

        src_file = tmp_path / str(task.id) / "abc-uuid"
        src_file.parent.mkdir(parents=True)
        src_file.write_text("hello", encoding="utf-8")

        svc, mock_ansible = batch_env("distribute_file", items_spec, params)
        await svc._execute_distribute_batch(test_db, task, items, params, None)

        ev = mock_ansible.run_playbook.call_args.args[2]
        assert ev["destpath"].split(",") == ["/tmp/abc-uuid"]

    @pytest.mark.asyncio
    async def test_batch_dest_sanitizes_srcfilename_path_traversal(self, test_db, batch_env, tmp_path):
        """srcfilename 只取 basename：任何路径成分被剥掉，杜绝目标端路径穿越。"""
        items_spec = [(10, "10.0.0.10")]
        params = {
            "srcpath": "temp/abc-uuid", "destpath": "/tmp/",
            "srcfilename": "../../etc/hosts",
        }
        task, items = await self._seed_task(test_db, items_spec, params)

        src_file = tmp_path / str(task.id) / "abc-uuid"
        src_file.parent.mkdir(parents=True)
        src_file.write_text("hello", encoding="utf-8")

        svc, mock_ansible = batch_env("distribute_file", items_spec, params)
        await svc._execute_distribute_batch(test_db, task, items, params, None)

        ev = mock_ansible.run_playbook.call_args.args[2]
        assert ev["destpath"].split(",") == ["/tmp/hosts"]

    @pytest.mark.asyncio
    async def test_batch_dest_falls_back_when_srcfilename_is_dotlike(self, test_db, batch_env, tmp_path):
        """srcfilename 净化为空（如 '..' 或 '.'）时回退存储名。"""
        items_spec = [(10, "10.0.0.10")]
        params = {
            "srcpath": "temp/abc-uuid", "destpath": "/tmp/",
            "srcfilename": "..",
        }
        task, items = await self._seed_task(test_db, items_spec, params)

        src_file = tmp_path / str(task.id) / "abc-uuid"
        src_file.parent.mkdir(parents=True)
        src_file.write_text("hello", encoding="utf-8")

        svc, mock_ansible = batch_env("distribute_file", items_spec, params)
        await svc._execute_distribute_batch(test_db, task, items, params, None)

        ev = mock_ansible.run_playbook.call_args.args[2]
        assert ev["destpath"].split(",") == ["/tmp/abc-uuid"]


class TestDuplicatePrevention:
    """B2: create_task must reject duplicate in-flight tasks with same params."""

    @pytest.mark.asyncio
    async def test_duplicate_pending_task_rejected(self, test_db, make_service):
        """Same (cluster_id, task_type, node_ids, params) pending task must be rejected."""
        async def executor(node, item, params, cancel_event, on_log):
            await asyncio.sleep(0.05)
            return {"rc": 0}

        svc = make_service(executor)
        task1 = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1, 2], params={},
        )
        assert task1.status == "pending"

        with pytest.raises(ValueError, match="已存在"):
            await svc.create_task(
                db=test_db, cluster_id=1, task_type="start", node_ids=[2, 1], params={},
            )

        await svc.wait_completed(task1.id)
        svc.shutdown_sync()
        await asyncio.sleep(0.1)

    @pytest.mark.asyncio
    async def test_same_params_terminal_task_allowed(self, test_db, make_service):
        """Same params but task already terminal must allow re-creation."""
        async def executor(node, item, params, cancel_event, on_log):
            return {"rc": 0}

        svc = make_service(executor)
        task1 = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1], params={},
        )
        await svc.wait_completed(task1.id)
        await test_db.refresh(task1)
        assert task1.status in ("success", "failed", "partial", "cancelled")

        task2 = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1], params={},
        )
        assert task2.id != task1.id
        await svc.wait_completed(task2.id)
