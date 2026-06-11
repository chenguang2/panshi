import asyncio
import io
import json
import logging
import os
import re
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator
import queue

logger = logging.getLogger(__name__)

# Resolve ansible project root: backend/ansible/ relative to this file
_ANSIBLE_DIR = Path(__file__).resolve().parent.parent.parent / "ansible"
# Allow override via env var for non-standard deployment layouts
PRIVATE_DATA_DIR = os.getenv("PANSHI_ANSIBLE_DIR", str(_ANSIBLE_DIR))

DEFAULT_JOB_TIMEOUT = 60
MAX_CONCURRENT_PLAYBOOKS = 5

# Allowed tags for the generic /ansible-run endpoint
ALLOWED_TAGS = frozenset({
    "nginx_cmd_run",
    "edge_statistic",
    "edge_tail_log",
    "edge_master_copy_to_slaves",
    "edge_init_env",
    "script_cmd_run",
    "nginx_stream",
    "edge_plugins_md5",
})

# Mapping from nginx_cmd values to user-facing action names
NGINX_CMD_MAP = {
    "start": "nginx_start",
    "stop": "nginx_stop",
    "restart": "nginx_reload",
    "check": "nginx_check",
}

# Reverse mapping for display
NGINX_CMD_LABEL = {v: k for k, v in NGINX_CMD_MAP.items()}


_SENTINEL = object()
MAX_LOG_LINES = 500


async def _run_ansible_stream(
    runner_method,
    ip: str,
    tag: str,
    extravars: dict[str, Any] | None = None,
    job_timeout: int = 600,
) -> AsyncGenerator[str, None]:
    """Run ansible playbook and yield SSE-formatted events with real-time stdout lines.

    Args:
        runner_method: An ``AnsibleRunnerService`` instance (or compatible) used to
                       call ``run_playbook`` with an ``event_handler``.
        ip: Target node IP.
        tag: Ansible tag to execute (e.g. ``install_openresty``).
        extravars: Extra variables for the playbook.

    Yields:
        SSE event strings: ``data: {"line": "...", "percent": N}\\n\\n``
        Final event: ``data: {"rc": N, "status": "...", "percent": 100}\\n\\n``
    """
    q: queue.Queue = queue.Queue()
    line_count = 0

    def event_handler(event_data: dict) -> None:
        # Ansible's display line (e.g. "TASK [edge : Build edge server]")
        stdout = event_data.get("stdout", "")
        for line in stdout.splitlines():
            if line.strip():
                q.put(line)
        # Task result stdout (actual command output from raw/shell modules)
        res = event_data.get("event_data", {}).get("res", {})
        if res:
            task_stdout = res.get("stdout", "") or ""
            for line in task_stdout.splitlines():
                if line.strip():
                    q.put(line)
            task_stderr = res.get("stderr", "") or ""
            for line in task_stderr.splitlines():
                if line.strip():
                    q.put(f"[stderr] {line}")

        async def _run_with_handler() -> dict[str, Any]:
            try:
                return await runner_method.run_playbook(
                    ip=ip, tag=tag, extravars=extravars,
                    event_handler=event_handler,
                    job_timeout=job_timeout,
                )
            finally:
                q.put(_SENTINEL)

    # Yield initial event to confirm connection is established
    yield f"data: {json.dumps({'line': '正在连接远程主机并启动 Ansible...', 'percent': 0})}\n\n"

    # Start run_playbook in background, read from queue concurrently
    task = asyncio.create_task(_run_with_handler())

    while True:
        line = await asyncio.to_thread(q.get)
        if line is _SENTINEL:
            break
        line_count += 1
        pct = min(int(line_count / 200 * 100), 99) if line_count < 200 else min(50 + int((line_count - 200) / 20), 99)
        yield f"data: {json.dumps({'line': line, 'percent': pct})}\n\n"

    result = await task
    rc = result.get("rc", -1)
    status = result.get("status", "failed")
    yield f"data: {json.dumps({'rc': rc, 'status': status, 'percent': 100})}\n\n"


