"""节点任务重试守卫 / 证据保留 / 日志上限 / 日志导出。

openspec node-task-ux-optimization 组 4（design D6 / D10）契约：

1. 重试守卫（api + service 双层）：仅终态任务可重试（409），``node_ids``
   必须全部属于该任务（400 并列出无效 id，不静默无操作）。
2. 重试保留证据：``attempt`` +1；旧日志改名为 ``{node_id}.attempt{N}.log``
   留档（旧失败原因追加到留档末尾），活动日志从空开始。
3. 日志行数上限 ``MAX_LOG_LINES``：写满后追加一行截断提示并停止追加，
   磁盘占用有界；``log_line_count`` 只记实际保存行数。
4. 日志导出：单节点 ``?download=true`` 带 ``Content-Disposition``；
   整任务 ``/logs/archive`` 返回 zip（条目 ``{ip}/{filename}`` + ``_missing.txt``）。
"""

import io
import zipfile
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.models.node_task import NodeTask, NodeTaskItem
from app.services import task_log_store


# ── 夹具与辅助 ────────────────────────────────────────────────────────


@pytest.fixture
def log_dir(tmp_path, monkeypatch):
    """把日志根目录指向临时目录，并清空行数缓存（避免跨用例残留）。"""
    monkeypatch.setattr(task_log_store, "_log_dir", tmp_path / "task-logs")
    monkeypatch.setattr(task_log_store, "_line_counts", {})
    return tmp_path / "task-logs"


async def _seed_task(
    session,
    *,
    task_status: str = "failed",
    item_status: str = "failed",
    nodes: tuple[tuple[int, str], ...] = ((1, "10.0.0.1"),),
    failure_reason: str | None = None,
) -> int:
    """造一条任务 + 子项，返回 task_id。"""
    task = NodeTask(
        cluster_id=1,
        task_type="cmd_exec",
        status=task_status,
        total_nodes=len(nodes),
    )
    task.set_params({"cmd": "ls -la /tmp"})
    session.add(task)
    await session.flush()
    for node_id, ip in nodes:
        session.add(
            NodeTaskItem(
                task_id=task.id,
                node_id=node_id,
                ip=ip,
                status=item_status,
                rc=1 if item_status == "failed" else None,
                failure_reason=failure_reason if item_status == "failed" else None,
            )
        )
    await session.commit()
    return task.id


def _patch_service(monkeypatch, fake):
    from app.api.v1 import node_tasks as node_tasks_mod

    monkeypatch.setattr(node_tasks_mod, "get_node_task_service", lambda: fake)


class _FakeService:
    """只记录调用，不真的执行（API 层守卫用例用）。"""

    def __init__(self):
        self.calls: list[tuple] = []

    async def retry_task(self, task_id, node_ids=None, db=None):
        self.calls.append((task_id, node_ids))


# ── 1. 重试守卫（API 层）─────────────────────────────────────────────


