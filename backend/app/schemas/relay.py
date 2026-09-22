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

    class Config:
        from_attributes = True
