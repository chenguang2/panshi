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
  status: number
  created_at?: string
  node_count: number
  healthy_node_count: number
  upstream_count: number
  route_count: number
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
}

export interface Node {
  id: number
  cluster_id: number
  ip: string
  service_port: number
  management_port: number
  status: number
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
  description: string
  schema: Record<string, any>
}

export interface RoutePlugin {
  plugin_name: string
  config: string
}