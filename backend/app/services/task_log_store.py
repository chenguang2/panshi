"""Task log file persistence.

Full execution logs (ansible/SSH output) are appended to files under
``data/task-logs/{task_id}/{node_id}.log`` instead of SQLite. The DB keeps
only a summary (stdout_tail / log_line_count / log_file path).

Log files are written from worker threads (ansible event_handler runs via
``asyncio.to_thread``), so append writes are guarded by a per-path lock.
"""

import os
import threading
from pathlib import Path

DEFAULT_LOG_ROOT = os.getenv("PANSHI_TASK_LOG_DIR", "data/task-logs")
STDOUT_TAIL_BYTES = 8192

_log_dir = Path(DEFAULT_LOG_ROOT)
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def log_root() -> Path:
    return _log_dir


def log_path(task_id: int, node_id: int) -> Path:
    return _log_dir / str(task_id) / f"{node_id}.log"


def _lock_for(key: str) -> threading.Lock:
    with _locks_guard:
        lock = _locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _locks[key] = lock
        return lock


def append_line(task_id: int, node_id: int, line: str) -> None:
    path = log_path(task_id, node_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with _lock_for(f"{task_id}/{node_id}"):
        with path.open("a", encoding="utf-8") as f:
            f.write(line if line.endswith("\n") else line + "\n")


def read_log(task_id: int, node_id: int, tail: int | None = None) -> str:
    path = log_path(task_id, node_id)
    if not path.exists():
        return ""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if tail and tail > 0:
        lines = lines[-tail:]
    return "\n".join(lines)


def reset_log(task_id: int, node_id: int) -> None:
    path = log_path(task_id, node_id)
    if path.exists():
        with _lock_for(f"{task_id}/{node_id}"):
            path.unlink(missing_ok=True)


def delete_task_logs(task_id: int) -> None:
    task_dir = _log_dir / str(task_id)
    if task_dir.exists():
        for p in task_dir.glob("*.log"):
            p.unlink(missing_ok=True)
        try:
            task_dir.rmdir()
        except OSError:
            pass


def tail_bytes(text: str, max_bytes: int = STDOUT_TAIL_BYTES) -> str:
    if len(text.encode("utf-8")) <= max_bytes:
        return text
    truncated = text.encode("utf-8")[-max_bytes:]
    return truncated.decode("utf-8", errors="replace")
