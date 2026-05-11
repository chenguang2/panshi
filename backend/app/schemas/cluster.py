import re
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime

NAME_PATTERN = re.compile(r'^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')
NAME_ERROR_MSG = "集群名称只能包含小写字母、数字和中划线，中划线不能在首尾"


class ClusterBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="集群标识名")
    display_name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    status: int = Field(default=1)

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not NAME_PATTERN.match(v):
            raise ValueError(NAME_ERROR_MSG)
        return v


class ClusterCreate(ClusterBase):
    pass


class ClusterUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    display_name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[int] = None

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not NAME_PATTERN.match(v):
            raise ValueError(NAME_ERROR_MSG)
        return v


class ClusterResponse(BaseModel):
    id: int
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    status: int = 1
    created_at: Optional[str] = None
    node_count: int = 0
    healthy_node_count: int = 0
    upstream_count: int = 0
    route_count: int = 0

    @field_validator('created_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not NAME_PATTERN.match(v):
            raise ValueError(NAME_ERROR_MSG)
        return v

    class Config:
        from_attributes = True


class ClusterListResponse(BaseModel):
    total: int
    items: List[ClusterResponse]


class UpstreamTargetSchema(BaseModel):
    target: str = Field(..., max_length=255)
    weight: int = Field(default=100, ge=1, le=1000)

    class Config:
        from_attributes = True


class UpstreamBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    load_balance: str = Field(default="weighted_roundrobin", description="负载均衡算法: weighted_roundrobin, chash, ewma, least_conn")
    description: Optional[str] = None
    hash_on: Optional[str] = Field(None, description="哈希位置: vars, header, cookie, vars_combinations")
    key: Optional[str] = None
    checks: Optional[Dict[str, Any]] = None
    retries: Optional[int] = None
    retry_timeout: Optional[float] = None
    timeout: Optional[Dict[str, Any]] = None
    pass_host: Optional[str] = Field(None, description="host策略: pass, node, rewrite")
    upstream_host: Optional[str] = None
    scheme: Optional[str] = Field(None, description="通信协议: http, https, tcp, udp")
    keepalive_pool: Optional[Dict[str, Any]] = None


class UpstreamCreate(UpstreamBase):
    targets: Optional[List[UpstreamTargetSchema]] = None


class UpstreamUpdate(BaseModel):
    name: Optional[str] = None
    load_balance: Optional[str] = None
    description: Optional[str] = None
    hash_on: Optional[str] = None
    key: Optional[str] = None
    targets: Optional[List[UpstreamTargetSchema]] = None
    checks: Optional[Dict[str, Any]] = None
    retries: Optional[int] = None
    retry_timeout: Optional[float] = None
    timeout: Optional[Dict[str, Any]] = None
    pass_host: Optional[str] = None
    upstream_host: Optional[str] = None
    scheme: Optional[str] = None
    keepalive_pool: Optional[Dict[str, Any]] = None


class UpstreamResponse(UpstreamBase):
    id: int
    edge_uuid: str
    cluster_id: int
    created_at: Optional[str] = None

    @field_validator('created_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @field_validator('checks', mode='before')
    @classmethod
    def convert_checks(cls, v):
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    @field_validator('timeout', mode='before')
    @classmethod
    def convert_timeout(cls, v):
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    @field_validator('keepalive_pool', mode='before')
    @classmethod
    def convert_keepalive_pool(cls, v):
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    class Config:
        from_attributes = True


class UpstreamWithTargets(UpstreamResponse):
    targets: List[UpstreamTargetSchema] = []


class NodeBase(BaseModel):
    ip: str = Field(..., max_length=50)
    service_port: int = Field(default=80, ge=1, le=65535)
    management_port: int = Field(default=9180, ge=1, le=65535)
    edge_path: str = Field(..., max_length=255)
    status: int = Field(default=1)

    @field_validator('edge_path')
    @classmethod
    def validate_edge_path(cls, v: str) -> str:
        if not v.startswith('/'):
            raise ValueError('Edge路径必须以 / 开头')
        return v


class NodeCreate(NodeBase):
    cluster_id: Optional[int] = None


class NodeUpdate(BaseModel):
    ip: Optional[str] = Field(None, max_length=50)
    service_port: Optional[int] = Field(None, ge=1, le=65535)
    management_port: Optional[int] = Field(None, ge=1, le=65535)
    edge_path: Optional[str] = Field(None, max_length=255)
    status: Optional[int] = None

    @field_validator('edge_path')
    @classmethod
    def validate_edge_path(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.startswith('/'):
            raise ValueError('Edge路径必须以 / 开头')
        return v


class NodeResponse(NodeBase):
    id: int
    cluster_id: int
    created_at: Optional[str] = None

    @field_validator('created_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True


class NodeListResponse(BaseModel):
    total: int
    items: List[NodeResponse]


class ConfigVersionResponse(BaseModel):
    id: int
    cluster_id: int
    resource_type: str
    resource_id: int
    version: int
    config: str
    created_at: Optional[str] = None
    created_by: str

    @field_validator('created_at', mode='before')
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True


class ConfigVersionListResponse(BaseModel):
    total: int
    items: List[ConfigVersionResponse]
    current_version: Optional[int] = None