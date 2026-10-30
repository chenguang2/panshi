/**
 * utils/tools/time.ts 单测 — 时间戳转换（tools-new-utilities）。
 * 时区语义（平台约定 AGENTS #26）：无后缀字符串按 UTC 解析；展示北京时间为主。
 */
import { describe, it, expect } from 'vitest'
import { parseTimeInput, epochToBeijing, fmtBeijing } from '@/utils/tools/time'

describe('parseTimeInput', () => {
  it('10 位数字按 epoch 秒解析', () => {
    const r = parseTimeInput('1793331059')
    expect(r.error).toBeUndefined()
    expect(r.epochMs).toBe(1793331059000)
  })

  it('13 位数字按 epoch 毫秒解析', () => {
    const r = parseTimeInput('1793331059000')
    expect(r.error).toBeUndefined()
    expect(r.epochMs).toBe(1793331059000)
  })

  it('无时区后缀字符串按 UTC 解析（平台存储约定）', () => {
    const r = parseTimeInput('2026-10-30 08:00:00')
    expect(r.error).toBeUndefined()
    expect(r.epochMs).toBe(Date.UTC(2026, 9, 30, 8, 0, 0))
  })

  it('ISO T 分隔同样按 UTC', () => {
    const r = parseTimeInput('2026-10-30T08:00:00')
    expect(r.epochMs).toBe(Date.UTC(2026, 9, 30, 8, 0, 0))
  })

  it('带 +08:00 后缀按其时区解析（与无后缀区分）', () => {
    const r = parseTimeInput('2026-10-30T16:00:00+08:00')
    expect(r.epochMs).toBe(Date.UTC(2026, 9, 30, 8, 0, 0))
  })

  it('带 Z 后缀按 UTC', () => {
    const r = parseTimeInput('2026-10-30T08:00:00Z')
    expect(r.epochMs).toBe(Date.UTC(2026, 9, 30, 8, 0, 0))
  })

  it('非法输入返回中文错误', () => {
    expect(parseTimeInput('hello').error).toContain('无法识别的时间格式')
    expect(parseTimeInput('').error).toContain('请输入')
    expect(parseTimeInput('12345').error).toContain('无法识别') // 非 10/13 位
  })

  it('带毫秒小数的 isoformat（后端形态 2026-07-22T00:50:15.983075）', () => {
    const r = parseTimeInput('2026-07-22T00:50:15.983075')
    expect(r.error).toBeUndefined()
    expect(r.epochMs).toBe(Date.UTC(2026, 6, 22, 0, 50, 15, 983))
  })
})

describe('epochToBeijing / fmtBeijing', () => {
  it('epoch → 北京时间字符串（UTC+8）', () => {
    // 2026-10-30T08:00:00Z = 北京 16:00
    expect(epochToBeijing(Date.UTC(2026, 9, 30, 8, 0, 0))).toBe('2026-10-30 16:00:00')
  })

  it('fmtBeijing 对 Date.UTC 构造一致', () => {
    expect(fmtBeijing(new Date(Date.UTC(2026, 0, 1, 0, 30, 0)))).toBe('2026-01-01 08:30:00')
  })
})
