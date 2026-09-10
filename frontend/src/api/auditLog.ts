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
