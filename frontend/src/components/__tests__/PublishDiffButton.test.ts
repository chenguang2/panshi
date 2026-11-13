import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PublishDiffButton from '../PublishDiffButton.vue'

describe('PublishDiffButton', () => {
  it('待发布态渲染按钮（title 提示）', async () => {
    const w = mount(PublishDiffButton, { props: { pending: true } })
    const btn = w.find('button.diff-preview-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('title')).toBe('查看与 Edge 节点的差异')
    await btn.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
    w.unmount()
  })

  it('partial 态渲染按钮', () => {
    const w = mount(PublishDiffButton, { props: { lastPublishStatus: 'partial' } })
    expect(w.find('button.diff-preview-btn').exists()).toBe(true)
    w.unmount()
  })

  it('未发布/已发布态不渲染', () => {
    const w1 = mount(PublishDiffButton, { props: { pending: false, lastPublishStatus: null } })
    expect(w1.find('button').exists()).toBe(false)
    w1.unmount()
    const w2 = mount(PublishDiffButton, { props: {} })
    expect(w2.find('button').exists()).toBe(false)
    w2.unmount()
  })
})