class TestRetryGuardApi:
    @pytest.mark.parametrize("status", ["pending", "running"])
    async def test_non_terminal_task_retry_is_rejected(
        self, async_authed_client, isolated_session, monkeypatch, status
    ):
        """running/pending 任务重试 → 409（此前会再起一个执行体覆盖 _running）。"""
        fake = _FakeService()
        _patch_service(monkeypatch, fake)
        async with isolated_session() as s:
            task_id = await _seed_task(
                s, task_status=status, item_status="running", nodes=((1, "10.0.0.1"), (2, "10.0.0.2"))
            )

        resp = await async_authed_client.post(f"/api/v1/node-tasks/{task_id}/retry", json={})

        assert resp.status_code == 409, resp.text
        assert "任务仍在执行中" in resp.json()["detail"]
        assert fake.calls == []

    @pytest.mark.parametrize("status", ["success", "failed", "partial", "cancelled"])
    async def test_terminal_task_retry_is_allowed(
        self, async_authed_client, isolated_session, monkeypatch, status
    ):
        """终态任务重试 → 200 且把 node_ids 原样交给 service。"""
        fake = _FakeService()
        _patch_service(monkeypatch, fake)
        async with isolated_session() as s:
            task_id = await _seed_task(s, task_status=status, item_status=status)

        resp = await async_authed_client.post(
            f"/api/v1/node-tasks/{task_id}/retry", json={"node_ids": [1]}
        )

        assert resp.status_code == 200, resp.text
        assert fake.calls == [(task_id, [1])]

    async def test_retry_missing_task_returns_404(self, async_authed_client, monkeypatch):
        fake = _FakeService()
        _patch_service(monkeypatch, fake)

        resp = await async_authed_client.post("/api/v1/node-tasks/999999/retry", json={})

        assert resp.status_code == 404
        assert fake.calls == []

    async def test_node_ids_not_belonging_to_task_is_rejected(
        self, async_authed_client, isolated_session, monkeypatch
    ):
        """node_ids 不属于该任务 → 400 并列出不匹配的 id（不得静默无操作）。"""
        fake = _FakeService()
        _patch_service(monkeypatch, fake)
        async with isolated_session() as s:
            task_id = await _seed_task(s, nodes=((1, "10.0.0.1"), (2, "10.0.0.2")))

        resp = await async_authed_client.post(
            f"/api/v1/node-tasks/{task_id}/retry", json={"node_ids": [1, 777]}
        )

        assert resp.status_code == 400, resp.text
        detail = resp.json()["detail"]
        assert "指定的节点不属于该任务" in detail
        assert "777" in detail
        assert fake.calls == []

    async def test_item_payload_exposes_attempt(self, async_authed_client, isolated_session):
        """子项载荷带 attempt（前端据此展示「第 N 次执行」）。"""
        async with isolated_session() as s:
            task_id = await _seed_task(s)
            item = (
                await s.execute(select(NodeTaskItem).where(NodeTaskItem.task_id == task_id))
            ).scalars().one()
            item.attempt = 2
            await s.commit()

        resp = await async_authed_client.get(f"/api/v1/node-tasks/{task_id}")

        assert resp.status_code == 200, resp.text
        assert resp.json()["items"][0]["attempt"] == 2


# ── 2. 重试保留证据（service 层）─────────────────────────────────────


class TestRetryKeepsEvidence:
    @pytest.fixture
    def make_service(self, isolated_session, log_dir):
        from app.services.node_task_service import NodeTaskService

        services = []

        def _make(new_lines=()):
            async def executor(node_id, item, params, cancel_event, on_log):
                for line in new_lines:
                    on_log({"stdout": line})
                return {"rc": 0, "status": "success"}

            svc = NodeTaskService(_ansible=None, executor=executor, db_factory=isolated_session)
            services.append(svc)
            return svc

        yield _make
        for svc in services:
            svc.shutdown_sync()

    async def test_retry_rotates_old_log_and_bumps_attempt(
        self, make_service, isolated_session, log_dir
    ):
        """重试后：attempt=1、旧日志留档为 attempt0 且含旧输出+旧失败原因、活动日志为空。"""
        reason = "节点 10.0.0.1 无法连接，请检查网络与 SSH 服务（22 端口）"
        async with isolated_session() as s:
            task_id = await _seed_task(s, failure_reason=reason, nodes=((1, "10.0.0.1"),))

        task_log_store.append_line(task_id, 1, "第一次执行的输出")
        task_log_store.append_line(task_id, 1, "ERROR! 连接失败")
        assert "第一次执行的输出" in task_log_store.read_log(task_id, 1)

        svc = make_service()  # 本次执行不产生任何输出
        await svc.retry_task(task_id)
        await svc.wait_completed(task_id, timeout=10)

        async with isolated_session() as s:
            item = (
                await s.execute(
                    select(NodeTaskItem)
                    .where(NodeTaskItem.task_id == task_id)
                    .execution_options(populate_existing=True)
                )
            ).scalars().one()
            assert item.attempt == 1
            # failure_reason 属「当前尝试」字段，随重置清空
            assert item.failure_reason is None

        archived = log_dir / str(task_id) / "1.attempt0.log"
        assert archived.exists(), "旧日志必须留档为 {node_id}.attempt0.log"
        archived_text = archived.read_text(encoding="utf-8")
        assert "第一次执行的输出" in archived_text
        assert "ERROR! 连接失败" in archived_text
        assert "失败原因" in archived_text and "无法连接" in archived_text

        # 活动日志为新文件（本次执行无输出 → 空），不再混着上一次的内容
        assert task_log_store.read_log(task_id, 1) == ""

    async def test_retry_new_attempt_log_starts_fresh(self, make_service, isolated_session, log_dir):
        """第二次执行的日志文件只含本次输出（旧内容已在 attempt0 留档）。"""
        async with isolated_session() as s:
            task_id = await _seed_task(s)
        task_log_store.append_line(task_id, 1, "第一次执行的输出")

        svc = make_service(["第二次执行的输出"])
        await svc.retry_task(task_id)
        await svc.wait_completed(task_id, timeout=10)

        active = task_log_store.read_log(task_id, 1)
        assert "第二次执行的输出" in active
        assert "第一次执行的输出" not in active
        assert (log_dir / str(task_id) / "1.attempt0.log").exists()

    async def test_retry_rejects_running_task_at_service_layer(self, make_service, isolated_session):
        """service 层冗余守卫：运行中任务重试抛中文 ValueError（不静默无操作）。"""
        async with isolated_session() as s:
            task_id = await _seed_task(s, task_status="running", item_status="running")

        svc = make_service()
        with pytest.raises(ValueError) as exc:
            await svc.retry_task(task_id)
        assert "任务仍在执行中" in str(exc.value)

    async def test_retry_rejects_foreign_node_ids_at_service_layer(
        self, make_service, isolated_session
    ):
        async with isolated_session() as s:
            task_id = await _seed_task(s)

        svc = make_service()
        with pytest.raises(ValueError) as exc:
            await svc.retry_task(task_id, node_ids=[1, 777])
        assert "777" in str(exc.value)


