import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster, Route } from '@/types'

const mockApiGet = vi.fn()
const mockApiDelete = vi.fn()
const mockExecuteDeleteWithProgress = vi.fn()
const mockShowDeleteConfirm = vi.fn()

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: vi.fn(),
  executeDeleteWithProgress: (...args: any[]) => mockExecuteDeleteWithProgress(...args),
  publishStatusRender: () => '',
  formatPublishDateTime: () => '',
}))

// 列个性化桩：顺序/宽度用可写 ref 暴露，测试直接驱动（真实 localStorage 由 useColumnConfig 单测覆盖）
const mockRouteColumnWidths = ref<Record<string, number>>({})
const mockRouteColumnOrder = ref<string[]>([])
const mockRouteColumnsSelected = ref(['name', 'uri', 'publish_status', 'priority', 'actions'])

vi.mock('@/composables/useColumnConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useColumnConfig')>()
  return {
    ...actual, // resolveOrderedColumns / applyColumnWidths 走真实实现
    useColumnConfig: () => ({
      popoverVisible: ref(false),
      columnsSelected: mockRouteColumnsSelected,
      searchVisible: ref(true),
      actionsSelected: ref(['copy', 'edit', 'delete', 'publish', 'version']),
      columnWidths: mockRouteColumnWidths,
      setColumnWidth: vi.fn(),
      resetWidths: vi.fn(),
      columnOrder: mockRouteColumnOrder,
      setColumnOrder: vi.fn(),
    }),
  }
})

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 1,
    edge_uuid: 'edge-1',
    cluster_id: 1,
    name: 'route-1',
    uri: '/a',
    priority: 100,
    status: 1,
    plugins: [],
    ...overrides,
  }
}

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 1,
    name: 'cluster-1',
    activeTab: 'routes',
    routes: [],
    routesPagination: { total: 0, page: 1, pageSize: 20 },
    routesSearch: '',
    routesSearchField: '',
    routesSortBy: '',
    routesSortOrder: 'asc',
    selectedRoute: null,
    selectedRouteKeys: [],
    nodes: [],
    ...overrides,
  } as Cluster
}

async function makeComposable(cluster: Cluster, publishNodeIds: number[] = []) {
  const { useClusterRoutes } = await import('../useClusterRoutes')
  const clusters = ref<Cluster[]>([cluster])
  const currentClusterId = ref<number | null>(null)
  const result = useClusterRoutes({
    clusters: computed(() => clusters.value),
    currentClusterId,
    openPublishModal: async () => publishNodeIds,
    showDeleteConfirm: (opts: any) => mockShowDeleteConfirm(opts),
    loadPluginConfigs: async () => {},
    versionModalVisible: ref(false),
    versionModalType: ref('route'),
    versionModalResourceId: ref(null),
    versionModalClusterId: ref(null),
    versionModalResourceName: ref(''),
    versionModalEdgeUuid: ref(''),
  })
  return { ...result, _currentClusterId: currentClusterId }
}

