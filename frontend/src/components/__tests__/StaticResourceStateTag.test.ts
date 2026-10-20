import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StaticResourceStateTag from '../StaticResourceStateTag.vue'

/**
 * static-resources-ux-close-loop 7.1：分发状态五态徽章判定表。
 * 视觉对齐 PublishStatusTag（红=配置异常，灰=待上传，橙=待分发，绿=已分发，橙红=失败）。
 */
const detail = {
  total: 3,
  success: 1,
  failed: 2,
  failed_nodes: [
    { node: '10.0.0.2:9181', error: 'connection refused' },
    { node: '10.0.0.3:9182', error: 'timeout' },
  ],
}

describe('StaticResourceStateTag · 五态判定表', () => {
  it('配置异常（route_exists=false）：红「配置异常」+ 指路 tooltip，优先级最高', () => {
    const w = mount(StaticResourceStateTag, {
      props: { currentVersion: 2, lastPublishOk: true, routeExists: false, lastPublishedAt: '2026-10-20T02:00:00Z' },
    })
    expect(w.text()).toContain('配置异常')
    expect(w.find('.srs-tag').classes()).toContain('srs-broken')
    expect(w.find('.srs-tag').attributes('title')).toContain('关联路由不存在')
  })

  it('待上传（无版本）：灰「待上传」', () => {
    const w = mount(StaticResourceStateTag, { props: { currentVersion: null, lastPublishOk: null, routeExists: true } })
    expect(w.text()).toContain('待上传')
    expect(w.find('.srs-tag').classes()).toContain('srs-pending-upload')
  })

  it('待分发（有版本、从未发布）：橙「待分发」+ tooltip 含上传时间', () => {
    const w = mount(StaticResourceStateTag, {
      props: { currentVersion: 1, lastPublishOk: null, routeExists: true, updatedAt: '2026-10-19T18:30:00Z' },
    })
    expect(w.text()).toContain('待分发')
    expect(w.find('.srs-tag').classes()).toContain('srs-pending-dispatch')
    const title = w.find('.srs-tag').attributes('title') || ''
    expect(title).toContain('尚未分发')
    expect(title).toContain('2026/10/20')
  })

  it('已分发：绿「已分发 3/3 节点」+ tooltip 最近分发时间', () => {
    const w = mount(StaticResourceStateTag, {
      props: {
        currentVersion: 1,
        lastPublishOk: true,
        routeExists: true,
        lastPublishedAt: '2026-10-20T02:00:00Z',
        publishDetail: { total: 3, success: 3, failed: 0, failed_nodes: [] },
      },
    })
    expect(w.text()).toContain('已分发 3/3 节点')
    expect(w.find('.srs-tag').classes()).toContain('srs-dispatched')
    expect(w.find('.srs-tag').attributes('title')).toContain('最近分发')
  })

  it('已分发（legacy 无 detail）：绿「已分发」无计数', () => {
    const w = mount(StaticResourceStateTag, {
      props: { currentVersion: 1, lastPublishOk: true, routeExists: true, lastPublishedAt: '2026-10-20T02:00:00Z' },
    })
    expect(w.text()).toContain('已分发')
    expect(w.text()).not.toContain('/3')
  })

  it('失败：橙红「已分发 1/3 节点」+ tooltip 列失败节点与原因', () => {
    const w = mount(StaticResourceStateTag, {
      props: {
        currentVersion: 1,
        lastPublishOk: false,
        routeExists: true,
        lastPublishedAt: '2026-10-20T02:00:00Z',
        publishDetail: detail,
      },
    })
    expect(w.text()).toContain('1/3 节点失败')
    expect(w.find('.srs-tag').classes()).toContain('srs-failed')
    const title = w.find('.srs-tag').attributes('title') || ''
    expect(title).toContain('10.0.0.2:9181')
    expect(title).toContain('connection refused')
  })
})

describe('StaticResourceStateTag · detail 累积合并回归（10.3 缺口修正）', () => {
  const mountMerged = async (props: Record<string, unknown>) => {
    const wrapper = mount(StaticResourceStateTag, { props })
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('重发单节点成功后的合并 detail（3/3）→ 已分发 3/3 节点（不得回跳 1/1）', async () => {
    const w = await mountMerged({
      currentVersion: 4,
      lastPublishOk: true,
      routeExists: true,
      lastPublishedAt: '2026-10-20T08:00:00',
      publishDetail: {
        total: 3,
        success: 3,
        failed: 0,
        failed_nodes: [],
        node_results: {
          1: { node: 'a', ok: true, error: '' },
          2: { node: 'b', ok: true, error: '' },
          3: { node: 'c', ok: true, error: '' },
        },
      },
    })
    expect(w.find('.srs-tag').text()).toBe('已分发 3/3 节点')
  })

  it('对另一节点重发成功后的合并 detail（2 成功 1 失败保留）→ 2/3 节点失败 + 原失败节点在 tooltip', async () => {
    const w = await mountMerged({
      currentVersion: 4,
      lastPublishOk: false,
      routeExists: true,
      lastPublishedAt: '2026-10-20T08:00:00',
      publishDetail: {
        total: 3,
        success: 2,
        failed: 1,
        failed_nodes: [{ node: '10.0.0.3:9182', node_id: 3, error: 'connection refused' }],
        node_results: {
          1: { node: 'a', ok: true, error: '' },
          2: { node: 'b', ok: true, error: '' },
          3: { node: '10.0.0.3:9182', ok: false, error: 'connection refused' },
        },
      },
    })
    expect(w.find('.srs-tag').text()).toContain('2/3 节点失败')
    expect(w.find('.srs-tag').attributes('title')).toContain('10.0.0.3:9182')
  })
})
