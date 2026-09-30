"""SQLite 异地备份/容灾恢复的 Pydantic 请求/响应结构。"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class DbBackupConfigUpdate(BaseModel):
    """PUT /db-backup/config 载荷。password 为一次性写入口（未提供则保留原值）。"""

    enabled: bool = False
    host: Optional[str] = Field(None, max_length=255)
    port: int = Field(22, ge=1, le=65535)
    username: Optional[str] = Field(None, max_length=128)
    auth_type: str = Field("password", pattern="^(password|key)$")
    password: Optional[str] = Field(None, max_length=256)
    key_path: Optional[str] = Field(None, max_length=512)
    remote_dir: Optional[str] = Field(None, max_length=512)
    interval_minutes: int = Field(5, ge=1, le=60 * 24 * 7)
    retain_count: int = Field(7, ge=1, le=1000)
    include_static: bool = False
    include_task_scripts: bool = False
    include_task_logs: bool = False


class DbBackupStatus(BaseModel):
    """派生状态（非持久化，响应时计算）。"""

    applicable: bool
    reason: Optional[str] = None  # 不适用原因（注册表中无 SQLite 连接）
    enabled: bool
    config_complete: bool
    in_progress: bool
    last_run_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None


class DbBackupConfigResponse(BaseModel):
    id: int
    enabled: bool
    host: Optional[str] = None
    port: int
    username: Optional[str] = None
    auth_type: str
    key_path: Optional[str] = None
    remote_dir: Optional[str] = None
    interval_minutes: int
    retain_count: int
    include_static: bool
    include_task_scripts: bool
    include_task_logs: bool
    last_run_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_status: Optional[str] = None
    last_error: Optional[str] = None
    updated_at: Optional[datetime] = None
    has_password: bool = False
    status: Optional[DbBackupStatus] = None


class DbBackupHistoryItem(BaseModel):
    id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str
    trigger: str
    package_name: Optional[str] = None
    file_size: Optional[int] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None

    model_config = {"from_attributes": True}


class DbBackupHistoryPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[DbBackupHistoryItem]


class DbBackupTestRequest(BaseModel):
    """远端连通性测试：字段缺省时回退已存配置（允许先填后测）。"""

    host: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    username: Optional[str] = None
    auth_type: Optional[str] = Field(None, pattern="^(password|key)$")
    password: Optional[str] = None
    key_path: Optional[str] = None
    remote_dir: Optional[str] = None


# ── 恢复向导 ────────────────────────────────────────────────────────────────


class RestoreTarget(BaseModel):
    """向导步骤 2 的临时远端目标（不依赖已存配置——新机配置表是空的）。"""

    host: str = Field(..., max_length=255)
    port: int = Field(22, ge=1, le=65535)
    username: str = Field(..., max_length=128)
    auth_type: str = Field("password", pattern="^(password|key)$")
    password: Optional[str] = Field(None, max_length=256)
    key_path: Optional[str] = Field(None, max_length=512)
    remote_dir: str = Field(..., max_length=512)


class RestorePackageItem(BaseModel):
    name: str
    size: int  # 字节
    mtime_utc: Optional[datetime] = None
    # meta 摘要（拉取失败时为 None，前端显示"元数据不可读"）
    meta: Optional[dict] = None


class RestoreListResponse(BaseModel):
    packages: List[RestorePackageItem]


class RestoreVerifyRequest(BaseModel):
    target: RestoreTarget
    package_name: str = Field(..., max_length=255)


class RestoreVerifyResult(BaseModel):
    verify_id: str
    package_name: str
    size: int
    # meta 摘要 + 版本比较提示 + 校验明细
    meta: dict
    version_note: Optional[str] = None
    checks: dict  # {tar_integrity, sha256, db_integrity, key_tables} 明细


class RestoreExecuteRequest(BaseModel):
    verify_id: str = Field(..., max_length=64)
    confirmed: bool = False


class RestoreExecuteResult(BaseModel):
    success: bool
    active_connection_id: Optional[str] = None
    restored_databases: List[dict] = []
    pre_restore_file: Optional[str] = None
    message: str