describe('useClusterRoutes batch selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  describe('selectRoutes', () => {
    it('sets selectedRouteKeys and clears selectedRoute when zero keys', async () => {
      const cluster = makeCluster({ selectedRoute: makeRoute({ id: 5 }) })
      const { selectRoutes } = await makeComposable(cluster)
      selectRoutes(cluster, [], [])
      expect(cluster.selectedRouteKeys).toEqual([])
      expect(cluster.selectedRoute).toBeNull()
    })

    it('sets selectedRoute to the single checked row', async () => {
      const cluster = makeCluster()
      const r1 = makeRoute({ id: 1 })
      const { selectRoutes } = await makeComposable(cluster)
      selectRoutes(cluster, [1], [r1])
      expect(cluster.selectedRouteKeys).toEqual([1])
      expect(cluster.selectedRoute).toBe(r1)
    })

    it('clears selectedRoute when two or more rows checked', async () => {
      const cluster = makeCluster({ selectedRoute: makeRoute({ id: 9 }) })
      const r1 = makeRoute({ id: 1 })
      const r2 = makeRoute({ id: 2 })
      const { selectRoutes } = await makeComposable(cluster)
      selectRoutes(cluster, [1, 2], [r1, r2])
      expect(cluster.selectedRouteKeys).toEqual([1, 2])
      expect(cluster.selectedRoute).toBeNull()
    })
  })

  describe('isDnsRoute', () => {
    it('returns true when route has dns_upstream plugin', async () => {
      const { isDnsRoute } = await makeComposable(makeCluster())
      expect(isDnsRoute(makeRoute({ plugins: [{ plugin_name: 'dns_upstream', config: '{}' }] }))).toBe(true)
    })

    it('returns false for normal plugins', async () => {
      const { isDnsRoute } = await makeComposable(makeCluster())
      expect(isDnsRoute(makeRoute({ plugins: [{ plugin_name: 'limit-req', config: '{}' }] }))).toBe(false)
    })

    it('returns false when plugins is empty or missing', async () => {
      const { isDnsRoute } = await makeComposable(makeCluster())
      expect(isDnsRoute(makeRoute({ plugins: [] }))).toBe(false)
      expect(isDnsRoute(makeRoute({ plugins: undefined }))).toBe(false)
    })
  })

  describe('single delete DNS guard', () => {
    it('blocks single delete of DNS route', async () => {
      const cluster = makeCluster()
      const dnsRoute = makeRoute({ id: 3, name: 'dns-route', plugins: [{ plugin_name: 'dns_upstream', config: '{}' }] })
      const { deleteRouteByRecord } = await makeComposable(cluster)
      deleteRouteByRecord(cluster, dnsRoute)
      expect(mockShowDeleteConfirm).not.toHaveBeenCalled()
    })

    it('allows single delete of normal route', async () => {
      const cluster = makeCluster()
      const { deleteRouteByRecord } = await makeComposable(cluster)
      deleteRouteByRecord(cluster, makeRoute({ id: 1 }))
      expect(mockShowDeleteConfirm).toHaveBeenCalled()
    })
  })

  describe('deleteRoutes', () => {
    it('composes title with up to 3 names fully', async () => {
      const cluster = makeCluster({
        routes: [makeRoute({ id: 1, name: 'a' }), makeRoute({ id: 2, name: 'b' }), makeRoute({ id: 3, name: 'c' })],
        selectedRouteKeys: [1, 2, 3],
      })
      const { deleteRoutes } = await makeComposable(cluster)
      deleteRoutes(cluster)
      expect(mockShowDeleteConfirm).toHaveBeenCalledTimes(1)
      const opts = mockShowDeleteConfirm.mock.calls[0][0]
      expect(opts.title).toContain('a')
      expect(opts.title).toContain('b')
      expect(opts.title).toContain('c')
      expect(opts.title).not.toContain('等')
    })

    it('truncates title with 等 N 条 when more than 3 routes', async () => {
      const cluster = makeCluster({
        routes: [1, 2, 3, 4, 5].map((id) => makeRoute({ id, name: `r${id}` })),
        selectedRouteKeys: [1, 2, 3, 4, 5],
      })
      const { deleteRoutes } = await makeComposable(cluster)
      deleteRoutes(cluster)
      const opts = mockShowDeleteConfirm.mock.calls[0][0]
      expect(opts.title).toContain('等 5 条')
      expect(opts.title).toContain('r1')
      expect(opts.title).not.toContain('r4')
    })

    it('blocks batch delete when selection contains DNS route', async () => {
      const cluster = makeCluster({
        routes: [
          makeRoute({ id: 1, name: 'a' }),
          makeRoute({ id: 2, name: 'dns', plugins: [{ plugin_name: 'dns_upstream', config: '{}' }] }),
        ],
        selectedRouteKeys: [1, 2],
      })
      const { deleteRoutes } = await makeComposable(cluster)
      deleteRoutes(cluster)
      expect(mockShowDeleteConfirm).not.toHaveBeenCalled()
    })

    it('calls executeDeleteWithProgress with resourceKey on confirm', async () => {
      const cluster = makeCluster({
        routes: [makeRoute({ id: 1, name: 'a' }), makeRoute({ id: 2, name: 'b' })],
        selectedRouteKeys: [1, 2],
        nodes: [{ id: 10, ip: '1.1.1.1', management_port: 9180 }],
      })
      const { deleteRoutes } = await makeComposable(cluster)
      deleteRoutes(cluster)
      const opts = mockShowDeleteConfirm.mock.calls[0][0]
      await opts.onOk(true, true, [10])
      expect(mockExecuteDeleteWithProgress).toHaveBeenCalledTimes(1)
      const progressOpts = mockExecuteDeleteWithProgress.mock.calls[0][0]
      expect(progressOpts.resourceKey).toEqual({
        field: 'route_ids',
        label: '路由',
        nameField: 'route_name',
        keys: [1, 2],
      })
      expect(progressOpts.apiEndpoint).toBe('/clusters/1/routes')
    })
  })

  describe('search/sort clears selection (D9)', () => {
    it('clears selectedRouteKeys and selectedRoute when search param changes', async () => {
      const cluster = makeCluster({
        selectedRouteKeys: [1, 2],
        selectedRoute: makeRoute({ id: 1 }),
      })
      const { loadRoutes } = await makeComposable(cluster)
      await loadRoutes(cluster)
      cluster.routesSearch = 'foo'
      await loadRoutes(cluster)
      expect(cluster.selectedRouteKeys).toEqual([])
      expect(cluster.selectedRoute).toBeNull()
    })

    it('keeps selection when search param unchanged', async () => {
      const cluster = makeCluster({
        selectedRouteKeys: [1, 2],
        selectedRoute: makeRoute({ id: 1 }),
      })
      const { loadRoutes } = await makeComposable(cluster)
      await loadRoutes(cluster)
      expect(cluster.selectedRouteKeys).toEqual([1, 2])
      expect(cluster.selectedRoute).not.toBeNull()
    })

    it('clears selection when sort param changes', async () => {
      const cluster = makeCluster({
        selectedRouteKeys: [1, 2],
        routesSortBy: '',
      })
      const { loadRoutes, handleRouteTableChange } = await makeComposable(cluster)
      await loadRoutes(cluster)
      handleRouteTableChange(cluster, { current: 1, pageSize: 20 }, { field: 'priority', order: 'ascend' })
      expect(cluster.selectedRouteKeys).toEqual([])
    })
  })
})

