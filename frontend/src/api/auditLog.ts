/**
 * 审计日志 API（audit-log-ui spec）。
 */
import api from '@/api/index'

export interface AuditLogItem {
  id: number
  username: string | null
  action: string
  resource: string
  resource_id: number | null
  detail: string | null
  ip_address: string | null
  created_at: string | null
}

export interface AuditLogPage {
  total: number
  page: number
  page_size: number
  items: AuditLogItem[]
}

export interface AuditLogMeta {
  users: string[]
  actions: string[]
  resources: string[]
  /** 库内总条数（D：用量提示，供归档决策参考） */
  total?: number
  /** 最早记录时间（ISO 字符串，空库为 null） */
  oldest?: string | null
}

export interface AuditLogQuery {
  page?: number
  page_size?: number
  user?: string
  action?: string
  resource?: string
  start?: string
  end?: string
}

export function listAuditLogs(params: AuditLogQuery) {
  return api.get<AuditLogPage>('/system/operations', { params })
}

export function getAuditLogMeta() {
  return api.get<AuditLogMeta>('/system/operations/meta')
}

export function exportAuditLogs(payload: {
  format: 'csv' | 'xlsx'
  user?: string
  action?: string
  resource?: string
}) {
  return api.post<{ task_id: string; status: string; rows: number }>('/system/operations/export', payload)
}

export function getExportStatus(taskId: string) {
  return api.get<{ task_id: string; status: string; format: string }>(`/system/operations/export/${taskId}`)
}

export function exportDownloadUrl(taskId: string) {
  return `/api/v1/system/operations/export/${taskId}/download`
}

export interface AuditArchivePreview {
  count: number
  oldest: string | null
  newest: string | null
}

/** 归档预览（只读）：统计 before（不含当日）之前的条数与时间范围 */
export function previewArchiveAuditLogs(before: string) {
  return api.post<AuditArchivePreview>('/system/operations/archive/preview', { before })
}

/** 手动归档清理：服务端先落 CSV 存档再删除，返回 task_id 供下载存档 */
export function archiveAuditLogs(before: string) {
  return api.post<{ archived: number; task_id?: string; file?: string }>('/system/operations/archive', { before })
}

/**
 * 下载导出/归档文件：必须走 axios 实例（自动带 Authorization 头）拉 blob，
 * 顶层导航（window.location.href）不带 token 会被下载端点 401 拒绝
 */
export async function downloadExport(taskId: string) {
  const res = await api.get<Blob>(`/system/operations/export/${taskId}/download`, {
    responseType: 'blob',
  })
  return res.data
}
