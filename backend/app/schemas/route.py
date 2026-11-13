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
    enable_websocket: Optional[bool] = Field(default=None, description="是否启用 WebSocket 代理")


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
    enable_websocket: Optional[bool] = None


class RouteResponse(RouteBase):
    id: int
    edge_uuid: str
    cluster_id: int
    upstream_id: Optional[int] = None
    upstream_name: Optional[str] = None
    current_version: Optional[int] = None
    published_at: Optional[str] = None
    # 上次发布结果（publish-status-unify）：'partial'=部分/全部节点失败，全部成功为 NULL；
    # 由两个列表端点透传，详情端点保持 None（对齐 B1：发布状态展示只走列表）
    last_publish_status: Optional[str] = None
    # 发布状态语义由后端单点推导（edge_sync.derive_pending_publish），前端不本地推导；
    # 两个列表端点组装时传入，详情端点有意不推导（B1），默认 False
    pending_publish: bool = False
    created_at: Optional[str] = None
    plugins: Optional[List[Dict[str, Any]]] = None
    cluster_name: Optional[str] = None
    cluster_group_name: Optional[str] = None  # response_model 默认剥离未声明字段；不加此行 routes.py 计算的分组名到不了响应

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
            except (ValueError, TypeError):
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
            except (ValueError, TypeError):
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


