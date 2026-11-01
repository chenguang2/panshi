"""真实取消通道（openspec node-task-center D3/D4）。

既有用例只能证明「取消标志置位后不再启动新子项」，杀不掉正在跑的进程：
``_run_subprocess`` / ``_run_subprocess_stream`` 没有 start_new_session，也没有
任何进程注册表，SSH 子进程（软件查询降级、脚本执行、install_openresty 第二阶段）
在用户点「取消」后继续跑到自然结束。

本文件钉住四组契约：
1. 真进程 kill：``_run_subprocess_stream`` 收到 cancel_event 后必须中断子进程；
2. 参数透传：nginx_cmd / statistic / software_check 的 ansible 腿与 SSH 腿都把
   cancel_event 继续往下传（否则上层取消对这两类任务无效）；
3. 子项状态：取消中断的子项落 ``cancelled``（而非 failed），已完成子项保持 success；
4. 取消请求持久化：``cancel_requested_at`` 落库（幂等）+ API 载荷暴露
   ``cancel_requested``/``cancel_requested_at``。
"""

import asyncio
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.models.node_task import NodeTask, NodeTaskItem
from app.services import ansible_service
from app.services import node_task_service as nts_mod
from app.services.node_task_service import NodeTaskService


def _session_factory(test_db):
    from sqlalchemy.ext.asyncio import async_sessionmaker

    engine = test_db.bind
    return async_sessionmaker(engine, class_=type(test_db), expire_on_commit=False)


@pytest.fixture
def make_service(test_db):
    from app.services.node_task_service import NodeTaskService as _Svc

    services = []

    def _make(executor):
        svc = _Svc(
            _ansible=None,
            executor=executor,
            db_factory=lambda: _session_factory(test_db)(),
        )
        services.append(svc)
        return svc

    yield _make
    for svc in services:
        svc.shutdown_sync()


def _ansible_with_stub(tmp_path):
    """真实 AnsibleRunnerService 实例 + 桩 run_playbook（记录 kwargs）。"""
    svc = ansible_service.AnsibleRunnerService(private_data_dir=str(tmp_path))
    svc.run_playbook = AsyncMock(return_value={"rc": 0, "status": "successful", "stdout": "", "stderr": ""})
    return svc


# ── 1. 真进程 kill ──────────────────────────────────────────────────────


class TestRealProcessKill:
    @pytest.mark.timeout(20)
    def test_stream_subprocess_is_killed_on_cancel(self):
        """sleep 30 的子进程必须被取消打断：5 秒内返回且 rc != 0。"""

        async def run():
            ev = asyncio.Event()

            async def cancel_soon():
                await asyncio.sleep(0.2)
                ev.set()

            asyncio.ensure_future(cancel_soon())
            return await asyncio.wait_for(
                ansible_service._run_subprocess_stream(["sleep", "30"], cancel_event=ev),
                timeout=5,
            )

        rc, stdout, stderr = asyncio.run(run())

        assert rc != 0, "被取消的子进程 rc 不应为 0（成功）"
        assert "已按用户请求取消执行" in stderr

    @pytest.mark.timeout(20)
    def test_plain_subprocess_is_killed_on_cancel(self):
        """非流式分支同样要能被取消（communicate 阻塞时也要打断）。"""

        async def run():
            ev = asyncio.Event()

            async def cancel_soon():
                await asyncio.sleep(0.2)
                ev.set()

            asyncio.ensure_future(cancel_soon())
            return await asyncio.wait_for(
                ansible_service._run_subprocess(["sleep", "30"], cancel_event=ev),
                timeout=5,
            )

        rc, _stdout, stderr = asyncio.run(run())

        assert rc != 0
        assert "已按用户请求取消执行" in stderr

    @pytest.mark.timeout(20)
    def test_no_cancel_event_keeps_old_behaviour(self):
        """不传 cancel_event 时行为不变（rc=0、输出原样）。"""

        async def run():
            return await ansible_service._run_subprocess(["echo", "hello"])

        rc, stdout, _stderr = asyncio.run(run())
        assert rc == 0
        assert stdout == "hello"

    @pytest.mark.timeout(20)
    def test_ssh_fallback_does_not_retry_after_cancel(self, monkeypatch):
        """取消后不得再发起 password 降级（第二轮）尝试。"""
        calls: list[tuple] = []

        async def fake_run_subprocess(cmd, env_extra=None, cancel_event=None):
            calls.append((cmd, env_extra))
            return 255, "", "Permission denied"

        monkeypatch.setattr(ansible_service, "_run_subprocess", fake_run_subprocess)
        monkeypatch.setattr(ansible_service, "_sshpass_available", lambda: True)

        async def run():
            ev = asyncio.Event()
            ev.set()
            return await ansible_service._run_ssh_with_fallback(
                "10.0.0.9", "root", "uptime", password="secret", cancel_event=ev,
            )

        rc, _stdout, stderr = asyncio.run(run())

        assert rc != 0
        assert len(calls) == 1, "取消后不应发起第二轮密码认证"
        assert "已按用户请求取消执行" in stderr


