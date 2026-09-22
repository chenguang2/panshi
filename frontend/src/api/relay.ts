/**
 * 跨中心中继区域注册表 API（openspec: add-relay-gateway）。
 */
import api from '@/api/index'

export interface RelayGateway {
  id: number
  code: string
  name: string
  http_base_url: string | null
  ssh_jump: string | null
  openresty_prefix: string | null
  status: 'enabled' | 'disabled' | string
  created_at?: string | null
  updated_at?: string | null
}

export interface RelaySegment {
  name: string
  ok: boolean
  elapsed_ms?: number
  error?: string
  nodes?: { node: string; ok: boolean; error?: string }[]
}

export interface RelayHealthResult {
  region: string
  ok: boolean
  segments: RelaySegment[]
  error?: string
}

export interface RelayPushResult {
  ok: boolean
  region: string
  rc?: number
  status?: string
  hosts_pattern?: string
  listen_port?: number
}

export function listRelayGateways() {
  return api.get<RelayGateway[]>('/relay/gateways')
}

export function createRelayGateway(data: Partial<RelayGateway>) {
  return api.post<RelayGateway>('/relay/gateways', data)
}

export function updateRelayGateway(id: number, data: Partial<RelayGateway>) {
  return api.put<RelayGateway>(`/relay/gateways/${id}`, data)
}

export function deleteRelayGateway(id: number) {
  return api.delete(`/relay/gateways/${id}`)
}

export function pushRelayGatewayConfig(id: number) {
  return api.post<RelayPushResult>(`/relay/gateways/${id}/push-config`)
}

export function initRelayGateway(id: number) {
  return api.post<RelayPushResult>(`/relay/gateways/${id}/init`)
}

export function relayHealthCheck(region?: string) {
  const query = region ? `?region=${encodeURIComponent(region)}` : ''
  return api.get<RelayHealthResult | { regions: RelayHealthResult[] }>(`/relay/health-check${query}`)
}
