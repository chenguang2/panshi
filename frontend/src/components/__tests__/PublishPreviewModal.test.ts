import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/api/clusters', () => ({
  getPublishPreview: vi.fn(),
}))

import { getPublishPreview } from '@/api/clusters'
import PublishPreviewModal from '../PublishPreviewModal.vue'

const mockedFetch = vi.mocked(getPublishPreview)

function bodyText(): string {
  return (document.body.textContent || '').trim()
}

/** AntD Modal 底部按钮按文案查找（antd-vue 4.x 主按钮无 .ant-btn-primary 旧类） */
function footerButton(text: string): HTMLButtonElement | null {
  return (
    ([...document.querySelectorAll('.ant-modal-footer button')] as HTMLButtonElement[]).find((b) =>
      (b.textContent || '').includes(text),
    ) ?? null
  )
}

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    cluster_id: 1,
    resource_type: 'upstream',
    resource_id: 5,
    name: 'user-service',
    checked_at: '2026-11-13T02:05:00',
    cluster_error: null,
    has_baseline: true,
    baseline_missing_reason: null,
    platform_change: {
      changed: [{ path: 'nodes.10.0.0.1:80', baseline: 50, candidate: 70 }],
      removed: {},
      added: { checks: { active: { http_path: '/status' } } },
    },
    nodes: [
      { label: '192.168.0.13', status: 'diff', reason: null, diff_count: 2, behind: false, behind_reason: null },
      {
        label: '192.168.0.15',
        status: 'diff',
        reason: null,
        diff_count: 3,
        behind: true,
        behind_reason: '落后于上次发布：retries 与待发布配置不一致（其余节点已一致）',
      },
    ],
    matrix: {
      node_labels: ['192.168.0.13', '192.168.0.15'],
      diff_rows: [
        { path: 'nodes.10.0.0.1:80', candidate: 70, values: { '192.168.0.13': 50, '192.168.0.15': 50 } },
        {
          path: 'checks',
          candidate: { active: { http_path: '/status' } },
          values: { '192.168.0.13': null, '192.168.0.15': null },
        },
        { path: 'retries', candidate: 3, values: { '192.168.0.13': 3, '192.168.0.15': '2' } },
      ],
      same_rows: [
        {
          path: 'name',
          candidate: 'user-service',
          values: { '192.168.0.13': 'user-service', '192.168.0.15': 'user-service' },
        },
      ],
    },
    summary: { diff_count: 3, same_count: 1, behind_nodes: ['192.168.0.15'] },
    ...overrides,
  }
}

function makeWrapper(props: Record<string, unknown> = {}) {
  return mount(PublishPreviewModal, {
    props: {
      open: true,
      clusterId: 1,
      clusterName: 'demo-cls',
      resourceType: 'upstream',
      resourceId: 5,
      resourceName: 'user-service',
      ...props,
    },
    global: {
      stubs: {
        'a-button': { template: '<button v-bind="$attrs"><slot /></button>' },
      },
    },
    attachTo: document.body,
  })
}

