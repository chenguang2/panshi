// SQLite 备份与容灾类型 — 对齐后端 app/api/v1/db_backup.py 与 app/schemas/db_backup.py

export type DbBackupAuthType = 'password' | 'key'

/** GET/PUT /db-backup/config 响应中的配置段 */
export interface DbBackupConfig {
  enabled: boolean
  host: string | null
  port: number
  username: string | null
  auth_type: DbBackupAuthType
  /** 响应不含明文，仅有是否已设置密码的布尔 */
  has_password: boolean
  key_path: string | null
  remote_dir: string | null
  interval_minutes: number
  retain_count: number
  include_static: boolean
  include_task_scripts: boolean
  include_task_logs: boolean
  last_run_at: string | null
  last_success_at: string | null
  last_status: string | null
  last_error: string | null
  updated_at: string | null
}

/** GET/PUT /db-backup/config 响应中的派生状态段 */
export interface DbBackupStatusInfo {
  applicable: boolean
  reason: string | null
  in_progress: boolean
  next_run_at: string | null
  last_success_at: string | null
  last_status: string | null
}

export interface DbBackupConfigResponse {
  config: DbBackupConfig
  status: DbBackupStatusInfo
}

/**
 * PUT /db-backup/config 载荷（后端为全量覆盖语义，须始终携带全部字段）。
 * password 仅在设置/修改时携带；「留空不修改」须省略该键。
 */
export interface DbBackupConfigUpdate {
  enabled: boolean
  host: string | null
  port: number
  username: string | null
  auth_type: DbBackupAuthType
  password?: string
  key_path: string | null
  remote_dir: string | null
  interval_minutes: number
  retain_count: number
  include_static: boolean
  include_task_scripts: boolean
  include_task_logs: boolean
}

/** POST /db-backup/run 成功响应（备份结果摘要，与历史条目同构） */
export interface DbBackupRunResult {
  id: number
  status: string
  trigger: string
  started_at: string | null
  finished_at: string | null
  package_name: string | null
  file_size: number | null
  duration_ms: number | null
  error: string | null
}

/** 备份历史条目（GET /db-backup/history 的 items 元素） */
export interface DbBackupHistoryItem {
  id: number
  started_at: string
  finished_at: string | null
  status: string
  trigger: string
  package_name: string | null
  file_size: number | null
  duration_ms: number | null
  error: string | null
}

export interface DbBackupHistoryPage {
  total: number
  page: number
  page_size: number
  items: DbBackupHistoryItem[]
}

/** POST /db-backup/test 载荷（未填字段留空，后端回退已保存配置） */
export interface DbBackupTestPayload {
  host?: string | null
  port?: number | null
  username?: string | null
  auth_type?: DbBackupAuthType | null
  password?: string | null
  key_path?: string | null
}

export interface DbBackupTestResult {
  ok: boolean
  message: string
}

// ── 恢复向导 ────────────────────────────────────────────────────────────────

/** 向导步骤 1 的临时远端目标（独立于备份配置——新机场景配置表是空的） */
export interface RestoreTargetPayload {
  host: string
  port: number
  username: string
  auth_type: DbBackupAuthType
  password?: string | null
  key_path?: string | null
  remote_dir: string
}

/** 包元数据摘要（远端 meta.json 读取失败时 meta 为 null 或 meta_error 非空） */
export interface RestorePackageMeta {
  created_at?: string | null
  app_version?: string | null
  git_commit?: string | null
  active_connection_id?: string | null
  databases?: string[]
  skipped_databases?: string[]
  /** 取值：static / task_scripts / task_logs（包未包含的 B 类数据段） */
  missing_b_segments?: string[]
  meta_error?: string | null
}

export interface RestorePackageItem {
  name: string
  size: number
  mtime_utc?: string | null
  meta: RestorePackageMeta | null
}

export interface RestoreListResult {
  packages: RestorePackageItem[]
}

export interface RestoreVerifyPayload {
  target: RestoreTargetPayload
  package_name: string
}

/** 校验明细中的单库报告 */
export interface RestoreVerifyDbReport {
  integrity: string
  missing_key_tables?: string[]
}

/** verify 响应的 meta（verify_and_stage 返回的校验摘要） */
export interface RestoreVerifyMeta {
  verify_id?: string
  package_name?: string
  created_at?: string | null
  app_version?: string | null
  git_commit?: string | null
  active_connection_id?: string | null
  databases?: Record<string, RestoreVerifyDbReport>
  skipped_databases?: string[]
  missing_b_segments?: string[]
  expires_at?: string
}

export interface RestoreVerifyResult {
  verify_id: string
  package_name: string
  size: number
  meta: RestoreVerifyMeta
  /** 非空表示备份包版本与当前应用不一致（橙色警示） */
  version_note: string | null
  checks: {
    tar_integrity: string
    sha256: string
    db_integrity: Record<string, string>
    key_tables: string
  }
}

export interface RestoreExecutePayload {
  verify_id: string
  confirmed: boolean
}

export interface RestoreExecuteResult {
  success: boolean
  active_connection_id: string | null
  restored_databases: Record<string, unknown>[]
  message: string
}