# ── 3. 日志行数上限 ──────────────────────────────────────────────────


class TestLogLineLimit:
    def test_cap_is_single_source_of_truth(self):
        """MAX_LOG_LINES 只有一处定义（task_log_store），ansible_service 复用。"""
        from app.services import ansible_service

        assert task_log_store.MAX_LOG_LINES == 5000
        assert ansible_service.MAX_LOG_LINES == task_log_store.MAX_LOG_LINES

    def test_append_stops_at_cap_with_truncation_note(self, log_dir, monkeypatch):
        monkeypatch.setattr(task_log_store, "MAX_LOG_LINES", 5)

        saved = sum(task_log_store.append_line(9, 1, f"line-{i}") for i in range(10))

        lines = task_log_store.read_log(9, 1).splitlines()
        assert saved == 5, "只应保存上限内的 5 行"
        assert lines[:5] == [f"line-{i}" for i in range(5)]
        # 第 6 行是截断提示，后续输出不再追加（磁盘占用有界）
        assert len(lines) == 6
        assert lines[-1] == task_log_store.TRUNCATION_NOTE
        assert task_log_store.is_truncated(9, 1) is True
        # tail 读取不受影响
        assert task_log_store.read_log(9, 1, tail=1) == task_log_store.TRUNCATION_NOTE

    def test_not_truncated_below_cap(self, log_dir):
        task_log_store.append_line(9, 1, "only line")
        assert task_log_store.is_truncated(9, 1) is False

    async def test_item_log_line_count_reflects_saved_lines(
        self, isolated_session, log_dir, monkeypatch
    ):
        """子项 log_line_count = 实际保存行数（被截断时不超过上限）。"""
        from app.services.node_task_service import NodeTaskService

        monkeypatch.setattr(task_log_store, "MAX_LOG_LINES", 3)

        async def executor(node_id, item, params, cancel_event, on_log):
            for i in range(8):
                on_log({"stdout": f"line-{i}"})
            return {"rc": 0, "status": "success"}

        svc = NodeTaskService(_ansible=None, executor=executor, db_factory=isolated_session)
        try:
            async with isolated_session() as s:
                task_id = await _seed_task(s)
            await svc.retry_task(task_id)
            await svc.wait_completed(task_id, timeout=10)

            async with isolated_session() as s:
                item = (
                    await s.execute(
                        select(NodeTaskItem)
                        .where(NodeTaskItem.task_id == task_id)
                        .execution_options(populate_existing=True)
                    )
                ).scalars().one()
            assert item.log_line_count == 3
            assert task_log_store.is_truncated(task_id, item.node_id) is True
        finally:
            svc.shutdown_sync()


# ── 4. 日志导出 ──────────────────────────────────────────────────────


