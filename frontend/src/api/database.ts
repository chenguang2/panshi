import api from '@/api/index'
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
  MigrationHistoryItem,
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
  return api.post<MigrateResult>('/database/migrate', body)
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
