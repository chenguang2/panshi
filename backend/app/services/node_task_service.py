"""Node operation task execution engine.

Drives persistent async tasks (install/start/stop/...) created via the
node-task-center API. Design decisions (openspec/changes/node-operation-task-center):

- Holds the shared ``AnsibleRunnerService`` singleton so the max_playbooks
  semaphore stays a process-wide limit (V1/V6). When constructed for tests,
  ``_ansible=None`` and an injected ``executor`` replaces real ansible calls.
- Per-node mutex: a node never runs two task items concurrently (V-1, design D2).
- Cancel: sets a per-task asyncio.Event; the executor is expected to observe
  it (run_playbook wraps it into ansible's cancel_callback, V2).
- ``_running`` holds strong Task references so asyncio does not GC them.
"""

import asyncio
import json
import logging
import queue as _queue
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.node_task import NodeTask, NodeTaskItem
from app.services import task_log_store

logger = logging.getLogger(__name__)

NodeExecutor = Callable[[int, NodeTaskItem, dict, asyncio.Event | None, Callable[[dict], None]], Awaitable[dict]]


class NodeTaskService:
    def __init__(
        self,
        _ansible: Any = None,
        executor: NodeExecutor | None = None,
        semaphore: asyncio.Semaphore | None = None,
        db_factory: Callable[[], Any] | None = None,
    ):
        self._ansible = _ansible
        self._executor = executor or self._execute_node
        self._db_factory = db_factory
        # Default semaphore: reuse the shared AnsibleRunnerService's semaphore.
        # (V1) When no ansible instance is provided (tests), default to a
        # per-instance semaphore of size 5 so tests remain meaningful.
        if semaphore is None:
            if _ansible is not None and hasattr(_ansible, "_semaphore"):
                semaphore = _ansible._semaphore
            else:
                semaphore = asyncio.Semaphore(5)
        assert semaphore is not None
        self._semaphore: asyncio.Semaphore = semaphore
        self._node_locks: dict[int, asyncio.Lock] = {}
        self._cancel_flags: dict[int, asyncio.Event] = {}
        self._running: dict[int, asyncio.Task] = {}
        # SSE fan-out; queue.Queue because on_log runs on ansible worker threads
        self._subscribers: dict[int, set[_queue.Queue]] = {}
        self._closed = False

    # ── public API ──────────────────────────────────────────────

    async def _assert_no_duplicate_inflight(
        self,
        db: AsyncSession,
        cluster_id: int,
        task_type: str,
        node_ids: list[int],
        params: dict | None,
    ) -> None:
        """Reject creating an in-flight task with the same params (B2)."""
        stmt = select(NodeTask.id).where(
            NodeTask.cluster_id == cluster_id,
            NodeTask.task_type == task_type,
            NodeTask.status.in_(["pending", "running"]),
        )
        task_ids = (await db.execute(stmt)).scalars().all()
        if not task_ids:
            return
        items = (
            await db.execute(
                select(NodeTaskItem.node_id).where(NodeTaskItem.task_id.in_(task_ids))
            )
        ).scalars().all()
        existing_node_ids = set(items)
        same_params = False
        for tid in task_ids:
            task = await db.get(NodeTask, tid)
            if task is not None and task.get_params() == (params or {}):
                same_params = True
                break
        if existing_node_ids and existing_node_ids == set(node_ids) and same_params:
            raise ValueError("相同参数的节点任务已存在，请勿重复创建")

    async def create_task(
        self,
        db: AsyncSession,
        cluster_id: int,
        task_type: str,
        node_ids: list[int],
        params: dict | None = None,
        node_snapshots: dict[int, tuple[str, str | None]] | None = None,
        created_by: int | None = None,
    ) -> NodeTask:
        """Persist a new task (pending) with node items and start execution."""
        await self._assert_no_duplicate_inflight(db, cluster_id, task_type, node_ids, params)
        task = NodeTask(
            cluster_id=cluster_id,
            task_type=task_type,
            status="pending",
            total_nodes=len(node_ids),
        )
        task.set_params(params or {})
        if created_by is not None:
            task.created_by = created_by
        db.add(task)
        await db.flush()

        for node_id in node_ids:
            ip, node_name = (node_snapshots or {}).get(node_id, (str(node_id), None))
            item = NodeTaskItem(
                task_id=task.id,
                node_id=node_id,
                ip=ip,
                node_name=node_name,
                status="pending",
            )
            item.set_logs([])
            db.add(item)
        await db.commit()

        self._cancel_flags[task.id] = asyncio.Event()
        self._running[task.id] = asyncio.create_task(self._execute(task.id))
        return task

    async def wait_completed(self, task_id: int, timeout: float = 30.0) -> None:
        """Wait until the background task finishes (bounded by timeout)."""
        task = self._running.get(task_id)
        if task is None:
            return
        await asyncio.wait_for(asyncio.shield(task), timeout=timeout)

    async def cancel_task(self, task_id: int) -> None:
        """Set the cancel flag; idempotent. Running items observe the event."""
        flag = self._cancel_flags.get(task_id)
        if flag is not None:
            flag.set()

    async def retry_task(self, task_id: int, node_ids: list[int] | None = None) -> None:
        """Reset failed/cancelled items to pending and re-execute them."""
        if node_ids is None:
            await self._reset_failed_items(task_id, None)
        else:
            await self._reset_failed_items(task_id, node_ids)
        flag = self._cancel_flags.get(task_id)
        if flag is not None:
            flag.clear()
        self._running[task_id] = asyncio.create_task(self._execute(task_id))

    def shutdown_sync(self) -> None:
        """Cancel running tasks (called by tests / lifespan shutdown)."""
        self._closed = True
        for task in self._running.values():
            task.cancel()

    # ── SSE broadcast (thread-safe; on_log runs on ansible worker threads) ──

    def subscribe(self, task_id: int) -> _queue.Queue:
        q: _queue.Queue = _queue.Queue(maxsize=1000)
        self._subscribers.setdefault(task_id, set()).add(q)
        return q

    def unsubscribe(self, task_id: int, q: _queue.Queue) -> None:
        subs = self._subscribers.get(task_id)
        if subs is not None:
            subs.discard(q)
            if not subs:
                self._subscribers.pop(task_id, None)

    def _broadcast(self, task_id: int, event: dict) -> None:
        for q in list(self._subscribers.get(task_id, ())):
            try:
                q.put_nowait(event)
            except _queue.Full:
                try:
                    q.get_nowait()
                    q.put_nowait(event)
                except _queue.Empty:
                    pass

    # ── internals ───────────────────────────────────────────────

    async def _execute(self, task_id: int) -> None:
        session_factory = self._db_factory or self._default_session_factory
        cancel_flag = self._cancel_flags.get(task_id)
        try:
            async with session_factory() as db:
                task = await db.get(NodeTask, task_id)
                if task is None:
                    return
                task.status = "running"
                task.started_at = datetime.utcnow()
                await db.commit()
                self._broadcast(task_id, {"type": "task_update", "task_id": task_id, "status": "running"})

                items = (
                    await db.execute(
                        select(NodeTaskItem)
                        .where(NodeTaskItem.task_id == task_id)
                        .order_by(NodeTaskItem.id)
                    )
                ).scalars().all()
                params = task.get_params()

                pending_items = [i for i in items if i.status == "pending"]

                if not pending_items:
                    await self._finalize_task(db, task, [i.status for i in items])
                    return

                async def run_one(item: NodeTaskItem) -> str:
                    if self._closed or (cancel_flag is not None and cancel_flag.is_set()):
                        return "skipped"
                    # Each node gets its own session: async sessions are not
                    # safe for concurrent writes from gather().
                    async with session_factory() as item_db:
                        fresh = await item_db.get(NodeTaskItem, item.id)
                        try:
                            return await self._run_item(item_db, fresh, params, cancel_flag)
                        except Exception as e:  # noqa: BLE001 - engine must not die on node failure
                            logger.exception("task %s node %s failed: %s", task_id, item.node_id, e)
                            fresh.status = "failed"
                            await item_db.commit()
                            return "failed"

                # Concurrent node execution: distinct nodes run in parallel up to
                # the semaphore; the same node never runs two items at once
                # (per-node lock inside _run_item).
                await asyncio.gather(*(run_one(i) for i in pending_items))

                db.expire_all()
                items = (
                    await db.execute(
                        select(NodeTaskItem)
                        .where(NodeTaskItem.task_id == task_id)
                        .order_by(NodeTaskItem.id)
                        .execution_options(populate_existing=True)
                    )
                ).scalars().all()
                await self._finalize_task(db, task, [i.status for i in items])
        except asyncio.CancelledError:
            async with session_factory() as db:
                task = await db.get(NodeTask, task_id)
                if task is not None:
                    task.status = "failed"
                    task.finished_at = datetime.utcnow()
                    await db.commit()
            raise
        finally:
            self._running.pop(task_id, None)

    async def _run_item(
        self,
        db: AsyncSession,
        item: NodeTaskItem,
        params: dict,
        cancel_flag: asyncio.Event | None,
    ) -> str:
        lock = self._node_locks.setdefault(item.node_id, asyncio.Lock())
        async with lock:
            if self._closed or (cancel_flag is not None and cancel_flag.is_set()):
                item.status = "skipped"
                await db.commit()
                return "skipped"

            async with self._semaphore:
                if self._closed or (cancel_flag is not None and cancel_flag.is_set()):
                    item.status = "skipped"
                    await db.commit()
                    return "skipped"

                item.status = "running"
                item.started_at = datetime.utcnow()
                await db.commit()
                self._broadcast(item.task_id, {
                    "type": "node_update", "task_id": item.task_id,
                    "node_id": item.node_id, "status": "running",
                })

                tail_chunks: list[str] = []
                line_count = 0
                tail_lock = threading.Lock()

                def on_log(event: dict) -> None:
                    nonlocal line_count
                    line = event.get("stdout", "") if isinstance(event, dict) else str(event)
                    if not line:
                        return
                    task_log_store.append_line(item.task_id, item.node_id, line)
                    with tail_lock:
                        tail_chunks.append(line)
                        line_count += len(line.splitlines())
                    self._broadcast(item.task_id, {
                        "type": "log_line", "task_id": item.task_id,
                        "node_id": item.node_id, "line": line,
                    })

                result = await self._executor(item.node_id, item, params, cancel_flag, on_log)

                rc = result.get("rc", -1)
                with tail_lock:
                    tail_text = "".join(tail_chunks)
                item.rc = rc
                if line_count > 0:
                    item.log_file = str(task_log_store.log_path(item.task_id, item.node_id).relative_to(task_log_store.log_root()))
                item.log_line_count = line_count
                item.stdout_tail = task_log_store.tail_bytes(tail_text)
                item.stdout = result.get("stdout")
                item.stderr = result.get("stderr")
                item.command = result.get("command")
                item.status = "success" if rc == 0 else "failed"
                item.finished_at = datetime.utcnow()
                await db.commit()
                self._broadcast(item.task_id, {
                    "type": "node_update", "task_id": item.task_id,
                    "node_id": item.node_id, "status": item.status, "rc": rc,
                })
                return item.status

    async def _finalize_task(self, db: AsyncSession, task: NodeTask, results: list[str]) -> None:
        task.success_nodes = results.count("success")
        task.failed_nodes = results.count("failed")
        task.cancelled_nodes = results.count("cancelled")
        task.finished_at = datetime.utcnow()

        skipped = results.count("skipped")
        if task.failed_nodes == 0 and skipped == 0:
            task.status = "success"
        elif task.success_nodes == 0 and task.failed_nodes == 0 and skipped > 0:
            task.status = "cancelled"
        elif task.failed_nodes > 0 and task.success_nodes == 0:
            task.status = "failed"
        else:
            task.status = "partial"
        await db.commit()
        self._broadcast(task.id, {
            "type": "task_update", "task_id": task.id,
            "status": task.status,
            "success_nodes": task.success_nodes,
            "failed_nodes": task.failed_nodes,
            "cancelled_nodes": task.cancelled_nodes,
        })
        self._broadcast(task.id, {"type": "done", "task_id": task.id})

    async def _reset_failed_items(self, task_id: int, node_ids: list[int] | None) -> None:
        session_factory = self._db_factory or self._default_session_factory

        async with session_factory() as db:
            stmt = select(NodeTaskItem).where(NodeTaskItem.task_id == task_id)
            items = (await db.execute(stmt)).scalars().all()
            for item in items:
                if node_ids is None or item.node_id in node_ids:
                    if item.status in ("failed", "cancelled", "skipped"):
                        item.status = "pending"
                        item.rc = None
                        item.stdout = None
                        item.stderr = None
                        item.command = None
                        item.started_at = None
                        item.finished_at = None
                        item.set_logs([])
                        task_log_store.reset_log(task_id, item.node_id)
                        item.log_file = None
                        item.log_line_count = 0
                        item.stdout_tail = None
            await db.commit()

    @staticmethod
    def _default_session_factory():
        from app.core.database import AsyncSessionLocal
        return AsyncSessionLocal()

