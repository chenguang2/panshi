from pydantic import BaseModel, Field
from typing import Optional, List


class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    role: str = Field(default="user")
    status: int = Field(default=1)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[int] = None


class UserResponse(UserBase):
    id: int
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    total: int
    items: List[UserResponse]


class PasswordResetRequest(BaseModel):
    new_password: str = Field(..., min_length=6)


class ClusterAssignRequest(BaseModel):
    cluster_ids: List[int]