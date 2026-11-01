"""Task log file persistence.

Full execution logs (ansible/SSH output) are appended to files under
``data/task-logs/{task_id}/{node_id}.log`` instead of SQLite. The DB keeps
only a summary (stdout_tail / log_line_count / log_file path).

Log files are written from worker threads (ansible event_handler runs via
``asyncio.to_thread``), so append writes are guarded by a per-path lock.

行数上限（openspec node-task-ux-optimization D10）：单个节点日志最多保存
``MAX_LOG_LINES`` 行内容，写满后末尾追加一行截断提示并停止追加——磁盘占用
有界，前端读到该行即可知道日志被截断。``MAX_LOG_LINES`` 是本模块唯一事实
源，``ansible_service`` 复用它（历史定义位置）。

历史尝试（D6）：重试前把活动日志改名为 ``{node_id}.attempt{N}.log`` 留档
（``rotate_log``），活动日志重新从空开始，``log_file`` 始终指向活动日志。
"""

import os
import threading
from pathlib import Path

DEFAULT_LOG_ROOT = os.getenv("PANSHI_TASK_LOG_DIR", "data/task-logs")
STDOUT_TAIL_BYTES = 8192
# 单节点日志行数上限（唯一事实源，ansible_service.MAX_LOG_LINES 复用本值）
MAX_LOG_LINES = 5000
# 写满上限后写入文件末尾的提示行（前端据此判定「日志被截断」）
TRUNCATION_NOTE = "…（已截断，后续输出未保存）"

_log_dir = Path(DEFAULT_LOG_ROOT)
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()
# 各日志已保存的内容行数缓存：{f"{task_id}/{node_id}": int}
# 懒初始化（首次触碰时数一遍文件），rotate/reset/delete 时清除。
_line_counts: dict[str, int] = {}


def log_root() -> Path:
    return _log_dir


def log_path(task_id: int, node_id: int) -> Path:
    return _log_dir / str(task_id) / f"{node_id}.log"


def attempt_log_path(task_id: int, node_id: int, attempt: int) -> Path:
    """历史尝试留档路径：``{node_id}.attempt{N}.log``（N = 该次执行的 attempt）。"""
    return _log_dir / str(task_id) / f"{node_id}.attempt{attempt}.log"


def _lock_for(key: str) -> threading.Lock:
    with _locks_guard:
        lock = _locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _locks[key] = lock
        return lock


def _count_file_lines(path: Path) -> int:
    """数文件行数（流式，兼容历史遗留的超大文件）。"""
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8", errors="replace") as f:
        return sum(1 for _ in f)


def _saved_lines(key: str, path: Path) -> int:
    """已保存的内容行数（不含截断提示行），懒初始化。"""
    count = _line_counts.get(key)
    if count is None:
        total = _count_file_lines(path)
        truncated = is_truncated(path=path)
        count = min(total - 1 if truncated else total, MAX_LOG_LINES)
        _line_counts[key] = count
    return count


def _write_lines(path: Path, lines: list[str]) -> None:
    if not lines:
        return
    with path.open("a", encoding="utf-8") as f:
        for line in lines:
            f.write(line if line.endswith("\n") else line + "\n")


