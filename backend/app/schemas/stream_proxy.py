import json as _json
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime


class TargetSchema(BaseModel):
    target: str = Field(..., max_length=255)
    weight: int = Field(default=100, ge=1, le=1000)

    class Config:
        from_attributes = True


class StreamProxyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    listen_port: int = Field(..., ge=1, le=65535)
    load_balance: str = Field(default="weighted_roundrobin")
    scheme: str = Field(default="tcp")
    description: Optional[str] = None
    timeout: Optional[Dict[str, Any]] = None
    keepalive_pool: Optional[Dict[str, Any]] = None
    remote_addr: Optional[str] = None
    sni: Optional[str] = None
    status: int = Field(default=1)


class StreamProxyCreate(StreamProxyBase):
    targets: Optional[List[TargetSchema]] = None


class StreamProxyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    load_balance: Optional[str] = None
    scheme: Optional[str] = None
    targets: Optional[List[TargetSchema]] = None
    timeout: Optional[Dict[str, Any]] = None
    keepalive_pool: Optional[Dict[str, Any]] = None
    remote_addr: Optional[str] = None
    sni: Optional[str] = None
    status: Optional[int] = None


class StreamProxyResponse(StreamProxyBase):
    id: int
    edge_uuid: str
    cluster_id: int
    targets: Optional[List[Dict[str, Any]]] = None
    timeout: Optional[Dict[str, Any]] = None
    keepalive_pool: Optional[Dict[str, Any]] = None
    current_version: Optional[int] = None
    published_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @field_validator("created_at", "updated_at", "published_at", mode="before")
    @classmethod
    def convert_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat() + "Z"
        return v

    @field_validator("targets", mode="before")
    @classmethod
    def convert_targets(cls, v):
        if isinstance(v, str):
            return _json.loads(v)
        return v

    @field_validator("timeout", mode="before")
    @classmethod
    def convert_timeout(cls, v):
        if isinstance(v, str):
            return _json.loads(v)
        return v

    @field_validator("keepalive_pool", mode="before")
    @classmethod
    def convert_keepalive_pool(cls, v):
        if isinstance(v, str):
            return _json.loads(v)
        return v

    class Config:
        from_attributes = True


class DetectPortsRequest(BaseModel):
    node_id: int = Field(..., ge=1)


class PortItem(BaseModel):
    port: int
    status: str  # available | in_use | not_in_config
    used_by: Optional[str] = None
    source: Optional[str] = None  # db | edge


class DetectPortsResponse(BaseModel):
    ports: List[PortItem] = []
