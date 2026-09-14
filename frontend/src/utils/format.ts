/**
 * 日期/文件大小格式化工具。
 *
 * Phase 1 收敛：替代散落在 12+ 视图中的本地 formatDate 实现与
 * useClusterUtils 中的 formatDate / formatPublishDateTime 导出，
 * 以及 useClusterStaticResources 的 formatFileSize。
 * 各函数与迁移前的历史输出保持同语义（统一 2 位零填充）。
 */

/**
 * 后端时间解析：所有模型时间列均为 datetime.utcnow()（naive UTC），
 * isoformat() 输出无时区后缀（如 2026-09-14T08:00:00）。
 * 无后缀视为 UTC；带 Z / ±hh:mm 后缀的原样解析。
 */
export function parseBackendDate(s: string): Date {
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? new Date(s) : new Date(s + 'Z')
}

/** dash 格式 `YYYY-MM-DD HH:mm`（分钟精度，Asia/Shanghai 时区）。历史 useClusterUtils.formatDate 同语义。 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    const d = parseBackendDate(dateStr)
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
  } catch {
    return dateStr
  }
}

/** dash 格式 `YYYY-MM-DD HH:mm:ss`（含秒，Asia/Shanghai 时区）。审计日志等需要秒级 dash 时间戳的场景。 */
export function formatDateTimeDash(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    const d = parseBackendDate(dateStr)
    // 显式指定 Asia/Shanghai 时区，避免浏览器/OS 时区差异
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
  } catch {
    return dateStr
  }
}

/** 斜杠格式 `YYYY/MM/DD HH:mm:ss`（含秒，zh-CN 2 位零填充，Asia/Shanghai 时区）。 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return parseBackendDate(dateStr).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
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

/** 斜杠格式 `MM/DD HH:mm`（无年份，zh-CN 2 位零填充，Asia/Shanghai 时区）。 */
export function formatMonthDayTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return parseBackendDate(dateStr).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
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
    return parseBackendDate(dateStr).toLocaleDateString('zh-CN', {
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
    return parseBackendDate(isoStr).toLocaleString('zh-CN', {
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

/** 人类可读文件大小（B / KB / MB / GB）。历史 useClusterStaticResources.formatFileSize 同语义。 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}
