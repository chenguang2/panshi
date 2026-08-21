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

export interface MigrateResult {
  message: string
  tables_migrated: number
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
