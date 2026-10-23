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
  organization?: string
  organizational_unit?: string
  client_ca?: string
  client_depth?: number
  skip_mtls_uri_regex?: string
  /** ssl-ux-review-fixes 组 2：发布状态四态——发布后被修改（列表端点派生下发） */
  pending_publish?: boolean
  /** ssl-ux-review-fixes 组 9：私钥掩码后由布尔表达「是否在位」（private_key/sign_key 恒空串） */
  has_private_key?: boolean
  has_sign_key?: boolean
  /** ssl-ux-review-fixes 组 3：到期信息（后端 derive_expiry 派生；解析失败为 null） */
  expire_at?: string | null
  expire_days?: number | null
  /** uapm 修复：证书 SAN（后端序列化期从 cert PEM 解析，非模型列；解析失败为空数组） */
  dns_sans?: string[]
  ip_sans?: string[]
}

/** ssl-ux-review-fixes 9.2：GET /clusters/{id}/ssl/{cert_id}/key 按需取响应（国密含 sign_key） */
export interface SslPrivateKeyResponse {
  private_key: string
  sign_key?: string
}

/** ssl-ux-review-fixes 10.1：POST /clusters/{id}/ssl/preview 响应（非法/缺失按字段 null） */
export interface SslPemCertPreview {
  ok: boolean
  subject_cn?: string | null
  san: string[]
  not_after?: string | null
  algorithm?: string | null
  expire_days?: number | null
}

export interface SslPemPreviewResponse {
  cert: SslPemCertPreview | null
  key: { ok: boolean } | null
  key_match: boolean | null
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
  organization?: string
  organizational_unit?: string
  client_ca?: string
  client_depth?: number
  skip_mtls_uri_regex?: string
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
  client_ca?: string
  client_depth?: number
  skip_mtls_uri_regex?: string
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
  organization?: string
  organizational_unit?: string
  client_ca?: string
  client_depth?: number
  skip_mtls_uri_regex?: string
}
