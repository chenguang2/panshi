import asyncio
import base64
import getpass
import io
import json
import logging
import os
import re
import shutil
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator, Callable
import queue

import yaml

from app.core.features import get_concurrency

logger = logging.getLogger(__name__)

# Resolve ansible project root: backend/ansible/ relative to this file
_ANSIBLE_DIR = Path(__file__).resolve().parent.parent.parent / "ansible"
# Allow override via env var for non-standard deployment layouts
PRIVATE_DATA_DIR = os.getenv("PANSHI_ANSIBLE_DIR", str(_ANSIBLE_DIR))

DEFAULT_JOB_TIMEOUT = 60
MAX_CONCURRENT_PLAYBOOKS = 5

_INVENTORY_PATH = Path(PRIVATE_DATA_DIR) / "inventory" / "host"

# ── SSH helper functions ──────────────────────────────────────────────

SSH_KEY_PATH = os.path.expanduser("~/.ssh/id_rsa")


def _build_ssh_cmd(ip: str, ssh_user: str, cmd: str, password: str | None = None, port: int | None = None) -> list[str]:
    """Build SSH command list, optionally wrapping with sshpass."""
    base_opts = [
        "-o", "ConnectTimeout=30",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
    ]
    if port and port != 22:
        base_opts += ["-p", str(port)]
    if password:
        return [
            "sshpass", "-p", password, "ssh",
            *base_opts,
            f"{ssh_user}@{ip}", cmd,
        ]
    return [
        "ssh", "-i", SSH_KEY_PATH,
        "-o", "BatchMode=yes",
        *base_opts,
        f"{ssh_user}@{ip}", cmd,
    ]


def _sshpass_available() -> bool:
    """Check whether ``sshpass`` is installed and in PATH."""
    return shutil.which("sshpass") is not None


