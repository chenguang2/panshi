from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class StaticResourceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="资源标识名")
    url_path: str = Field(..., max_length=200, description="URL 访问路径，如 /static/myapp")
    description: Optional[str] = Field(None, description="描述")


class StaticResourceCreate(StaticResourceBase):
    pass


class StaticResourceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    url_path: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None


class StaticResourceResponse(StaticResourceBase):
    id: int
    cluster_id: int
    file_size: Optional[int] = None
    current_version: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat() + "Z"
        return v

    class Config:
        from_attributes = True


class StaticResourceListResponse(BaseModel):
    total: int
    items: List[StaticResourceResponse]
