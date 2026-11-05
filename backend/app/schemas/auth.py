from pydantic import BaseModel, Field, field_validator
from typing import List, Optional

from app.schemas.user import validate_password_strength


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    user: "UserInfo"
    permissions: Optional[List[str]] = None
    must_change_password: bool = False


class UserInfo(BaseModel):
    id: int
    username: str
    role: str
    status: int

    class Config:
        from_attributes = True


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=6)
    new_password: str = Field(...)

    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, v):
        # 共享校验（含强度 + 默认口令禁令，default-password-guard-switch D6）
        return validate_password_strength(v)


class PermissionRequest(BaseModel):
    permissions: List[str]


LoginResponse.model_rebuild()