/**
 * Edge 节点自启动（systemd）管理 API。
 *
 * 注意：autostart 端点为 SSE 流式返回，由 useInstallStream composable
 * 消费，这里仅提供请求体类型与 URL 构建。
 */

export type AutostartAction = 'enable' | 'disable' | 'status'

export interface AutostartRequest {
  action: AutostartAction
  edge_path?: string
  run_user?: string
  root_user?: string
  root_password?: string
}

export type AutostartStatus = 'enabled' | 'disabled' | 'not_configured' | 'permission_denied' | 'unknown'

/** 生成 autostart SSE 流式端点 URL。 */
export function autostartUrl(nodeId: number): string {
  return `/nodes/${nodeId}/autostart`
}
