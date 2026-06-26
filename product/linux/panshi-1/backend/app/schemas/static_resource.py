from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime


class StaticResourceCreate(BaseModel):
    route_id: int = Field(..., description="路由 ID")
    description: Optional[str] = Field(None, description="描述")


class StaticResourceUpdate(BaseModel):
    description: Optional[str] = None


class StaticResourceResponse(BaseModel):
    id: int
    cluster_id: int
    route_id: Optional[int] = None
    edge_uuid: Optional[str] = None
    name: str
    url_path: Optional[str] = None
    description: Optional[str] = None
    file_size: Optional[int] = None
    storage_path: Optional[str] = None
    current_version: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

    @field_validator('created_at', 'updated_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat() + 'Z'
        return v


class StaticResourceListResponse(BaseModel):
    total: int
    items: List[StaticResourceResponse]
