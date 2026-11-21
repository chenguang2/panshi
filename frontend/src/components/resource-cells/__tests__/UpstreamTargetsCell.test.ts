// UpstreamTargetsCell：compact（面板前 2 + N）与 detailed（页面逐个 chip + 健康摘要）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UpstreamTargetsCell from '../UpstreamTargetsCell.vue'

const targets = [
  { target: '192.168.0.11:8080', weight: 100 },
  { target: '192.168.0.12:8080', weight: 50 },
  { target: '192.168.0.13:8080', weight: 50 },
]

describe('UpstreamTargetsCell.vue · compact（面板）', () => {
  it('前 2 个 chip + `+N` 折叠，带权重括号', () => {
    const wrapper = mount(UpstreamTargetsCell, { props: { targets } })
    const tags = wrapper.findAll('.target-tag')
    expect(tags).toHaveLength(2)
    expect(tags[0].text()).toContain('192.168.0.11:8080')
    expect(tags[0].find('.weight').text()).toBe('(100)')
    expect(wrapper.find('.target-more').text()).toBe('+1')
  })

  it('目标数 ≤ 2 时不出现 +N', () => {
    const wrapper = mount(UpstreamTargetsCell, { props: { targets: targets.slice(0, 2) } })
    expect(wrapper.findAll('.target-tag')).toHaveLength(2)
    expect(wrapper.find('.target-more').exists()).toBe(false)
  })

  it('空目标输出 .target-empty 的「—」', () => {
    const wrapper = mount(UpstreamTargetsCell, { props: { targets: [] } })
    expect(wrapper.find('.target-empty').text()).toBe('—')
    expect(wrapper.findAll('.target-tag')).toHaveLength(0)
  })
})

describe('UpstreamTargetsCell.vue · detailed（独立列表页）', () => {
  it('逐个 chip 全量呈现，不带折叠计数', () => {
    const wrapper = mount(UpstreamTargetsCell, { props: { targets, variant: 'detailed' } })
    const chips = wrapper.findAll('.tg-chip')
    expect(chips).toHaveLength(3)
    expect(chips[0].find('.tg-w').text()).toBe('100')
    expect(wrapper.find('.target-more').exists()).toBe(false)
  })

  it('健康摘要：全部健康 → 「N 目标 · 全部健康」', () => {
    const wrapper = mount(UpstreamTargetsCell, {
      props: { targets, variant: 'detailed', health: { allHealthy: true, pendingCount: 0 } },
    })
    const sum = wrapper.find('.tg-sum')
    expect(sum.text().replace(/\s+/g, ' ')).toBe('3 目标 · 全部健康')
    expect(wrapper.find('.tg-sum-pending').exists()).toBe(false)
  })

  it('健康摘要：待验证 → warning 分支「N 项待验证」', () => {
    const wrapper = mount(UpstreamTargetsCell, {
      props: { targets, variant: 'detailed', health: { allHealthy: false, pendingCount: 2 } },
    })
    const pending = wrapper.find('.tg-sum-pending')
    expect(pending.text().replace(/\s+/g, ' ')).toBe('2 项待验证')
    expect(wrapper.find('.tg-sum').text()).not.toContain('全部健康')
  })

  it('无 health 时不渲染摘要；healthTitle 透传到摘要 title', () => {
    const noHealth = mount(UpstreamTargetsCell, { props: { targets, variant: 'detailed' } })
    expect(noHealth.find('.tg-sum').exists()).toBe(false)

    const withTitle = mount(UpstreamTargetsCell, {
      props: {
        targets,
        variant: 'detailed',
        health: { allHealthy: true, pendingCount: 0 },
        healthTitle: '全部目标已发布且无待发布变更',
      },
    })
    expect(withTitle.find('.tg-sum').attributes('title')).toBe('全部目标已发布且无待发布变更')
  })

  it('空目标输出 .target-empty 的「—」', () => {
    const wrapper = mount(UpstreamTargetsCell, { props: { targets: [], variant: 'detailed' } })
    expect(wrapper.find('.target-empty').text()).toBe('—')
  })
})
