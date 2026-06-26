from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
import re


class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    role: str = Field(default="user")
    status: int = Field(default=1)


class UserCreate(UserBase):
    password: str = Field(...)

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('密码长度不能少于6个字符')
        if len(v) > 50:
            raise ValueError('密码长度不能超过50个字符')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('密码必须包含至少一个字母')
        if not re.search(r'\d', v):
            raise ValueError('密码必须包含至少一个数字')
        return v


class UserUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[int] = None


class UserResponse(UserBase):
    id: int
    created_at: Optional[str] = None
    permissions: List[str] = []
    cluster_ids: List[int] = []

    @field_validator('created_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    total: int
    items: List[UserResponse]


class PasswordResetRequest(BaseModel):
    new_password: str = Field(...)

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('密码长度不能少于6个字符')
        if len(v) > 50:
            raise ValueError('密码长度不能超过50个字符')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('密码必须包含至少一个字母')
        if not re.search(r'\d', v):
            raise ValueError('密码必须包含至少一个数字')
        return v


class ClusterAssignRequest(BaseModel):
    cluster_ids: List[int]