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
  MigratePayload,
  MigrateResult,
  MigrationBackupProgressEvent,
  MigrationCompleteEvent,
  MigrationHistoryItem,
  MigrationStreamEvent,
  MigrationTableProgressEvent,
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

export function migrateDatabase(sourceId: string, targetId: string, payload?: Partial<MigratePayload>) {
  const body: MigratePayload = {
    source_id: sourceId,
    target_id: targetId,
    mode: payload?.mode ?? 'replace',
    include_logs: payload?.include_logs ?? true,
    confirmed_clear: payload?.confirmed_clear ?? false,
  }
  return api.post<MigrateResult>('/database/migrate', body, { timeout: 300000 })
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
