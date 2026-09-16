import api from '@/api/index'
import { createSSEClient } from '@/utils/sse'
import type {
  DbConnection,
  DbConnectionCreate,
  DbConnectionUpdate,
  DbStatus,
  DbTestResult,
  ExportResult,
  ImportPayload,
  MigrationBackupProgressEvent,
  MigrationCompleteEvent,
  MigrationHistoryCleanupPreview,
  MigrationHistoryItem,
  MigrationStreamEvent,
  MigrationTableProgressEvent,
  RunningTasksResponse,
} from '@/types/database'

export function getDatabaseStatus() {
  return api.get<DbStatus>('/database/status')
}

export function listConnections() {
  return api.get<DbConnection[]>('/database/connections')
}

export function createConnection(data: DbConnectionCreate) {
  return api.post<DbConnection>('/database/connections', data)
}

export function updateConnection(connId: string, data: DbConnectionUpdate) {
  return api.put<DbConnection>(`/database/connections/${connId}`, data)
}

export function deleteConnection(connId: string) {
  return api.delete(`/database/connections/${connId}`)
}

export function testConnection(connId: string) {
  return api.post<DbTestResult>(`/database/connections/${connId}/test`)
}

export function switchDatabase(connectionId: string) {
  return api.post('/database/switch', { connection_id: connectionId })
}

/**
 * SSE streaming migration with real-time progress.
 * Returns AbortController for cancellation.
 */
export function migrateDatabaseStream(
  sourceId: string,
  targetId: string,
  options: {
    mode?: string
    includeLogs?: boolean
    confirmedClear?: boolean
    timeout?: number
    onProgress?: (data: MigrationTableProgressEvent) => void
    onBackupProgress?: (data: MigrationBackupProgressEvent) => void
    onBackupComplete?: (path: string) => void
    onComplete?: (data: MigrationCompleteEvent) => void
    onError?: (message: string) => void
  },
) {
  const token = localStorage.getItem('token') || ''
  return createSSEClient<MigrationStreamEvent>({
    url: '/api/v1/database/migrate-stream',
    body: {
      source_id: sourceId,
      target_id: targetId,
      mode: options.mode ?? 'replace',
      include_logs: options.includeLogs ?? true,
      confirmed_clear: options.confirmedClear ?? false,
      timeout: options.timeout ?? 300,
    },
    token,
    onEvent: (event) => {
      switch (event.type) {
        case 'table_progress':
          options.onProgress?.(event)
          break
        case 'backup_progress':
          options.onBackupProgress?.(event)
          break
        case 'backup_complete':
          options.onBackupComplete?.(event.path)
          break
        case 'complete':
          options.onComplete?.(event)
          break
        case 'error':
          options.onError?.(event.message)
          break
      }
    },
    onError: (error) => {
      options.onError?.(error.message)
    },
  })
}

export function exportDatabase(sourceId: string) {
  return api.post<ExportResult>('/database/export', { source_id: sourceId })
}

export function importDatabase(payload: ImportPayload) {
  return api.post('/database/import', payload)
}

export function getMigrationHistory() {
  return api.get<MigrationHistoryItem[]>('/database/history')
}

/** 清理影响预览（只读）：库内总数 / 将删除 / 将保留（按库内真实总数计算，不受列表 100 条上限影响）。 */
export function getMigrationHistoryCleanupPreview(keepLast: number) {
  return api.get<MigrationHistoryCleanupPreview>('/database/history/cleanup-preview', {
    params: { keep_last: keepLast },
  })
}

/** 按「保留最近 keepLast 条」清理当前活动库的迁移历史（running 记录受保护）。 */
export function cleanupMigrationHistory(keepLast: number) {
  return api.post<{ deleted: number; remaining: number }>('/database/history/cleanup', {
    keep_last: keepLast,
  })
}

export function getRunningTasks() {
  return api.get<RunningTasksResponse>('/database/running-tasks')
}
