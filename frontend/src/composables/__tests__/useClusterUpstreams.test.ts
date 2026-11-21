import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster, Upstream, Route } from '@/types'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()
const mockExecuteDeleteWithProgress = vi.fn()
const mockShowDeleteConfirm = vi.fn()
const mockMessageSuccess = vi.fn()
const mockMessageWarning = vi.fn()
const mockMessageError = vi.fn()
const mockShowOverlayModal = vi.fn()
const mockOpenPublishModal = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

vi.mock('ant-design-vue', () => ({
  message: {
    success: (...args: any[]) => mockMessageSuccess(...args),
    warning: (...args: any[]) => mockMessageWarning(...args),
    error: (...args: any[]) => mockMessageError(...args),
  },
}))

vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: (...args: any[]) => mockShowOverlayModal(...args),
}))

vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: vi.fn(),
  executeDeleteWithProgress: (...args: any[]) => mockExecuteDeleteWithProgress(...args),
  showDeleteConfirm: (opts: any) => mockShowDeleteConfirm(opts),
  buildDeleteProgressContent: () => '',
  publishStatusRender: () => '',
  formatPublishDateTime: () => '',
}))

// 列个性化桩：顺序/宽度用可写 ref 暴露，测试直接驱动（真实 localStorage 由 useColumnConfig 单测覆盖）
const mockUpstreamColumnWidths = ref<Record<string, number>>({})
const mockUpstreamColumnOrder = ref<string[]>([])

vi.mock('@/composables/useColumnConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useColumnConfig')>()
  return {
    ...actual, // resolveOrderedColumns / applyColumnWidths 走真实实现
    useColumnConfig: () => ({
      popoverVisible: ref(false),
      columnsSelected: ref(['name', 'load_balance', 'targets', 'version', 'actions']),
      searchVisible: ref(true),
      actionsSelected: ref(['copy', 'edit', 'delete', 'publish', 'version']),
      columnWidths: mockUpstreamColumnWidths,
      setColumnWidth: vi.fn(),
      resetWidths: vi.fn(),
      columnOrder: mockUpstreamColumnOrder,
      setColumnOrder: vi.fn(),
    }),
  }
})

function makeUpstream(overrides: Partial<Upstream> = {}): Upstream {
  return {
    id: 1,
    edge_uuid: 'edge-1',
    cluster_id: 1,
    name: 'upstream-1',
    load_balance: 'weighted_roundrobin',
    targets: [],
    ...overrides,
  }
}

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 1,
    name: 'cluster-1',
    activeTab: 'upstreams',
    upstreams: [],
    upstreamsPagination: { total: 0, page: 1, pageSize: 20 },
    upstreamsSearch: '',
    upstreamsSearchField: '',
    upstreamsSortBy: '',
    upstreamsSortOrder: 'asc',
    selectedUpstream: null,
    selectedUpstreamKeys: [],
    nodes: [],
    ...overrides,
  } as Cluster
}

async function makeComposable(cluster: Cluster) {
  const { useClusterUpstreams } = await import('../useClusterUpstreams')
  const clusters = ref<Cluster[]>([cluster])
  return useClusterUpstreams({
    clusters: computed(() => clusters.value),
    versionModalVisible: ref(false),
    versionModalType: ref('upstream'),
    versionModalResourceId: ref(null),
    versionModalClusterId: ref(null),
    versionModalResourceName: ref(''),
    versionModalEdgeUuid: ref(''),
    openPublishModal: (...args: any[]) => mockOpenPublishModal(...args),
  })
}

