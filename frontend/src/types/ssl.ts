export interface SslCertificate {
  id: number
  edge_uuid: string
  cluster_id: number
  name: string
  sni: string
  cert: string
  private_key?: string
  key?: string
  cert_type: string
  ssl_protocols?: string
  description?: string
  current_version?: number
  status: number
  created_at?: string
  updated_at?: string
  cluster_name?: string
  cluster_group_name?: string
}

export interface SslCertificateCreate {
  name: string
  cluster_id: number
  cert_type?: string
  sni: string
  cert: string
  private_key?: string
  key?: string
  ssl_protocols?: string
  description?: string
}

export interface SslCertificateUpdate {
  name?: string
  sni?: string
  cert?: string
  private_key?: string
  key?: string
  cert_type?: string
  ssl_protocols?: string
  description?: string
}

export interface SslListResponse {
  total: number
  items: SslCertificate[]
}
