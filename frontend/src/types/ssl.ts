export interface CommandLogEntry {
  step: string
  command: string
  exit_code: number
  stdout?: string
  stderr?: string
}

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
  gm?: boolean
  algorithm?: string
  sign_cert?: string
  sign_key?: string
  create_method?: string
  generate_log?: CommandLogEntry[]
  is_ca?: boolean
  ca_cert_id?: number | null
}

export interface SslCertificateGenerateRequest {
  name: string
  common_name: string
  dns_sans?: string[]
  ip_sans?: string[]
  validity_days?: number
  dual_cert?: boolean
  cert_type?: string
  algorithm?: 'sm2' | 'rsa' | 'ecc'
  ca_cert_id?: number | null
  generate_client_certs?: boolean
}

export interface CaCertificateGenerateRequest {
  name: string
  common_name?: string
  validity_days?: number
}

export interface SslCertificateGenerateResponse {
  server: SslCertificate
  client?: SslCertificate | null
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
  gm?: boolean
  sign_cert?: string
  sign_key?: string
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
  gm?: boolean
  sign_cert?: string
  sign_key?: string
  is_ca?: boolean
  ca_cert_id?: number | null
}

export interface SslListResponse {
  total: number
  items: SslCertificate[]
}
