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
from app.config.script_upload import TASK_SCRIPTS_DIR

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

    async def retry_task(self, task_id: int, node_ids: list[int] | None = None, db: Any = None) -> None:
        """Reset failed/cancelled items to pending and re-execute them.

        ``db``: 请求作用域会话（端点注入）。必须贯穿使用——audit 骨架已在该
        会话上 flush 并持有 SQLite 写锁，reset 若走第二个会话会被阻塞至
        busy_timeout 超时（"database is locked" → 500）。
        """
        if node_ids is None:
            await self._reset_failed_items(task_id, None, db=db)
        else:
            await self._reset_failed_items(task_id, node_ids, db=db)
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

                # Batch execution for distribute_file: run_playbook once with all IPs
                if task.task_type == "distribute_file":
                    await self._execute_distribute_batch(db, task, pending_items, params, cancel_flag)
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
                # Bug 3（任务 6 排查）：ansible 可能 rc==0 但 playbook 未实际执行
                # （节点不在 inventory → "no hosts matched"；或 UNREACHABLE/认证失败）。
                # 这类情况必须判为 failed，不得误报 success。
                if rc == 0:
                    false_success_err = _ansible_false_success_error(result, item.ip)
                    if false_success_err:
                        rc = -1
                        result = dict(result, rc=-1, status="failed", stderr=false_success_err)
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

    async def _reset_failed_items(self, task_id: int, node_ids: list[int] | None, db: Any = None) -> None:
        session_factory = self._db_factory or self._default_session_factory
        # db 贯穿（见 retry_task docstring）：仅在未提供请求会话时才自建
        if db is not None:
            await self._reset_failed_items_on(task_id, node_ids, db)
            return
        async with session_factory() as owned_db:
            await self._reset_failed_items_on(task_id, node_ids, owned_db)

    async def _reset_failed_items_on(self, task_id: int, node_ids: list[int] | None, db: Any) -> None:
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

        if task_type == "cmd_exec":
            script_file = params.get("script_file")
            script_content_raw = params.get("script_content")
            if script_file or script_content_raw:
                # Script mode: content from inline param or migrated file
                if script_content_raw:
                    script_content = script_content_raw
                else:
                    from app.config.script_upload import TASK_SCRIPTS_DIR
                    script_path = TASK_SCRIPTS_DIR / str(item.task_id) / f"{script_file}.sh"
                    if not script_path.exists():
                        return {"rc": -1, "status": "failed", "stderr": f"脚本文件不存在: {script_file}"}
                    script_content = script_path.read_text(encoding="utf-8")
                if not script_content.strip():
                    return {"rc": -1, "status": "failed", "stderr": "脚本内容为空"}
                try:
                    timeout = int(params.get("timeout") or 30)
                except (TypeError, ValueError):
                    timeout = 30
                # Execute via SSH + base64 pipeline (no file on disk)
                from app.services.ansible_service import (
                    get_ssh_user, _run_ssh_with_fallback, resolve_ssh_port,
                )
                ssh_user = get_ssh_user(node.ip)
                ssh_port = resolve_ssh_port(node)
                import base64
                b64 = base64.b64encode(script_content.encode("utf-8")).decode()
                ssh_cmd = f"echo '{b64}' | base64 -d | bash"
                on_log({"stdout": f"$ [script] bash -c '<base64_encoded_script>'"})
                try:
                    rc, stdout, stderr = await asyncio.wait_for(
                        _run_ssh_with_fallback(
                            node.ip, ssh_user, ssh_cmd,
                            on_line=on_log, port=ssh_port,
                        ),
                        timeout=timeout,
                    )
                except asyncio.TimeoutError:
                    return {"rc": -1, "status": "failed", "stderr": f"脚本执行超时（{timeout}s）"}
                return {
                    "rc": rc, "status": "success" if rc == 0 else "failed",
                    "stdout": stdout, "stderr": stderr,
                }
            # Normal cmd mode
            cmd = params.get("cmd") or ""
            if not cmd.strip():
                return {"rc": -1, "status": "failed", "stderr": "缺少 cmd 参数"}
            if self._ansible is None:
                raise ValueError("NodeTaskService has no ansible instance")
            security = params.get("security") or "blacklist"
            try:
                timeout = int(params.get("timeout") or 30)
            except (TypeError, ValueError):
                timeout = 30
            whitelist = _build_cmd_exec_whitelist(params.get("whitelist") or [])
            import base64

            ev = {
                "cmd_security": security,
                "cmd_timeout": timeout,
                "cmd_exec": base64.b64encode(cmd.encode()).decode(),
                "cmd_whitelist": base64.b64encode(whitelist.encode()).decode(),
            }
            result = await self._ansible.run_playbook(
                node.ip, "cmd_exec_run", ev,
                cancel_event=cancel_event, on_progress=on_log,
                job_timeout=timeout + 10,
            )
            return _cmd_exec_result_from_playbook(result)

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

    async def _execute_distribute_batch(
        self,
        db: AsyncSession,
        task: NodeTask,
        items: list,
        params: dict,
        cancel_flag: asyncio.Event | None,
    ) -> None:
        """Execute distribute_file: run_playbook once with all IPs, then map results to items."""
        srcpath = params.get("srcpath", "")
        destpath = params.get("destpath", "")
        if not srcpath or not destpath:
            for item in items:
                item.status = "failed"
                item.rc = -1
                item.stderr = "缺少 srcpath 或 destpath 参数"
                item.finished_at = datetime.utcnow()
            await db.commit()
            return

        # Resolve the actual file path from srcpath (format: "temp/{upload_id}" → "task-scripts/{task_id}/{upload_id}")
        task_script_dir = TASK_SCRIPTS_DIR / str(task.id)
        file_name = srcpath.split("/")[-1]
        actual_src = task_script_dir / file_name
        if not actual_src.exists():
            for item in items:
                item.status = "failed"
                item.rc = -1
                item.stderr = f"文件不存在: {file_name}"
                item.finished_at = datetime.utcnow()
            await db.commit()
            return

        # Build comma-separated IPs. srcpath/destpath repeat per node: the edge
        # role zips ips/src/dest with with_together (zip truncates to the
        # shortest list) and matches each host via
        # when: inventory_hostname == item.0 — single-element src/dest would
        # deliver the file to the first node only.
        ips = ",".join(item.ip for item in items)
        src_per_node = ",".join([str(actual_src)] * len(items))
        # 落地名：优先原始文件名（srcfilename，用户上传时的名字），只取 basename
        # 杜绝目标端路径穿越；缺失/净化为空时回退存储名（UUID，兼容旧任务）。
        # dest 精确到文件路径（而非目录），使节点上文件名 = 原始文件名。
        raw_name = str(params.get("srcfilename") or "").replace("\\", "/")
        landing_name = Path(raw_name).name
        if not landing_name or landing_name in (".", ".."):
            landing_name = file_name
        if not destpath.endswith("/"):
            destpath += "/"
        dest_full = f"{destpath}{landing_name}"
        dest_per_node = ",".join([dest_full] * len(items))
        ev = {"ips": ips, "srcpath": src_per_node, "destpath": dest_per_node}

        def _on_log(event: dict) -> None:
            line = event.get("stdout", "") if isinstance(event, dict) else str(event)
            if not line:
                return
            for item in items:
                task_log_store.append_line(task.id, item.node_id, line)
                self._broadcast(task.id, {
                    "type": "log_line", "task_id": task.id,
                    "node_id": item.node_id, "line": line,
                })

        if self._ansible is None:
            raise ValueError("NodeTaskService has no ansible instance")

        try:
            timeout = int(params.get("timeout") or 600)
        except (TypeError, ValueError):
            timeout = 600

        result = await self._ansible.run_playbook(
            "", "edge_master_copy_to_slaves", ev,
            cancel_event=cancel_flag, on_progress=_on_log,
            job_timeout=timeout,
        )

        rc = result.get("rc", -1)
        stderr = result.get("stderr", "")
        stdout = result.get("stdout", "")

        # Parse per-node results from ansible output
        # ansible with_together gives per-node output lines prefixed with [ip]
        node_results = _parse_distribute_results(stdout, stderr, items, rc)

        for item in items:
            nr = node_results.get(item.ip, {"rc": rc, "success": rc == 0})
            item.rc = nr.get("rc", rc)
            item.status = "success" if nr.get("success", False) else "failed"
            item.stdout = nr.get("stdout", stdout)
            item.stderr = nr.get("stderr", stderr if not nr.get("success", False) else "")
            item.finished_at = datetime.utcnow()
        await db.commit()

    async def _software_check_node(self, node, cmd_str: str, on_log) -> dict:
        """Run software_check via ansible, falling back to direct SSH on failure."""
        from app.services.ansible_service import get_ssh_user, _run_ssh_with_fallback, resolve_ssh_port, PRIVATE_DATA_DIR

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
        ssh_port = resolve_ssh_port(node)
        script_path = Path(PRIVATE_DATA_DIR) / "cmd_scripts" / "software_check.sh"
        script_content = script_path.read_text(encoding="utf-8")
        rc, stdout, stderr = await _run_ssh_with_fallback(
            node.ip, ssh_user, f"bash -s {cmd_str} <<'SOFT_CHECK_EOF'\n{script_content}\nSOFT_CHECK_EOF",
            on_line=on_log, port=ssh_port,
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


CMD_EXEC_BUILTIN_WHITELIST = [
    "ls", "ps", "df", "free", "top", "cat", "head", "tail", "grep", "wc",
    "du", "stat", "whoami", "hostname", "uptime", "date", "uname",
]


def _build_cmd_exec_whitelist(custom: list[str]) -> str:
    """合并内置只读命令与任务自定义白名单，返回逗号分隔字符串（去重保序）。

    与前端 cmdBuiltinWhitelist 保持一致；服务端强制内置列表，不依赖前端传参。
    """
    seen: set[str] = set()
    merged: list[str] = []
    for name in list(CMD_EXEC_BUILTIN_WHITELIST) + [c.strip() for c in custom if str(c).strip()]:
        if name not in seen:
            seen.add(name)
            merged.append(name)
    return ",".join(merged)


def _validate_script_security(script_content: str, security: str, whitelist: str = "") -> str | None:
    """Validate script content line-by-line against security policy.

    Returns error message string on block, None if allowed.
    Known limitation: variable assignment + indirect execution (e.g., `cmd="rm"; $cmd`)
    passes line-by-line checks. Documented in design.md D4.
    """
    if security == "none":
        return None

    blacklist_commands = {"rm", "mkfs", "dd", "shutdown", "reboot", "init", "halt", "poweroff"}
    whitelist_set = {w.strip() for w in whitelist.split(",") if w.strip()} if whitelist else set()

    for line in script_content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        # Extract the command name (first word)
        parts = stripped.split()
        if not parts:
            continue
        cmd_name = parts[0].split("/")[-1]  # Handle paths like /bin/rm
        if security in ("blacklist", "all"):
            if cmd_name in blacklist_commands:
                return f"脚本包含黑名单命令: {cmd_name}"
        if security == "whitelist":
            if cmd_name not in whitelist_set:
                return f"脚本包含不在白名单中的命令: {cmd_name}"
    return None


def _cmd_exec_result_from_playbook(result: dict) -> dict:
    """将 run_playbook 结果映射为 cmd_exec 节点结果。

    修复 Bug 2：ansible 连接失败（UNREACHABLE，rc!=0）时 shell_stdout 首行是
    PLAY 头而非 ERROR 前缀，旧逻辑会误判为 ok。现以 rc 为首要判定：
    - rc != 0 → failed（stdout 保留，stderr 记录错误）
    - rc == 0 → 依 parse_cmd_exec_output（timeout/blocked/failed/ok）
    """
    raw = result.get("shell_stdout") or result.get("stdout") or ""
    rc = result.get("rc")
    if rc != 0:
        stderr = result.get("stderr") or ""
        if not stderr:
            stderr = "命令执行失败（ansible rc=%s）" % rc
        return {"rc": rc, "status": "failed", "stdout": raw, "stderr": stderr}
    parsed = parse_cmd_exec_output(raw, rc=rc)
    if parsed["status"] == "ok":
        return {"rc": 0, "status": "successful", "stdout": parsed["stdout"]}
    return {"rc": -1, "status": "failed", "stdout": parsed["stdout"], "stderr": parsed["error"]}


def _ansible_false_success_error(result: dict, ip: str) -> str | None:
    """ansible rc==0 但 playbook 实际未执行目标主机时，返回友好错误信息。

    修复 Bug 3（任务 6 排查）：节点 IP 不在 ansible inventory 时 playbook 输出
    "Could not match supplied host pattern / skipping: no hosts matched"，
    ansible-playbook 仍以 rc=0 退出——旧逻辑会误报 success。本函数在 rc==0
    时扫描输出标记，命中即返回对应错误文案（镜像 cluster_edge_env.py 的防护）。
    """
    raw = "\n".join(
        str(result.get(k) or "") for k in ("stdout", "shell_stdout", "stderr")
    ).lower()
    if "no hosts matched" in raw or "could not match supplied host pattern" in raw:
        return f"节点 {ip} 不在 Ansible 主机清单中，请在 inventory/host 文件中添加该节点的 SSH 连接信息"
    if "unreachable!" in raw or '"unreachable": true' in raw:
        return f"节点 {ip} 无法连接，请检查网络和 SSH 配置"
    if "permission denied" in raw:
        return f"节点 {ip} SSH 认证失败，请检查免密登录或 inventory/host 中的密码"
    return None


def parse_cmd_exec_output(raw: str, rc: int = 0) -> dict:
    """Parse cmd_exec.sh output into a structured result.

    Status mapping (评审确认): 超时→timeout, 失败→failed, 拦截→blocked, 否则 ok.
    Returns ``{"status": str, "stdout": str, "error": str | None}``.
    """
    if not raw:
        if rc != 0:
            return {"status": "failed", "stdout": "", "error": "命令无输出（ansible rc=%s）" % rc}
        return {"status": "ok", "stdout": "", "error": None}
    first = raw.splitlines()[0].strip()
    if first.startswith("ERROR: 命令超时"):
        return {"status": "timeout", "stdout": raw, "error": first}
    if first.startswith("ERROR: 命令执行失败"):
        return {"status": "failed", "stdout": raw, "error": first}
    if (
        first.startswith("ERROR: 命令含")
        or first.startswith("ERROR: 白名单")
        or "不在白名单" in first
    ):
        return {"status": "blocked", "stdout": raw, "error": first}
    if rc != 0:
        return {"status": "failed", "stdout": raw, "error": "命令执行失败（ansible rc=%s）" % rc}
    return {"status": "ok", "stdout": raw, "error": None}

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
    from app.services.ansible_service import get_ssh_user, _run_ssh_with_fallback, resolve_ssh_port

    ssh_user = get_ssh_user(node.ip)
    ssh_port = resolve_ssh_port(node)
    destpath = str(Path(prefix).parent) + "/"
    build_cmd = f"cd {destpath}soft/install-edge && ./install-edge.sh {prefix}"
    on_log({"stdout": f"$ {build_cmd}"})
    rc, stdout, stderr = await _run_ssh_with_fallback(
        node.ip, ssh_user, build_cmd, on_line=on_log, port=ssh_port,
    )
    return {"rc": rc, "status": "success" if rc == 0 else "failed", "stdout": stdout, "stderr": stderr, "command": build_cmd}


def _parse_distribute_results(stdout: str, stderr: str, items: list, overall_rc: int) -> dict:
    """Parse ansible distribute_file output to determine per-node success/failure.

    Ansible ``with_together`` output lines are prefixed with ``[ip]``.
    Returns ``{ip: {"rc": int, "success": bool, "stdout": str, "stderr": str}}``.
    """
    results: dict = {}
    # Initialize all items as failed (worst case)
    for item in items:
        results[item.ip] = {"rc": overall_rc, "success": False, "stdout": "", "stderr": stderr}

    if not stdout:
        return results

    current_ip = None
    for line in stdout.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        # Check for [ip] prefix
        if stripped.startswith("[") and "]" in stripped:
            bracket_end = stripped.index("]")
            candidate_ip = stripped[1:bracket_end]
            # Validate it looks like an IP
            if any(c.isdigit() for c in candidate_ip) and len(candidate_ip) < 20:
                current_ip = candidate_ip
                remaining = stripped[bracket_end + 1:].strip()
                if current_ip in results:
                    results[current_ip]["stdout"] += remaining + "\n"
                continue
        if current_ip and current_ip in results:
            results[current_ip]["stdout"] += stripped + "\n"

    # If overall rc is 0, assume success for nodes that didn't show errors
    if overall_rc == 0:
        for ip, nr in results.items():
            nr["success"] = True
            nr["rc"] = 0

    # Check for UNREACHABLE or failed messages per node
    for line in stdout.splitlines():
        stripped = line.strip()
        if "UNREACHABLE" in stripped or "Failed to connect" in stripped:
            for ip, nr in results.items():
                if ip in stripped:
                    nr["success"] = False
                    nr["rc"] = -1

    return results
