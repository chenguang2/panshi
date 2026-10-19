import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster, Route } from '@/types'

const mockApiGet = vi.fn()
const mockApiDelete = vi.fn()
const mockExecuteDeleteWithProgress = vi.fn()
const mockShowDeleteConfirm = vi.fn()

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

vi.mock('@/composables/useColumnConfig', () => ({
  useColumnConfig: () => ({
    popoverVisible: ref(false),
    columnsSelected: ref(['name', 'uri', 'publish_status', 'priority', 'actions']),
    searchVisible: ref(true),
    actionsSelected: ref(['copy', 'edit', 'delete', 'publish', 'version']),
  }),
}))

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

async function makeComposable(cluster: Cluster) {
  const { useClusterRoutes } = await import('../useClusterRoutes')
  const clusters = ref<Cluster[]>([cluster])
  const currentClusterId = ref<number | null>(null)
  const result = useClusterRoutes({
    clusters: computed(() => clusters.value),
    currentClusterId,
    openPublishModal: async () => [],
    showDeleteConfirm: (opts: any) => mockShowDeleteConfirm(opts),
    loadPluginConfigs: async () => {},
    availablePlugins: ref([]),
    loadAvailablePlugins: async () => {},
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

describe('useClusterRoutes 复制/新建表单脏状态（batch1 组1）', () => {
  const routeA = {
    id: 1,
    edge_uuid: 'ea',
    cluster_id: 1,
    name: 'route-a',
    uri: '/a',
    priority: 1,
    status: 1,
    methods: 'GET',
    plugins: [],
    enable_websocket: true,
    plugin_config_ids: ['pg-a'],
  }
  const routeB = {
    id: 2,
    edge_uuid: 'eb',
    cluster_id: 1,
    name: 'route-b',
    uri: '/b',
    priority: 2,
    status: 0,
    methods: 'POST',
    plugins: [],
    enable_websocket: false,
    plugin_config_ids: ['pg-b'],
  }
  const routeC = {
    id: 3,
    edge_uuid: 'ec',
    cluster_id: 1,
    name: 'route-c',
    uri: '/c',
    priority: 3,
    status: 1,
    methods: 'PUT',
    plugins: [],
    enable_websocket: true,
    plugin_config_ids: undefined,
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters/1/routes') return Promise.resolve({ data: { total: 3, items: [routeA, routeB, routeC] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (/\/routes\/\d+\/plugins$/.test(url)) return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('先编辑带插件组/WS 的路由 A，再复制路由 B：两字段来自 B 而非 A（脏状态不泄漏）', async () => {
    const cluster = makeCluster()
    const c = await makeComposable(cluster)
    // 前次编辑会话：回填 A 的 WS/插件组脏状态
    await c.editRouteByRecord(cluster, routeA)
    expect(c.routeForm.enableWebsocket).toBe(true)
    expect(c.routeForm.plugin_config_ids).toEqual(['pg-a'])
    // 复制 B：两字段必须整体来自 B
    await c.copyRouteByRecord(cluster, routeB)
    expect(c.routeForm.enableWebsocket).toBe(false)
    expect(c.routeForm.plugin_config_ids).toEqual(['pg-b'])
    // 副本 status 沿用源路由既有赋值（已裁决：源禁用则副本禁用，不改写）
    expect(c.routeForm.status).toBe(routeB.status)
  })

  it('复制开 WS 且无插件组的路由：正向回填 true/空数组（缺省回填不残留）', async () => {
    const cluster = makeCluster()
    const c = await makeComposable(cluster)
    await c.editRouteByRecord(cluster, routeB)
    expect(c.routeForm.enableWebsocket).toBe(false)
    expect(c.routeForm.plugin_config_ids).toEqual(['pg-b'])
    await c.copyRouteByRecord(cluster, routeC)
    expect(c.routeForm.enableWebsocket).toBe(true)
    expect(c.routeForm.plugin_config_ids).toEqual([])
  })

  it('同会话点「添加路由」：新建表单 enableWebsocket 重置为 false（A1 新建路径 WS 泄漏）', async () => {
    const cluster = makeCluster()
    const c = await makeComposable(cluster)
    await c.editRouteByRecord(cluster, routeA)
    expect(c.routeForm.enableWebsocket).toBe(true)
    await c.showAddRouteModal(cluster)
    expect(c.routeForm.enableWebsocket).toBe(false)
    expect(c.routeForm.plugin_config_ids).toEqual([])
  })
})

// ── Tab 开表单不强制重载（batch1 7.7，C4）──────────────────────────────────
// editRouteByRecord / copyRouteByRecord / showAddRouteModal 直接按 record/初始态填充，
// 移除前置 await loadRoutes；「列表找不到记录」兜底统一为「重载一次 → 再找不到才提示」
//（copy 不再拿旧 record 兜底，与 edit 同语义）。

describe('useClusterRoutes Tab 开表单不强制重载（batch1 7.7）', () => {
  let listItems: Record<string, unknown>[] = []

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    listItems = []
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters/1/routes') return Promise.resolve({ data: { total: listItems.length, items: listItems } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (/\/routes\/\d+\/plugins$/.test(url)) return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  function listCalls(): number {
    return mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/clusters/1/routes').length
  }

  it('editRouteByRecord：记录已在列表中 → 不发列表重载请求，直接回填打开', async () => {
    const record = makeRoute({ id: 1, name: 'r1' })
    const cluster = makeCluster({ routes: [record] })
    const c = await makeComposable(cluster)

    await c.editRouteByRecord(cluster, record)

    expect(listCalls()).toBe(0)
    expect(c.routeModalVisible.value).toBe(true)
    expect(c.routeForm.name).toBe('r1')
  })

  it('copyRouteByRecord：记录已在列表中 → 不发列表重载请求，回填来自记录本身', async () => {
    const record = makeRoute({ id: 2, name: 'r2' })
    const cluster = makeCluster({ routes: [record] })
    const c = await makeComposable(cluster)

    await c.copyRouteByRecord(cluster, record)

    expect(listCalls()).toBe(0)
    expect(c.routeModalVisible.value).toBe(true)
    expect(c.routeForm.name).toBe('复制_r2')
  })

  it('showAddRouteModal：新建不发列表重载请求', async () => {
    const cluster = makeCluster()
    const c = await makeComposable(cluster)

    await c.showAddRouteModal(cluster)

    expect(listCalls()).toBe(0)
    expect(c.routeModalVisible.value).toBe(true)
  })

  it('记录缺失（edit/copy 同语义）：重载一次后找到 → 正常打开并回填', async () => {
    const record = makeRoute({ id: 9, name: 'late' })
    const cluster = makeCluster()
    const c = await makeComposable(cluster)
    listItems = [record]

    await c.editRouteByRecord(cluster, record)
    expect(listCalls()).toBe(1)
    expect(c.routeModalVisible.value).toBe(true)
    expect(c.routeForm.name).toBe('late')

    const c2 = await makeComposable(cluster)
    await c2.copyRouteByRecord(cluster, record)
    // edit 的兜底重载已把记录写入 cluster.routes，copy 直接命中，无需二次重载
    expect(listCalls()).toBe(1)
    expect(c2.routeModalVisible.value).toBe(true)
    expect(c2.routeForm.name).toBe('复制_late')
  })

  it('记录缺失且重载后仍找不到：不开表单（edit/copy 同语义，copy 不再拿旧 record 兜底）', async () => {
    const stale = makeRoute({ id: 404, name: 'stale' })
    const cluster = makeCluster()
    const c = await makeComposable(cluster)

    await c.editRouteByRecord(cluster, stale)
    expect(listCalls()).toBe(1)
    expect(c.routeModalVisible.value).toBe(false)

    const c2 = await makeComposable(cluster)
    await c2.copyRouteByRecord(cluster, stale)
    expect(listCalls()).toBe(2)
    expect(c2.routeModalVisible.value).toBe(false)
  })
})

describe('useClusterRoutes websocket submit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('handleRouteSubmit 发送 enable_websocket=false（取消勾选清除 DB 值）', async () => {
    const cluster = makeCluster({ id: 1 })
    const { handleRouteSubmit, routeForm, editingRoute, routeFormRef, _currentClusterId } =
      await makeComposable(cluster)
    const mockPut = vi.fn().mockResolvedValue({ data: { id: 1 } })
    // 覆写 api.put 捕获 payload
    const { default: api } = await import('@/api')
    ;(api.put as any) = mockPut
    // routeFormRef 绑定到 mock 元素，跳过真实 validate
    routeFormRef.value = { validate: async () => true } as any
    _currentClusterId.value = cluster.id
    // 模拟编辑路由，取消 websocket
    routeForm.value = {
      name: 'ws-route',
      uri: '/ws',
      methods: ['GET'],
      priority: 0,
      status: 1,
      upstream_id: 1,
      description: '',
      enableWebsocket: false,
      advancedMatchEnabled: false,
      advancedMatch: { vars: [] },
      plugins: [],
      plugin_config_ids: [],
    }
    editingRoute.value = {
      id: 1,
      edge_uuid: 'e',
      cluster_id: 1,
      name: 'ws-route',
      uri: '/ws',
      priority: 0,
      status: 1,
    } as any

    await handleRouteSubmit()
    const payload = mockPut.mock.calls[0][1]
    expect(payload.enable_websocket).toBe(false)
  })
})
