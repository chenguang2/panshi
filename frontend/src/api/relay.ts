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
  nodes?: { node: string; ok: boolean; error?: string; ssh_skipped?: boolean; note?: string }[]
}

export interface RelayHealthResult {
  region: string
  ok: boolean
  segments: RelaySegment[]
  error?: string
}

export interface RelayConfigFile {
  path: string
  content: string
  purpose: string
}

export interface RelayConfigPreview {
  region_code: string
  openresty_prefix: string
  listen_port: number
  files: RelayConfigFile[]
  notes: string[]
}

/** 长耗时中继接口专用超时：链路体检为同步网络探测（预算 60s），超过 axios 全局 30s。
 * init / push 已改为 SSE 流式（见 `useInstallStream`），不受 axios 超时约束。
 */
const RELAY_LONG_TIMEOUT = 180_000

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

/** init / push 的 SSE 流地址（经 `useInstallStream.start` 消费，实时 stdout + 进度）。 */
export const relayInitStreamUrl = (id: number) => `/relay/gateways/${id}/init`

export const relayPushStreamUrl = (id: number) => `/relay/gateways/${id}/push-config`

export function relayHealthCheck(region?: string) {
  const query = region ? `?region=${encodeURIComponent(region)}` : ''
  return api.get<RelayHealthResult | { regions: RelayHealthResult[] }>(
    `/relay/health-check${query}`,
    { timeout: RELAY_LONG_TIMEOUT },
  )
}

/** 只读预览该区域将写入网关机的配置文件内容（供界面复制 / ansible 不可用时手工配置）。 */
export function getRelayConfigPreview(id: number) {
  return api.get<RelayConfigPreview>(`/relay/gateways/${id}/config-preview`)
}