class AnsibleExecutionError(Exception):
    """Raised when ansible-runner execution fails."""
    def __init__(self, message: str, rc: int = -1, detail: str | None = None):
        self.rc = rc
        self.detail = detail
        super().__init__(message)


class AnsibleRunnerService:
    """Service for executing Ansible playbooks via ansible-runner.

    The ansible project lives at ``private_data_dir`` (default: ``backend/ansible/``).
    The ``inventory/hosts`` file inside that directory is maintained by the ops team
    and contains SSH credentials. Playbooks target specific hosts via the ``ips``
    extra variable (the playbook declares ``hosts: '{{ ips | default("edge_cluster") }}'``).
    """

    def __init__(
        self,
        private_data_dir: str = PRIVATE_DATA_DIR,
        job_timeout: int = DEFAULT_JOB_TIMEOUT,
    ):
        self._private_data_dir = private_data_dir
        self._job_timeout = job_timeout
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_PLAYBOOKS)
        # Ensure SSH ControlPath directory exists for ControlMaster sockets
        os.makedirs("/tmp/panshi-cp", exist_ok=True)

    # ── public API ──────────────────────────────────────────────

    async def run_playbook(
        self,
        ip: str,
        tag: str,
        extravars: dict[str, Any] | None = None,
        event_handler: Any = None,
        job_timeout: int | None = None,
    ) -> dict[str, Any]:
        """Execute an ansible playbook tag against a single target host.

        Args:
            ip: Target node IP (injected into ``extravars.ips``).
            tag: Ansible tag to execute (e.g. ``nginx_cmd_run``).
        extravars: Extra variables merged with ``{"ips": ip}``.
        event_handler: Optional callback for real-time event streaming.
                       Called for each ansible-runner event.
        job_timeout: Playbook timeout in seconds (default 60, use 600+ for install).

        Returns:
            Dict with keys ``rc``, ``status``, ``stdout``, ``stderr``.
        """
        import ansible_runner

        ev = dict(extravars or {})
        ev["ips"] = ip  # playbook reads this to scope to a specific host

        logger.info(
            "Running ansible playbook tag=%s ip=%s extravars=%s",
            tag, ip, _sanitize_for_log(ev),
        )

        # Ensure ansible-playbook is findable in PATH even when the backend is
        # started without uv run (e.g. prepare/linux/start.sh uses raw python).
        _venv_bin = str(Path(sys.executable).parent.resolve())
        _current_path = os.environ.get("PATH", "")
        _runner_env = {
            "ANSIBLE_HOST_KEY_CHECKING": "False",
            "ANSIBLE_SSH_ARGS": "-C -o ControlMaster=auto -o ControlPersist=600s -o UpdateHostKeys=no",
            "ANSIBLE_SSH_CONTROL_PATH": "/tmp/panshi-cp/%%h-%%p-%%r",
            "ANSIBLE_PIPELINING": "True",
        }
        if _venv_bin not in _current_path:
            _runner_env["PATH"] = f"{_venv_bin}:{_current_path}"

        # Build kwargs for ansible_runner.run, optionally adding event_handler
        effective_timeout = job_timeout if job_timeout is not None else self._job_timeout
        runner_kwargs = dict(
            private_data_dir=self._private_data_dir,
            playbook="edge.yml",
            tags=tag,
            extravars=ev,
            envvars=_runner_env,
            settings={"job_timeout": effective_timeout},
        )
        if event_handler is not None:
            runner_kwargs["event_handler"] = event_handler

        async with self._semaphore:
            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        ansible_runner.run,
                        **runner_kwargs,
                    ),
                    timeout=effective_timeout + 10,
                )
            except asyncio.TimeoutError:
                raise AnsibleExecutionError(
                    f"Playbook timed out after {self._job_timeout}s",
                    rc=-1, detail="timeout",
                )

        _raw_stdout = getattr(result, "stdout", "")
        _raw_stderr = getattr(result, "stderr", "")
        # ansible-runner may return file handles (TextIOWrapper / IOBase) instead of
        # strings in some configurations; read them to avoid JSON serialization errors.
        if isinstance(_raw_stdout, io.IOBase):
            stdout = _raw_stdout.read() or ""
        elif not isinstance(_raw_stdout, str):
            stdout = str(_raw_stdout)
        else:
            stdout = _raw_stdout
        if isinstance(_raw_stderr, io.IOBase):
            stderr = _raw_stderr.read() or ""
        elif not isinstance(_raw_stderr, str):
            stderr = str(_raw_stderr)
        else:
            stderr = _raw_stderr
        rc = getattr(result, "rc", -1)
        status = getattr(result, "status", "failed")
        # Capture the full ansible-playbook command for diagnostic display
        command = getattr(result.config, "command", None)
        command_str = " ".join(command) if isinstance(command, list) else (command or "")

        logger.info(
            "Ansible result tag=%s ip=%s rc=%d status=%s",
            tag, ip, rc, status,
        )

        return {
            "rc": rc,
            "status": status,
            "stdout": stdout,
            "stderr": stderr,
            "command": command_str,
        }

    async def nginx_cmd(
        self,
        ip: str,
        action: str,
        prefix: str,
        ports: str = "",
    ) -> dict[str, Any]:
        """Execute nginx_cmd_run tag (start/stop/reload/check)."""
        nginx_cmd = NGINX_CMD_MAP.get(action)
        if nginx_cmd is None:
            raise ValueError(f"Unknown nginx_cmd action: {action}")
        ev = {
            "nginx_cmd": nginx_cmd,
            "prefix": prefix,
            "ports": ports,
        }
        return await self.run_playbook(ip, "nginx_cmd_run", ev)

    async def statistic(
        self,
        ip: str,
        prefix: str,
        ports: str,
    ) -> dict[str, Any]:
        """Execute edge_statistic tag to collect CPU/memory/disk/version."""
        ev = {"prefix": prefix, "ports": ports}
        return await self.run_playbook(ip, "edge_statistic", ev)

    async def install_openresty(
        self,
        ip: str,
        prefix: str,
        srcpath: str,
        destpath: str,
    ) -> dict[str, Any]:
        """Execute install_openresty tag to deploy OpenResty on target node."""
        ev = {"prefix": prefix, "srcpath": srcpath, "destpath": destpath}
        return await self.run_playbook(ip, "install_openresty", ev)

    async def install_edge(
        self,
        ip: str,
        prefix: str,
    ) -> dict[str, Any]:
        """Execute install_edge tag to deploy Edge service on target node."""
        ev = {"prefix": prefix}
        return await self.run_playbook(ip, "install_edge", ev)

    async def generic_run(
        self,
        ip: str,
        tag: str,
        extravars: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Run an arbitrary allowed tag."""
        if tag not in ALLOWED_TAGS:
            raise ValueError(f"Disallowed tag: {tag}")
        return await self.run_playbook(ip, tag, extravars)

    # ── helpers ────────────────────────────────────────────────

    @staticmethod
    def _parse_nginx_status(stdout: str) -> dict[str, Any]:
        """Parse nginx_cmd.sh stdout to determine nginx process status.

        Returns a dict with ``nginx_running`` (bool) and ``nginx_status`` (str).
        """
        # Strip ANSI escape codes before matching
        clean = _strip_ansi(stdout)
        # Running indicators (rc may be 0/1 but nginx IS running)
        if re.search(r"Nginx\s+process\s+.*\b running\b", clean, re.IGNORECASE):
            pid_match = re.search(r"PID\s*:\s*(\d+)", clean)
            return {
                "nginx_running": True,
                "nginx_status": "running",
                "nginx_pid": pid_match.group(1) if pid_match else None,
            }
        if re.search(r"Nginx\s+started\s+successfully", clean, re.IGNORECASE):
            pid_match = re.search(r"PID\s*:\s*(\d+)", clean)
            return {
                "nginx_running": True,
                "nginx_status": "started",
                "nginx_pid": pid_match.group(1) if pid_match else None,
            }
        # Stopped / not-running indicators
        if re.search(r"Nginx\s+process\s+does\s+not\s+exist", clean, re.IGNORECASE):
            return {"nginx_running": False, "nginx_status": "not_exist", "nginx_pid": None}
        if re.search(r"Nginx\s+process\s+has\s+been\s+stopped", clean, re.IGNORECASE):
            return {"nginx_running": False, "nginx_status": "stopped", "nginx_pid": None}
        if re.search(r"Failed\s+to\s+start\s+Nginx", clean, re.IGNORECASE):
            return {"nginx_running": False, "nginx_status": "start_failed", "nginx_pid": None}
        # Fallback: unknown
        return {"nginx_running": False, "nginx_status": "unknown", "nginx_pid": None}

    def build_status_detail(
        self,
        tag: str,
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """Build the ``status_detail`` JSON payload from an ansible result."""
        detail: dict[str, Any] = {
            "last_execution": datetime.now(timezone.utc).isoformat(),
            "last_status": result.get("status", "unknown"),
            "last_rc": result.get("rc", -1),
            "last_tag": tag,
            "last_error": None if result.get("rc") == 0 else (
                result.get("stderr", "") or result.get("stdout", "")
            ),
        }
        if tag in ("nginx_cmd_run", "edge_statistic"):
            detail["nginx"] = self._parse_nginx_status(
                result.get("stdout", "")
            )
        if tag == "edge_statistic" and result.get("rc") == 0:
            detail["statistic"] = self._parse_statistic_stdout(
                result.get("stdout", "")
            )
        return detail


    @staticmethod
    def _parse_statistic_stdout(stdout: str) -> dict[str, str]:
        """Extract CPU/memory/disk/version from cron_check.sh stdout.

        The input is the full playbook stdout (with ANSI codes + JSON formatting).
        Strips ANSI codes and searches for target patterns across all lines.
        """
        clean = _strip_ansi(stdout)
        stats: dict[str, str] = {}
        for line in clean.splitlines():
            # Remove JSON quoting / commas / indentation from playbook debug output
            raw = line.strip().strip('",').strip()
            if "Total CPU usage for Nginx:" in raw:
                stats["cpu_usage"] = raw.split(":", 1)[1].strip().strip('",')
            elif "Total memory usage for Nginx:" in raw:
                stats["memory_usage"] = raw.split(":", 1)[1].strip().strip('",')
            elif "Total CPU usage for all processes:" in raw:
                stats["system_cpu_usage"] = raw.split(":", 1)[1].strip().strip('",')
            elif "Total memory usage for all processes:" in raw:
                stats["system_memory_usage"] = raw.split(":", 1)[1].strip().strip('",')
            elif "Edge version:" in raw:
                # Value is a JSON object like {"version":"2.7.5","boot_time":...}
                # Playbook debug output repr-escapes inner quotes (\"), undo that first.
                val = raw.split(":", 1)[1].strip().strip('",').replace('\\"', '"')
                try:
                    parsed = json.loads(val)
                    if isinstance(parsed, dict) and "version" in parsed:
                        stats["edge_version"] = parsed["version"]
                    else:
                        stats["edge_version"] = val
                except (json.JSONDecodeError, TypeError):
                    stats["edge_version"] = val
        return stats


# ── module-level helpers ──────────────────────────────────────

_ANSI_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


def _strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences from a string."""
    return _ANSI_RE.sub("", text)


def _sanitize_for_log(extravars: dict[str, Any]) -> dict[str, Any]:
    """Remove sensitive fields before logging."""
    safe = dict(extravars)
    for key in ("ansible_ssh_pass", "ansible_ssh_private_key_file", "ssh_password"):
        safe.pop(key, None)
    return safe
