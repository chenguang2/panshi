import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PublishStatusTag from '../PublishStatusTag.vue'

interface ExtraProps {
  pending?: boolean
  lastPublishStatus?: string | null
}

function renderTag(version?: number | null, publishedAt?: string | null, extra?: ExtraProps) {
  return mount(PublishStatusTag, { props: { version, publishedAt, ...extra } })
}

describe('PublishStatusTag.vue - 既有三分支（未传新 props，向后兼容基线）', () => {
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

describe('PublishStatusTag.vue - 向后兼容判定', () => {
  it('lastPublishStatus=null 且 pending 未传 → 仍走既有分支（「未同步」可达）', () => {
    const wrapper = renderTag(1, null, { lastPublishStatus: null })
    expect(wrapper.text()).toContain('v1 · 未同步')
    expect(wrapper.find('.ps-pending').exists()).toBe(false)
    expect(wrapper.find('.ps-partial').exists()).toBe(false)
  })

  it('仅传 pending=false（lastPublishStatus 未传）→ pendingAware 生效：publishedAt 为空只显示 vX 不带「未同步」', () => {
    const wrapper = renderTag(1, null, { pending: false })
    expect(wrapper.text()).toBe('v1')
    expect(wrapper.text()).not.toContain('未同步')
  })
})

describe('PublishStatusTag.vue - 四态（pendingAware）', () => {
  it('未发布优先于 pending：version 为空时显示「未发布」', () => {
    const wrapper = renderTag(null, null, { pending: true })
    expect(wrapper.text()).toBe('未发布')
    expect(wrapper.find('.ps-unpublished').exists()).toBe(true)
    expect(wrapper.find('.ps-pending').exists()).toBe(false)
  })

  it('partial：⚠ vX · 发布未完全生效（橙红 ps-partial）+ tooltip「上次发布存在未生效节点，请重新发布」', () => {
    const wrapper = renderTag(3, '2026-05-14T02:30:00Z', { pending: false, lastPublishStatus: 'partial' })
    expect(wrapper.text()).toContain('⚠ v3 · 发布未完全生效')
    expect(wrapper.find('.ps-partial').exists()).toBe(true)
    expect(wrapper.find('.ps-partial').attributes('title')).toBe('上次发布存在未生效节点，请重新发布')
    expect(wrapper.find('.ps-published').exists()).toBe(false)
  })

  it('判定顺序：partial 优先于 pending', () => {
    const wrapper = renderTag(3, null, { pending: true, lastPublishStatus: 'partial' })
    expect(wrapper.find('.ps-partial').exists()).toBe(true)
    expect(wrapper.find('.ps-pending').exists()).toBe(false)
  })

  it('待发布（橙 ps-pending）+ tooltip「配置已修改，发布后生效」，不显示版本号', () => {
    const wrapper = renderTag(3, '2026-05-14T02:30:00Z', { pending: true })
    expect(wrapper.text()).toBe('待发布')
    expect(wrapper.find('.ps-pending').exists()).toBe(true)
    expect(wrapper.find('.ps-pending').attributes('title')).toBe('配置已修改，发布后生效')
    expect(wrapper.find('.ps-published').exists()).toBe(false)
  })

  it('仅传 lastPublishStatus（pending 未传）也能命中 partial 态', () => {
    const wrapper = renderTag(2, null, { lastPublishStatus: 'partial' })
    expect(wrapper.text()).toContain('⚠ v2 · 发布未完全生效')
    expect(wrapper.find('.ps-partial').exists()).toBe(true)
  })

  it('已发布（pendingAware）：vX 绿标 + 发布时间，无待发布/未完全生效标记', () => {
    const wrapper = renderTag(3, '2026-05-14T02:30:00Z', { pending: false })
    expect(wrapper.text()).toContain('v3')
    expect(wrapper.text()).toContain('2026/05/14')
    expect(wrapper.find('.ps-published').exists()).toBe(true)
    expect(wrapper.find('.ps-pending').exists()).toBe(false)
    expect(wrapper.find('.ps-partial').exists()).toBe(false)
  })

  it('已发布但 publishedAt 为空：只显示 vX，不带时间、不带「未同步」', () => {
    const wrapper = renderTag(3, null, { pending: false, lastPublishStatus: null })
    expect(wrapper.text()).toBe('v3')
    expect(wrapper.find('.ps-date').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('未同步')
  })
})