# ── production executor (injected in tests) ─────────────────

    async def _execute_node(
        self,
        node_id: int,
        item: NodeTaskItem,
        params: dict,
        cancel_event: asyncio.Event | None,
        on_log: Callable[[dict], None],
    ) -> dict:
        """Real executor: dispatch to AnsibleRunnerService by task_type.

        Node-derived params (prefix/ports/edge_target) are resolved from the
        node record when not provided in ``params``. Operations on the edge
        program (start/stop/reload/check/statistic) use ``node.edge_path``,
        matching the per-node endpoints; install tasks use
        ``node.openresty_path`` (the openresty install location).
        """
        task_type = await _task_type_of(item)
        node = await _resolve_node(item.task_id, node_id)
        if node is None:
            return {"rc": -1, "status": "failed", "stderr": f"节点 {item.ip} 已不存在"}

        if task_type in ("start", "stop", "reload", "check", "statistic"):
            prefix = params.get("prefix") or node.edge_path
        else:
            prefix = params.get("prefix") or node.openresty_path or node.edge_path
        ports = str(params.get("ports") or node.management_port or "")

        if task_type in ("start", "stop", "reload", "check"):
            if self._ansible is None:
                raise ValueError("NodeTaskService has no ansible instance")
            return await self._ansible.nginx_cmd(node.ip, task_type, prefix, ports)
        if task_type == "statistic":
            if self._ansible is None:
                raise ValueError("NodeTaskService has no ansible instance")
            return await self._ansible.statistic(node.ip, prefix, ports)

        if task_type == "software_check":
            software_list = params.get("software_list") or []
            cmd_str = ",".join(software_list)
            return await self._software_check_node(node, cmd_str, on_log)

        if task_type == "install_openresty":
            srcpath = f"{_SOFT_DIR()}"
            destpath = str(Path(prefix).parent) + "/"
            ev = {"prefix": prefix, "srcpath": srcpath, "destpath": destpath}
            openresty_file = params.get("openresty_file")
            if openresty_file:
                ev["openresty_file"] = openresty_file
            copy_result = await self._ansible.run_playbook(
                node.ip, "install_openresty_copy", ev,
                cancel_event=cancel_event,
                on_progress=on_log,
                job_timeout=600,
            )
            if copy_result.get("rc") != 0:
                return copy_result
            return await _install_openresty_ssh(node, prefix, on_log)

        edge_target = node.edge_path
        if task_type == "install_edge":
            ev = {"prefix": prefix, "edge_target": edge_target}
            return await self._ansible.run_playbook(
                node.ip, "install_edge", ev, cancel_event=cancel_event,
                on_progress=on_log, job_timeout=600,
            )
        if task_type == "associate_new_openresty":
            if not prefix:
                return {"rc": -1, "status": "failed", "stderr": "节点安装路径为空"}
            ev = {"prefix": prefix, "edge_target": edge_target}
            return await self._ansible.run_playbook(
                node.ip, "upgrade_openresty", ev, cancel_event=cancel_event,
                on_progress=on_log, job_timeout=600,
            )
        if task_type == "edge_pack_add":
            pack_file = params.get("pack_file")
            if not pack_file:
                return {"rc": -1, "status": "failed", "stderr": "缺少 pack_file 参数"}
            ev = {
                "srcpath": f"{_SOFT_DIR()}",
                "destpath": str(Path(prefix).parent) + "/",
                "pack_file": pack_file,
                "prefix": prefix,
            }
            return await self._ansible.run_playbook(
                node.ip, "edge_pack_add", ev, cancel_event=cancel_event,
                on_progress=on_log, job_timeout=600,
            )
        if task_type == "edge_pack_rebase":
            version = params.get("version")
            if not version:
                return {"rc": -1, "status": "failed", "stderr": "缺少 version 参数"}
            ev = {"edge_target": edge_target, "version": version}
            return await self._ansible.run_playbook(
                node.ip, "edge_pack_rebase", ev, cancel_event=cancel_event,
                on_progress=on_log, job_timeout=600,
            )
        if task_type == "edge_env_deploy":
            env_content = params.get("env_content")
            if env_content is None:
                return {"rc": -1, "status": "failed", "stderr": "缺少 env_content 参数"}
            ev = {"env_content": env_content, "destpath": edge_target}
            return await self._ansible.run_playbook(
                node.ip, "edge_init_env", ev, cancel_event=cancel_event,
                on_progress=on_log, job_timeout=120,
            )

        raise ValueError(f"unknown task type: {task_type}")

    async def _software_check_node(self, node, cmd_str: str, on_log) -> dict:
        """Run software_check via ansible, falling back to direct SSH on failure."""
        from app.services.ansible_service import get_ssh_user, _run_ssh_with_fallback, PRIVATE_DATA_DIR

        if self._ansible is not None:
            result = await self._ansible.run_playbook(
                node.ip, "software_check_run",
                {"software_list": cmd_str}, on_progress=on_log,
            )
            raw = result.get("shell_stdout") or ""
            if result.get("rc") == 0 and raw:
                return {
                    "rc": 0, "status": "successful",
                    "stdout": json.dumps(parse_software_check_output(raw), ensure_ascii=False),
                    "stderr": result.get("stderr", ""),
                }
            on_log({"stdout": "ansible 软件查询失败，降级为 SSH 直连执行"})

        ssh_user = get_ssh_user(node.ip)
        script_path = Path(PRIVATE_DATA_DIR) / "cmd_scripts" / "software_check.sh"
        script_content = script_path.read_text(encoding="utf-8")
        rc, stdout, stderr = await _run_ssh_with_fallback(
            node.ip, ssh_user, f"bash -s {cmd_str} <<'SOFT_CHECK_EOF'\n{script_content}\nSOFT_CHECK_EOF",
            on_line=on_log,
        )
        return {
            "rc": rc, "status": "successful" if rc == 0 else "failed",
            "stdout": json.dumps(parse_software_check_output(stdout), ensure_ascii=False) if rc == 0 else stdout,
            "stderr": stderr,
        }



