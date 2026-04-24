from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime


class DictTypeBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    status: int = Field(default=1)


class DictTypeCreate(DictTypeBase):
    pass


class DictTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[int] = None


class DictTypeResponse(DictTypeBase):
    id: int
    created_at: Optional[str] = None

    @field_validator('created_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True


class DictDataBase(BaseModel):
    label: str = Field(..., max_length=100)
    value: str = Field(..., max_length=100)
    sort: int = Field(default=0)
    status: int = Field(default=1)


class DictDataCreate(DictDataBase):
    type_id: int


class DictDataUpdate(BaseModel):
    label: Optional[str] = None
    value: Optional[str] = None
    sort: Optional[int] = None
    status: Optional[int] = None


class DictDataResponse(DictDataBase):
    id: int
    type_id: int
    created_at: Optional[str] = None

    @field_validator('created_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    resource: Optional[str] = None
    resource_id: Optional[int] = None
    detail: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: Optional[str] = None

    @field_validator('created_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True