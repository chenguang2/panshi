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

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, String, Text

from app.core.database import Base


class DbBackupConfig(Base):
    """单行配置表（id=1）。"""

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
    interval_minutes = Column(Integer, nullable=False, default=5)
    retain_count = Column(Integer, nullable=False, default=7)
    # B 类数据段开关（默认 false，包不含对应目录）
    include_static = Column(Boolean, nullable=False, default=False)
    include_task_scripts = Column(Boolean, nullable=False, default=False)
    include_task_logs = Column(Boolean, nullable=False, default=False)
    # 调度状态（attempt = 任意一次尝试；success 仅成功。防止失败重试风暴）
    last_run_at = Column(DateTime, nullable=True)
    last_success_at = Column(DateTime, nullable=True)
    last_status = Column(String(16), nullable=True)  # success | failed
    last_error = Column(Text, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


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
