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

/** 8 节点分组 mock：5 一致 + 2 同指纹落后 + 1 旁路（>5 触发分组呈现） */
function makeGroupedResult() {
  const labels = ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5', '10.0.0.6', '10.0.0.7', '10.0.0.8']
  const okNodes = labels.slice(0, 5).map((label) => ({
    label,
    status: 'ok',
    reason: null,
    diff_count: 0,
    behind: false,
    behind_reason: null,
  }))
  const behindReason = '落后于上次发布：retries 与待发布配置不一致'
  const behindNodes = ['10.0.0.6', '10.0.0.7'].map((label) => ({
    label,
    status: 'diff',
    reason: null,
    diff_count: 1,
    behind: true,
    behind_reason: behindReason,
  }))
  const bypassNode = {
    label: '10.0.0.8',
    status: 'diff',
    reason: null,
    diff_count: 1,
    behind: false,
    behind_reason: null,
  }
  const sameValues = Object.fromEntries(labels.map((l) => [l, 'user-service']))
  return makeResult({
    nodes: [...okNodes, ...behindNodes, bypassNode],
    matrix: {
      node_labels: labels,
      diff_rows: [
        {
          path: 'retries',
          candidate: 3,
          values: {
            '10.0.0.1': 3,
            '10.0.0.2': 3,
            '10.0.0.3': 3,
            '10.0.0.4': 3,
            '10.0.0.5': 3,
            '10.0.0.6': '2',
            '10.0.0.7': '2',
            '10.0.0.8': 3,
          },
        },
        {
          path: 'timeout',
          candidate: 10,
          values: {
            '10.0.0.1': 10,
            '10.0.0.2': 10,
            '10.0.0.3': 10,
            '10.0.0.4': 10,
            '10.0.0.5': 10,
            '10.0.0.6': 10,
            '10.0.0.7': 10,
            '10.0.0.8': 15,
          },
        },
      ],
      same_rows: [{ path: 'name', candidate: 'user-service', values: sameValues }],
    },
    summary: { diff_count: 2, same_count: 1, behind_nodes: ['10.0.0.6', '10.0.0.7'] },
  })
}

/** 8 节点混合状态 mock：4 一致 + 2 同指纹落后 + 1 缺失 + 1 不可达 */
function makeGroupedMixedStatusResult() {
  const labels = ['10.1.0.1', '10.1.0.2', '10.1.0.3', '10.1.0.4', '10.1.0.5', '10.1.0.6', '10.1.0.7', '10.1.0.8']
  const node = (label: string, extra: Record<string, unknown>) => ({
    label,
    reason: null,
    diff_count: 0,
    behind: false,
    behind_reason: null,
    ...extra,
  })
  const behindReason = '落后于上次发布：retries 与待发布配置不一致'
  const nodes = [
    ...labels.slice(0, 4).map((l) => node(l, { status: 'ok' })),
    node('10.1.0.5', { status: 'diff', diff_count: 1, behind: true, behind_reason: behindReason }),
    node('10.1.0.6', { status: 'diff', diff_count: 1, behind: true, behind_reason: behindReason }),
    node('10.1.0.7', { status: 'missing' }),
    node('10.1.0.8', { status: 'unreachable', reason: '连接超时（10s）' }),
  ]
  return makeResult({
    nodes,
    matrix: {
      node_labels: labels,
      diff_rows: [
        {
          path: 'retries',
          candidate: 3,
          values: {
            '10.1.0.1': 3,
            '10.1.0.2': 3,
            '10.1.0.3': 3,
            '10.1.0.4': 3,
            '10.1.0.5': '2',
            '10.1.0.6': '2',
            '10.1.0.7': null,
            '10.1.0.8': null,
          },
        },
      ],
      same_rows: [
        { path: 'name', candidate: 'user-service', values: Object.fromEntries(labels.map((l) => [l, 'user-service'])) },
      ],
    },
    summary: { diff_count: 1, same_count: 1, behind_nodes: ['10.1.0.5', '10.1.0.6'] },
  })
}

