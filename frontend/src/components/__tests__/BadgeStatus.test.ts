import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BadgeStatus from '../BadgeStatus.vue'

describe('BadgeStatus.vue', () => {
  it('renders text', () => {
    const wrapper = mount(BadgeStatus, {
      props: { text: '在线', status: 'online' },
    })
    expect(wrapper.text()).toContain('在线')
  })

  it('has correct status class', () => {
    const wrapper = mount(BadgeStatus, {
      props: { text: '离线', status: 'offline' },
    })
    expect(wrapper.find('.status-dot').classes()).toContain('offline')
  })
})

describe('BadgeStatus.vue · 管理开关态（r5-③）', () => {
  it('disabled 变体：badge-disabled 类、无圆点、透传 title', () => {
    const wrapper = mount(BadgeStatus, {
      props: {
        text: '已禁用',
        status: 'disabled',
        title: '管理开关已禁用：不承载业务流量，仍可执行节点任务与状态查询',
      },
    })
    expect(wrapper.classes()).toContain('badge-disabled')
    expect(wrapper.classes()).not.toContain('badge-neutral')
    expect(wrapper.find('.status-dot').exists()).toBe(false)
    expect(wrapper.attributes('title')).toContain('管理开关已禁用')
  })

  it('非 disabled 状态仍渲染圆点，且无 title 属性', () => {
    const wrapper = mount(BadgeStatus, { props: { text: '运行中', status: 'online' } })
    expect(wrapper.find('.status-dot').exists()).toBe(true)
    expect(wrapper.attributes('title')).toBeUndefined()
  })
})