class TestLogExport:
    async def test_download_sets_attachment_header(
        self, async_authed_client, isolated_session, log_dir
    ):
        async with isolated_session() as s:
            task_id = await _seed_task(s)
        task_log_store.append_line(task_id, 1, "hello log")

        resp = await async_authed_client.get(
            f"/api/v1/node-tasks/{task_id}/items/1/log", params={"download": "true"}
        )

        assert resp.status_code == 200, resp.text
        assert "hello log" in resp.text
        disposition = resp.headers["content-disposition"]
        assert disposition.startswith("attachment")
        assert f'filename="{task_id}-10.0.0.1-1.log"' in disposition

    async def test_inline_read_has_no_attachment_header(
        self, async_authed_client, isolated_session, log_dir
    ):
        async with isolated_session() as s:
            task_id = await _seed_task(s)
        task_log_store.append_line(task_id, 1, "hello log")

        resp = await async_authed_client.get(f"/api/v1/node-tasks/{task_id}/items/1/log")

        assert resp.status_code == 200
        assert "attachment" not in resp.headers.get("content-disposition", "")

    async def test_download_filename_sanitizes_ip(
        self, async_authed_client, isolated_session, log_dir
    ):
        """文件名里的 IP 需安全字符处理（IPv6 冒号等不得进 header/路径）。"""
        async with isolated_session() as s:
            task_id = await _seed_task(s, nodes=((5, "fe80::1"),))
        task_log_store.append_line(task_id, 5, "v6 log")

        resp = await async_authed_client.get(
            f"/api/v1/node-tasks/{task_id}/items/5/log", params={"download": "true"}
        )

        assert resp.status_code == 200, resp.text
        disposition = resp.headers["content-disposition"]
        assert ":" not in disposition.split("filename=")[-1]
        assert "fe80" in disposition

    async def test_archive_zip_contains_all_node_logs(
        self, async_authed_client, isolated_session, log_dir
    ):
        """整任务导出：zip 内为 {ip}/{filename}，无日志节点写进 _missing.txt。"""
        async with isolated_session() as s:
            task_id = await _seed_task(s, nodes=((1, "10.0.0.1"), (2, "10.0.0.2")))
        task_log_store.append_line(task_id, 1, "node1 log")
        # 造一份历史尝试留档，验证也一并打包
        task_log_store.append_line(task_id, 1, "old attempt")
        task_log_store.rotate_log(task_id, 1, 0)
        task_log_store.append_line(task_id, 1, "current attempt log")

        resp = await async_authed_client.get(f"/api/v1/node-tasks/{task_id}/logs/archive")

        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "application/zip"
        assert f'filename="task-{task_id}-logs.zip"' in resp.headers["content-disposition"]

        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        names = zf.namelist()
        assert "10.0.0.1/1.log" in names
        assert "10.0.0.1/1.attempt0.log" in names
        assert "_missing.txt" in names
        missing = zf.read("_missing.txt").decode("utf-8")
        assert "10.0.0.2" in missing
        assert "node1 log" in zf.read("10.0.0.1/1.attempt0.log").decode("utf-8")
        assert "current attempt log" in zf.read("10.0.0.1/1.log").decode("utf-8")

    async def test_archive_missing_task_returns_404(self, async_authed_client):
        resp = await async_authed_client.get("/api/v1/node-tasks/999999/logs/archive")
        assert resp.status_code == 404

    async def test_attempt_param_reads_archived_log(
        self, async_authed_client, isolated_session, log_dir
    ):
        """?attempt=N 读取第 N 次执行的留档日志（历史尝试可回看）。"""
        async with isolated_session() as s:
            task_id = await _seed_task(s)
        task_log_store.append_line(task_id, 1, "第一次执行的输出")
        task_log_store.rotate_log(task_id, 1, 0)
        task_log_store.append_line(task_id, 1, "第二次执行的输出")

        ok = await async_authed_client.get(
            f"/api/v1/node-tasks/{task_id}/items/1/log", params={"attempt": 0}
        )
        assert ok.status_code == 200
        assert "第一次执行的输出" in ok.text
        assert "第二次执行的输出" not in ok.text

        missing = await async_authed_client.get(
            f"/api/v1/node-tasks/{task_id}/items/1/log", params={"attempt": 9}
        )
        assert missing.status_code == 404
