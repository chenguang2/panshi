/**
 * 自启动状态六态展示映射（autostart-ux-review-fixes 批 1 · design D2）。
 *
 * 六态：未查询（库中无记录，非失败语义）/ 已启用 / 已禁用 / 未配置（真实态）
 *      / 查询受限（无 systemctl 读取权限，橙 outline 非红）/ 查询失败（无法识别输出）。
 * 「未知」文案已废除（2026-10-27 评审裁决）。
 */
import type { AutostartStatus } from '@/api/edgeAutostart'
import { formatDateTime } from '@/utils/format'

export type AutostartTagKind = 'real' | 'failure' | 'unset'

export interface AutostartTagInfo {
  label: string
  /** antdv tag 预设色；'default' 渲染灰 */
  color: string
  /** outline=true：透明底描边样式（失败态专用，与填充色真实态区分层级） */
  outline?: boolean
  kind: AutostartTagKind
  /** tooltip 补充说明（可空） */
  hint?: string
  /** 超过 7 天未更新的真实态 shall 显示「状态可能过期」（tooltip，不加警示色） */
  stale?: boolean
}

const TAGS: Record<AutostartStatus, Omit<AutostartTagInfo, 'stale'>> = {
  enabled: { label: '已启用', color: 'green', kind: 'real' },
  disabled: { label: '已禁用', color: 'orange', kind: 'real' },
  not_configured: {
    label: '未配置',
    color: 'default',
    kind: 'real',
    // 中性事实，非错误
    hint: '节点上没有 edge.service，需先在节点安装或执行启用',
  },
  permission_denied: {
    label: '查询受限',
    color: 'orange',
    outline: true,
    kind: 'failure',
    hint: '当前账号无 systemctl 读取权限，可用 root 查询或检查节点 sudo 配置',
  },
  unknown: {
    label: '查询失败',
    color: 'red',
    outline: true,
    kind: 'failure',
    hint: '最近一次查询未能识别节点真实状态，可重新查询或查看操作日志',
  },
}

/** 库中无记录：非失败语义（曾与「查询失败」混显为「未知」） */
const NOT_QUERIED: AutostartTagInfo = {
  label: '未查询',
  color: 'default',
  kind: 'unset',
  hint: '尚未对该节点执行过查询',
}

export const AUTOSTART_STALE_DAYS = 7

export function mapAutostartStatus(
  status: AutostartStatus | string | null | undefined,
  updatedAt?: string | null,
): AutostartTagInfo {
  const info = !status || !(status in TAGS) ? (status ? TAGS.unknown : NOT_QUERIED) : TAGS[status as AutostartStatus]
  const result: AutostartTagInfo = { ...info }
  if (result.kind === 'real' && updatedAt) {
    const t = new Date(updatedAt).getTime()
    if (!Number.isNaN(t) && Date.now() - t > AUTOSTART_STALE_DAYS * 86400_000) result.stale = true
  }
  return result
}

/** 操作类型 → 展示文案（状态列小字「{时间} · {最后操作}」用） */
export function autostartActionLabel(action: string | null | undefined): string {
  switch (action) {
    case 'enable':
      return '最后操作：启用自启动'
    case 'disable':
      return '最后操作：禁用自启动'
    case 'status':
      return '最后操作：查询状态'
    default:
      return ''
  }
}

/** 最近操作 tooltip（design D8：action/rc/时间/脱敏命令） */
export function autostartRecordTooltip(record: {
  action?: string | null
  rc?: number | null
  updated_at?: string | null
  command?: string | null
  status_label?: string
}): string | null {
  const parts: string[] = []
  if (record.status_label) parts.push(`当前状态：${record.status_label}`)
  if (record.updated_at) parts.push(`时间：${formatDateTime(record.updated_at)}`)
  if (record.action) parts.push(`操作：${autostartActionLabel(record.action).replace('最后操作：', '')}`)
  if (record.rc !== null && record.rc !== undefined) parts.push(`返回码 rc：${record.rc}`)
  if (record.command) parts.push(`脱敏命令：${record.command}`)
  return parts.length ? parts.join('\n') : null
}
