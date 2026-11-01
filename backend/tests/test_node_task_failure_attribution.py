"""节点任务失败归因测试（openspec: node-task-ux-optimization 第 1 组）。

背景：真实失败（rc≠0）此前不落任何中文原因——`_ansible_false_success_error`
只在 rc==0 时被调用，rc≠0 且 stderr 为空时前端只看到「失败」两字与空原因。
本文件钉死：归因函数、落库字段、中断恢复、汇总载荷与列表端点单次附加查询。
"""

import pytest
from sqlalchemy import event, select
from unittest.mock import patch

from app.models.node_task import NodeTask, NodeTaskItem
from app.services import ansible_service


# ── 夹具：复用 tests/test_node_task_service.py 的构造方式 ──────────────


def _session_factory(test_db):
    """返回与 test_db 同引擎的会话工厂（每个节点独立会话，避免并发写同一 session）。"""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    engine = test_db.bind
    maker = async_sessionmaker(engine, class_=type(test_db), expire_on_commit=False)
    return maker


@pytest.fixture
def make_service(test_db):
    """构造绑定隔离库 + 假 executor 的 NodeTaskService（同既有测试写法）。"""
    from app.services.node_task_service import NodeTaskService

    services = []

    def _make(executor, semaphore=None):
        svc = NodeTaskService(
            _ansible=None,  # 引擎不得触碰真实 ansible
            executor=executor,
            semaphore=semaphore,
            db_factory=lambda: _session_factory(test_db)(),
        )
        services.append(svc)
        return svc

    yield _make

    for svc in services:
        svc.shutdown_sync()


async def _load_items(test_db, task_id: int) -> list[NodeTaskItem]:
    rows = await test_db.execute(
        select(NodeTaskItem)
        .where(NodeTaskItem.task_id == task_id)
        .order_by(NodeTaskItem.id)
        .execution_options(populate_existing=True)
    )
    return list(rows.scalars().all())


# ── 1. 归因函数 ────────────────────────────────────────────────────────


