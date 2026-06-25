from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime


class EdgeEnvReadResponse(BaseModel):
    node_id: int
    node_ip: str
    content: str


class EdgeEnvDeployRequest(BaseModel):
    content: str = Field(..., min_length=1)
    node_ids: Optional[List[int]] = None


class NodeResultItem(BaseModel):
    ip: str
    status: str
    error: Optional[str] = None
    steps: Optional[List[dict]] = None


class EdgeEnvDeployResponse(BaseModel):
    version_id: int
    status: str
    node_results: List[NodeResultItem]


class EdgeEnvVersionListItem(BaseModel):
    id: int
    status: str
    deployed_by: str
    deployed_at: datetime
    node_count: int
    success_count: int


class EdgeEnvVersionResponse(BaseModel):
    id: int
    cluster_id: int
    content: str
    previous_content: Optional[str] = None
    status: str
    deployed_by: str
    deployed_at: datetime
    node_results: List[Any]