/** 5 节点 mock：3 一致 + 2 同指纹落后（不超阈值，保持矩阵） */
function makeFiveNodeResult() {
  const labels = ['10.2.0.1', '10.2.0.2', '10.2.0.3', '10.2.0.4', '10.2.0.5']
  const behindReason = '落后于上次发布：retries 与待发布配置不一致'
  const nodes = [
    ...labels.slice(0, 3).map((label) => ({
      label,
      status: 'ok',
      reason: null,
      diff_count: 0,
      behind: false,
      behind_reason: null,
    })),
    ...['10.2.0.4', '10.2.0.5'].map((label) => ({
      label,
      status: 'diff',
      reason: null,
      diff_count: 1,
      behind: true,
      behind_reason: behindReason,
    })),
  ]
  return makeResult({
    nodes,
    matrix: {
      node_labels: labels,
      diff_rows: [
        {
          path: 'retries',
          candidate: 3,
          values: { '10.2.0.1': 3, '10.2.0.2': 3, '10.2.0.3': 3, '10.2.0.4': '2', '10.2.0.5': '2' },
        },
      ],
      same_rows: [
        { path: 'name', candidate: 'user-service', values: Object.fromEntries(labels.map((l) => [l, 'user-service'])) },
      ],
    },
    summary: { diff_count: 1, same_count: 1, behind_nodes: ['10.2.0.4', '10.2.0.5'] },
  })
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

  it('超过阈值（8 节点）切换分组呈现：组数/组头/IP chips/组内差异表', async () => {
    mockedFetch.mockResolvedValue({ data: makeGroupedResult() })
    const wrapper = makeWrapper()
    await vi.waitFor(() => {
      // 3 组：2 节点落后组 + 1 节点旁路组 + 5 节点一致组；不再按节点铺列
      expect(document.querySelectorAll('.pv-group')).toHaveLength(3)
      expect(document.querySelectorAll('.pv-node-h')).toHaveLength(0)
    })
    const titles = [...document.querySelectorAll('.pv-group-title')].map((el) => (el.textContent || '').trim())
    expect(titles[0]).toContain('落后于上次发布：retries 与待发布配置不一致')
    expect(titles[1]).toBe('与待发布存在差异')
    expect(titles[2]).toBe('与待发布配置一致')
    // IP chips 归组：落后组 2 节点居首（按节点数降序），旁路组 1 节点，一致组 5 节点
    const groupEls = document.querySelectorAll('.pv-group')
    const chipsOf = (el: Element) => [...el.querySelectorAll('.pv-gchip')].map((c) => (c.textContent || '').trim())
    expect(chipsOf(groupEls[0])).toEqual(['10.0.0.6', '10.0.0.7'])
    expect(chipsOf(groupEls[1])).toEqual(['10.0.0.8'])
    expect(chipsOf(groupEls[2])).toHaveLength(5)
    // 组内差异表：落后组只含 retries（3 → 2），旁路组只含 timeout（10 → 15），一致组无表
    const tables = document.querySelectorAll('.pv-gtable')
    expect(tables).toHaveLength(2)
    expect(tables[0].textContent).toContain('retries')
    expect(tables[0].textContent).not.toContain('timeout')
    expect(tables[1].textContent).toContain('timeout')
    expect(tables[1].textContent).toContain('15')
    expect(groupEls[2].querySelectorAll('table')).toHaveLength(0)
    wrapper.unmount()
  })

  it('超过阈值：缺失与不可达节点仅列 IP 归组（不可达附原因），组序差异→缺失→不可达→一致', async () => {
    mockedFetch.mockResolvedValue({ data: makeGroupedMixedStatusResult() })
    const wrapper = makeWrapper()
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.pv-group')).toHaveLength(4)
      expect(document.querySelectorAll('.pv-node-h')).toHaveLength(0)
    })
    const groupEls = document.querySelectorAll('.pv-group')
    // 组序：差异组（2 节点落后）→ 缺失 → 不可达 → 一致
    expect((groupEls[0].querySelector('.pv-group-title')?.textContent || '').trim()).toContain(
      '落后于上次发布：retries',
    )
    expect((groupEls[1].querySelector('.pv-group-title')?.textContent || '').trim()).toBe('缺失该资源')
    expect((groupEls[2].querySelector('.pv-group-title')?.textContent || '').trim()).toBe('不可达')
    expect((groupEls[3].querySelector('.pv-group-title')?.textContent || '').trim()).toBe('与待发布配置一致')
    // 缺失/不可达组仅列 IP、无差异表；不可达附原因
    expect(groupEls[1].querySelectorAll('table')).toHaveLength(0)
    expect(groupEls[2].querySelectorAll('table')).toHaveLength(0)
    expect(groupEls[2].textContent || '').toContain('连接超时（10s）')
    const chipsOf = (el: Element) => [...el.querySelectorAll('.pv-gchip')].map((c) => (c.textContent || '').trim())
    expect(chipsOf(groupEls[1])).toEqual(['10.1.0.7'])
    expect(chipsOf(groupEls[2])).toEqual(['10.1.0.8'])
    expect(chipsOf(groupEls[3])).toHaveLength(4)
    wrapper.unmount()
  })

  it('5 节点（不超阈值）保持逐节点矩阵呈现', async () => {
    mockedFetch.mockResolvedValue({ data: makeFiveNodeResult() })
    const wrapper = makeWrapper()
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.pv-node-h')).toHaveLength(5)
      expect(document.querySelectorAll('.pv-group')).toHaveLength(0)
    })
    // 矩阵含落后节点的差异列
    expect(bodyText()).toContain('10.2.0.4')
    expect(bodyText()).toContain('retries')
    wrapper.unmount()
  })

  it('分组模式下「显示一致字段」在差异组内追加一致行', async () => {
    mockedFetch.mockResolvedValue({ data: makeGroupedResult() })
    const wrapper = makeWrapper()
    await vi.waitFor(() => expect(document.querySelectorAll('.pv-group')).toHaveLength(3))
    // 开关前：差异组表只有差异行
    let tables = document.querySelectorAll('.pv-gtable')
    expect(tables).toHaveLength(2)
    expect(tables[0].querySelectorAll('.pv-same-row')).toHaveLength(0)
    const toggle = document.querySelector('.pv-toggle input') as HTMLInputElement | null
    expect(toggle).toBeTruthy()
    toggle!.checked = true
    toggle!.dispatchEvent(new Event('change'))
    await vi.waitFor(() => {
      // 两个差异组各追加「组内与候选一致」行：落后组追加 timeout+name，旁路组追加 retries+name
      tables = document.querySelectorAll('.pv-gtable')
      expect(tables[0].querySelectorAll('.pv-same-row')).toHaveLength(2)
      expect(tables[1].querySelectorAll('.pv-same-row')).toHaveLength(2)
      expect(tables[0].textContent).toContain('timeout')
      expect(tables[0].textContent).toContain('name')
      expect(tables[0].textContent).toContain('user-service')
      expect(tables[1].textContent).toContain('retries')
    })
    wrapper.unmount()
  })
})