class TestClassifyAnsibleFailure:
    """按优先级把 ansible 输出（ANSI/英文文本）翻成中文归因。"""

    @pytest.mark.parametrize(
        ("result", "rc", "expected"),
        [
            # 1) 不在主机清单
            (
                {"rc": 4, "stdout": "skipping: no hosts matched", "stderr": ""},
                4,
                "不在 Ansible 主机清单中",
            ),
            (
                {"rc": 0, "stdout": "Could not match supplied host pattern, ignoring: 10.0.0.9"},
                0,
                "不在 Ansible 主机清单中",
            ),
            # 2) 无法连接（含超时类连接错误，优先级高于「执行超时」）
            (
                {"rc": 4, "stdout": "fatal: [10.0.0.9]: UNREACHABLE! => {\"msg\": \"Failed to connect\"}"},
                4,
                "无法连接",
            ),
            ({"rc": 4, "stdout": "", "stderr": '{"unreachable": true}'}, 4, "无法连接"),
            (
                {"rc": 4, "stdout": "Failed to connect to the host via ssh: ..."},
                4,
                "无法连接",
            ),
            (
                {"rc": 4, "stdout": "msg: Connection timed out during banner exchange"},
                4,
                "无法连接",
            ),
            # 3) 认证失败
            ({"rc": 4, "stdout": "Permission denied (publickey,password)."}, 4, "SSH 认证失败"),
            ({"rc": 4, "stdout": "Authentication failed."}, 4, "SSH 认证失败"),
            # 4) 执行超时
            ({"rc": 4, "stdout": "command timed out after 600s"}, 4, "执行超时"),
            ({"rc": 4, "stdout": "Exit code 124", "stderr": ""}, 4, "执行超时"),
            # 5) 磁盘不足
            ({"rc": 1, "stdout": "write error: No space left on device"}, 1, "磁盘空间不足"),
            # 6) 权限不足
            ({"rc": 1, "stdout": "sudo: command not found"}, 1, "缺少必要权限"),
            ({"rc": 1, "stdout": "sudo: a password is required"}, 1, "缺少必要权限"),
            # 7) 兜底：rc 非 0 且非 None
            ({"rc": 4, "stdout": "some unexpected noise", "stderr": ""}, 4, "执行失败（返回码 4）"),
        ],
    )
    def test_classifies_known_failure_shapes(self, result, rc, expected):
        msg = ansible_service.classify_ansible_failure(result, "10.0.0.9", rc=rc)
        assert msg is not None
        assert expected in msg
        # 文案必须指明节点 IP，便于前端首屏直接展示
        assert "10.0.0.9" in msg

    @pytest.mark.parametrize("rc", [0, None])
    def test_returns_none_when_no_marker_and_rc_is_not_failure(self, rc):
        """rc==0（或未知）且无任何失败标记 → 无归因，不得凭空造原因。"""
        assert ansible_service.classify_ansible_failure({"stdout": "", "stderr": ""}, "10.0.0.9", rc=rc) is None

    def test_rc_defaults_to_result_rc(self):
        """未显式传 rc 时取 result['rc']。"""
        result = {"rc": 3, "stdout": "boom", "stderr": ""}
        assert "返回码 3" in (ansible_service.classify_ansible_failure(result, "10.0.0.9") or "")

    def test_connection_timeout_wins_over_generic_timeout(self):
        """'connection timed out' 必须先命中「无法连接」，不得落到「执行超时」。"""
        result = {"rc": 4, "stdout": "Failed to connect: connection timed out"}
        msg = ansible_service.classify_ansible_failure(result, "10.0.0.9", rc=4) or ""
        assert "无法连接" in msg
        assert "执行超时" not in msg

    def test_auth_failure_wins_over_unreachable(self):
        """ansible 的认证失败是**包在 UNREACHABLE! 里**的：两个标记同时出现时必须报认证失败。

        真实输出形如：``fatal: [ip]: UNREACHABLE! => {"msg": "Failed to connect to
        the host via ssh: root@ip: Permission denied (publickey,password).",
        "unreachable": true}``——若先命中 unreachable，用户会被引去查网络与 22 端口，
        而真正要改的是清单里的密码/密钥。
        """
        result = {
            "rc": 4,
            "stdout": (
                'fatal: [10.0.0.9]: UNREACHABLE! => {"changed": false, "msg": '
                '"Failed to connect to the host via ssh: root@10.0.0.9: '
                'Permission denied (publickey,password).", "unreachable": true}'
            ),
        }
        msg = ansible_service.classify_ansible_failure(result, "10.0.0.9", rc=4) or ""
        assert "认证失败" in msg
        assert "无法连接" not in msg

    def test_scans_shell_stdout_too(self):
        """软件查询等腿把结果放在 shell_stdout，归因同样要覆盖。"""
        result = {"rc": 1, "shell_stdout": "No space left on device"}
        assert "磁盘空间不足" in (ansible_service.classify_ansible_failure(result, "10.0.0.9", rc=1) or "")

    def test_legacy_false_success_wrapper_keeps_rc0_semantics(self):
        """旧名 _ansible_false_success_error 语义不变：rc=0 场景无命中返回 None。"""
        assert ansible_service._ansible_false_success_error({"rc": 0, "stdout": "", "stderr": ""}, "10.0.0.9") is None
        hit = ansible_service._ansible_false_success_error({"rc": 0, "stdout": "no hosts matched"}, "10.0.0.9")
        assert hit is not None and "主机清单" in hit


# ── 2. _run_item 落库归因 ──────────────────────────────────────────────