describe('useClusterUpstreams batch selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  describe('selectUpstreams', () => {
    it('clears selectedUpstream when zero keys', async () => {
      const cluster = makeCluster({ selectedUpstream: makeUpstream({ id: 5 }) })
      const { selectUpstreams } = await makeComposable(cluster)
      selectUpstreams(cluster, [], [])
      expect(cluster.selectedUpstreamKeys).toEqual([])
      expect(cluster.selectedUpstream).toBeNull()
    })

    it('sets selectedUpstream to the single row when one key', async () => {
      const cluster = makeCluster()
      const { selectUpstreams } = await makeComposable(cluster)
      const u = makeUpstream({ id: 7 })
      selectUpstreams(cluster, [7], [u])
      expect(cluster.selectedUpstreamKeys).toEqual([7])
      expect(cluster.selectedUpstream).toEqual(u)
    })

    it('clears selectedUpstream when two or more keys', async () => {
      const cluster = makeCluster({ selectedUpstream: makeUpstream({ id: 1 }) })
      const { selectUpstreams } = await makeComposable(cluster)
      const u1 = makeUpstream({ id: 1 })
      const u2 = makeUpstream({ id: 2 })
      selectUpstreams(cluster, [1, 2], [u1, u2])
      expect(cluster.selectedUpstreamKeys).toEqual([1, 2])
      expect(cluster.selectedUpstream).toBeNull()
    })
  })

  describe('deleteUpstreams', () => {
    it('warns when no upstream is checked', async () => {
      const cluster = makeCluster()
      const { deleteUpstreams } = await makeComposable(cluster)
      await deleteUpstreams(cluster)
      expect(mockShowDeleteConfirm).not.toHaveBeenCalled()
    })

    it('lists up to 3 upstream names in confirm title', async () => {
      const cluster = makeCluster({
        upstreams: [
          makeUpstream({ id: 1, name: 'a' }),
          makeUpstream({ id: 2, name: 'b' }),
          makeUpstream({ id: 3, name: 'c' }),
        ],
        selectedUpstreamKeys: [1, 2, 3],
        nodes: [{ id: 10, ip: '1.1.1.1', management_port: 9180 }],
        routes: [],
      })
      const { deleteUpstreams } = await makeComposable(cluster)
      await deleteUpstreams(cluster)
      const opts = mockShowDeleteConfirm.mock.calls[0][0]
      expect(opts.title).toContain('a')
      expect(opts.title).toContain('b')
      expect(opts.title).toContain('c')
    })

    it('truncates title with 等 N 条 when more than 3 upstreams', async () => {
      const cluster = makeCluster({
        upstreams: [1, 2, 3, 4].map((i) => makeUpstream({ id: i, name: `u${i}` })),
        selectedUpstreamKeys: [1, 2, 3, 4],
        nodes: [{ id: 10, ip: '1.1.1.1', management_port: 9180 }],
        routes: [],
      })
      const { deleteUpstreams } = await makeComposable(cluster)
      await deleteUpstreams(cluster)
      const opts = mockShowDeleteConfirm.mock.calls[0][0]
      expect(opts.title).toContain('等 4 条')
    })

    it('filters out referenced upstreams and warns', async () => {
      const cluster = makeCluster({
        upstreams: [makeUpstream({ id: 1, name: 'ref' }), makeUpstream({ id: 2, name: 'free' })],
        selectedUpstreamKeys: [1, 2],
        nodes: [{ id: 10, ip: '1.1.1.1', management_port: 9180 }],
        routes: [{ id: 100, upstream_id: 1, name: 'r1', cluster_id: 1, uri: '/x' } as Route],
      })
      const { deleteUpstreams } = await makeComposable(cluster)
      await deleteUpstreams(cluster)
      const opts = mockShowDeleteConfirm.mock.calls[0][0]
      expect(opts.title).not.toContain('ref')
      expect(opts.title).toContain('free')
    })

    it('does not open confirm when all upstreams referenced', async () => {
      const cluster = makeCluster({
        upstreams: [makeUpstream({ id: 1, name: 'ref' })],
        selectedUpstreamKeys: [1],
        nodes: [{ id: 10, ip: '1.1.1.1', management_port: 9180 }],
        routes: [{ id: 100, upstream_id: 1, name: 'r1', cluster_id: 1, uri: '/x' } as Route],
      })
      const { deleteUpstreams } = await makeComposable(cluster)
      await deleteUpstreams(cluster)
      expect(mockShowDeleteConfirm).not.toHaveBeenCalled()
    })

    it('calls executeDeleteWithProgress with resourceKey on confirm', async () => {
      const cluster = makeCluster({
        upstreams: [makeUpstream({ id: 1, name: 'a' }), makeUpstream({ id: 2, name: 'b' })],
        selectedUpstreamKeys: [1, 2],
        nodes: [{ id: 10, ip: '1.1.1.1', management_port: 9180 }],
        routes: [],
      })
      const { deleteUpstreams } = await makeComposable(cluster)
      await deleteUpstreams(cluster)
      const opts = mockShowDeleteConfirm.mock.calls[0][0]
      await opts.onOk(true, true, [10])
      expect(mockExecuteDeleteWithProgress).toHaveBeenCalledTimes(1)
      const progressOpts = mockExecuteDeleteWithProgress.mock.calls[0][0]
      expect(progressOpts.resourceKey).toEqual({
        field: 'upstream_ids',
        label: '上游',
        nameField: 'upstream_name',
        keys: [1, 2],
      })
      expect(progressOpts.apiEndpoint).toBe('/clusters/1/upstreams')
    })
  })

  describe('search/sort clears selection (D9)', () => {
    it('clears selectedUpstreamKeys and selectedUpstream when search param changes', async () => {
      const cluster = makeCluster({
        upstreams: [makeUpstream({ id: 1 })],
        selectedUpstream: makeUpstream({ id: 1 }),
        selectedUpstreamKeys: [1],
      })
      const { loadUpstreams } = await makeComposable(cluster)
      await loadUpstreams(cluster)
      cluster.upstreamsSearch = 'a'
      await loadUpstreams(cluster)
      expect(cluster.selectedUpstreamKeys).toEqual([])
      expect(cluster.selectedUpstream).toBeNull()
    })

    it('keeps selection when search param unchanged', async () => {
      const cluster = makeCluster({
        upstreams: [makeUpstream({ id: 1 })],
        selectedUpstreamKeys: [1],
      })
      const { loadUpstreams } = await makeComposable(cluster)
      await loadUpstreams(cluster)
      await loadUpstreams(cluster)
      expect(cluster.selectedUpstreamKeys).toEqual([1])
    })

    it('clears selection when sort param changes', async () => {
      const cluster = makeCluster({
        upstreams: [makeUpstream({ id: 1 })],
        selectedUpstream: makeUpstream({ id: 1 }),
        selectedUpstreamKeys: [1],
        upstreamsSortBy: 'name',
        upstreamsSortOrder: 'asc',
      })
      const { handleUpstreamTableChange } = await makeComposable(cluster)
      cluster.upstreamsSortBy = 'created_at'
      cluster.upstreamsSortOrder = 'desc'
      handleUpstreamTableChange(cluster, { current: 1, pageSize: 20 }, { field: 'created_at', order: 'descend' })
      expect(cluster.selectedUpstreamKeys).toEqual([])
      expect(cluster.selectedUpstream).toBeNull()
    })

    it('keeps selection when only page changes (pagination preserve)', async () => {
      const cluster = makeCluster({
        upstreams: [makeUpstream({ id: 1 })],
        selectedUpstreamKeys: [1],
        upstreamsPagination: { total: 50, page: 1, pageSize: 20 },
      })
      const { handleUpstreamTableChange } = await makeComposable(cluster)
      handleUpstreamTableChange(cluster, { current: 2, pageSize: 20 }, {})
      expect(cluster.selectedUpstreamKeys).toEqual([1])
    })
  })
})

