// Database management types — mirror backend app/schemas/database.py + ConnectionConfig.public_dict()

export type DbType = 'sqlite' | 'postgres'

export interface DbConnection {
  id: string
  type: DbType
  name: string
  path?: string | null
  host?: string | null
  port?: number | null
  database?: string | null
  username?: string | null
  password_set?: boolean
  ssl?: boolean
  display_address?: string
}

export interface DbConnectionCreate {
  type: DbType
  name: string
  path?: string | null
  host?: string | null
  port?: number | null
  database?: string | null
  username?: string | null
  password?: string | null
  ssl?: boolean
}

export interface DbConnectionUpdate {
  name?: string | null
  path?: string | null
  host?: string | null
  port?: number | null
  database?: string | null
  username?: string | null
  password?: string | null
  ssl?: boolean | null
}

export interface DbStatus {
  active: DbConnection | null
  connections_count: number
  version: number
}

export interface DbTestResult {
  success: boolean
  detail: string
}

export interface MigratePayload {
  source_id: string
  target_id: string
  mode?: string
  include_logs?: boolean
  confirmed_clear?: boolean
}

export interface MigrateTableDetail {
  name: string
  columns: number
  rows: number
}

export interface MigrateResult {
  message: string
  tables_migrated: number
  tables: MigrateTableDetail[]
  backup_path: string
}

export interface ExportResult {
  message: string
  archive_path: string
}

export interface ImportPayload {
  archive_path: string
  target_id: string
  confirmed_clear?: boolean
}

export interface MigrationHistoryItem {
  id: number
  direction: string
  source_connection: string
  target_connection: string
  mode: string
  status: string
  tables_count?: number
  backup_path?: string
  error_message?: string
  created_at?: string | null
}

// ── SSE 迁移流事件（v3 8B-2：判别联合，供 createSSEClient<T> 类型收窄，消除 as any）──
interface SSEEventBase {
  [key: string]: unknown
}

export interface MigrationTableProgressEvent extends SSEEventBase {
  type: 'table_progress'
  table_index: number
  total_tables: number
  table_name?: string
  copied_rows?: number
  total_rows?: number
  skipped?: boolean
}

export interface MigrationBackupProgressEvent extends SSEEventBase {
  type: 'backup_progress'
  done: number
  total: number
}

export interface MigrationBackupCompleteEvent extends SSEEventBase {
  type: 'backup_complete'
  path: string
}

export interface MigrationCompleteEvent extends SSEEventBase {
  type: 'complete'
  message: string
  tables_migrated: number
  tables: MigrateTableDetail[]
  backup_path?: string
}

export interface MigrationErrorEvent extends SSEEventBase {
  type: 'error'
  message: string
}

export type MigrationStreamEvent =
  | MigrationTableProgressEvent
  | MigrationBackupProgressEvent
  | MigrationBackupCompleteEvent
  | MigrationCompleteEvent
  | MigrationErrorEvent
