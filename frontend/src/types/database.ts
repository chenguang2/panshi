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

export interface MigrateTableDetail {
  name: string
  columns: number
  rows: number
  /** 表类型（后端 app/core/db_migration.table_kind）：业务表 / 审计与导入日志 / 任务日志 */
  kind?: 'business' | 'audit_log' | 'task_log'
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
  duration_seconds?: number | null
  started_at?: string | null
  created_at?: string | null
}

/** 迁移历史清理预览：按库内真实总数计算（列表接口只返回最近 100 条）。 */
export interface MigrationHistoryCleanupPreview {
  total: number
  will_delete: number
  will_keep: number
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

// ── Running tasks（Task 3.1: GET /database/running-tasks 响应类型）──

export interface MigrationProgress {
  phase: string // "backup" | "migrating" | ""
  backup_done: number
  backup_total: number
  table_index: number
  total_tables: number
  current_table: string
  copied_rows: number
  total_rows: number
  skipped: boolean
}

export interface MigrationState {
  in_progress: boolean
  source_id: string | null
  target_id: string | null
  started_at: string | null
  progress: MigrationProgress | null
}

export interface RunningTask {
  id: number
  cluster_id: number
  cluster_name: string
  task_type: string
  status: string
  total_nodes: number
  success_nodes: number
  failed_nodes: number
  created_at: string | null
  started_at: string | null
}

export interface RunningTasksResponse {
  migration: MigrationState
  tasks: RunningTask[]
}
