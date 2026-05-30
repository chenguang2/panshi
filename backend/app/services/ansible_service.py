import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

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

    # ── public API ──────────────────────────────────────────────

    async def run_playbook(
        self,
        ip: str,
        tag: str,
        extravars: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute an ansible playbook tag against a single target host.

        Args:
            ip: Target node IP (injected into ``extravars.ips``).
            tag: Ansible tag to execute (e.g. ``nginx_cmd_run``).
            extravars: Extra variables merged with ``{"ips": ip}``.

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

        async with self._semaphore:
            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        ansible_runner.run,
                        private_data_dir=self._private_data_dir,
                        playbook="edge.yml",
                        tags=tag,
                        extravars=ev,
                        envvars={"ANSIBLE_HOST_KEY_CHECKING": "False"},
                        settings={"job_timeout": self._job_timeout},
                    ),
                    timeout=self._job_timeout + 10,
                )
            except asyncio.TimeoutError:
                raise AnsibleExecutionError(
                    f"Playbook timed out after {self._job_timeout}s",
                    rc=-1, detail="timeout",
                )

        stdout = getattr(result, "stdout", "")
        stderr = getattr(result, "stderr", "")
        rc = getattr(result, "rc", -1)
        status = getattr(result, "status", "failed")

        logger.info(
            "Ansible result tag=%s ip=%s rc=%d status=%s",
            tag, ip, rc, status,
        )

        return {
            "rc": rc,
            "status": status,
            "stdout": stdout,
            "stderr": stderr,
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
        if tag == "edge_statistic" and result.get("rc") == 0:
            detail["statistic"] = self._parse_statistic_stdout(
                result.get("stdout", "")
            )
        return detail


    @staticmethod
    def _parse_statistic_stdout(stdout: str) -> dict[str, str]:
        """Extract CPU/memory/disk/version from cron_check.sh stdout."""
        stats: dict[str, str] = {}
        for line in stdout.splitlines():
            line = line.strip()
            if line.startswith("Total CPU usage for Nginx:"):
                stats["cpu_usage"] = line.split(":", 1)[1].strip()
            elif line.startswith("Total memory usage for Nginx:"):
                stats["memory_usage"] = line.split(":", 1)[1].strip()
            elif line.startswith("Total CPU usage for all processes:"):
                stats["system_cpu_usage"] = line.split(":", 1)[1].strip()
            elif line.startswith("Total memory usage for all processes:"):
                stats["system_memory_usage"] = line.split(":", 1)[1].strip()
            elif line.startswith("Edge version:"):
                stats["edge_version"] = line.split(":", 1)[1].strip()
        return stats


# ── module-level helpers ──────────────────────────────────────

def _sanitize_for_log(extravars: dict[str, Any]) -> dict[str, Any]:
    """Remove sensitive fields before logging."""
    safe = dict(extravars)
    for key in ("ansible_ssh_pass", "ansible_ssh_private_key_file", "ssh_password"):
        safe.pop(key, None)
    return safe
