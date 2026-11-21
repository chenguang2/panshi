import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from '../EmptyState.vue'
import StrokeIcon from '../StrokeIcon.vue'

/**
 * 空态单点（central-management-parity 批次 C）。
 * 解剖 = 设计原语 .empty5（52px 虚线圆图标 → 标题 → 说明 → 动作区），
 * 权重/尺寸由 src/style.css 的 .empty5 承担（样式单点），此处钉结构与条件渲染。
 */
describe('EmptyState（全站空态单点）', () => {
  it('渲染 title / description / 插槽动作，解剖顺序为 图标 → 标题 → 说明 → 动作', () => {
    const w = mount(EmptyState, {
      props: { title: '暂无路由', description: '添加第一条路由，将流量按规则转发到上游' },
      slots: { default: '<button class="act">添加路由</button>' },
    })

    expect(w.classes()).toContain('empty5')
    const parts = w.element.children
    expect(parts[0].classList.contains('e-icon')).toBe(true)
    expect(parts[1].classList.contains('e-title')).toBe(true)
    expect(parts[2].classList.contains('e-sub')).toBe(true)
    expect(parts[3].classList.contains('e-actions')).toBe(true)

    expect(w.find('.e-title').text()).toBe('暂无路由')
    expect(w.find('.e-sub').text()).toBe('添加第一条路由，将流量按规则转发到上游')
    expect(w.find('.e-actions button.act').text()).toBe('添加路由')
  })

  it('无 description 时不渲染 .e-sub（不留空边距节点）', () => {
    const w = mount(EmptyState, { props: { title: '未找到可配置的插件' } })
    expect(w.find('.e-sub').exists()).toBe(false)
    expect(w.find('.e-title').text()).toBe('未找到可配置的插件')
  })

  it('无默认插槽时不渲染 .e-actions', () => {
    const w = mount(EmptyState, { props: { title: '暂无插件元数据', description: '先去左侧添加' } })
    expect(w.find('.e-actions').exists()).toBe(false)
  })

  it('插槽只有注释/空白时同样不渲染 .e-actions（Vue 会在 <template> 里跳过评论区的作用）', () => {
    const w = mount(EmptyState, {
      props: { title: '暂无数据' },
      slots: { default: '   ' },
    })
    expect(w.find('.e-actions').exists()).toBe(false)
  })

  it('图标默认 inbox，可通过 icon 覆盖（透传 StrokeIcon 的 name）', () => {
    const def = mount(EmptyState, { props: { title: '暂无数据' } })
    expect(def.findComponent(StrokeIcon).props('name')).toBe('inbox')
    expect(def.find('.e-icon svg polyline').attributes('points')).toBe('22 12 16 12 14 15 10 15 8 12 2 12')

    const custom = mount(EmptyState, { props: { title: '暂无数据', icon: 'trash' } })
    expect(custom.findComponent(StrokeIcon).props('name')).toBe('trash')
  })

  it('图标尺寸 20（52px 虚线圆内居中）', () => {
    const w = mount(EmptyState, { props: { title: '暂无数据' } })
    expect(w.findComponent(StrokeIcon).props('size')).toBe(20)
    expect(w.find('.e-icon svg').attributes('width')).toBe('20')
  })
})
