import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatMonthDayTime,
  formatDateOnly,
  formatPublishDateTime,
  formatFileSize,
  formatRelativeTime,
  formatEpochDateTime,
  formatDurationCompact,
  durationSeconds,
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

  describe('formatDurationCompact（紧凑耗时：45s / 3m20s / 1h05m）', () => {
    it('不足 1 分钟按秒', () => {
      expect(formatDurationCompact(0)).toBe('0s')
      expect(formatDurationCompact(45)).toBe('45s')
      expect(formatDurationCompact(59)).toBe('59s')
    })
    it('不足 1 小时按分秒', () => {
      expect(formatDurationCompact(60)).toBe('1m')
      expect(formatDurationCompact(200)).toBe('3m20s')
      expect(formatDurationCompact(605)).toBe('10m05s')
    })
    it('1 小时以上按时分', () => {
      expect(formatDurationCompact(3600)).toBe('1h')
      expect(formatDurationCompact(3900)).toBe('1h05m')
    })
    it('负值与非法值钳为 0 / 占位', () => {
      expect(formatDurationCompact(-3)).toBe('0s')
      expect(formatDurationCompact(null)).toBe('—')
      expect(formatDurationCompact(undefined)).toBe('—')
      expect(formatDurationCompact(Number.NaN)).toBe('—')
    })
  })

  describe('durationSeconds（两个后端时间戳的秒差）', () => {
    it('naive UTC 串相减得秒数（时区偏移在差值中抵消）', () => {
      expect(durationSeconds('2026-08-02T10:00:00', '2026-08-02T10:00:45')).toBe(45)
    })
    it('任意一端缺失返回 null（调用方渲染占位）', () => {
      expect(durationSeconds(null, '2026-08-02T10:00:45')).toBeNull()
      expect(durationSeconds('2026-08-02T10:00:00', null)).toBeNull()
      expect(durationSeconds(undefined, undefined)).toBeNull()
    })
    it('结束早于开始钳为 0（客户端/服务端时钟漂移）', () => {
      expect(durationSeconds('2026-08-02T10:00:45', '2026-08-02T10:00:00')).toBe(0)
    })
  })

  describe('formatEpochDateTime（epoch 秒 → Asia/Shanghai，metrics node-health last_seen_ts）', () => {
    it('epoch 1787309262（UTC 10:47:42）按 Asia/Shanghai 展示为 18:47:42', () => {
      expect(formatEpochDateTime(1787309262)).toBe('2026-08-21 18:47:42')
    })
    it('空值 / 非法值返回占位', () => {
      expect(formatEpochDateTime(null)).toBe('-')
      expect(formatEpochDateTime(undefined)).toBe('-')
      expect(formatEpochDateTime(Number.NaN)).toBe('-')
    })
  })
})
