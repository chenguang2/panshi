import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatMonthDayTime,
  formatDateOnly,
  formatPublishDateTime,
  formatFileSize,
} from '../format'

describe('utils/format', () => {
  describe('formatDate（dash YYYY-MM-DD HH:mm）', () => {
    it('格式化为分钟精度 dash 格式', () => {
      expect(formatDate('2026-08-29T14:30:45')).toBe('2026-08-29 14:30')
    })
    it('空值返回 -', () => {
      expect(formatDate(null)).toBe('-')
      expect(formatDate(undefined)).toBe('-')
      expect(formatDate('')).toBe('-')
    })
  })

  describe('formatDateTime（slash YYYY/MM/DD HH:mm:ss）', () => {
    it('格式化为带秒斜杠格式', () => {
      expect(formatDateTime('2026-08-29T14:30:45')).toBe('2026/08/29 14:30:45')
    })
    it('空值返回 -，非法值输出 Invalid Date（与历史行为一致）', () => {
      expect(formatDateTime(null)).toBe('-')
      expect(formatDateTime('not-a-date')).toBe('Invalid Date')
    })
  })

  describe('formatMonthDayTime（slash MM/DD HH:mm）', () => {
    it('格式化为无年份格式', () => {
      expect(formatMonthDayTime('2026-08-29T14:30:45')).toBe('08/29 14:30')
    })
    it('空值返回 -', () => {
      expect(formatMonthDayTime(null)).toBe('-')
    })
  })

  describe('formatDateOnly（slash YYYY/MM/DD）', () => {
    it('格式化为日期', () => {
      expect(formatDateOnly('2026-08-29T14:30:45')).toBe('2026/08/29')
    })
    it('空值返回 -', () => {
      expect(formatDateOnly(null)).toBe('-')
    })
  })

  describe('formatPublishDateTime（Asia/Shanghai）', () => {
    it('空值返回空串', () => {
      expect(formatPublishDateTime(null)).toBe('')
    })
    it('UTC 时间按上海时区展示', () => {
      // 2026-05-14T02:30:00Z == 2026-05-14 10:30:00 +08:00
      const out = formatPublishDateTime('2026-05-14T02:30:00Z')
      expect(out).toContain('2026/05/14')
      expect(out).toContain('10:30:00')
    })
  })

  describe('formatFileSize', () => {
    it('B / KB / MB 分级', () => {
      expect(formatFileSize(512)).toBe('512 B')
      expect(formatFileSize(2048)).toBe('2.0 KB')
      expect(formatFileSize(52428800)).toBe('50.0 MB')
    })
  })
})