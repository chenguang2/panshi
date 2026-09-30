import api from '@/api/index'
import type {
  DbBackupConfigResponse,
  DbBackupConfigUpdate,
  DbBackupHistoryPage,
  DbBackupRunResult,
  DbBackupTestPayload,
  DbBackupTestResult,
  RestoreExecutePayload,
  RestoreExecuteResult,
  RestoreListResult,
  RestoreTargetPayload,
  RestoreVerifyPayload,
  RestoreVerifyResult,
} from '@/types/dbBackup'

/** 立即备份为同步长请求（快照 + 打包 + SSH 推送），覆盖全局 30s 超时 */
const BACKUP_RUN_TIMEOUT = 120_000
/** 校验需先下载完整备份包再算 SHA256 / integrity，覆盖全局 30s 超时 */
const RESTORE_VERIFY_TIMEOUT = 300_000

/** 读取备份配置与派生状态（适用性 / 下次预计 / 进行中标记） */
export function getDbBackupConfig() {
  return api.get<DbBackupConfigResponse>('/db-backup/config')
}

/**
 * 保存备份配置（后端为全量覆盖语义，payload 须携带全部字段）。
 * password 仅在设置/修改时携带，「留空不修改」须省略该键。
 */
export function updateDbBackupConfig(data: DbBackupConfigUpdate) {
  return api.put<DbBackupConfigResponse>('/db-backup/config', data)
}

/** 立即备份（不要求 enabled，但要求配置完整；进行中返回 409） */
export function runDbBackupNow() {
  return api.post<DbBackupRunResult>('/db-backup/run', {}, { timeout: BACKUP_RUN_TIMEOUT })
}

/** 分页读取备份历史（服务端分页） */
export function getDbBackupHistory(page: number, pageSize: number) {
  return api.get<DbBackupHistoryPage>('/db-backup/history', {
    params: { page, page_size: pageSize },
  })
}

/** 测试远端目标连通性（表单未填字段留空，后端回退已保存配置） */
export function testDbBackupTarget(data: DbBackupTestPayload) {
  return api.post<DbBackupTestResult>('/db-backup/test', data)
}

/** 恢复向导步骤 1：临时目标 → 远端备份包列表（含元数据摘要） */
export function listRestorePackages(data: RestoreTargetPayload) {
  return api.post<RestoreListResult>('/db-backup/restore/list', data)
}

/** 恢复向导步骤 2：下载 + SHA256 + 完整性校验并暂存（verify_id 供执行复用） */
export function verifyRestorePackage(data: RestoreVerifyPayload) {
  return api.post<RestoreVerifyResult>('/db-backup/restore/verify', data, {
    timeout: RESTORE_VERIFY_TIMEOUT,
  })
}

/** 恢复向导步骤 3：高危确认后落位激活（confirmed 必须为 true） */
export function executeDbRestore(data: RestoreExecutePayload) {
  return api.post<RestoreExecuteResult>('/db-backup/restore/execute', data)
}
