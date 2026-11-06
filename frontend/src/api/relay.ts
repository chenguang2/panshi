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
  /** SSH 连接（relay-gateway-inventory-ui）：口令不出列表（单查端点按需取） */
  ssh_user?: string | null
  ssh_port?: number | null
  ansible_python_interpreter?: string | null
  ssh_common_args?: string | null
  /** 清单漂移标记（后端列表计算注入，非库列）：true = ansible inventory 缺该局主机组，init/push 前置会拦 */
  inventory_group_missing?: boolean | null
  /** 区域节点计数（后端列表聚合注入，非库列）：下发确认弹窗展示白名单规模 */
  enabled_node_count?: number
  total_node_count?: number
  /** 挂接集群计数（relay-gateways-ux-redesign）：>0 时删除菜单禁用，先解挂再删 */
  attached_cluster_count?: number
  /** 下发快照（relay-push-drift-preview）：最后一次成功下发时间与漂移差集 */
  last_pushed_at?: string | null
  push_drift?: { added: string[]; removed: string[] } | null
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

/** 网关创建/更新载荷（relay-gateway-inventory-ui）：SSH 连接凭据随注册提交 */
export interface RelayGatewayPayload {
  code?: string
  name?: string
  http_base_url?: string | null
  ssh_jump?: string | null
  openresty_prefix?: string | null
  status?: string
  ssh_user?: string
  ssh_password?: string | null
  ssh_port?: number
  ansible_python_interpreter?: string | null
  ssh_common_args?: string | null
}

export function createRelayGateway(data: RelayGatewayPayload) {
  return api.post<RelayGateway>('/relay/gateways', data)
}

export function updateRelayGateway(id: number, data: RelayGatewayPayload) {
  return api.put<RelayGateway>(`/relay/gateways/${id}`, data)
}

export function deleteRelayGateway(id: number) {
  return api.delete(`/relay/gateways/${id}`)
}

/** 按需单查网关 SSH 口令（relay-gateway-inventory-ui：列表不回传，单独留审计） */
export function fetchGatewayCredential(id: number) {
  return api.get<{ ssh_password: string | null }>(`/relay/gateways/${id}/credential`)
}

/** init / push 的 SSE 流地址（经 `useInstallStream.start` 消费，实时 stdout + 进度）。 */
export const relayInitStreamUrl = (id: number) => `/relay/gateways/${id}/init`

export const relayPushStreamUrl = (id: number) => `/relay/gateways/${id}/push-config`

/** sshd 跳板转发配置的 SSE 流地址（以 root 在网关机配置，凭据仅本次使用、不保存）。 */
export const relaySshdSetupStreamUrl = (id: number) => `/relay/gateways/${id}/sshd-setup`

export interface RelaySshdSetupRequest {
  root_user: string
  root_password: string
}

export function relayHealthCheck(region?: string) {
  const query = region ? `?region=${encodeURIComponent(region)}` : ''
  return api.get<RelayHealthResult | { regions: RelayHealthResult[] }>(`/relay/health-check${query}`, {
    timeout: RELAY_LONG_TIMEOUT,
  })
}

/** 只读预览该区域将写入网关机的配置文件内容（供界面复制 / ansible 不可用时手工配置）。 */
export function getRelayConfigPreview(id: number) {
  return api.get<RelayConfigPreview>(`/relay/gateways/${id}/config-preview`)
}
