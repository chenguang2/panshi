import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PublishStatusTag from '../PublishStatusTag.vue'

function renderTag(version?: number | null, publishedAt?: string | null) {
  return mount(PublishStatusTag, { props: { version, publishedAt } })
}

describe('PublishStatusTag.vue', () => {
  it('已发布（有版本+时间）：显示 v 版本与发布时间', () => {
    const wrapper = renderTag(3, '2026-05-14T02:30:00Z')
    const text = wrapper.text()
    expect(text).toContain('v3')
    expect(text).toContain('2026/05/14')
    expect(wrapper.find('.ps-published').exists()).toBe(true)
  })

  it('已发布但未同步：显示 未同步', () => {
    const wrapper = renderTag(1, null)
    expect(wrapper.text()).toContain('v1')
    expect(wrapper.text()).toContain('未同步')
    expect(wrapper.find('.ps-published').exists()).toBe(true)
  })

  it('未发布：显示灰色 未发布', () => {
    const wrapper = renderTag(null, null)
    expect(wrapper.text()).toBe('未发布')
    expect(wrapper.find('.ps-unpublished').exists()).toBe(true)
  })

  it('version 为 undefined 视为未发布', () => {
    const wrapper = renderTag(undefined, null)
    expect(wrapper.text()).toBe('未发布')
  })

  it('version 为 0 视为已发布', () => {
    const wrapper = renderTag(0, null)
    expect(wrapper.text()).toContain('v0')
  })
})