async def _run_subprocess(cmd: list[str]) -> tuple[int, str, str]:
    """Run a subprocess, return (rc, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    rc = proc.returncode or 0
    return rc, stdout.decode("utf-8", errors="replace").strip(), stderr.decode("utf-8", errors="replace").strip()


async def _run_subprocess_stream(
    cmd: list[str],
    on_line: Callable[[dict], None] | None = None,
) -> tuple[int, str, str]:
    """Run a subprocess, streaming stdout/stderr lines to ``on_line`` as they arrive.

    Unlike ``_run_subprocess`` (which blocks until the process exits via
    ``communicate()``), this reads stdout line-by-line and invokes ``on_line``
    for each line in real time. Returns (rc, full_stdout, full_stderr).
    """
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_lines: list[str] = []
    stderr_lines: list[str] = []

    async def pump(stream: Any, collect: list[str], is_stderr: bool) -> None:
        while True:
            raw = await stream.readline()
            if not raw:
                break
            line = raw.decode("utf-8", errors="replace").rstrip("\n")
            collect.append(line)
            if on_line is not None and line.strip():
                on_line({"stderr": line} if is_stderr else {"stdout": line})

    await asyncio.gather(
        pump(proc.stdout, stdout_lines, False),
        pump(proc.stderr, stderr_lines, True),
    )
    rc = await proc.wait()
    return rc, "\n".join(stdout_lines), "\n".join(stderr_lines)


async def _run_ssh_with_fallback(
    ip: str,
    ssh_user: str,
    cmd: str,
    password: str | None = None,
    port: int | None = None,
    status_callback=None,
    on_line: Callable[[dict], None] | None = None,
) -> tuple[int, str, str]:
    """Run SSH command, retrying with password fallback on auth failure.

    When ``on_line`` is provided, stdout/stderr lines are streamed to it in
    real time (compile output etc.). Returns (rc, stdout, stderr). On fallback
    failure, merges both error outputs.
    """
    # Round 1: key-based
    key_cmd = _build_ssh_cmd(ip, ssh_user, cmd, port=port)
    if on_line is not None:
        rc, stdout, stderr = await _run_subprocess_stream(key_cmd, on_line)
    else:
        rc, stdout, stderr = await _run_subprocess(key_cmd)
    if rc == 0:
        return rc, stdout, stderr

    # Check whether to attempt password fallback
    is_auth_failure = (
        rc == 255
        or "Permission denied" in stderr
        or "Authentication failed" in stderr
    )
    if not is_auth_failure:
        return rc, stdout, stderr
    if password and not _sshpass_available():
        hint = "\n提示: 免密登录失败，且 sshpass 未安装，无法使用密码认证。请安装 sshpass 后重试: sudo apt-get install sshpass"
        return rc, stdout, stderr + hint
    if not password:
        return rc, stdout, stderr

    # Round 2: password-based
    if status_callback:
        await status_callback("免密登录失败，正在尝试密码认证...")
    pass_cmd = _build_ssh_cmd(ip, ssh_user, cmd, password=password, port=port)
    if on_line is not None:
        rc2, stdout2, stderr2 = await _run_subprocess_stream(pass_cmd, on_line)
    else:
        rc2, stdout2, stderr2 = await _run_subprocess(pass_cmd)
    if rc2 == 0:
        return rc2, stdout2, stderr2

    # Both failed — merge errors
    merged_stderr = f"免密登录失败: {stderr}\n--- 密码认证也失败 ---\n{stderr2}"
    return rc2, stdout2, merged_stderr


def get_ssh_password(ip: str) -> str | None:
    """Resolve SSH password for *ip* from ansible inventory.

    Priority: host-level ``ansible_ssh_pass`` → group vars → ``None``.
    Returns ``None`` when no password is configured (key-based auth only).
    """
    try:
        with open(_INVENTORY_PATH) as f:
            data = yaml.safe_load(f)
    except (FileNotFoundError, yaml.YAMLError):
        return None

    try:
        hosts = (
            data.get("all", {})
            .get("children", {})
            .get("edge_cluster", {})
            .get("hosts", {})
        )
        host_entry = hosts.get(ip, {})
        if isinstance(host_entry, dict):
            pw = host_entry.get("ansible_ssh_pass")
            if pw:
                return str(pw)

        group_vars = (
            data.get("all", {})
            .get("children", {})
            .get("edge_cluster", {})
            .get("vars", {})
        )
        if isinstance(group_vars, dict):
            pw = group_vars.get("ansible_ssh_pass")
            if pw:
                return str(pw)
    except (AttributeError, TypeError):
        pass

    return None


def is_node_in_inventory(ip: str) -> bool:
    """Return True if *ip* exists under ``edge_cluster.hosts`` in the inventory.

    Used as a pre-check before autostart enable/disable: root-credential
    injection relies on the host already being present in the inventory.
    """
    try:
        with open(_INVENTORY_PATH) as f:
            data = yaml.safe_load(f)
    except (FileNotFoundError, yaml.YAMLError):
        return False
    try:
        hosts = (
            data.get("all", {})
            .get("children", {})
            .get("edge_cluster", {})
            .get("hosts", {})
        )
        return isinstance(hosts.get(ip), dict)
    except (AttributeError, TypeError):
        return False


def get_ssh_user(ip: str) -> str:
    """Resolve SSH user for *ip* from ansible inventory, falling back to ``"jboss"``.

    Priority: host-level ``ansible_ssh_user`` → group vars → ``"jboss"``.
    """
    try:
        with open(_INVENTORY_PATH) as f:
            data = yaml.safe_load(f)
    except (FileNotFoundError, yaml.YAMLError):
        return "jboss"

    try:
        hosts = (
            data.get("all", {})
            .get("children", {})
            .get("edge_cluster", {})
            .get("hosts", {})
        )
        host_entry = hosts.get(ip, {})
        if isinstance(host_entry, dict):
            user = host_entry.get("ansible_ssh_user")
            if user:
                return user

        group_vars = (
            data.get("all", {})
            .get("children", {})
            .get("edge_cluster", {})
            .get("vars", {})
        )
        if isinstance(group_vars, dict):
            user = group_vars.get("ansible_ssh_user")
            if user:
                return user
    except (AttributeError, TypeError):
        pass

    return "jboss"


def get_default_run_user(ip: str) -> str:
    """Resolve the default run user for edge.service (决策 7).

    Uses the host-level ``ansible_ssh_user`` from the inventory ONLY when it is
    explicitly configured for that host; otherwise falls back to the user
    running this backend process (``getpass.getuser()``).

    Note: unlike ``get_ssh_user`` (which is about SSH connection and falls back
    to group vars / "jboss"), the run user is about which user edge.service
    should run as. A host without an explicit ansible_ssh_user has no per-host
    run user, so we default to the backend process user.
    """
    try:
        with open(_INVENTORY_PATH) as f:
            data = yaml.safe_load(f)
    except (FileNotFoundError, yaml.YAMLError):
        return getpass.getuser()
    try:
        hosts = (
            data.get("all", {})
            .get("children", {})
            .get("edge_cluster", {})
            .get("hosts", {})
        )
        host_entry = hosts.get(ip, {})
        if isinstance(host_entry, dict):
            user = host_entry.get("ansible_ssh_user")
            if user:
                return user
    except (AttributeError, TypeError):
        pass
    return getpass.getuser()


def get_ssh_port(ip: str) -> int | None:
    """Resolve SSH port for *ip* from ansible inventory.

    Priority: host-level ``ansible_port`` → group vars → ``None`` (default 22).
    """
    try:
        with open(_INVENTORY_PATH) as f:
            data = yaml.safe_load(f)
    except (FileNotFoundError, yaml.YAMLError):
        return None

    try:
        hosts = (
            data.get("all", {})
            .get("children", {})
            .get("edge_cluster", {})
            .get("hosts", {})
        )
        host_entry = hosts.get(ip, {})
        if isinstance(host_entry, dict):
            port = host_entry.get("ansible_port")
            if port:
                return int(port)

        group_vars = (
            data.get("all", {})
            .get("children", {})
            .get("edge_cluster", {})
            .get("vars", {})
        )
        if isinstance(group_vars, dict):
            port = group_vars.get("ansible_port")
            if port:
                return int(port)
    except (AttributeError, TypeError, ValueError):
        pass

    return None


def resolve_ssh_port(node) -> int:
    """Resolve the SSH port for a Node.

    Priority: ``node.ssh_port`` → inventory ``ansible_port`` → 22.
    """
    if getattr(node, "ssh_port", None):
        return int(node.ssh_port)
    inv_port = get_ssh_port(node.ip)
    return inv_port if inv_port else 22


# Serialize access to the inventory file for temporary ansible_port injection
_inventory_lock = threading.Lock()
# In-memory backup of original SSH creds per-IP, set by _inventory_inject_ssh
# and consumed by _inventory_restore_ssh to restore the ops-owned inventory.
_ssh_backup: dict[str, dict[str, str | None]] = {}


def _inventory_inject_port(ip: str, port: int) -> None:
    """Temporarily set ``ansible_port`` for *ip* in the inventory file.

    Injects the port before an ansible run and restores the original value
    afterwards, so the ops-owned inventory file is never left modified.
    No-op when the port matches what is already configured.
    """
    with _inventory_lock:
        try:
            with open(_INVENTORY_PATH) as f:
                data = yaml.safe_load(f) or {}
            hosts = (
                data.get("all", {})
                .get("children", {})
                .get("edge_cluster", {})
                .get("hosts", {})
            )
            host_entry = hosts.get(ip, {})
            if not isinstance(host_entry, dict):
                return
            current = host_entry.get("ansible_port")
            if current is not None and int(current) == port:
                return
            host_entry["ansible_port"] = port
            with open(_INVENTORY_PATH, "w") as f:
                yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
            logger.info("Injected ansible_port=%s for %s into inventory", port, ip)
        except (FileNotFoundError, OSError, yaml.YAMLError, ValueError) as e:
            logger.warning("Failed to inject ansible_port for %s: %s", ip, e)


def _inventory_restore_port(ip: str, port: int) -> None:
    """Remove the injected ``ansible_port`` from *ip* in the inventory file.

    Only removes when the current value equals the injected *port* (i.e. we
    injected it); a port the ops team configured themselves is preserved.
    """
    with _inventory_lock:
        try:
            with open(_INVENTORY_PATH) as f:
                data = yaml.safe_load(f) or {}
            hosts = (
                data.get("all", {})
                .get("children", {})
                .get("edge_cluster", {})
                .get("hosts", {})
            )
            host_entry = hosts.get(ip, {})
            if not isinstance(host_entry, dict):
                return
            if host_entry.get("ansible_port") is not None and int(host_entry["ansible_port"]) == port:
                del host_entry["ansible_port"]
                with open(_INVENTORY_PATH, "w") as f:
                    yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
                logger.info("Restored inventory (removed injected ansible_port for %s)", ip)
        except (FileNotFoundError, OSError, yaml.YAMLError, ValueError) as e:
            logger.warning("Failed to restore ansible_port for %s: %s", ip, e)


def _inventory_inject_ssh(ip: str, user: str, password: str) -> None:
    """Temporarily set ``ansible_ssh_user``/``ansible_ssh_pass`` for *ip* in the inventory.

    Edits the inventory file at the line level, preserving comments/format of
    every other line (a yaml round-trip would drop comments and rewrite the
    whole file). Original credential lines are backed up in ``_ssh_backup`` so
    ``_inventory_restore_ssh`` can restore them verbatim.
    No-op if *ip* is not present in the inventory.
    """
    with _inventory_lock:
        try:
            with open(_INVENTORY_PATH) as f:
                lines = f.readlines()
            start = _find_host_line(lines, ip)
            if start is None:
                return
            backup = {
                "user": _get_cred_line(lines, start, "ansible_ssh_user"),
                "pass": _get_cred_line(lines, start, "ansible_ssh_pass"),
            }
            _ssh_backup[ip] = backup
            _set_cred_line(lines, start, "ansible_ssh_user", user)
            _set_cred_line(lines, start, "ansible_ssh_pass", password)
            with open(_INVENTORY_PATH, "w") as f:
                f.writelines(lines)
            logger.info("Injected root ssh creds for %s into inventory", ip)
        except (FileNotFoundError, OSError, TypeError) as e:
            logger.warning("Failed to inject ssh creds for %s: %s", ip, e)


def _inventory_restore_ssh(ip: str) -> None:
    """Restore the inventory entry for *ip* to its pre-injection state.

    Reverts the ``ansible_ssh_user``/``ansible_ssh_pass`` lines to the exact
    original text saved by ``_inventory_inject_ssh`` (preserving quotes and
    format). Removes the lines if the original had no credentials.
    """
    with _inventory_lock:
        try:
            with open(_INVENTORY_PATH) as f:
                lines = f.readlines()
            start = _find_host_line(lines, ip)
            if start is None:
                return
            backup = _ssh_backup.pop(ip, None)
            if backup is None:
                return
            _restore_cred_line(lines, start, "ansible_ssh_user", backup.get("user"))
            _restore_cred_line(lines, start, "ansible_ssh_pass", backup.get("pass"))
            with open(_INVENTORY_PATH, "w") as f:
                f.writelines(lines)
            logger.info("Restored inventory ssh creds for %s", ip)
        except (FileNotFoundError, OSError, TypeError) as e:
            logger.warning("Failed to restore ssh creds for %s: %s", ip, e)


def _find_host_line(lines: list[str], ip: str) -> int | None:
    """Return the index of the host line for *ip* under ``hosts:``, else None."""
    host_prefix = f"        {ip}:"
    for i, line in enumerate(lines):
        stripped = line.rstrip("\n")
        if stripped.startswith(host_prefix) or stripped == host_prefix:
            return i
    return None


def _get_cred_line(lines: list[str], start: int, key: str) -> str | None:
    """Return the raw credential line text for *key* inside the host block."""
    for i in range(start + 1, len(lines)):
        line = lines[i]
        if not line.startswith("          "):
            break
        if line.lstrip().startswith(f"{key}:"):
            return line
    return None


def _set_cred_line(lines: list[str], start: int, key: str, value: str) -> None:
    """Replace the *key* line in the host block, or append it under the host."""
    idx = None
    for i in range(start + 1, len(lines)):
        line = lines[i]
        if not line.startswith("          "):
            break
        if line.lstrip().startswith(f"{key}:"):
            idx = i
            break
    indent = "          "
    new_line = f"{indent}{key}: {value}\n"
    if idx is not None:
        lines[idx] = new_line
    else:
        lines.insert(start + 1, new_line)


def _restore_cred_line(lines: list[str], start: int, key: str, original: str | None) -> None:
    """Restore the *key* line in the host block to *original* (or remove it)."""
    idx = None
    for i in range(start + 1, len(lines)):
        line = lines[i]
        if not line.startswith("          "):
            break
        if line.lstrip().startswith(f"{key}:"):
            idx = i
            break
    if idx is None:
        return
    if original is not None:
        lines[idx] = original
    else:
        del lines[idx]


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
    "edge_read_env",
    "edge_pack_list",
    "software_check_run",
    "cmd_exec_run",
    "edge_autostart",
})

# Mapping from nginx_cmd values to user-facing action names
NGINX_CMD_MAP = {
    "start": "nginx_start",
    "stop": "nginx_stop",
    "restart": "nginx_reload",
    "reload": "nginx_reload",
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
    ssh_port: int | None = None,
) -> AsyncGenerator[str, None]:
    """Run ansible playbook and yield SSE-formatted events with real-time stdout lines.

    Args:
        runner_method: An ``AnsibleRunnerService`` instance (or compatible) used to
                       call ``run_playbook`` with an ``event_handler``.
        ip: Target node IP.
        tag: Ansible tag to execute (e.g. ``install_openresty``).
        extravars: Extra variables for the playbook.
        ssh_port: Optional SSH port forwarded to run_playbook for inventory injection.

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
                ssh_port=ssh_port,
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
        # This singleton is constructed at import time (module-level in
        # cluster_nodes.py, during main.py's api_router import), so the first
        # get_concurrency() call loads features.yaml here, before main.py:27's
        # explicit load_features(). Both share the module-level cache, making
        # this equivalent to a single read at startup.
        self._semaphore = asyncio.Semaphore(get_concurrency("max_playbooks", MAX_CONCURRENT_PLAYBOOKS))
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
        cancel_event: asyncio.Event | None = None,
        on_progress: Any = None,
        ssh_port: int | None = None,
    ) -> dict[str, Any]:
        """Execute an ansible playbook tag against a single target host.

        Args:
            ip: Target node IP (injected into ``extravars.ips``).
            tag: Ansible tag to execute (e.g. ``nginx_cmd_run``).
        extravars: Extra variables merged with ``{"ips": ip}``.
        event_handler: Optional callback for real-time event streaming.
                       Called for each ansible-runner event.
        job_timeout: Playbook timeout in seconds (default 60, use 600+ for install).
        cancel_event: Optional asyncio.Event; when set, ansible-runner's
                      cancel_callback is armed so the playbook process group
                      gets SIGKILLed (only cancel_callback can stop the
                      playbook -- wait_for/to_thread cannot kill it).
        on_progress: Optional callback receiving each ansible event dict
                     (used by the task engine to collect per-line logs).
        ssh_port: Optional SSH port; when non-22, temporarily injects
                  ``ansible_port`` into the inventory for this run and
                  restores it afterwards.

        Returns:
            Dict with keys ``rc``, ``status``, ``stdout``, ``stderr``.
        """
        import ansible_runner

        # Temporarily inject a non-standard SSH port into the inventory so the
        # ansible connection uses it; restored in finally.
        inject_port = ssh_port if (ssh_port and ssh_port != 22) else None
        if inject_port:
            _inventory_inject_port(ip, inject_port)

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

        # Build kwargs for ansible_runner.run, optionally adding event_handler.
        # When a custom handler is installed, ansible_runner no longer populates
        # result.events, so we wrap the handler to collect res.stdout here and
        # use it to fill shell_stdout later (cmd_exec/software_check rely on it).
        collected_stdout: list[str] = []

        def _wrapped_handler(event: dict) -> None:
            ed = event.get("event_data", {}) if isinstance(event, dict) else {}
            res = ed.get("res", {}) or {}
            out = res.get("stdout")
            if out:
                collected_stdout.append(out)
            handler = event_handler if event_handler is not None else on_progress
            if handler is not None:
                handler(event)

        effective_timeout = job_timeout if job_timeout is not None else self._job_timeout
        runner_kwargs = dict(
            private_data_dir=self._private_data_dir,
            playbook="edge.yml",
            tags=tag,
            extravars=ev,
            envvars=_runner_env,
            settings={"job_timeout": effective_timeout},
        )
        if event_handler is not None or on_progress is not None:
            runner_kwargs["event_handler"] = _wrapped_handler
        if cancel_event is not None:
            runner_kwargs["cancel_callback"] = lambda: cancel_event.is_set()

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
            finally:
                if inject_port:
                    _inventory_restore_port(ip, inject_port)

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

        # Extract structured shell/slurp module output from ansible-runner events.
        # The combined stdout includes ansible headers; use events to get clean output.
        shell_stdout = ""
        slurp_content = ""
        if collected_stdout:
            shell_stdout = collected_stdout[-1]
        event_list = getattr(result, "events", []) or []
        for event in event_list:
            ed = event.get("event_data", {}) if isinstance(event, dict) else {}
            if not ed:
                continue
            # shell/command module: stdout appears in runner_on_ok res
            res = ed.get("res", {}) or {}
            if res.get("stdout"):
                shell_stdout = res["stdout"]
            # slurp module: content is base64-encoded in res.content
            if res.get("content"):
                slurp_content = res["content"]

        return {
            "rc": rc,
            "status": status,
            "stdout": stdout,
            "stderr": stderr,
            "command": command_str,
            "shell_stdout": shell_stdout,
            "slurp_content": slurp_content,
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
        openresty_file: str | None = None,
    ) -> dict[str, Any]:
        """Execute install_openresty tag to deploy OpenResty on target node."""
        ev = {"prefix": prefix, "srcpath": srcpath, "destpath": destpath}
        if openresty_file:
            ev["openresty_file"] = openresty_file
        return await self.run_playbook(ip, "install_openresty", ev)

    async def install_edge(
        self,
        ip: str,
        prefix: str,
    ) -> dict[str, Any]:
        """Execute install_edge tag to deploy Edge service on target node."""
        ev = {"prefix": prefix}
        return await self.run_playbook(ip, "install_edge", ev)

    async def edge_autostart(
        self,
        ip: str,
        action: str,
        edge_service_content: str | None,
        ssh_user: str | None = None,
        ssh_pass: str | None = None,
        on_line: Callable[[dict], None] | None = None,
    ) -> dict[str, Any]:
        """Enable/disable/query Edge systemd self-start over SSH.

        enable/disable connect as root (ssh_user/ssh_pass, passed per-request
        and not persisted) to write edge.service and run systemctl.
        status uses the inventory SSH user (no root needed) to read is-enabled.

        Returns dict with keys rc/status/stdout/stderr.
        """
        if action not in ("enable", "disable", "status"):
            raise ValueError(f"Unknown autostart action: {action}")

        if action in ("enable", "disable"):
            user = ssh_user or "root"
            password = ssh_pass or ""
        else:
            user = get_ssh_user(ip)
            password = get_ssh_password(ip) or ""

        if action == "enable":
            b64 = base64.b64encode((edge_service_content or "").encode()).decode()
            cmd = (
                f"echo {b64} | base64 -d > /etc/systemd/system/edge.service && "
                "systemctl daemon-reload && systemctl enable edge && "
                "systemctl is-enabled edge"
            )
        elif action == "disable":
            cmd = "systemctl disable edge && systemctl is-enabled edge"
        else:
            cmd = "systemctl is-enabled edge"

        rc, stdout, stderr = await _run_ssh_with_fallback(
            ip, user, cmd, password=password, on_line=on_line,
        )
        return {"rc": rc, "status": "successful" if rc == 0 else "failed",
                "stdout": stdout, "stderr": stderr}

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
        if re.search(r"Nginx\s+configuration\s+has\s+been\s+reloaded", clean, re.IGNORECASE):
            return {
                "nginx_running": True,
                "nginx_status": "running",
                "nginx_pid": None,
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


def build_edge_service_content(run_user: str, edge_path: str) -> str:
    """Build the /etc/systemd/system/edge.service content (决策 1a).

    Type=oneshot + RemainAfterExit=yes because ``bin/edge start`` daemonizes
    and returns immediately. No Restart (决策 6a): with oneshot, systemd's
    Restart tracks the start command, not the nginx process, so it would not
    actually guard nginx crashes.
    """
    return (
        "[Unit]\n"
        "Description=Edge Gateway\n"
        "After=network.target\n"
        "\n"
        "[Service]\n"
        "Type=oneshot\n"
        f"User={run_user}\n"
        f"Group={run_user}\n"
        f"WorkingDirectory={edge_path}\n"
        f"ExecStart={edge_path}/bin/edge start\n"
        "RemainAfterExit=yes\n"
        "\n"
        "[Install]\n"
        "WantedBy=multi-user.target\n"
    )


def parse_autostart_status(stdout: str) -> str:
    """Normalize ``systemctl is-enabled`` output to a four-state status.

    - contains "enabled" → "enabled"
    - contains "disabled" → "disabled"
    - contains "No such file or directory" → "not_configured" (no service file)
    - otherwise → "unknown"

    Note: disabled and "no file" both exit with rc=1, so they are told apart
    by output content (实测 192.168.0.24, 决策 3).
    """
    if "No such file or directory" in stdout:
        return "not_configured"
    if "enabled" in stdout:
        return "enabled"
    if "disabled" in stdout:
        return "disabled"
    return "unknown"