# ── 2. cancel_event 参数透传 ────────────────────────────────────────────


class TestCancelPassthrough:
    @pytest.mark.asyncio
    async def test_nginx_cmd_passes_cancel_event(self, tmp_path):
        ansible = _ansible_with_stub(tmp_path)
        ev = asyncio.Event()
        sink = []

        await ansible.nginx_cmd(
            "10.0.0.5", "start", "/work/edge", "9180", cancel_event=ev, on_progress=sink.append,
        )

        kwargs = ansible.run_playbook.await_args.kwargs
        assert kwargs.get("cancel_event") is ev
        assert kwargs.get("on_progress") == sink.append, "nginx_cmd 应顺带产出实时日志"

    @pytest.mark.asyncio
    async def test_statistic_passes_cancel_event(self, tmp_path):
        ansible = _ansible_with_stub(tmp_path)
        ev = asyncio.Event()
        sink = []

        await ansible.statistic(
            "10.0.0.5", "/work/edge", "9180", cancel_event=ev, on_progress=sink.append,
        )

        kwargs = ansible.run_playbook.await_args.kwargs
        assert kwargs.get("cancel_event") is ev
        assert kwargs.get("on_progress") == sink.append

    @pytest.mark.asyncio
    async def test_software_check_passes_cancel_event_to_ansible_and_ssh(
        self, monkeypatch, tmp_path
    ):
        """ansible 腿与 SSH 降级腿都必须接到 cancel_event。"""
        ansible = _ansible_with_stub(tmp_path)
        ansible.run_playbook = AsyncMock(
            return_value={"rc": 1, "status": "failed", "shell_stdout": "", "stderr": "boom"}
        )
        ssh_calls: list[dict] = []

        async def fake_ssh(ip, user, cmd, on_line=None, port=None, cancel_event=None, **_kw):
            ssh_calls.append({"cancel_event": cancel_event})
            return 0, "", ""

        monkeypatch.setattr(ansible_service, "_run_ssh_with_fallback", fake_ssh)
        monkeypatch.setattr(ansible_service, "get_ssh_user", lambda ip: "root")
        monkeypatch.setattr(ansible_service, "resolve_ssh_port", lambda node: 22)
        monkeypatch.setattr(nts_mod, "PRIVATE_DATA_DIR", str(tmp_path), raising=False)

        script = tmp_path / "cmd_scripts" / "software_check.sh"
        script.parent.mkdir(parents=True, exist_ok=True)
        script.write_text("echo OK", encoding="utf-8")
        monkeypatch.setattr(
            nts_mod, "_software_check_ssh_command", lambda cmd_str, content: "echo OK"
        )

        node = SimpleNamespace(ip="10.0.0.5", management_port=9180, edge_path="/work/edge")
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        ev = asyncio.Event()

        await svc._software_check_node(node, "nginx", lambda e: None, cancel_event=ev)

        assert ansible.run_playbook.await_args.kwargs.get("cancel_event") is ev
        assert ssh_calls and ssh_calls[0]["cancel_event"] is ev

    @pytest.mark.asyncio
    async def test_software_check_skips_ssh_fallback_when_cancelled(self, monkeypatch, tmp_path):
        """已取消时不得再发起 SSH 降级（否则取消等于没取消）。"""
        ansible = _ansible_with_stub(tmp_path)
        ansible.run_playbook = AsyncMock(
            return_value={"rc": 1, "status": "failed", "shell_stdout": "", "stderr": "boom"}
        )
        ssh_calls: list = []

        async def fake_ssh(*a, **kw):
            ssh_calls.append(kw)
            return 0, "", ""

        monkeypatch.setattr(ansible_service, "_run_ssh_with_fallback", fake_ssh)
        monkeypatch.setattr(ansible_service, "get_ssh_user", lambda ip: "root")
        monkeypatch.setattr(ansible_service, "resolve_ssh_port", lambda node: 22)

        node = SimpleNamespace(ip="10.0.0.5", management_port=9180, edge_path="/work/edge")
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        ev = asyncio.Event()
        ev.set()

        result = await svc._software_check_node(node, "nginx", lambda e: None, cancel_event=ev)

        assert ssh_calls == [], "取消后不应降级走 SSH"
        assert result["rc"] != 0
        assert "已按用户请求取消执行" in str(result.get("stderr", ""))

    @pytest.mark.asyncio
    async def test_install_openresty_ssh_passes_cancel_event(self, monkeypatch):
        seen: list[dict] = []

        async def fake_ssh(ip, user, cmd, on_line=None, port=None, cancel_event=None, **_kw):
            seen.append({"cancel_event": cancel_event})
            return 0, "", ""

        monkeypatch.setattr(ansible_service, "_run_ssh_with_fallback", fake_ssh)
        monkeypatch.setattr(ansible_service, "get_ssh_user", lambda ip: "root")
        monkeypatch.setattr(ansible_service, "resolve_ssh_port", lambda node: 22)

        node = SimpleNamespace(ip="10.0.0.5", management_port=9180, edge_path="/work/edge")
        ev = asyncio.Event()
        await nts_mod._install_openresty_ssh(
            node, "/work/edge", lambda e: None, cancel_event=ev
        )

        assert seen and seen[0]["cancel_event"] is ev