class TestRunItemAttribution:
    @pytest.mark.asyncio
    async def test_rc4_unreachable_records_chinese_reason_and_backfills_stderr(
        self, test_db, make_service
    ):
        """任务 #11 实况：rc=4、stderr 空、原因只在 stdout 的 UNREACHABLE 文本里。"""

        async def executor(node, item, params, cancel_event, on_log):
            return {
                "rc": 4,
                "status": "failed",
                "stdout": (
                    "fatal: [10.0.0.9]: UNREACHABLE! => {\"changed\": false, "
                    "\"msg\": \"Failed to connect to the host via ssh: ssh: connect to host "
                    "10.0.0.9 port 22: Connection timed out\"}"
                ),
                "stderr": "",
            }

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[9],
            params={}, node_snapshots={9: ("10.0.0.9", "n9")},
        )
        await svc.wait_completed(task.id)

        items = await _load_items(test_db, task.id)
        assert len(items) == 1
        item = items[0]
        assert item.status == "failed"
        assert item.failure_reason, "rc≠0 的真实失败必须落中文归因"
        assert "无法连接" in item.failure_reason
        # stderr 原本为空 → 回填同一归因文案，兼容旧前端「原因」列
        assert item.stderr == item.failure_reason

    @pytest.mark.asyncio
    async def test_nonempty_stderr_is_preserved(self, test_db, make_service):
        """有真实 stderr 时不得被归因文案覆盖（保留原始诊断信息）。"""

        async def executor(node, item, params, cancel_event, on_log):
            return {"rc": 2, "status": "failed", "stdout": "", "stderr": "real diagnostics"}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[9],
            params={}, node_snapshots={9: ("10.0.0.9", "n9")},
        )
        await svc.wait_completed(task.id)

        item = (await _load_items(test_db, task.id))[0]
        assert item.stderr == "real diagnostics"
        assert item.failure_reason and "返回码 2" in item.failure_reason

    @pytest.mark.asyncio
    async def test_success_item_has_no_failure_reason(self, test_db, make_service):
        async def executor(node, item, params, cancel_event, on_log):
            return {"rc": 0, "status": "successful", "stdout": "ok", "stderr": ""}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[9],
            params={}, node_snapshots={9: ("10.0.0.9", "n9")},
        )
        await svc.wait_completed(task.id)

        item = (await _load_items(test_db, task.id))[0]
        assert item.status == "success"
        assert item.failure_reason is None

    @pytest.mark.asyncio
    async def test_false_success_keeps_reason_too(self, test_db, make_service):
        """rc=0 假成功（节点不在清单）也要落归因（stderr 已回填同一文案）。"""

        async def executor(node, item, params, cancel_event, on_log):
            return {"rc": 0, "status": "successful", "stdout": "skipping: no hosts matched", "stderr": ""}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[9],
            params={}, node_snapshots={9: ("10.0.0.9", "n9")},
        )
        await svc.wait_completed(task.id)

        item = (await _load_items(test_db, task.id))[0]
        assert item.status == "failed"
        assert item.failure_reason and "主机清单" in item.failure_reason
        assert item.stderr == item.failure_reason


# ── 3. 异常兜底分支 ────────────────────────────────────────────────────


class TestExecutorExceptionFallback:
    @pytest.mark.asyncio
    async def test_executor_exception_records_reason(self, test_db, make_service):
        """executor 抛异常时（无 stderr 可落）必须写「执行异常」原因。"""

        async def executor(node, item, params, cancel_event, on_log):
            raise RuntimeError("boom")

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[9],
            params={}, node_snapshots={9: ("10.0.0.9", "n9")},
        )
        await svc.wait_completed(task.id)

        item = (await _load_items(test_db, task.id))[0]
        assert item.status == "failed"
        assert item.failure_reason, "异常兜底不得留空原因"
        assert "执行异常" in item.failure_reason
        assert "boom" in item.failure_reason

    @pytest.mark.asyncio
    async def test_executor_exception_reason_truncated(self, test_db, make_service):
        """异常文本超长时截断到 500 字符，避免落库天文数字。"""

        async def executor(node, item, params, cancel_event, on_log):
            raise RuntimeError("x" * 2000)

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[9],
            params={}, node_snapshots={9: ("10.0.0.9", "n9")},
        )
        await svc.wait_completed(task.id)

        item = (await _load_items(test_db, task.id))[0]
        assert item.failure_reason is not None
        assert len(item.failure_reason) <= 500


# ── 4. 重启中断恢复 ────────────────────────────────────────────────────


class TestRecoverInterrupted:
    @pytest.mark.asyncio
    async def test_incomplete_items_get_interrupted_reason(self, test_db, test_db_factory):
        """进程重启把 running/pending 任务改判 failed 时，未完成子项要写明中断原因。"""
        from app.services.node_task_service import recover_interrupted_tasks

        task = NodeTask(cluster_id=1, task_type="start", status="running", total_nodes=2)
        task.set_params({})
        test_db.add(task)
        await test_db.commit()
        await test_db.refresh(task)

        test_db.add_all([
            NodeTaskItem(task_id=task.id, node_id=1, ip="10.0.0.1", status="running"),
            NodeTaskItem(task_id=task.id, node_id=2, ip="10.0.0.2", status="pending"),
            NodeTaskItem(task_id=task.id, node_id=3, ip="10.0.0.3", status="success", rc=0),
        ])
        await test_db.commit()

        # recover_interrupted_tasks 内部自建会话（from app.core.database import AsyncSessionLocal），
        # 测试里指向隔离库的会话工厂。
        with patch("app.core.database.AsyncSessionLocal", test_db_factory):
            await recover_interrupted_tasks()

        items = await _load_items(test_db, task.id)
        by_node = {i.node_id: i for i in items}
        assert by_node[1].status == "failed", "遗留 running 子项必须改判 failed"
        assert by_node[2].status == "failed", "遗留 pending 子项必须改判 failed"
        assert by_node[1].failure_reason == "进程重启中断，任务未完成"
        assert by_node[2].failure_reason == "进程重启中断，任务未完成"
        assert by_node[1].stderr == "进程重启中断，任务未完成", "空 stderr 一并回填"
        assert by_node[3].failure_reason is None, "已成功子项不得被改写"


