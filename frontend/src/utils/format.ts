/**
 * 日期/文件大小格式化工具。
 *
 * Phase 1 收敛：替代散落在 12+ 视图中的本地 formatDate 实现与
 * useClusterUtils 中的 formatDate / formatPublishDateTime 导出，
 * 以及 useClusterStaticResources 的 formatFileSize。
 * 各函数与迁移前的历史输出保持同语义（统一 2 位零填充）。
 */

/** dash 格式 `YYYY-MM-DD HH:mm`（分钟精度）。历史 useClusterUtils.formatDate 同语义。 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 斜杠格式 `YYYY/MM/DD HH:mm:ss`（含秒，zh-CN 2 位零填充）。 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/** 斜杠格式 `MM/DD HH:mm`（无年份，zh-CN 2 位零填充）。 */
export function formatMonthDayTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/** 斜杠日期 `YYYY/MM/DD`（仅日期，2 位零填充）。 */
export function formatDateOnly(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/** 完整发布时间（Asia/Shanghai 时区，含秒）。历史 formatPublishDateTime 同语义。 */
export function formatPublishDateTime(isoStr: string | null): string {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return isoStr || ''
  }
}

/** 人类可读文件大小（B / KB / MB）。历史 useClusterStaticResources.formatFileSize 同语义。 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}