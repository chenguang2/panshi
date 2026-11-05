import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/api/clusters', () => ({
  getClusterDrift: vi.fn(),
}))

import { getClusterDrift } from '@/api/clusters'
import ClusterDriftDrawer from '../ClusterDriftDrawer.vue'

const mockedFetch = vi.mocked(getClusterDrift)

function bodyText(): string {
  return (document.body.textContent || '').trim()
}

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    cluster_id: 1,
    checked_at: '2026-11-05T08:00:00',
    cluster_error: null,
    summary: { ok: 1, drift: 2, unknown: 1, out_of_scope: 0 },
    types: {
      route: {
        label: '路由',
        items: [
          { resource_id: 1, name: 'r-ok', status: 'ok', reason: null, diff: null },
          {
            resource_id: 2,
            name: 'r-drift',
            status: 'drift',
            reason: null,
            diff: {
              removed: { methods: ['GET'] },
              changed: [{ path: 'uri', baseline: '/a/*', edge: '/CHANGED/*' }],
            },
          },
          { resource_id: 3, name: 'r-old', status: 'unknown', reason: '基线缺失：请重新发布', diff: null },
        ],
      },
    },
    out_of_scope_types: ['static_resource', 'node'],
    ...overrides,
  }
}

function makeWrapper(props: Record<string, unknown> = {}) {
  return mount(ClusterDriftDrawer, {
    props: { open: true, clusterId: 1, clusterName: '演示集群', ...props },
    global: {
      stubs: {
        'a-button': { template: '<button v-bind="$attrs"><slot /></button>' },
      },
    },
    attachTo: document.body,
  })
}

describe('ClusterDriftDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockedFetch.mockResolvedValue({ data: makeResult() })
  })

  it('fetches on open and renders summary + three statuses', async () => {
    const wrapper = makeWrapper()
    await vi.waitFor(() => expect(mockedFetch).toHaveBeenCalledWith(1))
    await vi.waitFor(() => {
      expect(bodyText()).toContain('一致 1')
      expect(bodyText()).toContain('漂移 2')
      expect(bodyText()).toContain('无法评估 1')
    })
    const text = bodyText()
    expect(text).toContain('路由（3）')
    expect(text).toContain('r-ok')
    expect(text).toContain('漂移')
    expect(text).toContain('基线缺失')
    expect(text).toContain('static_resource、node')
    wrapper.unmount()
  })

  it('shows title with cluster name and cluster_error when present', async () => {
    mockedFetch.mockResolvedValue({
      data: makeResult({
        cluster_error: '集群中没有活跃的 edge 节点',
        summary: { ok: 0, drift: 0, unknown: 0, out_of_scope: 0 },
        types: {},
      }),
    })
    const wrapper = makeWrapper()
    await vi.waitFor(() => expect(bodyText()).toContain('集群中没有活跃的 edge 节点'))
    wrapper.unmount()
  })

  it('expands diff table only after clicking 展开差异', async () => {
    const wrapper = makeWrapper()
    await vi.waitFor(() => expect(bodyText()).toContain('r-drift'))
    expect(bodyText()).not.toContain('字段路径')
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('展开差异'))
    expect(btn).toBeTruthy()
    ;(btn as HTMLButtonElement).click()
    await vi.waitFor(() => expect(bodyText()).toContain('字段路径'))
    const text = bodyText()
    expect(text).toContain('uri')
    expect(text).toContain('/CHANGED/*')
    expect(text).toContain('（Edge 已无此字段）')
    wrapper.unmount()
  })

  it('re-check button triggers a second fetch', async () => {
    const wrapper = makeWrapper()
    await vi.waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1))
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('重新检测'))
    expect(btn).toBeTruthy()
    ;(btn as HTMLButtonElement).click()
    await vi.waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2))
    wrapper.unmount()
  })

  it('renders api error message when fetch fails', async () => {
    mockedFetch.mockRejectedValue({ response: { data: { detail: '集群不存在' } } })
    const wrapper = makeWrapper()
    await vi.waitFor(() => expect(bodyText()).toContain('集群不存在'))
    wrapper.unmount()
  })
})
