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

export interface Upstream {
  id: number
  cluster_id: number
  name: string
  load_balance: string
  description?: string
  created_at?: string
}

export interface Route {
  id: number
  cluster_id: number
  upstream_id?: number
  name: string
  uri: string
  methods?: string
  priority: number
  status: number
  description?: string
  created_at?: string
}