# ── 5. 汇总载荷 ────────────────────────────────────────────────────────


def _mk_item(node_id: int, ip: str, reason: str | None, status: str = "failed") -> NodeTaskItem:
    return NodeTaskItem(
        id=node_id, task_id=1, node_id=node_id, ip=ip, status=status,
        rc=-1 if status == "failed" else 0, failure_reason=reason,
    )


def _mk_task(total: int = 4) -> NodeTask:
    return NodeTask(
        id=1, cluster_id=1, task_type="start", status="failed",
        total_nodes=total, success_nodes=0, failed_nodes=total, cancelled_nodes=0,
    )


class TestFailureSummary:
    """摘要口径：短标签统一带「节点」前缀 + 计数，多条原因用「；」连接。

    例：`3 台节点不在 Ansible 主机清单中；1 台节点 SSH 认证失败`。
    """

    def test_summarize_groups_by_reason_with_counts(self):
        from app.api.v1.node_tasks import _summarize_failures

        items = [
            _mk_item(1, "10.0.0.1", "节点 10.0.0.1 不在 Ansible 主机清单中，请在 inventory/host 文件中添加该节点的 SSH 连接信息"),
            _mk_item(2, "10.0.0.2", "节点 10.0.0.2 不在 Ansible 主机清单中，请在 inventory/host 文件中添加该节点的 SSH 连接信息"),
            _mk_item(3, "10.0.0.3", "节点 10.0.0.3 不在 Ansible 主机清单中，请在 inventory/host 文件中添加该节点的 SSH 连接信息"),
            _mk_item(4, "10.0.0.4", "节点 10.0.0.4 SSH 认证失败，请检查免密登录或清单中的密码"),
        ]
        summary = _summarize_failures(items)
        assert summary == "3 台节点不在 Ansible 主机清单中；1 台节点 SSH 认证失败"

    def test_summarize_cancelled_reads_naturally(self):
        """取消归因的摘要不得读成「1 台节点任务已被取消」。

        子项取消的归因原文是「任务已被取消，执行已中断」（主语是任务），
        套上「{n} 台节点」前缀后会变成「1 台节点任务已被取消」——同句出现两个
        「任务」、语义拗口。取消是任务级结果，标签应直接是「已取消」。
        """
        from app.api.v1.node_tasks import _summarize_failures

        items = [_mk_item(1, "10.0.0.1", "任务已被取消，执行已中断")]
        assert _summarize_failures(items) == "1 台已取消"

    def test_summarize_returns_none_without_reasons(self):
        from app.api.v1.node_tasks import _summarize_failures

        assert _summarize_failures([]) is None
        assert _summarize_failures([_mk_item(1, "10.0.0.1", None, status="success")]) is None

    def test_summarize_collapses_exception_variants(self):
        """异常兜底原因带可变文本（异常消息），同类要合并成一个计数。"""
        from app.api.v1.node_tasks import _summarize_failures

        items = [
            _mk_item(1, "10.0.0.1", "节点 10.0.0.1 执行异常：boom A"),
            _mk_item(2, "10.0.0.2", "节点 10.0.0.2 执行异常：boom B"),
        ]
        assert _summarize_failures(items) == "2 台节点执行异常"

    def test_to_task_dict_includes_summary_when_items_given(self):
        from app.api.v1.node_tasks import _to_task_dict

        items = [
            _mk_item(1, "10.0.0.1", "节点 10.0.0.1 无法连接，请检查网络与 SSH 服务（22 端口）"),
            _mk_item(2, "10.0.0.2", "节点 10.0.0.2 执行超时，请检查命令或调大超时时间"),
        ]
        data = _to_task_dict(_mk_task(2), items)
        assert data["failure_summary"] == "1 台节点无法连接；1 台节点执行超时"
        assert data["items"][0]["failure_reason"].startswith("节点 10.0.0.1 无法连接")

    def test_to_task_dict_accepts_precomputed_summary(self):
        """列表端点批量聚合后传入，避免 N+1 查询。"""
        from app.api.v1.node_tasks import _to_task_dict

        data = _to_task_dict(_mk_task(2), failure_summary="2 台无法连接")
        assert data["failure_summary"] == "2 台无法连接"
        assert "items" not in data


