import api from '@/api/index'

// ---- Request Types ----

export interface TestConnectionRequest {
  cluster_id: number
  node_id: number
  admin_key?: string
}

export interface ImportRequest {
  cluster_id: number
  node_id: number
  admin_key?: string
  selections: ImportSelections
}

export interface ImportSelections {
  upstreams: boolean
  routes: boolean
  plugin_configs: boolean
  global_rules: boolean
  plugin_metadata: boolean
  stream_proxy: boolean
  ssl_certificates: boolean
}

// ---- Response Types ----

export interface TestConnectionResponse {
  success: boolean
  version?: string
  plugin_count?: number
  route_count?: number
  upstream_count?: number
  plugin_config_count?: number
  global_rule_count?: number
  plugin_metadata_count?: number
  stream_proxy_count?: number
  node?: string
  cluster_name?: string
  response_time_ms?: number
  message?: string
}

export interface PluginSummary {
  known_count: number
  unknown_count: number
  unknown_plugin_names: string[]
}

export interface Conflict {
  type: string
  resource: string
  reason: string
  resolution: string
}

export interface PluginMetadataPreview {
  plugin_name: string
  config_data: Record<string, any>
}

export interface PreviewResponse {
  upstreams: Record<string, any>[]
  routes: Record<string, any>[]
  plugin_configs: Record<string, any>[]
  global_rules: Record<string, any>[]
  plugin_metadata: PluginMetadataPreview[]
  stream_proxies: Record<string, any>[]
  conflicts: Conflict[]
  plugin_summary: PluginSummary
  warnings?: string[]
}

export interface ImportedCounts {
  upstreams: number
  routes: number
  plugin_configs: number
  global_rules: number
  plugin_metadata: number
  stream_proxies: number
  skipped: number
}

export interface ImportResponse {
  success: boolean
  import_log_id: number
  imported_counts: ImportedCounts
  plugin_summary: PluginSummary
  message: string
}

// ---- API Functions ----

export function testConnection(clusterId: number, nodeId: number, adminKey?: string) {
  const body: TestConnectionRequest = { cluster_id: clusterId, node_id: nodeId }
  if (adminKey) body.admin_key = adminKey
  return api.post<TestConnectionResponse>('/edge-import/test-connection', body)
}

export function getPreview(clusterId: number, nodeId: number, adminKey?: string) {
  const body: Record<string, any> = { cluster_id: clusterId, node_id: nodeId }
  if (adminKey) body.admin_key = adminKey
  return api.post<PreviewResponse>('/edge-import/preview', body)
}

export function executeImport(clusterId: number, nodeId: number, selections: ImportSelections, adminKey?: string) {
  const body: ImportRequest = { cluster_id: clusterId, node_id: nodeId, selections }
  if (adminKey) body.admin_key = adminKey
  return api.post<ImportResponse>('/edge-import/execute', body)
}
