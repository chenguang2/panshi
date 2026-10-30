/**
 * 时间戳转换（tools-new-utilities）。
 *
 * 时区语义显式（AGENTS #26 平台约定）：
 *   - 无时区后缀的日期字符串按 **UTC** 解析（后端 isoformat 存储形态）
 *   - 带 Z / ±hh:mm 后缀按其自身时区解析
 *   - 展示以北京时间（Asia/Shanghai）为主，UTC/epoch 全量对照
 */

const BEIJING_TZ = 'Asia/Shanghai'

export interface TimeParseResult {
  error?: string
  /** 毫秒 epoch（内部统一精度） */
  epochMs?: number
  /** 秒级（展示用） */
  epochSec?: number
  /** 北京时间 YYYY-MM-DD HH:mm:ss */
  beijing?: string
  /** UTC YYYY-MM-DD HH:mm:ss */
  utc?: string
  /** ISO 8601（UTC，Z 后缀） */
  iso?: string
  /** 输入识别形态说明 */
  detected?: string
}

/** 任意时区 Date → 指定时区 YYYY-MM-DD HH:mm:ss（经 en-US 部件格式化，避免 locale 差异） */
function fmtInZone(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}:${get('second')}`
}

export function epochToBeijing(epochMs: number): string {
  return fmtInZone(new Date(epochMs), BEIJING_TZ)
}

export function fmtBeijing(d: Date): string {
  return fmtInZone(d, BEIJING_TZ)
}

function fmtUtc(d: Date): string {
  return fmtInZone(d, 'UTC')
}

export function parseTimeInput(raw: string): TimeParseResult {
  const input = raw.trim()
  if (!input) {
    return { error: '请输入时间戳或日期时间字符串' }
  }

  let epochMs: number | undefined
  let detected: string

  // 1) 纯数字：10 位=秒，13 位=毫秒；其余位数拒绝（避免歧义）
  if (/^\d+$/.test(input)) {
    if (input.length === 10) {
      epochMs = Number(input) * 1000
      detected = 'epoch 秒（10 位）'
    } else if (input.length === 13) {
      epochMs = Number(input)
      detected = 'epoch 毫秒（13 位）'
    } else {
      return { error: '无法识别的时间格式：数字时间戳应为 10 位（秒）或 13 位（毫秒）' }
    }
  } else {
    // 2) 日期时间字符串
    const m = input.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?\d*)?(Z|[+-]\d{2}:?\d{2})?$/,
    )
    if (m) {
      const [, y, mo, d, h, mi, s = '0', msStr = '0', tz] = m
      if (tz) {
        // 有后缀：交给 Date 原生解析（ISO 带时区语义跨引擎一致）
        epochMs = new Date(input.replace(' ', 'T')).getTime()
        detected = tz === 'Z' ? 'ISO 字符串（UTC，Z 后缀）' : `ISO 字符串（时区 ${tz}）`
      } else {
        // 无后缀：按 UTC 构造（平台存储约定）
        epochMs = Date.UTC(
          Number(y),
          Number(mo) - 1,
          Number(d),
          Number(h),
          Number(mi),
          Number(s),
          Number(msStr.padEnd(3, '0')),
        )
        detected = 'ISO 字符串（无时区后缀 → 按 UTC 解析，平台存储约定）'
      }
    } else {
      // 3) 原生兜底（Date 可解析的其他形态）
      const d = new Date(input)
      if (!Number.isNaN(d.getTime())) {
        epochMs = d.getTime()
        detected = '浏览器日期解析'
      } else {
        return { error: '无法识别的时间格式：支持 epoch（10/13 位数字）或 YYYY-MM-DD HH:mm:ss（无后缀按 UTC）' }
      }
    }
  }

  if (epochMs === undefined || Number.isNaN(epochMs)) {
    return { error: '无法识别的时间格式' }
  }

  const d = new Date(epochMs)
  return {
    epochMs,
    epochSec: Math.floor(epochMs / 1000),
    beijing: fmtInZone(d, BEIJING_TZ),
    utc: fmtUtc(d),
    iso: d.toISOString(),
    detected,
  }
}
