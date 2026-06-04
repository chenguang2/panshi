import api from '@/api/index'

// ---- Request Types ----

export interface TestConnectionRequest {
  cluster_id: number
  node_id: number
}

export interface ImportRequest {
  cluster_id: number
  node_id: number
  selections: ImportSelections
}

export interface ImportSelections {
  upstreams: boolean
  routes: boolean
  plugin_configs: boolean
  global_rules: boolean
  plugin_metadata: boolean
}

// ---- Response Types ----

export interface TestConnectionResponse {
  success: boolean
  version: string
  plugin_count: number
  route_count: number
  upstream_count: number
  message: string
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
  conflicts: Conflict[]
  plugin_summary: PluginSummary
}

export interface ImportedCounts {
  upstreams: number
  routes: number
  plugin_configs: number
  global_rules: number
  plugin_metadata: number
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

export function testConnection(clusterId: number, nodeId: number) {
  return api.post<TestConnectionResponse>('/edge-import/test-connection', { cluster_id: clusterId, node_id: nodeId })
}

export function getPreview(clusterId: number, nodeId: number) {
  return api.get<PreviewResponse>('/edge-import/preview', { params: { cluster_id: clusterId, node_id: nodeId } })
}

export function executeImport(clusterId: number, nodeId: number, selections: ImportSelections) {
  return api.post<ImportResponse>('/edge-import/execute', { cluster_id: clusterId, node_id: nodeId, selections })
}
