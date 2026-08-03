"""Tests for task log file persistence and SSE broadcast."""

import asyncio
import pytest
from sqlalchemy import select

from app.models.node_task import NodeTask, NodeTaskItem
from app.services import task_log_store


@pytest.fixture
def make_service(test_db):
    from app.services.node_task_service import NodeTaskService

    services = []

    def _make(executor, semaphore=None):
        def session_factory():
            from sqlalchemy.ext.asyncio import async_sessionmaker

            maker = async_sessionmaker(test_db.bind, class_=type(test_db), expire_on_commit=False)
            return maker()

        svc = NodeTaskService(
            _ansible=None,
            executor=executor,
            semaphore=semaphore,
            db_factory=session_factory,
        )
        services.append(svc)
        return svc

    yield _make

    for svc in services:
        svc.shutdown_sync()


@pytest.mark.asyncio
async def test_append_and_read_log_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(task_log_store, "_log_dir", tmp_path)
    task_log_store.append_line(7, 3, "line one")
    task_log_store.append_line(7, 3, "line two")

    assert task_log_store.read_log(7, 3) == "line one\nline two"
    assert task_log_store.read_log(7, 3, tail=1) == "line two"
    assert task_log_store.read_log(7, 99) == ""


@pytest.mark.asyncio
async def test_reset_and_delete_logs(tmp_path, monkeypatch):
    monkeypatch.setattr(task_log_store, "_log_dir", tmp_path)
    task_log_store.append_line(7, 3, "line")
    task_log_store.reset_log(7, 3)
    assert task_log_store.read_log(7, 3) == ""

    task_log_store.append_line(7, 3, "a")
    task_log_store.append_line(7, 4, "b")
    task_log_store.delete_task_logs(7)
    assert task_log_store.read_log(7, 3) == ""
    assert task_log_store.read_log(7, 4) == ""


@pytest.mark.asyncio
async def test_tail_bytes_caps_large_output():
    big = "x" * 20000
    tail = task_log_store.tail_bytes(big)
    assert len(tail.encode("utf-8")) <= task_log_store.STDOUT_TAIL_BYTES
    assert tail.endswith("x")
    small = "short"
    assert task_log_store.tail_bytes(small) == small


class TestLogFilePersistence:
    @pytest.mark.asyncio
    async def test_on_log_writes_file_and_summary(self, test_db, make_service, tmp_path, monkeypatch):
        monkeypatch.setattr(task_log_store, "_log_dir", tmp_path)
        lines_written = []

        async def executor(node, item, params, cancel_event, on_log):
            on_log({"stdout": "first line"})
            on_log({"stdout": "second line\nwith newline"})
            return {"rc": 0, "status": "success", "stdout": "raw stdout"}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="install_openresty",
            node_ids=[3], params={},
        )
        await svc.wait_completed(task.id)

        items = (await test_db.execute(select(NodeTaskItem).where(NodeTaskItem.task_id == task.id))).scalars().all()
        item = items[0]
        assert item.status == "success"
        assert item.log_file is not None
        assert item.log_line_count == 3
        assert "first line" in (item.stdout_tail or "")
        assert "second line" in (item.stdout_tail or "")

        content = task_log_store.read_log(task.id, 3)
        assert "first line" in content
        assert "second line" in content

    @pytest.mark.asyncio
    async def test_sse_broadcast_delivers_log_lines(self, test_db, make_service, tmp_path, monkeypatch):
        monkeypatch.setattr(task_log_store, "_log_dir", tmp_path)
        received: list[dict] = []

        async def executor(node, item, params, cancel_event, on_log):
            await asyncio.sleep(0.05)
            on_log({"stdout": "streamed line"})
            return {"rc": 0, "status": "success"}

        svc = make_service(executor)
        task = await svc.create_task(
            db=test_db, cluster_id=1, task_type="start", node_ids=[3], params={},
        )
        q = svc.subscribe(task.id)

        async def drain():
            deadline = asyncio.get_event_loop().time() + 5
            while asyncio.get_event_loop().time() < deadline:
                try:
                    event = q.get_nowait()
                except Exception:
                    await asyncio.sleep(0.02)
                    continue
                received.append(event)
                if event.get("type") == "done":
                    return

        await asyncio.gather(drain(), svc.wait_completed(task.id))
        svc.unsubscribe(task.id, q)

        types = [e["type"] for e in received]
        assert "log_line" in types
        assert "done" in types
        log_event = next(e for e in received if e["type"] == "log_line")
        assert log_event["line"] == "streamed line"
        assert log_event["node_id"] == 3
