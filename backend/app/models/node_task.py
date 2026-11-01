"""Node operation task models.

Persist async node-operation tasks (install/start/stop/...).
Design decisions (see openspec/changes/node-operation-task-center):
- ``cluster_id`` is a plain int (no FK): task history survives cluster deletion (V5).
- ``NodeTaskItem.node_id`` is a plain int (no FK): node deletion must not
  cascade-delete task items (V4, snapshot principle).
- ``NodeTaskItem.task_id`` FK with ondelete=CASCADE: deleting a task cleans up its items.
- JSON-ish fields use Text + json.dumps to match project convention (status_detail).
"""

import json
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.core.database import Base


class NodeTask(Base):
    __tablename__ = "install_task"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, nullable=False)  # no FK (V5)
    task_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    params = Column(Text, nullable=True)  # JSON snapshot
    total_nodes = Column(Integer, nullable=False, default=0)
    success_nodes = Column(Integer, nullable=False, default=0)
    failed_nodes = Column(Integer, nullable=False, default=0)
    # skipped 子项此前被计入状态判定（全 skipped → cancelled）却无独立列，
    # 前端无法显示「跳过 N 台」（openspec node-task-ux-optimization D2）。
    skipped_nodes = Column(Integer, nullable=False, default=0)
    cancelled_nodes = Column(Integer, nullable=False, default=0)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    # 取消请求时间（D3）：内存 asyncio.Event 刷新页面即消失，「取消中」状态
    # 必须可从库读回；幂等语义 = 已有值时不再覆盖（首次请求时间恒定）。
    cancel_requested_at = Column(DateTime, nullable=True)

    def set_params(self, params: dict | None) -> None:
        self.params = json.dumps(params, ensure_ascii=False) if params is not None else None

    def get_params(self) -> dict:
        if not self.params:
            return {}
        return json.loads(self.params)


class NodeTaskItem(Base):
    __tablename__ = "install_task_node"
    __table_args__ = (
        UniqueConstraint("task_id", "node_id", name="uq_install_task_node_task_node"),
    )

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("install_task.id", ondelete="CASCADE"), nullable=False)
    node_id = Column(Integer, nullable=False)  # plain int, no FK (V4)
    ip = Column(String(50), nullable=False)  # snapshot
    node_name = Column(String(100), nullable=True)  # snapshot
    status = Column(String(20), nullable=False, default="pending")
    rc = Column(Integer, nullable=True)
    logs = Column(Text, nullable=True)  # JSON list of {t, level, line} (deprecated: kept empty, full logs live in file)
    stdout = Column(Text, nullable=True)  # tail summary (stdout_tail-compatible), kept for API compat
    stderr = Column(Text, nullable=True)
    failure_reason = Column(Text, nullable=True)  # 中文失败归因，前端首屏展示（openspec node-task-ux-optimization）
    command = Column(Text, nullable=True)
    # 执行次数（D6）：0 = 首次执行，每次重试 +1；旧日志留档为
    # ``{node_id}.attempt{旧值}.log``，活动日志重新从空开始。
    attempt = Column(Integer, nullable=False, default=0)
    log_file = Column(String(255), nullable=True)  # relative path task-logs/{task_id}/{node_id}.log
    log_line_count = Column(Integer, nullable=False, default=0)
    stdout_tail = Column(Text, nullable=True)  # tail of log output (max ~8KB)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    def set_logs(self, logs: list) -> None:
        self.logs = json.dumps(logs, ensure_ascii=False)

    def get_logs(self) -> list:
        if not self.logs:
            return []
        return json.loads(self.logs)
