import { describe, it, expect } from 'vitest'
import { areTargetsVerified, summarizeTargetHealth, targetDot, targetWeightPercents } from '../upstreamTargets'

const T = [
  { target: '192.168.1.11:8000', weight: 80 },
  { target: '192.168.1.12:8000', weight: 60 },
  { target: '192.168.1.13:8000', weight: 40 },
]

describe('areTargetsVerified（方案 A：发布态近似）', () => {
  it('已发布 + 无待发布 + 上次发布无异常 → 全部健康', () => {
    expect(
      areTargetsVerified({ published_at: '2026-11-01T00:00:00Z', pending_publish: false, last_publish_status: null }),
    ).toBe(true)
  })
  it('未发布 → 待验证', () => {
    expect(areTargetsVerified({ published_at: null })).toBe(false)
  })
  it('有待发布变更 → 待验证', () => {
    expect(areTargetsVerified({ published_at: '2026-11-01T00:00:00Z', pending_publish: true })).toBe(false)
  })
  it('上次发布未完全生效 → 待验证', () => {
    expect(
      areTargetsVerified({
        published_at: '2026-11-01T00:00:00Z',
        pending_publish: false,
        last_publish_status: 'partial',
      }),
    ).toBe(false)
  })
  it('pending_publish 缺省（未接入四态）不影响判定', () => {
    expect(areTargetsVerified({ published_at: '2026-11-01T00:00:00Z' })).toBe(true)
  })
})

describe('targetWeightPercents', () => {
  it('逐目标独立四舍五入（与设计稿 80/60/40 → 44/33/22 同口径，合计允许非 100）', () => {
    expect(targetWeightPercents(T)).toEqual([44, 33, 22])
  })
  it('单目标 = 100%', () => {
    expect(targetWeightPercents([{ target: 'a', weight: 100 }])).toEqual([100])
  })
  it('等权两目标 = 50/50', () => {
    expect(
      targetWeightPercents([
        { target: 'a', weight: 50 },
        { target: 'b', weight: 50 },
      ]),
    ).toEqual([50, 50])
  })
  it('总权重为 0 → 全 0（不产生 NaN）', () => {
    expect(
      targetWeightPercents([
        { target: 'a', weight: 0 },
        { target: 'b', weight: 0 },
      ]),
    ).toEqual([0, 0])
  })
  it('负权重按 0 处理', () => {
    expect(
      targetWeightPercents([
        { target: 'a', weight: -5 },
        { target: 'b', weight: 100 },
      ]),
    ).toEqual([0, 100])
  })
  it('空列表 → 空数组', () => {
    expect(targetWeightPercents([])).toEqual([])
  })
})

describe('summarizeTargetHealth', () => {
  it('健康：total = 目标数、pending 0（文案走「全部健康」分支）', () => {
    expect(summarizeTargetHealth(T, true)).toEqual({ ok: true, total: 3, pending: 0 })
  })
  it('待验证：pending = 目标全量（无目标级健康数据，不能只标一部分）', () => {
    expect(summarizeTargetHealth(T, false)).toEqual({ ok: false, total: 3, pending: 3 })
  })
})

describe('targetDot', () => {
  it('健康 → d-ok 且 title 说明「按发布态近似」', () => {
    const d = targetDot(true)
    expect(d.cls).toBe('d-ok')
    expect(d.title).toContain('按发布态近似')
  })
  it('待验证 → d-warn 且 title 列出三种原因', () => {
    const d = targetDot(false)
    expect(d.cls).toBe('d-warn')
    expect(d.title).toContain('未发布')
    expect(d.title).toContain('待发布')
    expect(d.title).toContain('未生效')
  })
})
