import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TaskStatusTag from '../TaskStatusTag.vue'

/** 全站唯一状态呈现（node-task-ux-optimization D6） */
function mountTag(props: Record<string, unknown>) {
  return mount(TaskStatusTag, { props })
}

const CASES = [
  { status: 'pending', label: '待执行', cls: 'status-pending' },
  { status: 'running', label: '执行中', cls: 'status-running' },
  { status: 'success', label: '成功', cls: 'status-success' },
  { status: 'partial', label: '部分成功', cls: 'status-partial' },
  { status: 'failed', label: '失败', cls: 'status-failed' },
  { status: 'cancelled', label: '已取消', cls: 'status-cancelled' },
  { status: 'skipped', label: '跳过', cls: 'status-skipped' },
]

describe('TaskStatusTag.vue - 状态映射', () => {
  it.each(CASES)('$status → 文案「$label」+ class $cls', ({ status, label, cls }) => {
    const wrapper = mountTag({ status })
    expect(wrapper.find('.status-tag').exists()).toBe(true)
    expect(wrapper.classes()).toContain(cls)
    expect(wrapper.text()).toContain(label)
  })

  it('cancelRequested + running → 取消中（琥珀），不再呈现执行中', () => {
    const wrapper = mountTag({ status: 'running', cancelRequested: true })
    expect(wrapper.text()).toContain('取消中')
    expect(wrapper.classes()).toContain('status-cancelling')
    expect(wrapper.classes()).not.toContain('status-running')
    expect(wrapper.text()).not.toContain('执行中')
  })

  it('cancelRequested 对非 running 状态无影响（如 success 仍为成功）', () => {
    const wrapper = mountTag({ status: 'success', cancelRequested: true })
    expect(wrapper.text()).toContain('成功')
    expect(wrapper.classes()).toContain('status-success')
  })

  it('未知状态：原样显示 status，回落中性灰样式，不崩', () => {
    const wrapper = mountTag({ status: 'weird_status' })
    expect(wrapper.text()).toContain('weird_status')
    expect(wrapper.classes()).toContain('status-unknown')
  })

  it('failed 与 partial 使用不同语义 class（色相与形状双重区分的前提）', () => {
    const failed = mountTag({ status: 'failed' })
    const partial = mountTag({ status: 'partial' })
    expect(failed.classes()).toContain('status-failed')
    expect(partial.classes()).toContain('status-partial')
    expect(failed.classes()).not.toContain('status-partial')
    expect(partial.classes()).not.toContain('status-failed')
  })
})

describe('TaskStatusTag.vue - 图标', () => {
  it('默认展示图标：成功为 ✓，失败为 ✕，部分成功为 ⚠', () => {
    expect(mountTag({ status: 'success' }).find('.status-icon').text()).toBe('✓')
    expect(mountTag({ status: 'failed' }).find('.status-icon').text()).toBe('✕')
    expect(mountTag({ status: 'partial' }).find('.status-icon').text()).toBe('⚠')
    expect(mountTag({ status: 'pending' }).find('.status-icon').text()).toBe('○')
    expect(mountTag({ status: 'skipped' }).find('.status-icon').text()).toBe('⊘')
  })

  it('执行中/取消中使用 CSS 转圈动画（不是字形图标）', () => {
    const running = mountTag({ status: 'running' })
    expect(running.find('.status-spinner').exists()).toBe(true)
    expect(running.find('.status-icon').exists()).toBe(false)

    const cancelling = mountTag({ status: 'running', cancelRequested: true })
    expect(cancelling.find('.status-spinner').exists()).toBe(true)
  })

  it('showIcon=false 时不渲染任何图标', () => {
    const wrapper = mountTag({ status: 'success', showIcon: false })
    expect(wrapper.find('.status-icon').exists()).toBe(false)
    expect(wrapper.find('.status-spinner').exists()).toBe(false)
    expect(wrapper.text()).toContain('成功')
  })
})