describe('PublishPreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockedFetch.mockResolvedValue({ data: makeResult() })
  })

  it('open 时按资源定位拉取并渲染矩阵/徽章/结论', async () => {
    const wrapper = makeWrapper()
    await vi.waitFor(() => expect(mockedFetch).toHaveBeenCalledWith(1, 'upstream', 5))
    await vi.waitFor(() => {
      const text = bodyText()
      expect(text).toContain('发布差异预览 · 上游 user-service（demo-cls）')
      expect(text).toContain('192.168.0.13 差 2 项')
      expect(text).toContain('192.168.0.15 差 3 项 · 落后')
      expect(text).toContain('落后于上次发布：retries 与待发布配置不一致（其余节点已一致）')
      expect(text).toContain('nodes.10.0.0.1:80')
    })
    // 结论条走 behind 分支（有点名落后节点时优先）
    expect(bodyText()).toContain('直接发布即可一次性覆盖以下全部差异')
    // 默认只显差异：一致行 name 不渲染
    expect(document.querySelectorAll('.pv-same-row').length).toBe(0)
    // 差异格：缺失标注
    expect(bodyText()).toContain('缺失')
    wrapper.unmount()
  })

  it('平台侧变更段渲染 changed/added', async () => {
    const wrapper = makeWrapper()
    await vi.waitFor(() => {
      const text = bodyText()
      expect(text).toContain('平台侧本次变更（vs 上次发布版本）')
      expect(text).toContain('50')
      expect(text).toContain('70')
      expect(text).toContain('（新增）')
    })
    wrapper.unmount()
  })

  it('显示一致字段开关追加一致行', async () => {
    const wrapper = makeWrapper()
    await vi.waitFor(() => expect(bodyText()).toContain('隐藏 1 个一致字段'))
    const toggle = document.querySelector('.pv-toggle input') as HTMLInputElement | null
    expect(toggle).toBeTruthy()
    toggle!.checked = true
    toggle!.dispatchEvent(new Event('change'))
    await vi.waitFor(() => {
      expect(bodyText()).toContain('显示一致字段（当前显示全部字段）')
    })
    // 一致行出现（name 行的所有节点列均为候选值）
    const sameRow = document.querySelectorAll('.pv-same-row')
    expect(sameRow.length).toBe(1)
    expect(sameRow[0].textContent).toContain('name')
    expect(sameRow[0].textContent).toContain('user-service')
    wrapper.unmount()
  })

  it('基线缺失降级：platform_change 段显示原因，矩阵照常', async () => {
    mockedFetch.mockResolvedValue({
      data: makeResult({
        has_baseline: false,
        baseline_missing_reason: '基线缺失：该快照不含实发载荷（旧版本），重新发布后可用',
        platform_change: null,
      }),
    })
    const wrapper = makeWrapper()
    await vi.waitFor(() => {
      const text = bodyText()
      expect(text).toContain('基线缺失：该快照不含实发载荷（旧版本），重新发布后可用')
      expect(text).toContain('nodes.10.0.0.1:80')
    })
    wrapper.unmount()
  })

  it('单节点不可达：结论条 error 且去发布禁用', async () => {
    mockedFetch.mockResolvedValue({
      data: makeResult({
        cluster_error: '集群中没有活跃的 edge 节点',
        nodes: [],
        matrix: { node_labels: [], diff_rows: [], same_rows: [] },
        summary: { diff_count: 0, same_count: 0, behind_nodes: [] },
      }),
    })
    const wrapper = makeWrapper()
    await vi.waitFor(() => {
      expect(bodyText()).toContain('集群中没有活跃的 edge 节点')
    })
    const okBtn = footerButton('去发布')
    expect(okBtn).toBeTruthy()
    expect(okBtn!.disabled).toBe(true)
    wrapper.unmount()
  })

  it('去发布 emit 交还页面，不自行关闭发布流程', async () => {
    const wrapper = makeWrapper()
    await vi.waitFor(() => expect(mockedFetch).toHaveBeenCalled())
    const okBtn = footerButton('去发布')
    expect(okBtn).toBeTruthy()
    okBtn!.click()
    await vi.waitFor(() => {
      expect(wrapper.emitted('publish')).toHaveLength(1)
    })
    wrapper.unmount()
  })

  it('拉取失败显示错误与重新检测入口', async () => {
    mockedFetch.mockRejectedValue({
      response: { data: { detail: '资源类型 upstream 尚未接入发布差异预览（首批：上游、路由）' } },
    })
    const wrapper = makeWrapper()
    await vi.waitFor(() => {
      expect(bodyText()).toContain('尚未接入发布差异预览')
      expect(bodyText()).toContain('重新检测')
    })
    wrapper.unmount()
  })
})