# ── 3. 子项状态：取消 = cancelled ───────────────────────────────────────


class TestCancelledItemStatus:
    @pytest.mark.asyncio
    async def test_cancelled_item_marked_cancelled_not_failed(self, test_db, make_service):
        """中途取消 → 中断的子项落 cancelled（原因含「取消」），已完成者保持 success。"""
        started = asyncio.Event()
        release = asyncio.Event()

        async def executor(node, item, params, cancel_event, on_log):
            if node == 1:
                started.set()
                await release.wait()
                return {"rc": 0, "status": "successful"}
            # nodes 2/3：等取消标志后返回失败 rc（模拟 run_playbook 被 SIGKILL）
            for _ in range(200):
                if cancel_event is not None and cancel_event.is_set():
                    return {"rc": -9, "status": "failed", "stderr": "Killed"}
                await asyncio.sleep(0.01)
            return {"rc": 0}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1, 2, 3], params={},
        )
        await started.wait()
        await svc.cancel_task(task.id, db=test_db)
        release.set()
        await svc.wait_completed(task.id)

        items = (
            await test_db.execute(
                select(NodeTaskItem)
                .where(NodeTaskItem.task_id == task.id)
                .execution_options(populate_existing=True)
            )
        ).scalars().all()
        statuses = {i.node_id: i.status for i in items}

        assert statuses[1] == "success", "已完成的子项不得被取消改写"
        assert statuses[2] in ("cancelled", "skipped")
        assert statuses[3] in ("cancelled", "skipped")

        cancelled_items = [i for i in items if i.status == "cancelled"]
        assert cancelled_items, "取消中断的子项必须落 cancelled（此前恒为 failed）"
        for i in cancelled_items:
            assert "取消" in (i.failure_reason or "")

        await test_db.refresh(task)
        assert task.cancelled_nodes == len(cancelled_items)
        assert task.success_nodes == 1

    @pytest.mark.asyncio
    async def test_distribute_batch_records_cancelled(self, test_db, monkeypatch, tmp_path):
        """批量分发腿（distribute_file）同样要落 cancelled。

        它是与单节点腿并列的第二条执行路径：run_playbook 早已接 cancel，
        取消时子项此前仍按 failed 落库，导致「取消」与「失败」在批量分发任务里
        分不开（D3 要求取消中断的子项落 cancelled）。
        """
        from app.config import script_upload as su_mod

        monkeypatch.setattr(nts_mod, "TASK_SCRIPTS_DIR", tmp_path)
        monkeypatch.setattr(su_mod, "TASK_SCRIPTS_DIR", tmp_path)

        task = NodeTask(cluster_id=1, task_type="distribute_file", status="running")
        task.set_params(
            {"srcpath": "temp/up-1", "destpath": "/etc/app/", "srcfilename": "app.yaml"}
        )
        test_db.add(task)
        await test_db.commit()
        await test_db.refresh(task)

        items = []
        for idx, ip in enumerate(["10.9.9.1", "10.9.9.2"], start=1):
            item = NodeTaskItem(
                task_id=task.id, node_id=idx, ip=ip, status="running",
            )
            item.set_logs([])
            test_db.add(item)
            items.append(item)
        await test_db.commit()

        # 落地源文件必须存在（批量腿前置检查），取消发生在 run_playbook 内
        (tmp_path / str(task.id)).mkdir(parents=True, exist_ok=True)
        (tmp_path / str(task.id) / "up-1").write_text("k: v\n", encoding="utf-8")

        run_playbook = AsyncMock(
            return_value={"rc": -15, "stdout": "", "stderr": "已按用户请求取消执行", "command": ""}
        )
        svc = NodeTaskService(_ansible=SimpleNamespace(run_playbook=run_playbook))
        cancel_flag = asyncio.Event()
        cancel_flag.set()

        await svc._execute_distribute_batch(test_db, task, items, task.get_params(), cancel_flag)

        for item in items:
            assert item.status == "cancelled", f"{item.ip} 取消中断必须落 cancelled，实际 {item.status}"
            assert "取消" in (item.failure_reason or "")


