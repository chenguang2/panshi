from pydantic import BaseModel, Field
from typing import Optional, List


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
