// SQLite 备份与容灾类型 — 对齐后端 app/api/v1/db_backup.py 与 app/schemas/db_backup.py
// 多目标两层模型（openspec db-backup-multi-target D1/D9）：全局单行 + 备份位置表

export type DbBackupAuthType = 'password' | 'key'

/** 备份位置（GET /db-backup/config 的 config.targets 元素；密码不回显） */
export interface DbBackupTarget {
  id: number
  /** 展示用标识（唯一，允许中文；不进文件名与 shell 命令） */
  name: string
  host: string
  port: number
  username: string
  auth_type: DbBackupAuthType
  /** 响应不含明文，仅有是否已设置密码的布尔 */
  has_password: boolean
  key_path: string | null
  remote_dir: string
  retain_count: number
  enabled: boolean
  created_at: string | null
  updated_at: string | null
}

/** GET/PUT /db-backup/config 响应中的配置段（全局字段 + 位置列表；旧单目标列已下线） */
export interface DbBackupConfig {
  enabled: boolean
  interval_minutes: number
  /** 来源标识：多机共享备份目录时区分各机；空 = 保存时后端自动解析并回显 */
  source_name: string | null
  include_static: boolean
  include_task_scripts: boolean
  include_task_logs: boolean
  last_run_at: string | null
  last_success_at: string | null
  /** 三态：success / partial / failed */
  last_status: string | null
  last_error: string | null
  updated_at: string | null
  targets: DbBackupTarget[]
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
 * PUT /db-backup/config 载荷——仅全局字段（目标字段从此端点移除，兼容忽略）。
 * source_name 空串/null = 未填，后端自动解析（首字符字母/数字，可用 . _ -，≤64 字符）。
 */
export interface DbBackupConfigUpdate {
  enabled: boolean
  interval_minutes: number
  source_name?: string | null
  include_static: boolean
  include_task_scripts: boolean
  include_task_logs: boolean
}

/** POST /db-backup/targets 载荷（name 唯一校验；password 仅设置/修改时携带，留空不修改） */
export interface DbBackupTargetCreate {
  name: string
  host: string
  port: number
  username: string
  auth_type: DbBackupAuthType
  password?: string
  key_path: string | null
  remote_dir: string
  retain_count: number
  enabled: boolean
}

/** PUT /db-backup/targets/{id} 载荷（全量更新；密码留空 = 不修改须省略该键） */
export type DbBackupTargetUpdate = DbBackupTargetCreate

/** POST /db-backup/run 成功响应（备份结果摘要，与历史条目同构） */
export interface DbBackupRunResult {
  id: number
  /** 三态：success / partial / failed */
  status: string
  trigger: string
  started_at: string | null
  finished_at: string | null
  package_name: string | null
  file_size: number | null
  duration_ms: number | null
  error: string | null
  /** 每启用位置的推送子结果（构建阶段失败时为空/缺省） */
  targets?: DbBackupHistoryTargetItem[] | null
}

/** 历史记录的位置子结果（启用位置各一条；target_name 为快照，位置删除不丢失） */
export interface DbBackupHistoryTargetItem {
  target_id: number | null
  target_name: string
  status: 'success' | 'failed'
  error: string | null
  duration_ms: number | null
}

/** 备份历史条目（GET /db-backup/history 的 items 元素） */
export interface DbBackupHistoryItem {
  id: number
  started_at: string
  finished_at: string | null
  /** 三态：success / partial / failed */
  status: string
  trigger: string
  package_name: string | null
  file_size: number | null
  duration_ms: number | null
  error: string | null
  targets?: DbBackupHistoryTargetItem[] | null
}

export interface DbBackupHistoryPage {
  total: number
  page: number
  page_size: number
  items: DbBackupHistoryItem[]
}

/** POST /db-backup/targets/test 载荷（可先于保存测试；未填字段后端回退既有配置语义不适用——按载荷直测） */
export interface DbBackupTargetTestPayload {
  host: string
  port?: number | null
  username?: string | null
  auth_type?: DbBackupAuthType | null
  password?: string | null
  key_path?: string | null
  remote_dir?: string | null
}

export interface DbBackupTestResult {
  ok: boolean
  message: string
}

// ── 恢复向导 ────────────────────────────────────────────────────────────────

/**
 * 恢复来源载荷（restore/list 与 verify 的 target 段）：
 * - 手动输入：host/username/remote_dir 等既有字段；
 * - 从已配置位置选择：仅携带 target_id（null = 「全部位置」聚合）。
 * 两形态二选一，由后端校验。
 */
export interface RestoreTargetPayload {
  target_id?: number | null
  host?: string
  port?: number
  username?: string
  auth_type?: DbBackupAuthType
  password?: string | null
  key_path?: string | null
  remote_dir?: string
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
  /** 从文件名解析的来源标识（唯一事实来源）；旧格式包为 null（界面显示 —） */
  source?: string | null
  /** 包内 meta 与文件名不一致（包被手工改名过） */
  source_renamed?: boolean
  /** 「全部位置」聚合视图：该包名存在的位置名称列表（按包名去重合并后标注） */
  locations?: string[] | null
}

export interface RestoreListResult {
  packages: RestorePackageItem[]
  /** 聚合视图下不可达的位置名称（降级标注，不阻断列表） */
  failed_locations?: string[] | null
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
