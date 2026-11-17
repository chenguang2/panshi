import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageStatBadges from '../PageStatBadges.vue'

describe('PageStatBadges.vue', () => {
  it('items 为空时不渲染任何 DOM', () => {
    const wrapper = mount(PageStatBadges, { props: { items: [] } })
    expect(wrapper.html()).toBe('<!--v-if-->')
    expect(wrapper.findAll('[data-test="page-stat"]')).toHaveLength(0)
  })

  it('首项带 ph-lite lite-accent（主统计）', () => {
    const wrapper = mount(PageStatBadges, {
      props: {
        items: [
          { value: 12, label: '节点' },
          { value: 9, label: '运行中', tone: 'ok' },
        ],
      },
    })
    const items = wrapper.findAll('[data-test="page-stat"]')
    expect(items).toHaveLength(2)
    expect(items[0].classes()).toContain('ph-lite')
    expect(items[0].classes()).toContain('lite-accent')
    expect(items[1].classes()).not.toContain('lite-accent')
  })

  it('tone 落到对应类名（ok/warn/bad）', () => {
    const wrapper = mount(PageStatBadges, {
      props: {
        items: [
          { value: 12, label: '节点' },
          { value: 9, label: '运行中', tone: 'ok' },
          { value: 2, label: '未检测', tone: 'warn' },
          { value: 1, label: '异常', tone: 'bad' },
        ],
      },
    })
    const items = wrapper.findAll('[data-test="page-stat"]')
    expect(items[1].classes()).toContain('lite-ok')
    expect(items[2].classes()).toContain('lite-warn')
    expect(items[3].classes()).toContain('lite-bad')
  })

  it('无 tone 的后续项不带色调类', () => {
    const wrapper = mount(PageStatBadges, {
      props: {
        items: [
          { value: 12, label: '节点' },
          { value: 3, label: '已禁用' },
        ],
      },
    })
    expect(wrapper.findAll('[data-test="page-stat"]')[1].attributes('class')).toBe('ph-lite')
  })

  it('文案 = value + label', () => {
    const wrapper = mount(PageStatBadges, {
      props: {
        items: [
          { value: 31, label: '路由' },
          { value: 'v9', label: '最新版本' },
        ],
      },
    })
    const items = wrapper.findAll('[data-test="page-stat"]')
    expect(items[0].text()).toBe('31 路由')
    expect(items[1].text()).toBe('v9 最新版本')
  })
})