# ── 4. 取消请求持久化 ───────────────────────────────────────────────────


class TestCancelRequestPersisted:
    @pytest.mark.asyncio
    async def test_cancel_task_persists_requested_at_idempotently(self, test_db, make_service):
        started = asyncio.Event()
        release = asyncio.Event()

        async def executor(node, item, params, cancel_event, on_log):
            started.set()
            await release.wait()
            return {"rc": 0}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1], params={},
        )
        await started.wait()
        await svc.cancel_task(task.id, db=test_db)
        await test_db.refresh(task)
        first = task.cancel_requested_at
        assert first is not None, "取消请求必须落库（刷新页面后仍显示「取消中」）"

        await asyncio.sleep(0.02)
        await svc.cancel_task(task.id, db=test_db)
        await test_db.refresh(task)
        assert task.cancel_requested_at == first, "重复取消不得覆盖首次请求时间（幂等）"

        release.set()
        await svc.wait_completed(task.id)

    @pytest.mark.asyncio
    async def test_cancel_task_broadcasts_task_update(self, test_db, make_service):
        started = asyncio.Event()
        release = asyncio.Event()

        async def executor(node, item, params, cancel_event, on_log):
            started.set()
            await release.wait()
            return {"rc": 0}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[1], params={},
        )
        q = svc.subscribe(task.id)
        await started.wait()
        await svc.cancel_task(task.id, db=test_db)

        events = []
        while True:
            try:
                events.append(q.get_nowait())
            except Exception:
                break
        assert any(
            e.get("type") == "task_update" and e.get("cancel_requested") is True
            for e in events
        ), f"取消必须广播 task_update(cancel_requested)，实际: {events}"
        svc.unsubscribe(task.id, q)
        release.set()
        await svc.wait_completed(task.id)


# ── 5. API 载荷 ────────────────────────────────────────────────────────


