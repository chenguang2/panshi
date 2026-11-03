import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LatencyBucketDistribution from '../LatencyBucketDistribution.vue'
import type { FastRatioBucketStats } from '@/api/metrics'

const stats = (over: Partial<FastRatioBucketStats> = {}): FastRatioBucketStats => ({
  bounds: [10, 20, 50, 100],
  ratios: [99.5, 0.4, 0.1, 0, 0],
  counts: [995, 4, 1, 0, 0],
  total: 1000,
  ...over,
})

const stubs = {
  'a-tooltip': {
    template: '<span class="a-tooltip-stub" :title="title"><slot /></span>',
    props: ['title'],
  },
}

const mountStrip = (s: FastRatioBucketStats | null) =>
  mount(LatencyBucketDistribution, { props: { stats: s }, global: { stubs } })

describe('LatencyBucketDistribution.vue 耗时区间分布（metrics-fast-ratio-card D9/D10）', () => {
  it('渲染块标题与全部桶 chip（含溢出桶），主值为占比两位小数', () => {
    const w = mountStrip(stats())
    expect(w.find('.bucket-strip').exists()).toBe(true)
    expect(w.text()).toContain('耗时区间分布')
    const chips = w.findAll('.bucket-chip')
    // 4 个边界 → 5 桶（含溢出桶 >100ms）
    expect(chips).toHaveLength(5)
    expect(chips[0].text()).toContain('≤10ms')
    expect(chips[1].text()).toContain('10–20ms')
    expect(chips[2].text()).toContain('20–50ms')
    expect(chips[3].text()).toContain('50–100ms')
    expect(chips[4].text()).toContain('>100ms')
    expect(chips[0].text()).toContain('99.50%')
    expect(chips[1].text()).toContain('0.40%')
  })

  it('chip 悬停显示计数（a-tooltip title），口径提示说明左开右闭与窗口总量', () => {
    const w = mountStrip(stats())
    const tips = w.findAll('.a-tooltip-stub').map((t) => t.attributes('title'))
    expect(tips).toContain('10–20ms：4 次（0.40%）')
    const info = tips.find((t) => t?.includes('左开右闭'))
    expect(info).toBeDefined()
    expect(info).toContain('窗口内共 1000 次请求')
    expect(info).toContain('10 < 耗时 ≤ 20 ms')
  })

  it('零计数桶置灰仍渲染（0.00%，无条件渲染保持行数稳定）', () => {
    const w = mountStrip(stats())
    const chips = w.findAll('.bucket-chip')
    expect(chips[3].classes()).toContain('dimmed')
    expect(chips[3].text()).toContain('0.00%')
    expect(chips[0].classes()).not.toContain('dimmed')
  })

  it('边界为小数时自然去尾零（0.5ms）', () => {
    const w = mountStrip(
      stats({ bounds: [0.5, 10, 20], ratios: [98, 1.5, 0.5, 0], counts: [980, 15, 5, 0], total: 1000 }),
    )
    const labels = w.findAll('.bucket-chip .bucket-label').map((l) => l.text())
    expect(labels).toEqual(['≤0.5ms', '0.5–10ms', '10–20ms', '>20ms'])
  })

  it('stats 为 null（窗口无请求）→ 整块不渲染', () => {
    const w = mountStrip(null)
    expect(w.find('.bucket-strip').exists()).toBe(false)
  })
})
