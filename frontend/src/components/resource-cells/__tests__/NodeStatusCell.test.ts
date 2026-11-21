// NodeStatusCell：面板（双无圆点 .ps-tag）与页面（BadgeStatus 两行）两种既有形态。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeStatusCell from '../NodeStatusCell.vue'

describe('NodeStatusCell.vue · panel（最大化面板）', () => {
  it('已启用 + 在线：两枚 ps-tag，管理开关为 ps-pub', () => {
    const wrapper = mount(NodeStatusCell, {
      props: { variant: 'panel', enabled: true, runtime: 'running' },
    })
    const tags = wrapper.findAll('.ps-tag')
    expect(tags.map((t) => t.text())).toEqual(['已启用', '在线'])
    expect(tags[0].classes()).toContain('ps-pub')
    expect(tags[1].classes()).toContain('ps-pub')
    expect(tags[0].attributes('title')).toBe('管理开关：已启用')
    expect(tags[1].attributes('title')).toBe('运行态：在线（Edge 进程运行中）')
  })

  it('已禁用 + 离线：ps-unpub 管理态 + ps-partial 运行态，title 语义照抄面板', () => {
    const wrapper = mount(NodeStatusCell, {
      props: { variant: 'panel', enabled: false, runtime: 'stopped' },
    })
    const tags = wrapper.findAll('.ps-tag')
    expect(tags.map((t) => t.text())).toEqual(['已禁用', '离线'])
    expect(tags[0].classes()).toContain('ps-unpub')
    expect(tags[0].attributes('title')).toContain('管理开关已禁用')
    expect(tags[1].classes()).toContain('ps-partial')
    expect(tags[1].attributes('title')).toBe('运行态：离线（Edge 进程已停止）')
  })

  it('未检测运行态：第三枚降级为 ps-unpub「未检测」', () => {
    const wrapper = mount(NodeStatusCell, {
      props: { variant: 'panel', enabled: true, runtime: 'unknown' },
    })
    const tags = wrapper.findAll('.ps-tag')
    expect(tags.map((t) => t.text())).toEqual(['已启用', '未检测'])
    expect(tags[1].classes()).toContain('ps-unpub')
    expect(tags[1].attributes('title')).toBe('运行态：未检测')
  })

  it('execText 用 .status-exec-time 输出；缺省不渲染', () => {
    const withExec = mount(NodeStatusCell, {
      props: { variant: 'panel', runtime: 'running', execText: '3 分钟前检测' },
    })
    expect(withExec.find('.status-exec-time').text()).toBe('3 分钟前检测')
    expect(withExec.find('.status-exec-time').classes()).not.toContain('is-page')

    const withoutExec = mount(NodeStatusCell, { props: { variant: 'panel', runtime: 'running' } })
    expect(withoutExec.find('.status-exec-time').exists()).toBe(false)
  })
})

describe('NodeStatusCell.vue · page（节点独立页）', () => {
  it('运行中：单枚 BadgeStatus（badge-online + 圆点），无「已禁用」胶囊', () => {
    const wrapper = mount(NodeStatusCell, {
      props: { variant: 'page', enabled: true, runtime: 'running' },
    })
    expect(wrapper.find('.node-status-cell').classes()).toContain('is-page')
    expect(wrapper.findAll('.badge-status')).toHaveLength(1)
    expect(wrapper.find('.badge-online').text()).toBe('运行中')
    expect(wrapper.find('.status-dot').classes()).toContain('online')
    expect(wrapper.text()).not.toContain('已禁用')
    // 页面形态不渲染面板的无圆点胶囊
    expect(wrapper.findAll('.ps-tag')).toHaveLength(0)
  })

  it('已禁用 + 已停止：两枚 BadgeStatus（disabled 无圆点 / offline）', () => {
    const wrapper = mount(NodeStatusCell, {
      props: { variant: 'page', enabled: false, runtime: 'stopped' },
    })
    const badges = wrapper.findAll('.badge-status')
    expect(badges.map((b) => b.text())).toEqual(['已禁用', '已停止'])
    expect(wrapper.find('.badge-disabled').exists()).toBe(true)
    expect(wrapper.find('.badge-offline').exists()).toBe(true)
    // disabled 变体按 r5-③ 不渲染圆点
    expect(wrapper.findAll('.status-dot')).toHaveLength(1)
  })

  it('未检测：badge-neutral「未检测」', () => {
    const wrapper = mount(NodeStatusCell, {
      props: { variant: 'page', enabled: true, runtime: 'unknown' },
    })
    expect(wrapper.find('.badge-neutral').text()).toBe('未检测')
  })

  it('execText 在页面形态下为 .status-exec-time.is-page 且位于胶囊行之后', () => {
    const wrapper = mount(NodeStatusCell, {
      props: { variant: 'page', runtime: 'stopped', execText: '1 小时前检测' },
    })
    const exec = wrapper.find('.status-exec-time')
    expect(exec.classes()).toContain('is-page')
    expect(exec.text()).toBe('1 小时前检测')
    expect(wrapper.html().indexOf('status-exec-time')).toBeGreaterThan(wrapper.html().indexOf('badge-offline'))
  })
})
