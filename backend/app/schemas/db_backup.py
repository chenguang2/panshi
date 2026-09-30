"""SQLite 异地备份/容灾恢复的 Pydantic 请求/响应结构。"""

import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class DbBackupConfigUpdate(BaseModel):
    """PUT /db-backup/config 载荷（仅全局字段，设计 D1/D9）。

    多目标化后目标连接字段移至位置 CRUD；载荷中的旧目标字段被忽略（兼容）。
    """

    enabled: bool = False
    interval_minutes: int = Field(5, ge=1, le=60 * 24 * 7)
    include_static: bool = False
    include_task_scripts: bool = False
    include_task_logs: bool = False
    # 来源标识：空/未提供 = 自动解析
    source_name: Optional[str] = Field(None, max_length=64)

    @field_validator("source_name")
    @classmethod
    def _check_source_name(cls, v: Optional[str]) -> Optional[str]:
        """非空必须匹配校验正则（D2）；空串归一为 None（= 未填 → 自动解析，D6）。"""
        if v is None or v == "":
            return None
        from app.services.db_backup_service import SOURCE_NAME_RE

        if not SOURCE_NAME_RE.match(v):
            raise ValueError(
                "来源标识非法：首字符必须为字母/数字，仅允许字母/数字/点/中划线/下划线，长度 ≤64"
            )
        return v


# ── 备份位置（多目标，设计 D1/D2）──────────────────────────────────────────


# 名称仅用于下拉与历史快照展示，不进文件名与 shell 命令；
# 拒文件系统保留字符与控制字符是为避免任何二进制消费方踩坑，允许中文
_TARGET_NAME_FORBIDDEN_RE = re.compile(r'[/\\:*?"<>|\x00-\x1f\x7f]')


def _validate_target_name(name: Optional[str]) -> str:
    if name is None or not name.strip():
        raise ValueError("位置名称不能为空")
    if name.strip() != name:
        raise ValueError("位置名称首尾不得含空白")
    if len(name) > 64:
        raise ValueError("位置名称长度不得超过 64 字符")
    if _TARGET_NAME_FORBIDDEN_RE.search(name):
        raise ValueError('位置名称不得包含 / \\ : * ? " < > | 及控制字符')
    return name


def _normalize_password(v: Optional[str]) -> Optional[str]:
    """空串归一为 None（= 不修改已存密码）。"""
    if v is None or v == "":
        return None
    return v


class DbBackupTargetBase(BaseModel):
    name: str = Field(..., max_length=64)
    host: str = Field(..., max_length=255)
    port: int = Field(22, ge=1, le=65535)
    username: str = Field(..., max_length=128)
    # password | key
    auth_type: str = Field("password", pattern="^(password|key)$")
    # 留空/未提供 = 不修改已存密码；响应绝不回显
    password: Optional[str] = None
    key_path: Optional[str] = Field(None, max_length=512)
    remote_dir: str = Field(..., max_length=512)
    retain_count: int = Field(7, ge=1, le=1000)
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def _check_name(cls, v: Optional[str]) -> str:
        return _validate_target_name(v)

    @field_validator("password")
    @classmethod
    def _norm_password(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_password(v)


class DbBackupTargetCreate(DbBackupTargetBase):
    pass


class DbBackupTargetUpdate(DbBackupTargetBase):
    pass


class DbBackupTargetResponse(BaseModel):
    id: int
    name: str
    host: str
    port: int
    username: str
    auth_type: str
    has_password: bool = False
    key_path: Optional[str] = None
    remote_dir: str
    retain_count: int
    enabled: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


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
    source_name: Optional[str] = None
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
    # 来源标识（设计 D5）：文件名解析为唯一事实来源；旧格式包无来源标识 → None
    source: Optional[str] = None
    # meta.source 存在且 ≠ 文件名解析值 → True（包被改名过）
    source_renamed: bool = False
    # meta 摘要（拉取失败时为 None，前端显示"元数据不可读"）
    meta: Optional[dict] = None


class RestoreListResponse(BaseModel):
    packages: List[RestorePackageItem]


class RestoreTargetRef(BaseModel):
    """恢复向导目标三形态（对齐 /restore/list）：target_id 引用已配置位置
    （密码只在服务端解密——GET /targets 无明文回显，前端无法回传连接字段），
    或手输临时目标连接字段组（host/username/remote_dir 必填由端点校验）。
    字段约束镜像 RestoreTarget（全部放宽为可选，组合校验在端点做）。"""

    target_id: Optional[int] = None
    host: Optional[str] = Field(None, max_length=255)
    port: int = Field(22, ge=1, le=65535)
    username: Optional[str] = Field(None, max_length=128)
    auth_type: str = Field("password", pattern="^(password|key)$")
    password: Optional[str] = Field(None, max_length=256)
    key_path: Optional[str] = Field(None, max_length=512)
    remote_dir: Optional[str] = Field(None, max_length=512)


class RestoreVerifyRequest(BaseModel):
    target: RestoreTargetRef
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