describe('useClusterUpstreams copy', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('allUpstreamActionButtons 含 copy，defaultActions 含 copy', async () => {
    const cluster = makeCluster()
    const { allUpstreamActionButtons, upstreamActionsSelected } = await makeComposable(cluster)
    expect(allUpstreamActionButtons.map((b: any) => b.key)).toContain('copy')
    expect(allUpstreamActionButtons.find((b: any) => b.key === 'copy')?.title).toBe('复制')
    expect(upstreamActionsSelected.value).toContain('copy')
  })
})

// 表单相关用例（copyUpstreamByRecord / showAddUpstreamModal / editUpstreamByRecord / handleUpstreamSubmit /
// 校验切 Tab / 误关保护 / 保存后发布引导 / 权重文案）已删除：表单与提交已迁至共享组件
// components/UpstreamFormModal.vue（B1），行为覆盖见 components/__tests__/UpstreamFormModal.test.ts。
describe('useClusterUpstreams 勾选同步单选 rows[0] 守卫 (4.1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('勾选 1 行但 rows[0] 缺失（跨页勾选）：不写单选，保留既有单选', async () => {
    const cluster = makeCluster({ selectedUpstream: makeUpstream({ id: 1 }) })
    const { selectUpstreams } = await makeComposable(cluster)
    selectUpstreams(cluster, [9], [])
    expect(cluster.selectedUpstreamKeys).toEqual([9])
    expect(cluster.selectedUpstream).not.toBeNull()
    expect(cluster.selectedUpstream?.id).toBe(1)
  })

  it('勾选 1 行、此前无单选且 rows[0] 缺失：单选保持空（单选按钮维持禁用）', async () => {
    const cluster = makeCluster()
    const { selectUpstreams } = await makeComposable(cluster)
    selectUpstreams(cluster, [9], [])
    expect(cluster.selectedUpstreamKeys).toEqual([9])
    expect(cluster.selectedUpstream).toBeNull()
  })
})