class TestListApiFailureSummary:
    @pytest.fixture
    def client(self, test_db, test_db_factory):
        import asyncio

        from app.main import app
        from app.core.database import get_db
        from app.core.security import hash_password
        from app.models.user import User
        from tests.api_helpers import AuthedTestClient, isolated_app_lifespan

        async def override_get_db():
            async with test_db_factory() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db

        async def _seed_user():
            if await test_db.get(User, 1) is None:
                test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                                 role="admin", status=1))
                await test_db.commit()

        asyncio.run(_seed_user())

        with isolated_app_lifespan(), AuthedTestClient(app) as c:
            yield c
        app.dependency_overrides.clear()

    @staticmethod
    async def _seed_two_tasks(test_db) -> list[int]:
        """两条任务：A 三台未在清单、B 一台认证失败 + 一台成功。"""
        task_a = NodeTask(cluster_id=1, task_type="start", status="failed", total_nodes=3, failed_nodes=3)
        task_a.set_params({})
        task_b = NodeTask(cluster_id=1, task_type="start", status="partial", total_nodes=2,
                          success_nodes=1, failed_nodes=1)
        task_b.set_params({})
        test_db.add_all([task_a, task_b])
        await test_db.commit()
        await test_db.refresh(task_a)
        await test_db.refresh(task_b)

        test_db.add_all([
            NodeTaskItem(task_id=task_a.id, node_id=1, ip="10.0.0.1", status="failed", rc=4,
                         failure_reason="节点 10.0.0.1 不在 Ansible 主机清单中，请在 inventory/host 文件中添加该节点的 SSH 连接信息"),
            NodeTaskItem(task_id=task_a.id, node_id=2, ip="10.0.0.2", status="failed", rc=4,
                         failure_reason="节点 10.0.0.2 不在 Ansible 主机清单中，请在 inventory/host 文件中添加该节点的 SSH 连接信息"),
            NodeTaskItem(task_id=task_a.id, node_id=3, ip="10.0.0.3", status="failed", rc=4,
                         failure_reason="节点 10.0.0.3 不在 Ansible 主机清单中，请在 inventory/host 文件中添加该节点的 SSH 连接信息"),
            NodeTaskItem(task_id=task_b.id, node_id=4, ip="10.0.0.4", status="failed", rc=4,
                         failure_reason="节点 10.0.0.4 SSH 认证失败，请检查免密登录或清单中的密码"),
            NodeTaskItem(task_id=task_b.id, node_id=5, ip="10.0.0.5", status="success", rc=0),
        ])
        await test_db.commit()
        return [task_a.id, task_b.id]

    def test_list_all_tasks_returns_failure_summary(self, client, test_db):
        import asyncio

        asyncio.run(self._seed_two_tasks(test_db))
        resp = client.get("/api/v1/node-tasks")
        assert resp.status_code == 200
        items = {t["id"]: t for t in resp.json()["items"]}
        assert "failure_summary" in next(iter(items.values()))
        summaries = [t["failure_summary"] for t in items.values()]
        assert "3 台节点不在 Ansible 主机清单中" in summaries
        assert "1 台节点 SSH 认证失败" in summaries
        # 无失败原因的任务 → None（而不是空串）
        for t in items.values():
            if t["failed_nodes"] == 0:
                assert t.get("failure_summary") is None

    def test_list_cluster_tasks_returns_failure_summary(self, client, test_db):
        import asyncio

        task_ids = asyncio.run(self._seed_two_tasks(test_db))
        resp = client.get("/api/v1/clusters/1/node-tasks")
        assert resp.status_code == 200
        items = {t["id"]: t for t in resp.json()["items"]}
        assert set(task_ids).issubset(items)
        assert items[task_ids[0]]["failure_summary"] == "3 台节点不在 Ansible 主机清单中"

    def test_list_endpoint_queries_items_once(self, client, test_db):
        """列表端点只允许一次附加查询（禁止逐任务 N+1）。"""
        import asyncio

        asyncio.run(self._seed_two_tasks(test_db))
        statements: list[str] = []

        def _before(conn, cursor, statement, params, context, executemany):
            if "install_task_node" in statement.lower() and statement.lower().lstrip().startswith("select"):
                statements.append(statement)

        engine = test_db.bind.sync_engine
        event.listen(engine, "before_cursor_execute", _before)
        try:
            resp = client.get("/api/v1/node-tasks")
        finally:
            event.remove(engine, "before_cursor_execute", _before)

        assert resp.status_code == 200
        assert len(statements) == 1, f"子项原因查询次数应为 1，实际 {len(statements)}: {statements}"