def append_line(task_id: int, node_id: int, line: str) -> int:
    """追加一行日志，返回本次实际保存的行数（0 = 已被上限丢弃）。

    写满 ``MAX_LOG_LINES`` 时：只写入剩余配额内的行，随后在文件末尾追加
    ``TRUNCATION_NOTE`` 并停止追加后续内容。多行 ``line`` 按行拆分处理。
    """
    path = log_path(task_id, node_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    key = f"{task_id}/{node_id}"
    with _lock_for(key):
        saved = _saved_lines(key, path)
        if saved >= MAX_LOG_LINES:
            # 已达上限：只在首次写一行截断提示，之后不再落盘（磁盘占用有界）
            if not is_truncated(path=path):
                _write_lines(path, [TRUNCATION_NOTE])
            return 0

        new_lines = line.splitlines() or [line]
        remaining = MAX_LOG_LINES - saved
        accepted = new_lines[:remaining]
        _write_lines(path, accepted)
        if len(accepted) < len(new_lines) or saved + len(accepted) >= MAX_LOG_LINES:
            # 本次写入已顶到上限（含超出配额被丢弃的情况）→ 追加提示行
            _write_lines(path, [TRUNCATION_NOTE])
            _line_counts[key] = MAX_LOG_LINES
        else:
            _line_counts[key] = saved + len(accepted)
        return len(accepted)


def is_truncated(task_id: int | None = None, node_id: int | None = None, *, path: Path | None = None) -> bool:
    """活动日志是否已写满上限（判定依据 = 文件末尾的截断提示行，无新增列）。"""
    target = path if path is not None else log_path(task_id, node_id)  # type: ignore[arg-type]
    if not target.exists():
        return False
    with target.open("rb") as f:
        f.seek(0, os.SEEK_END)
        size = f.tell()
        f.seek(max(0, size - 512))
        tail = f.read().decode("utf-8", errors="replace").splitlines()
    return bool(tail) and tail[-1].strip() == TRUNCATION_NOTE


def read_log(task_id: int, node_id: int, tail: int | None = None) -> str:
    path = log_path(task_id, node_id)
    if not path.exists():
        return ""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if tail and tail > 0:
        lines = lines[-tail:]
    return "\n".join(lines)


def read_attempt_log(task_id: int, node_id: int, attempt: int) -> str:
    """读取某次历史尝试的留档日志（不存在返回空串）。"""
    path = attempt_log_path(task_id, node_id, attempt)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def node_log_files(task_id: int, node_id: int) -> list[Path]:
    """该节点的全部日志文件（活动日志 + 历史尝试留档），活动日志在后。"""
    files: list[Path] = []
    active = log_path(task_id, node_id)
    task_dir = active.parent
    if task_dir.exists():
        archived = sorted(
            task_dir.glob(f"{node_id}.attempt*.log"),
            key=lambda p: p.name,
        )
        files.extend(archived)
    if active.exists():
        files.append(active)
    return files


def rotate_log(task_id: int, node_id: int, attempt: int, trailing_note: str | None = None) -> Path | None:
    """把活动日志留档为 ``{node_id}.attempt{attempt}.log``，活动日志重新开始。

    ``trailing_note`` 会在改名之前追加到旧日志末尾（重试时写入上次的失败
    原因，保证「日志 + 原因」作为一份证据一起留档）。返回留档路径；活动
    日志不存在时返回 None（新建任务首次执行没有可留档内容）。
    """
    path = log_path(task_id, node_id)
    key = f"{task_id}/{node_id}"
    with _lock_for(key):
        _line_counts.pop(key, None)
        if not path.exists():
            return None
        if trailing_note:
            _write_lines(path, [trailing_note])
        archived = attempt_log_path(task_id, node_id, attempt)
        # 同一 attempt 重复轮转（数据异常/重复重试）不得覆盖旧证据，加序号后缀
        serial = 1
        while archived.exists():
            archived = attempt_log_path(task_id, node_id, attempt).with_name(
                f"{node_id}.attempt{attempt}-{serial}.log"
            )
            serial += 1
        path.replace(archived)
        return archived


def reset_log(task_id: int, node_id: int) -> None:
    path = log_path(task_id, node_id)
    if path.exists():
        with _lock_for(f"{task_id}/{node_id}"):
            path.unlink(missing_ok=True)
            _line_counts.pop(f"{task_id}/{node_id}", None)


def delete_task_logs(task_id: int) -> None:
    task_dir = _log_dir / str(task_id)
    if task_dir.exists():
        for p in task_dir.glob("*.log"):
            p.unlink(missing_ok=True)
            _line_counts.pop(f"{task_id}/{p.name.split('.')[0]}", None)
        try:
            task_dir.rmdir()
        except OSError:
            pass


def tail_bytes(text: str, max_bytes: int = STDOUT_TAIL_BYTES) -> str:
    if len(text.encode("utf-8")) <= max_bytes:
        return text
    truncated = text.encode("utf-8")[-max_bytes:]
    return truncated.decode("utf-8", errors="replace")