describe('useClusterUpstreams targets 列与发布状态 (2.7/4.2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('allUpstreamColumns 补目标节点列，位于负载均衡之后', async () => {
    const cluster = makeCluster()
    const { allUpstreamColumns } = await makeComposable(cluster)
    const keys = allUpstreamColumns.map((col: { key: string }) => col.key)
    expect(keys).toContain('targets')
    expect(keys.indexOf('targets')).toBeGreaterThan(keys.indexOf('load_balance'))
  })

  it('发布状态列消费 pending_publish / last_publish_status', async () => {
    const cluster = makeCluster()
    const { allUpstreamColumns } = await makeComposable(cluster)
    const col = allUpstreamColumns.find((c: { key: string }) => c.key === 'publish_status')
    const vnode = col.customRender({
      record: {
        current_version: 3,
        published_at: '2026-01-01T00:00:00Z',
        pending_publish: true,
        last_publish_status: null,
      },
    })
    expect(vnode.props).toMatchObject({ version: 3, pending: true, lastPublishStatus: null })
    const partial = col.customRender({
      record: { current_version: 3, published_at: null, pending_publish: false, last_publish_status: 'partial' },
    })
    expect(partial.props).toMatchObject({ version: 3, pending: false, lastPublishStatus: 'partial' })
  })
})

/**
 * 列顺序/列宽个性化（cluster-tab-column-personalization 3.1）：
 * 存储顺序重排 → 显隐过滤 → 宽度覆盖，三段同序（与节点 Tab 同构）。
 */
describe('useClusterUpstreams 列顺序与列宽', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpstreamColumnWidths.value = {}
    mockUpstreamColumnOrder.value = []
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('默认档：无偏好时按默认顺序，无宽列补默认宽度', async () => {
    const { visibleUpstreamColumns } = await makeComposable(makeCluster())
    const cols = visibleUpstreamColumns.value as any[]
    // 桩内 columnsSelected 为 ['name','load_balance','targets','version','actions']（version 非真实列，被过滤）
    expect(cols.map((c) => c.key)).toEqual(['name', 'load_balance', 'targets', 'actions'])
    expect(cols.find((c) => c.key === 'name').width).toBe(180)
    expect(cols.find((c) => c.key === 'actions').width).toBe(120)
  })

  it('列顺序：用户顺序优先，未知 key 剔除，未定位列留在设计位（route-column-reorder-fix）', async () => {
    // 存储序 [actions, name]：两列填回各自槽位（name→0、actions→末），未定位的 load_balance/targets 不动
    mockUpstreamColumnOrder.value = ['actions', 'ghost', 'name', 'actions']
    const { visibleUpstreamColumns } = await makeComposable(makeCluster())
    expect((visibleUpstreamColumns.value as any[]).map((c) => c.key)).toEqual([
      'actions',
      'load_balance',
      'targets',
      'name',
    ])
  })

  it('列宽：覆盖值优先于默认档', async () => {
    mockUpstreamColumnWidths.value = { name: 320 }
    const { visibleUpstreamColumns } = await makeComposable(makeCluster())
    expect((visibleUpstreamColumns.value as any[]).find((c) => c.key === 'name').width).toBe(320)
  })
})
