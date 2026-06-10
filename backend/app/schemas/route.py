from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime


class RouteBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    uri: str = Field(..., max_length=500)
    methods: Optional[str] = None
    priority: int = Field(default=0)
    status: int = Field(default=1)
    description: Optional[str] = None
    # 高级匹配字段
    hosts: Optional[str] = Field(default=None, description="请求 Host 匹配，多个用逗号分隔")
    remote_addrs: Optional[str] = Field(default=None, description="客户端 IP 地址，多个用逗号分隔")
    vars: Optional[List[List[Any]]] = Field(default=None, description='条件匹配表达式 [["var", "op", "val"], ...]')
    advanced_match_enabled: Optional[bool] = Field(default=False, description="是否启用高级匹配")
    plugin_config_ids: Optional[List[str]] = Field(default=None, description="关联的插件组 edge_uuid 列表")


class RouteCreate(RouteBase):
    upstream_id: Optional[int] = None


class RouteUpdate(BaseModel):
    name: Optional[str] = None
    uri: Optional[str] = None
    methods: Optional[str] = None
    priority: Optional[int] = None
    status: Optional[int] = None
    upstream_id: Optional[int] = None
    description: Optional[str] = None
    hosts: Optional[str] = None
    remote_addrs: Optional[str] = None
    vars: Optional[List[List[Any]]] = None
    advanced_match_enabled: Optional[bool] = None
    plugin_config_ids: Optional[List[str]] = None


class RouteResponse(RouteBase):
    id: int
    edge_uuid: str
    cluster_id: int
    upstream_id: Optional[int] = None
    upstream_name: Optional[str] = None
    current_version: Optional[int] = None
    published_at: Optional[str] = None
    created_at: Optional[str] = None
    plugins: Optional[List[Dict[str, Any]]] = None
    cluster_name: Optional[str] = None

    @field_validator('created_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat() + 'Z'
        return v

    @field_validator('vars', mode='before')
    @classmethod
    def convert_vars(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except:
                return None
        return v

    @field_validator('plugin_config_ids', mode='before')
    @classmethod
    def convert_plugin_config_ids(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except:
                return None
        return v

    class Config:
        from_attributes = True


class RouteListResponse(BaseModel):
    total: int
    page: int = 1
    page_size: int = 20
    items: List[RouteResponse]


class PluginConfig(BaseModel):
    plugin_name: str
    config: Any


class PluginUpdateRequest(BaseModel):
    plugins: List[PluginConfig]