def parse_software_check_output(raw: str) -> dict:
    """Parse software_check.sh output lines into a structured dict.
    Input lines: ``OK|<cmd>|<pkg>|<ver>`` or ``MISS|<cmd>|未安装||``.
    Returns ``{cmd: {"installed": bool, "pkg": str, "ver": str}}``.
    """
    result: dict = {}
    if not raw:
        return result
    for line in raw.splitlines():
        line = line.strip()
        if not line or "|" not in line:
            continue
        parts = line.split("|")
        if len(parts) < 3:
            continue
        status, name = parts[0], parts[1]
        if status == "OK":
            pkg = parts[2] if len(parts) > 2 else ""
            ver = parts[3] if len(parts) > 3 else ""
            result[name] = {"installed": True, "pkg": pkg, "ver": ver}
        elif status == "MISS":
            result[name] = {"installed": False, "pkg": "未安装", "ver": ""}
    return result

# ── module-level singleton (V1/V6) ────────────────────────────────────
# Reuses the shared AnsibleRunnerService instance so the max_playbooks
# semaphore remains a process-wide limit across tasks and sync operations.
# Lazily initialized to avoid import cycles with api/v1 modules.
_ansible_service: Any = None
_service_instance: NodeTaskService | None = None


def _get_shared_ansible():
    global _ansible_service
    if _ansible_service is None:
        from app.api.v1.cluster_install import _ansible_service as shared
        _ansible_service = shared
    return _ansible_service


