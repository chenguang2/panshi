"""Migration orchestration support — table dependency order, task state machine,
single-task lock.

Design (see openspec/changes/support-postgres-database/design.md):
- D3: 22 business tables ordered by FK dependency; ps_db_migration_log excluded.
- G11: log tables (sys_audit_log/ps_import_log/install_task/install_task_node)
  may be optionally skipped for faster migration.
"""

import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

# ── Table dependency order (topological). Each inner tuple is one batch that
# can be migrated in parallel (no interdependency within the batch).
DEPENDENCY_ORDER: list[tuple[str, ...]] = [
    ("sys_user", "sys_audit_log", "ps_cluster", "ps_plugin_enabled"),
    ("ps_upstream", "ps_upstream_target"),
    ("ps_route", "ps_route_plugin"),
    (
        "ps_plugin_metadata",
        "ps_plugin_config",
        "ps_global_rule",
        "ps_stream_proxy",
        "ps_static_resource",
        "ps_import_log",
        "ps_node",
        "ps_config_version",
    ),
    ("ps_ssl_certificate",),
    ("ps_node_autostart", "sys_user_cluster", "sys_user_permission"),
    ("install_task", "install_task_node"),
]

# Reverse order for clearing child-first (FK-safe teardown).
CLEAR_ORDER: list[tuple[str, ...]] = list(reversed(DEPENDENCY_ORDER))

# Tables excluded from migration entirely (operational metadata).
EXCLUDED_TABLES: frozenset[str] = frozenset({"ps_db_migration_log"})

# Log/audit tables that may be skipped when "include logs" is unchecked.
LOG_TABLES: frozenset[str] = frozenset(
    {"sys_audit_log", "ps_import_log", "install_task", "install_task_node"}
)

# All business tables in dependency order (flat).
ALL_BUSINESS_TABLES: list[str] = [t for group in DEPENDENCY_ORDER for t in group]


def tables_for_migration(include_logs: bool = True) -> list[str]:
    """Return the ordered list of tables to migrate, honoring the log flag."""
    if include_logs:
        return list(ALL_BUSINESS_TABLES)
    return [t for t in ALL_BUSINESS_TABLES if t not in LOG_TABLES]


class MigrationState(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class MigrationTask:
    """Simple in-memory migration task with a state machine."""

    def __init__(self) -> None:
        self.state: MigrationState = MigrationState.PENDING
        self.error: Optional[str] = None
        self.completed_tables: int = 0
        self.total_tables: int = 0

    def start(self) -> None:
        if self.state not in (MigrationState.PENDING,):
            raise ValueError(f"cannot start task in state {self.state}")
        self.state = MigrationState.RUNNING

    def update_progress(self, completed: int, total: int) -> None:
        self.completed_tables = completed
        self.total_tables = total

    def succeed(self) -> None:
        if self.state != MigrationState.RUNNING:
            raise ValueError(f"cannot succeed task in state {self.state}")
        self.state = MigrationState.SUCCESS

    def fail(self, message: str) -> None:
        if self.state != MigrationState.RUNNING:
            raise ValueError(f"cannot fail task in state {self.state}")
        self.state = MigrationState.FAILED
        self.error = message


# ── Single-task lock (G8: migration tasks run one at a time) ──────────────


class SingleTaskLock:
    """非阻塞单任务锁：acquire() 默认立即返回，传 timeout 可有限等待。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()

    def acquire(self, timeout: float = 0.0) -> bool:
        return self._lock.acquire(timeout=timeout)

    def release(self) -> None:
        self._lock.release()


migration_lock = SingleTaskLock()
