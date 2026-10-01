import api from '@/api/index'
import type {
  DbBackupConfigResponse,
  DbBackupConfigUpdate,
  DbBackupHistoryPage,
  DbBackupRunResult,
  DbBackupTarget,
  DbBackupTargetCreate,
  DbBackupTargetTestPayload,
  DbBackupTargetUpdate,
  DbBackupTestResult,
  RestoreExecutePayload,
  RestoreExecuteResult,
  RestoreListResult,
  RestoreTargetPayload,
  RestoreVerifyPayload,
  RestoreVerifyResult,
} from '@/types/dbBackup'

/** 立即备份为同步长请求（快照 + 打包 + 多位置 SSH 串行推送），覆盖全局 30s 超时 */
const BACKUP_RUN_TIMEOUT = 120_000
/** 校验需先下载完整备份包再算 SHA256 / integrity，覆盖全局 30s 超时 */
const RESTORE_VERIFY_TIMEOUT = 300_000

/** 列包耗时随 位置数 × 包数 增长（逐包 SSH 取 meta 摘要），聚合模式实测可达 1 分钟+，须覆盖全局 30s（约定 #29） */
const RESTORE_LIST_TIMEOUT = 180_000

/**
 * 恢复执行（本地落位 + 引擎重载，无下载；正常秒级到数十秒）。
 * 600s = 2 × 暂存 TTL（STAGE_TTL_SECONDS=600）保守上限；超时后前端按「后端可能仍在执行」文案防重复发起（H3）。
 */
const RESTORE_EXECUTE_TIMEOUT = 600_000

/** 读取备份配置（全局字段 + 位置列表）与派生状态（适用性 / 下次预计 / 进行中标记） */
export function getDbBackupConfig() {
  return api.get<DbBackupConfigResponse>('/db-backup/config')
}

/** 保存全局配置（仅全局字段；位置 CRUD 走独立端点） */
export function updateDbBackupConfig(data: DbBackupConfigUpdate) {
  return api.put<DbBackupConfigResponse>('/db-backup/config', data)
}

/** 新增备份位置（name 全库唯一校验；密码留空 = 不设置） */
export function createDbBackupTarget(data: DbBackupTargetCreate) {
  return api.post<DbBackupTarget>('/db-backup/targets', data)
}

/** 更新备份位置（全量更新；密码留空 = 不修改须省略该键） */
export function updateDbBackupTarget(id: number, data: DbBackupTargetUpdate) {
  return api.put<DbBackupTarget>(`/db-backup/targets/${id}`, data)
}

/** 删除备份位置（不清理其远端目录——包搁浅语义，确认文案已标注） */
export function deleteDbBackupTarget(id: number) {
  return api.delete<void>(`/db-backup/targets/${id}`)
}

/** 按载荷目标参数测试连通性（可先于保存） */
export function testDbBackupTarget(data: DbBackupTargetTestPayload) {
  return api.post<DbBackupTestResult>('/db-backup/targets/test', data)
}

/** 立即备份（不要求 enabled，但要求至少一个启用位置；进行中返回 409） */
export function runDbBackupNow() {
  return api.post<DbBackupRunResult>('/db-backup/run', {}, { timeout: BACKUP_RUN_TIMEOUT })
}

/** 分页读取备份历史（服务端分页；记录含三态状态与位置子结果） */
export function getDbBackupHistory(page: number, pageSize: number) {
  return api.get<DbBackupHistoryPage>('/db-backup/history', {
    params: { page, page_size: pageSize },
  })
}

/**
 * 恢复向导步骤 1：列备份包。
 * - 载荷仅 target_id（null）= 「全部位置」聚合（按包名去重合并，不可达位置降级标注）
 * - target_id 非空 = 指定位置列包
 * - 手输参数组 = 临时远端目标（换机场景）
 */
export function listRestorePackages(data: RestoreTargetPayload) {
  return api.post<RestoreListResult>('/db-backup/restore/list', data, {
    timeout: RESTORE_LIST_TIMEOUT,
  })
}

/** 恢复向导步骤 2：下载 + SHA256 + 完整性校验并暂存（verify_id 供执行复用） */
export function verifyRestorePackage(data: RestoreVerifyPayload) {
  return api.post<RestoreVerifyResult>('/db-backup/restore/verify', data, {
    timeout: RESTORE_VERIFY_TIMEOUT,
  })
}

/** 恢复向导步骤 3：高危确认后落位激活（confirmed 必须为 true）；显式长超时防大库恢复被全局 30s 误断（H3） */
export function executeDbRestore(data: RestoreExecutePayload) {
  return api.post<RestoreExecuteResult>('/db-backup/restore/execute', data, {
    timeout: RESTORE_EXECUTE_TIMEOUT,
  })
}