class TestCancelApiPayload:
    @pytest.fixture
    def seeds(self, test_db_factory):
        """在独立短生命周期会话里播种（PG 下 asyncpg 连接不可跨 loop 复用）。"""
        import asyncio as _asyncio
        from app.models.user import User
        from app.core.security import hash_password

        async def _seed_user():
            async with test_db_factory() as session:
                if await session.get(User, 1) is None:
                    session.add(
                        User(
                            id=1, username="api_user",
                            password_hash=hash_password("password123"),
                            role="admin", status=1,
                        )
                    )
                    await session.commit()

        _asyncio.run(_seed_user())

        def _seed_task(cancel_requested: bool = False) -> int:
            async def _seed():
                async with test_db_factory() as session:
                    task = NodeTask(cluster_id=1, task_type="start", status="running")
                    task.set_params({})
                    if cancel_requested:
                        task.cancel_requested_at = datetime.utcnow()
                    session.add(task)
                    await session.commit()
                    await session.refresh(task)
                    return task.id

            return _asyncio.run(_seed())

        return _seed_task

    @pytest.fixture
    def client(self, test_db_factory, seeds):
        from tests.api_helpers import AuthedTestClient, isolated_app_lifespan
        from app.main import app
        from app.core.database import get_db

        async def override_get_db():
            async with test_db_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db

        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            yield c
        app.dependency_overrides.clear()

    def test_detail_exposes_cancel_requested(self, client, seeds):
        task_id = seeds(cancel_requested=True)

        resp = client.get(f"/api/v1/node-tasks/{task_id}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["cancel_requested"] is True
        assert body["cancel_requested_at"]

    def test_detail_cancel_requested_false_by_default(self, client, seeds):
        task_id = seeds()

        resp = client.get(f"/api/v1/node-tasks/{task_id}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["cancel_requested"] is False
        assert body["cancel_requested_at"] is None

    def test_cancel_endpoint_returns_cancel_requested(self, client):
        resp = client.post("/api/v1/node-tasks/9999/cancel")

        assert resp.status_code == 200
        body = resp.json()
        assert body.get("cancel_requested") is True


# ── 6. 取消状态卫生（第 4 组暴露的缺口）─────────────────────────────────


async def _seed_finished_task(test_db, *, status: str, cancel_requested: bool = False):
    """直接播种一个已结束任务 + 一条同名状态子项，返回 (task, item)。"""
    task = NodeTask(cluster_id=1, task_type="start", status=status)
    task.set_params({})
    if cancel_requested:
        task.cancel_requested_at = datetime.utcnow()
    test_db.add(task)
    await test_db.flush()
    item = NodeTaskItem(task_id=task.id, node_id=1, ip="10.0.0.1", status=status)
    item.set_logs([])
    test_db.add(item)
    await test_db.commit()
    await test_db.refresh(task)
    return task, item


class TestCancelStateHygiene:
    @pytest.mark.asyncio
    async def test_retry_clears_cancel_state(self, test_db, make_service):
        """重试必须清取消态：cancel_requested_at 归 None，取消 Event 换新对象。

        旧实现只有 ``flag.clear()``：若 ``_cancel_flags`` 里是别的执行体留下的
        Event（或 clear 因对象替换而失效），新一次执行会在起跑瞬间被判「已取消」。
        """
        task, _item = await _seed_finished_task(
            test_db, status="cancelled", cancel_requested=True,
        )

        async def executor(node, item, params, cancel_event, on_log):
            return {"rc": 0, "status": "success"}

        svc = make_service(executor)
        stale = asyncio.Event()
        stale.set()
        svc._cancel_flags[task.id] = stale

        await svc.retry_task(task.id, db=test_db)

        await test_db.refresh(task)
        assert task.cancel_requested_at is None, "重试后不得残留「取消中」标记"

        flag = svc._cancel_flags.get(task.id)
        assert flag is not None, "重试必须为本次执行准备新的取消 Event"
        assert flag is not stale, "必须替换旧 Event（clear 旧的不足以表达新一次执行）"
        assert flag.is_set() is False, "新 Event 不得处于已置位状态"

        await svc.wait_completed(task.id)
        await test_db.refresh(task)
        assert task.status == "success", "取消态残留会把新一次执行立即判为已取消"

    @pytest.mark.asyncio
    async def test_retry_broadcasts_cancel_requested_false(self, test_db, make_service):
        """重试要广播 task_update(cancel_requested=False)，否则前端一直显示「取消中」。"""
        task, _item = await _seed_finished_task(
            test_db, status="cancelled", cancel_requested=True,
        )

        async def executor(node, item, params, cancel_event, on_log):
            return {"rc": 0, "status": "success"}

        svc = make_service(executor)
        q = svc.subscribe(task.id)
        try:
            await svc.retry_task(task.id, db=test_db)
            await svc.wait_completed(task.id)

            events = []
            while True:
                try:
                    events.append(q.get_nowait())
                except Exception:
                    break
            assert any(
                e.get("type") == "task_update" and e.get("cancel_requested") is False
                for e in events
            ), f"重试必须广播取消态已清除，实际: {events}"
        finally:
            svc.unsubscribe(task.id, q)

    @pytest.mark.asyncio
    async def test_cancel_terminal_task_is_noop(self, test_db, make_service):
        """取消已结束任务不得写 cancel_requested_at（否则列表给已结束任务挂「取消中」）。"""
        task, _item = await _seed_finished_task(test_db, status="success")

        async def executor(node, item, params, cancel_event, on_log):  # pragma: no cover
            return {"rc": 0}

        svc = make_service(executor)
        flag = asyncio.Event()
        svc._cancel_flags[task.id] = flag

        await svc.cancel_task(task.id, db=test_db)

        await test_db.refresh(task)
        assert task.cancel_requested_at is None
        assert flag.is_set() is False, "终态任务无需置取消标志"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", ["success", "failed", "partial", "cancelled"])
    async def test_cancel_noop_for_every_terminal_status(self, test_db, make_service, status):
        """四种终态一致：幂等无副作用（含已取消的任务本身）。"""
        task, _item = await _seed_finished_task(test_db, status=status)
        svc = make_service(None)
        await svc.cancel_task(task.id, db=test_db)
        await test_db.refresh(task)
        assert task.cancel_requested_at is None
