from pydantic import BaseModel, Field
from typing import Optional, List


class EdgeEnvLimits(BaseModel):
    """Edge 生效上传上限诊断（edge-upload-limit-alignment）。

    生效上限 = `deploy.http.admin.client_max_body_size`；缺失时按 Edge pack 的
    server 级基线（32MB）生效——http 级的同名配置对该 server 无效。
    """

    platform_mb: int
    admin_mb: Optional[int] = None
    effective_mb: int
    sufficient: bool
    note: str


class EdgeEnvReadResponse(BaseModel):
    node_id: int
    node_ip: str
    content: str
    route: str
    relay_via: Optional[str] = None
    limits: Optional[EdgeEnvLimits] = None


class EdgeEnvDeployRequest(BaseModel):
    content: str = Field(..., min_length=1)
    node_ids: Optional[List[int]] = None


class NodeResultItem(BaseModel):
    ip: str
    status: str
    error: Optional[str] = None
    steps: Optional[List[dict]] = None
