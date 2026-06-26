from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class PreviewRequest(BaseModel):
    cluster_id: int
    node_id: int
    admin_key: Optional[str] = None


class TestConnectionRequest(BaseModel):
    cluster_id: int
    node_id: int
    admin_key: Optional[str] = None


class TestConnectionResponse(BaseModel):
    success: bool
    version: Optional[str] = None
    plugin_count: Optional[int] = None
    route_count: Optional[int] = None
    upstream_count: Optional[int] = None
    plugin_config_count: Optional[int] = None
    global_rule_count: Optional[int] = None
    plugin_metadata_count: Optional[int] = None
    node: Optional[str] = None
    cluster_name: Optional[str] = None
    response_time_ms: Optional[int] = None
    message: Optional[str] = None


class PluginPreview(BaseModel):
    name: str
    config: Dict[str, Any]
    is_known: bool


class UpstreamPreview(BaseModel):
    name: str
    type: str
    nodes: Optional[Dict[str, int]] = None
    hash_on: Optional[str] = None
    key: Optional[str] = None
    pass_host: Optional[str] = None
    scheme: Optional[str] = None
    retries: Optional[int] = None
    timeout: Optional[Dict[str, Any]] = None
    checks: Optional[Dict[str, Any]] = None
    keepalive_pool: Optional[Dict[str, Any]] = None
    edge_uuid: str


class RoutePreview(BaseModel):
    name: Optional[str] = None
    uri: Optional[str] = None
    uris: Optional[List[str]] = None
    methods: Optional[List[str]] = None
    hosts: Optional[List[str]] = None
    remote_addrs: Optional[str] = None
    vars: Optional[List[List[Any]]] = None
    priority: int = 0
    upstream_id: Optional[str] = None
    plugins: Optional[List[PluginPreview]] = None
    plugin_config_id: Optional[str] = None
    status: int = 1
    edge_uuid: str


class PluginConfigPreview(BaseModel):
    name: str
    description: Optional[str] = None
    plugins: Optional[List[PluginPreview]] = None
    edge_uuid: str


class GlobalRulePreview(BaseModel):
    name: str
    description: Optional[str] = None
    plugins: Optional[List[PluginPreview]] = None
    edge_uuid: str


class PluginMetadataPreview(BaseModel):
    plugin_name: str
    config_data: Any = None


class ConflictInfo(BaseModel):
    type: str  # name_conflict / route_conflict / uuid_conflict
    resource_type: str  # upstream / route / plugin_config / global_rule
    resource_name: str
    reason: str
    resolution: str


class PluginSummary(BaseModel):
    known_count: int
    unknown_count: int
    unknown_plugin_names: List[str]


class ImportPreviewResponse(BaseModel):
    upstreams: List[UpstreamPreview]
    routes: List[RoutePreview]
    plugin_configs: List[PluginConfigPreview]
    global_rules: List[GlobalRulePreview]
    plugin_metadata: List[PluginMetadataPreview] = []
    conflicts: List[ConflictInfo]
    plugin_summary: PluginSummary


class ImportSelection(BaseModel):
    upstreams: bool = True
    routes: bool = True
    plugin_configs: bool = True
    global_rules: bool = True
    plugin_metadata: bool = True


class ImportExecuteRequest(BaseModel):
    cluster_id: int
    node_id: int
    admin_key: Optional[str] = None
    selections: ImportSelection = ImportSelection()


class ImportCounts(BaseModel):
    upstreams: int = 0
    routes: int = 0
    plugin_configs: int = 0
    global_rules: int = 0
    plugin_metadata: int = 0
    skipped: int = 0


class ImportExecuteResponse(BaseModel):
    success: bool
    import_log_id: Optional[int] = None
    imported_counts: Optional[ImportCounts] = None
    skipped_counts: Optional[ImportCounts] = None
    plugin_summary: Optional[PluginSummary] = None
    message: Optional[str] = None


class ImportLogResponse(BaseModel):
    id: int
    cluster_id: int
    node_ip: str
    node_port: int
    edge_path: Optional[str] = None
    status: str
    upstream_count: int
    route_count: int
    plugin_config_count: int
    global_rule_count: int
    known_plugin_count: int
    unknown_plugin_count: int
    unknown_plugin_names: Optional[str] = None
    conflict_details: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True
