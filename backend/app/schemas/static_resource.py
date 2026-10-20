from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime


class StaticResourceCreate(BaseModel):
    route_id: int = Field(..., description="路由 ID")
    description: Optional[str] = Field(None, description="描述")


class StaticResourceUpdate(BaseModel):
    description: Optional[str] = None
    # static-resources-ux-close-loop 8.1：换绑路由（None=不改绑定；与当前相同则幂等跳过）
    route_id: Optional[int] = None


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
    # static-resources-ux-close-loop 组 5：发布结果持久化读回（detail 为解析后的 JSON 对象）
    last_publish_ok: Optional[bool] = None
    last_published_at: Optional[str] = None
    route_exists: Optional[bool] = None
    last_publish_detail: Optional[dict] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

    @field_validator('last_publish_detail', mode='before')
    @classmethod
    def _coerce_publish_detail(cls, v: Any) -> Any:
        # static-resources-ux-close-loop 回归（2026-10-20 实页验收）：TEXT 列经
        # from_attributes 直读为 JSON 字符串，model_validate 先于端点侧解析时
        # dict_type 校验即炸（全局列表 500）。schema 边界 str→dict 容错，#48 同源。
        if isinstance(v, str):
            try:
                import json

                return json.loads(v)
            except Exception:
                return None
        return v

    @field_validator('created_at', 'updated_at', 'last_published_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat() + 'Z'
        return v


class StaticResourceListResponse(BaseModel):
    total: int
    items: List[StaticResourceResponse]