// 表单相关用例（复制/新建脏状态、开表单不重载、handleRouteSubmit websocket/校验/发布引导）已删除：
// 表单与提交已迁至共享组件 components/RouteFormModal.vue（B1），
// 行为覆盖见 components/__tests__/RouteFormModal.test.ts。

/**
 * 列顺序/列宽个性化（cluster-tab-column-personalization 4.1）：
 * 10 列全量参与重排，无宽列补默认档（fixed 布局下限）。
 */
describe('useClusterRoutes 列顺序与列宽', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteColumnWidths.value = {}
    mockRouteColumnOrder.value = []
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('默认档：无偏好时按默认顺序，无宽列补默认宽度', async () => {
    const { visibleRouteColumns } = await makeComposable(makeCluster())
    const cols = visibleRouteColumns.value as any[]
    expect(cols.map((c) => c.key)).toEqual(['name', 'uri', 'priority', 'publish_status', 'actions'])
    expect(cols.find((c) => c.key === 'name').width).toBe(160)
  })

  beforeEach(() => {
    mockRouteColumnOrder.value = []
    mockRouteColumnsSelected.value = ['name', 'uri', 'publish_status', 'priority', 'actions']
  })

  it('列顺序：用户顺序优先，未知 key 剔除，未定位列留在设计位（route-column-reorder-fix）', async () => {
    // 存储序 [actions, uri]：两列填回各自槽位（uri→1、actions→末），未定位的 name/priority/publish_status 不动
    mockRouteColumnOrder.value = ['actions', 'uri', 'ghost']
    const { visibleRouteColumns } = await makeComposable(makeCluster())
    expect((visibleRouteColumns.value as any[]).map((c) => c.key)).toEqual([
      'name',
      'actions',
      'priority',
      'publish_status',
      'uri',
    ])
  })

  it('列顺序：启用非默认列（方法/上游）不被甩到操作列之后', async () => {
    // 旧版 setColumnOrder 按 defaultColumns 清洗，残缺顺序让 methods/upstream_id 追加到 actions 之后
    mockRouteColumnOrder.value = ['name', 'uri', 'priority', 'publish_status', 'actions']
    mockRouteColumnsSelected.value = ['name', 'uri', 'methods', 'upstream_id', 'publish_status', 'priority', 'actions']
    const { visibleRouteColumns } = await makeComposable(makeCluster())
    expect((visibleRouteColumns.value as any[]).map((c) => c.key)).toEqual([
      'name',
      'uri',
      'methods',
      'upstream_id',
      'priority',
      'publish_status',
      'actions',
    ])
  })

  it('列宽：覆盖值优先于默认档', async () => {
    mockRouteColumnWidths.value = { uri: 360 }
    const { visibleRouteColumns } = await makeComposable(makeCluster())
    expect((visibleRouteColumns.value as any[]).find((c) => c.key === 'uri').width).toBe(360)
  })
})