def get_node_task_service() -> NodeTaskService:
    global _service_instance
    if _service_instance is None:
        _service_instance = NodeTaskService(_ansible=_get_shared_ansible())
    return _service_instance


node_task_service = get_node_task_service()


async def recover_interrupted_tasks() -> None:
    """Mark pending/running tasks as failed on startup (process restart)."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            update(NodeTask)
            .where(NodeTask.status.in_(["pending", "running"]))
            .values(status="failed", finished_at=datetime.utcnow())
        )
        await db.commit()


# ── production executor helpers ────────────────────────────────────────


def _SOFT_DIR() -> str:
    from app.services.ansible_service import PRIVATE_DATA_DIR
    return str(Path(PRIVATE_DATA_DIR) / "soft")


async def _task_type_of(item: NodeTaskItem) -> str:
    """Look up the task_type of the task owning this item."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        task = await db.get(NodeTask, item.task_id)
        return task.task_type if task else "unknown"


async def _resolve_node(task_id: int, node_id: int):
    """Load the Node record by node_id (task_id unused here, kept for future use)."""
    from app.models.cluster import Node
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        return await db.get(Node, node_id)


async def _install_openresty_ssh(node, prefix: str, on_log: Callable[[dict], None]) -> dict:
    """Phase 2 of install_openresty: SSH build of install-edge.sh on the node."""
    from app.services.ansible_service import get_ssh_user, _run_ssh_with_fallback

    ssh_user = get_ssh_user(node.ip)
    destpath = str(Path(prefix).parent) + "/"
    build_cmd = f"cd {destpath}soft/install-edge && ./install-edge.sh {prefix}"
    on_log({"stdout": f"$ {build_cmd}"})
    rc, stdout, stderr = await _run_ssh_with_fallback(
        node.ip, ssh_user, build_cmd, on_line=on_log,
    )
    return {"rc": rc, "status": "success" if rc == 0 else "failed", "stdout": stdout, "stderr": stderr, "command": build_cmd}
