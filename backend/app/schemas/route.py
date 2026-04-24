from pydantic import BaseModel, Field
from typing import Optional, List


class RouteBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    uri: str = Field(..., max_length=500)
    methods: Optional[str] = None
    priority: int = Field(default=0)
    status: int = Field(default=1)
    description: Optional[str] = None


class RouteCreate(RouteBase):
    cluster_id: int
    upstream_id: Optional[int] = None


class RouteUpdate(BaseModel):
    name: Optional[str] = None
    uri: Optional[str] = None
    methods: Optional[str] = None
    priority: Optional[int] = None
    status: Optional[int] = None
    upstream_id: Optional[int] = None
    description: Optional[str] = None


class RouteResponse(RouteBase):
    id: int
    cluster_id: int
    upstream_id: Optional[int] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class RouteListResponse(BaseModel):
    total: int
    items: List[RouteResponse]


class PluginConfig(BaseModel):
    plugin_name: str
    config: str


class PluginUpdateRequest(BaseModel):
    plugins: List[PluginConfig]


class BuiltinPluginResponse(BaseModel):
    name: str
    description: str
    schema: dict