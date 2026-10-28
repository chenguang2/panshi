/**
 * Edge 节点自启动（systemd）管理 API。
 *
 * 注意：autostart 端点为 SSE 流式返回，由 useInstallStream composable
 * 消费，这里仅提供请求体类型与 URL 构建。
 */

type AutostartAction = 'enable' | 'disable' | 'status'

export type AutostartStatus = 'enabled' | 'disabled' | 'not_configured' | 'permission_denied' | 'unknown'

/** 生成 autostart SSE 流式端点 URL。 */
export function autostartUrl(nodeId: number): string {
  return `/nodes/${nodeId}/autostart`
}

import api from '@/api/index'

export interface AutostartRecord {
  /** 节点 DB id */
  node_id: number
  cluster_id: number
  status: AutostartStatus | string | null
  /** 最近操作：enable | disable | status */
  action: string | null
  /** 脱敏命令（审计口径） */
  command: string | null
  rc: number | null
  /** naive UTC（isoformat 无时区后缀，展示走 utils/format.ts） */
  updated_at: string | null
  /** 节点是否在 ansible 主机清单（预检，无记录节点也返回） */
  in_inventory?: boolean
}

export function listAutostartRecords() {
  return api.get<{ items: AutostartRecord[] }>('/nodes/autostart/records')
}

export function listAutostartDefaults() {
  return api.get<{ default_run_user?: string }>('/nodes/autostart/defaults')
}

export function getNodeAutostartDefaults(nodeId: number) {
  return api.get<{ run_user?: string }>(`/nodes/${nodeId}/autostart/defaults`)
}
