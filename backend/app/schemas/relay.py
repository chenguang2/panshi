"""区域注册表 schemas（openspec: add-relay-gateway / relay-region-registry）。"""
import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

CODE_PATTERN = re.compile(r"^[a-z][a-z0-9-]{1,31}$")
CODE_ERROR_MSG = "区域code格式错误: 以小写字母开头，仅含小写字母/数字/中划线，长度2-32"
STATUS_VALUES = ("enabled", "disabled")


class RelayGatewayCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=32)
    name: str = Field(..., min_length=1, max_length=100)
    http_base_url: Optional[str] = Field(None, max_length=255)
    ssh_jump: Optional[str] = Field(None, max_length=255)
    openresty_prefix: Optional[str] = Field(None, max_length=255)
    status: str = "enabled"

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        if not CODE_PATTERN.match(v):
            raise ValueError(CODE_ERROR_MSG)
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in STATUS_VALUES:
            raise ValueError("status 仅允许 enabled/disabled")
        return v

    @field_validator("http_base_url", "ssh_jump", "openresty_prefix")
    @classmethod
    def strip_path_fields(cls, v: Optional[str]) -> Optional[str]:
        """路径/URL 字段去首尾空白：前导空格曾让 init 的 nginx 探测静默失败（2026-10-03 kjc 实发）。"""
        if v is None:
            return None
        v = v.strip()
        return v or None


class RelayGatewayUpdate(BaseModel):
    """code 字段存在仅为显式拒绝修改（必须与现值一致）；其余字段按提交更新。"""

    code: Optional[str] = Field(None, min_length=2, max_length=32)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    http_base_url: Optional[str] = Field(None, max_length=255)
    ssh_jump: Optional[str] = Field(None, max_length=255)
    openresty_prefix: Optional[str] = Field(None, max_length=255)
    status: Optional[str] = None

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not CODE_PATTERN.match(v):
            raise ValueError(CODE_ERROR_MSG)
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in STATUS_VALUES:
            raise ValueError("status 仅允许 enabled/disabled")
        return v

    @field_validator("http_base_url", "ssh_jump", "openresty_prefix")
    @classmethod
    def strip_path_fields(cls, v: Optional[str]) -> Optional[str]:
        """同 Create：路径/URL 字段去首尾空白（None 透传，空串归 None）。"""
        if v is None:
            return None
        v = v.strip()
        return v or None


class RelayStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in STATUS_VALUES:
            raise ValueError("status 仅允许 enabled/disabled")
        return v


class RelayGatewayOut(BaseModel):
    id: int
    code: str
    name: str
    http_base_url: Optional[str] = None
    ssh_jump: Optional[str] = None
    openresty_prefix: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # 清单漂移标记（列表端点计算注入，非库列）：True = inventory/gateways 缺该局主机组
    inventory_group_missing: Optional[bool] = None

    class Config:
        from_attributes = True


class RelayConfigFile(BaseModel):
    """一份待写入网关机的配置文件内容（只读预览，供界面复制/手工配置兜底）。"""

    path: str
    content: str
    purpose: str


class RelayConfigPreview(BaseModel):
    """区域配置预览：init 的 nginx 配置 + push 的白名单内容（不触网、不改远端）。"""

    region_code: str
    openresty_prefix: str
    listen_port: int
    files: list[RelayConfigFile]
    notes: list[str]


class RelaySshdSetupRequest(BaseModel):
    """以 root 在网关机配置 sshd 跳板转发（凭据仅本次使用，不保存、不落库）。"""

    root_user: str = Field(default="root", description="root 账号")
    root_password: str = Field(..., min_length=1, description="root 密码（仅本次使用，不保存）")
