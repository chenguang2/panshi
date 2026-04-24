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
  admin_url: string
  admin_key: string
  description?: string
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