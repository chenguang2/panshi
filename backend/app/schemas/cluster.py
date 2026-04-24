from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime


class ClusterBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    display_name: Optional[str] = None
    admin_url: str = Field(..., max_length=500)
    admin_key: str = Field(..., min_length=1)
    description: Optional[str] = None
    status: int = Field(default=1)


class ClusterCreate(ClusterBase):
    pass


class ClusterUpdate(BaseModel):
    display_name: Optional[str] = None
    admin_url: Optional[str] = None
    admin_key: Optional[str] = None
    description: Optional[str] = None
    status: Optional[int] = None


class ClusterResponse(ClusterBase):
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


class ClusterListResponse(BaseModel):
    total: int
    items: List[ClusterResponse]


class UpstreamBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    load_balance: str = Field(default="roundrobin")
    description: Optional[str] = None


class UpstreamCreate(UpstreamBase):
    cluster_id: int


class UpstreamUpdate(BaseModel):
    name: Optional[str] = None
    load_balance: Optional[str] = None
    description: Optional[str] = None


class UpstreamTargetSchema(BaseModel):
    target: str = Field(..., max_length=255)
    weight: int = Field(default=100, ge=1, le=1000)


class UpstreamResponse(UpstreamBase):
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


class UpstreamWithTargets(UpstreamResponse):
    targets: List[UpstreamTargetSchema] = []