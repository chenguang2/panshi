import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatMonthDayTime,
  formatDateOnly,
  formatPublishDateTime,
  formatFileSize,
  formatRelativeTime,
} from '../format'

describe('utils/format', () => {
  describe('formatDate（dash YYYY-MM-DD HH:mm）', () => {
    it('格式化为分钟精度 dash 格式', () => {
      expect(formatDate('2026-08-29T14:30:45')).toBe('2026-08-29 22:30')
    })
    it('空值返回 -', () => {
      expect(formatDate(null)).toBe('-')
      expect(formatDate(undefined)).toBe('-')
      expect(formatDate('')).toBe('-')
    })
  })

  describe('formatDateTime（slash YYYY/MM/DD HH:mm:ss）', () => {
    it('格式化为带秒斜杠格式', () => {
      expect(formatDateTime('2026-08-29T14:30:45')).toBe('2026/08/29 22:30:45')
    })
    it('无时区后缀的 UTC 串按 UTC 解析转东 8 区', () => {
      // 后端 datetime.utcnow().isoformat() 无 Z 后缀：02:00 UTC == 10:00 北京
      expect(formatDateTime('2026-08-02T02:00:00')).toBe('2026/08/02 10:00:00')
    })
    it('带 Z 后缀的 UTC 串按 UTC 解析转东 8 区', () => {
      expect(formatDateTime('2026-08-02T02:00:00Z')).toBe('2026/08/02 10:00:00')
    })
    it('尾部括号注记（备份包 meta 的 "(Asia/Shanghai)"）被剥掉后正常解析', () => {
      // 备份包 meta.json 的 created_local 历史格式带 " (Asia/Shanghai)" 后缀，非法 ISO；
      // 存量包已固化该格式，前端必须兼容（否则列表/校验详情显示 Invalid Date）
      expect(formatDateTime('2026-08-30T20:02:38.123456+08:00 (Asia/Shanghai)')).toBe('2026/08/30 20:02:38')
    })
    it('空值返回 -，非法值输出 Invalid Date（与历史行为一致）', () => {
      expect(formatDateTime(null)).toBe('-')
      expect(formatDateTime('not-a-date')).toBe('Invalid Date')
    })
  })

  describe('formatMonthDayTime（slash MM/DD HH:mm）', () => {
    it('格式化为无年份格式', () => {
      expect(formatMonthDayTime('2026-08-29T14:30:45')).toBe('08/29 22:30')
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

  // node-management-ux-batch2 2.1：相对时间单点（D3：负差值钳「刚刚」，更早回落日期）
  describe('formatRelativeTime', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    function atNow(offsetMs: number): string {
      // 后端真实形状：datetime.now(timezone.utc).isoformat()（带 +00:00 后缀）
      return new Date(Date.now() + offsetMs).toISOString().replace('Z', '+00:00')
    }

    it('空值返回空串（渲染侧据此不展示）', () => {
      expect(formatRelativeTime(null)).toBe('')
      expect(formatRelativeTime(undefined)).toBe('')
      expect(formatRelativeTime('')).toBe('')
    })

    it('<1 分钟 → 「刚刚」', () => {
      vi.setSystemTime(new Date('2026-10-12T08:00:00Z'))
      expect(formatRelativeTime(atNow(-30_000))).toBe('刚刚')
      expect(formatRelativeTime(atNow(0))).toBe('刚刚')
    })

    it('负差值（客户端时钟回拨/后端时钟漂移）钳为 0 → 「刚刚」', () => {
      vi.setSystemTime(new Date('2026-10-12T08:00:00Z'))
      expect(formatRelativeTime(atNow(5 * 60_000))).toBe('刚刚')
      expect(formatRelativeTime(atNow(2 * 3600_000))).toBe('刚刚')
    })

    it('N 分钟前', () => {
      vi.setSystemTime(new Date('2026-10-12T08:00:00Z'))
      expect(formatRelativeTime(atNow(-5 * 60_000))).toBe('5 分钟前')
      expect(formatRelativeTime(atNow(-59 * 60_000))).toBe('59 分钟前')
    })

    it('N 小时前', () => {
      vi.setSystemTime(new Date('2026-10-12T08:00:00Z'))
      expect(formatRelativeTime(atNow(-3 * 3600_000))).toBe('3 小时前')
      expect(formatRelativeTime(atNow(-23 * 3600_000))).toBe('23 小时前')
    })

    it('N 天前（<7 天）', () => {
      vi.setSystemTime(new Date('2026-10-12T08:00:00Z'))
      expect(formatRelativeTime(atNow(-2 * 24 * 3600_000))).toBe('2 天前')
      expect(formatRelativeTime(atNow(-6 * 24 * 3600_000))).toBe('6 天前')
    })

    it('更早（≥7 天）回落 formatDateOnly 日期', () => {
      vi.setSystemTime(new Date('2026-10-12T08:00:00Z'))
      expect(formatRelativeTime(atNow(-30 * 24 * 3600_000))).toBe('2026/09/12')
    })

    it('naive UTC 串（无时区后缀）按 UTC 解析', () => {
      vi.setSystemTime(new Date('2026-10-12T08:00:00Z'))
      // 2026-10-12T07:55:00 UTC == 5 分钟前
      expect(formatRelativeTime('2026-10-12T07:55:00')).toBe('5 分钟前')
    })
  })
})
