export interface User {
  id: number
  username: string
  role: string
  status: number
  created_at?: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
  permissions?: string[]
}

export interface RoutePagination {
  total: number
  page: number
  pageSize: number
}

export interface UpstreamPagination {
  total: number
  page: number
  pageSize: number
}

export interface NodePagination {
  total: number
  page: number
  pageSize: number
}

export interface Cluster {
  id: number
  name: string
  display_name?: string
  description?: string
  group_name?: string
  admin_key?: string
  status: number
  created_at?: string
  node_count: number
  healthy_node_count: number
  upstream_count: number
  route_count: number
  plugin_config_count: number
  global_rule_count: number
  static_resource_count: number
  plugin_metadata_count: number
  activeTab?: string
  nodes?: Node[]
  nodesLoading?: boolean
  nodesPagination?: NodePagination
  nodesSearch?: string
  nodesSearchField?: string
  nodesSortBy?: string
  nodesSortOrder?: 'asc' | 'desc'
  upstreams?: Upstream[]
  upstreamsLoading?: boolean
  upstreamsPagination?: UpstreamPagination
  upstreamsSearch?: string
  upstreamsSearchField?: string
  upstreamsSortBy?: string
  upstreamsSortOrder?: 'asc' | 'desc'
  routes?: Route[]
  routesLoading?: boolean
  routesPagination?: RoutePagination
  routesSearch?: string
  routesSearchField?: string
  routesSortBy?: string
  routesSortOrder?: 'asc' | 'desc'
  selectedNode?: Node | null
  selectedUpstream?: Upstream | null
  selectedRoute?: Route | null
  plugin_configs?: PluginConfig[]
  selectedPluginConfig?: PluginConfig | null
  global_rules?: any[]
  selectedGlobalRule?: any | null
  static_resources?: any[]
  staticResourcesLoading?: boolean
  selectedStaticResource?: any | null
}

export interface Node {
  id: number
  cluster_id: number
  ip: string
  service_port: number
  management_port: number
  edge_path?: string
  edge_install_path?: string
  status: number
  status_detail?: Record<string, any>
  created_at?: string
}

export interface UpstreamTarget {
  id?: number
  upstream_id?: number
  target: string
  weight: number
  status?: number
}

export interface Upstream {
  id: number
  edge_uuid: string
  cluster_id: number
  name: string
  load_balance: string
  description?: string
  created_at?: string
  targets?: UpstreamTarget[]
}

export interface Route {
  id: number
  edge_uuid: string
  cluster_id: number
  upstream_id?: number
  name: string
  uri: string
  methods?: string
  priority: number
  status: number
  description?: string
  created_at?: string
  hosts?: string
  remote_addrs?: string
  vars?: [string, string, string][]
  advanced_match_enabled?: boolean
  current_version?: number
  published_at?: string
  plugins?: Record<string, any>
}

export type MatchRuleType = 'header' | 'query' | 'postarg' | 'cookie' | 'builtin'

export type MatchOperator = '==' | '!=' | '>' | '<' | '~~' | '~*' | 'IN' | 'NOT IN'

export interface MatchRule {
  type: MatchRuleType
  key: string
  operator: MatchOperator
  value: string
}

export interface Plugin {
  name: string
  display_name?: string
  category?: string
  description: string
  schema: Record<string, any>
  metadata_schema?: Record<string, any>
  enable_metadata?: boolean
}

export interface RoutePlugin {
  plugin_name: string
  config: string
}

export interface PluginConfig {
  id: number
  name: string
  description: string
  plugins: Record<string, any>
  edge_uuid?: string
  current_version?: number
  published_at?: string
  created_at?: string
  updated_at?: string
}

export interface StreamProxyTarget {
  target: string
  weight: number
}

export interface StreamProxy {
  id: number
  edge_uuid: string
  cluster_id: number
  name: string
  description?: string
  listen_port: number
  load_balance: string
  hash_on?: string
  key?: string
  scheme: string
  targets?: StreamProxyTarget[]
  timeout?: Record<string, number>
  keepalive_pool?: Record<string, number>
  checks?: Record<string, unknown> | string
  retries?: number
  retry_timeout?: number
  proxy_type?: string
  dns_config?: Record<string, unknown> | string
  remote_addr?: string
  sni?: string
  status: number
  current_version?: number
  published_at?: string
  created_at?: string
  updated_at?: string
  cluster_name?: string
  cluster_group_name?: string
  ref_node_id?: number
}

export interface PortItem {
  port: number
  status: 'available' | 'in_use' | 'not_in_config'
  used_by?: string
  source?: 'db' | 'edge'
}