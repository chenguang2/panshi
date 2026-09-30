"""SQLite 异地备份：配置与历史模型。

设计见 openspec/changes/sqlite-backup-dr + docs/design/sqlite-backup-dr.md：
- 配置存库（而非 JSON 文件）的用意：DR 恢复数据时配置随库一起回来，
  新机器恢复完成即自动续上备份节奏。
- 与 ps_db_migration_log 同类：平台实例的运维元数据，不参与数据迁移
  （migrate.py 的 DEPENDENCY_ORDER 未列入即自动排除）。
- 时间列一律 naive UTC 存储（约定 #26）。
- 密码 Fernet 加密（复用 db_config 的密钥链，即 JWT secret）。
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from app.core.database import Base


class DbBackupConfig(Base):
    """全局单行配置表（id=1）。多目标化（db-backup-multi-target D1）后仅承载
    全局字段与调度状态；旧目标列保留不删（D7 迁移源 + 回滚可用），代码不再读写。"""

    __tablename__ = "ps_db_backup_config"

    id = Column(Integer, primary_key=True, index=True)
    enabled = Column(Boolean, nullable=False, default=False)
    host = Column(String(255), nullable=True)
    port = Column(Integer, nullable=False, default=22)
    username = Column(String(128), nullable=True)
    # password | key
    auth_type = Column(String(16), nullable=False, default="password")
    password_encrypted = Column(Text, nullable=True)
    key_path = Column(String(512), nullable=True)
    remote_dir = Column(String(512), nullable=True)
    # 来源标识（设计 db-backup-source-tag D1）：共享远端目录时区分备份归属；
    # NULL = 未解析（配置保存载荷空 / 存量升级遗留），由 resolve_source_name 解析回写
    source_name = Column(String(64), nullable=True)
    interval_minutes = Column(Integer, nullable=False, default=5)
    retain_count = Column(Integer, nullable=False, default=7)
    # B 类数据段开关（默认 false，包不含对应目录）
    include_static = Column(Boolean, nullable=False, default=False)
    include_task_scripts = Column(Boolean, nullable=False, default=False)
    include_task_logs = Column(Boolean, nullable=False, default=False)
    # 调度状态（attempt = 任意一次尝试；success 仅成功。防止失败重试风暴）
    last_run_at = Column(DateTime, nullable=True)
    last_success_at = Column(DateTime, nullable=True)
    last_status = Column(String(16), nullable=True)  # success | partial | failed
    last_error = Column(Text, nullable=True)
    # 存量单行 → 默认位置一次性迁移标志（D7）：假 + 旧 host 非空时触发迁移；
    # 置位后不再触发（防「删光位置后重启 → 默认位置复活」）
    targets_migrated = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class DbBackupTarget(Base):
    """备份位置（多目标扇出的远端目的地，设计 D1/D2）。

    - name 唯一、仅用于下拉与历史快照展示，不进文件名与 shell 命令
      （文件名安全由来源标识正则单独负责）
    - 仅 retain_count 按位置差异化（局内短保留快恢复 / 中心长保留防勒索）；
      内容段/频率/来源标识全局一致
    - 密码 Fernet 加密（复用 db_config 密钥链，即 JWT secret），响应不回显
    """

    __tablename__ = "ps_db_backup_target"
    __table_args__ = (UniqueConstraint("name", name="uq_db_backup_target_name"),)

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(64), nullable=False)
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False, default=22)
    username = Column(String(128), nullable=False)
    # password | key
    auth_type = Column(String(16), nullable=False, default="password")
    password_encrypted = Column(Text, nullable=True)
    key_path = Column(String(512), nullable=True)
    remote_dir = Column(String(512), nullable=False)
    retain_count = Column(Integer, nullable=False, default=7)
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class DbBackupHistoryTarget(Base):
    """位置推送子结果（设计 D4）：一次备份对每个启用位置各一条。

    - 仅推送阶段产生（构建阶段失败 → 整体 failed、无子结果行）
    - target_id 不设 FK 强制（位置删除后悬挂无妨），展示走 target_name 快照
    """

    __tablename__ = "ps_db_backup_history_target"

    id = Column(Integer, primary_key=True, index=True)
    history_id = Column(
        Integer, ForeignKey("ps_db_backup_history.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_id = Column(Integer, nullable=True, index=True)
    target_name = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False)  # success | failed
    error = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)


class DbBackupHistory(Base):
    """每次备份一条记录（手动/调度同源）。"""

    __tablename__ = "ps_db_backup_history"

    id = Column(Integer, primary_key=True, index=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String(16), nullable=False, default="running")  # running | success | failed
    trigger = Column(String(16), nullable=False, default="manual")  # manual | scheduled
    package_name = Column(String(255), nullable=True)
    file_size = Column(BigInteger, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
