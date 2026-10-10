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

vi.mock('@/composables/useColumnConfig', () => ({
  useColumnConfig: () => ({
    popoverVisible: ref(false),
    columnsSelected: ref(['name', 'load_balance', 'targets', 'version', 'actions']),
    searchVisible: ref(true),
    actionsSelected: ref(['copy', 'edit', 'delete', 'publish', 'version']),
  }),
}))

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

  it('copyUpstreamByRecord 设 copyingUpstream/editingUpstream/name/打开弹窗', async () => {
    const cluster = makeCluster({ id: 1 })
    const { copyUpstreamByRecord, copyingUpstream, editingUpstream, upstreamForm, upstreamModalVisible } =
      await makeComposable(cluster)
    const source = makeUpstream({ id: 3, name: 'svc-a', load_balance: 'chash', description: 'desc-a' }) as any
    mockApiGet.mockResolvedValue({ data: { total: 1, items: [source] } })
    await copyUpstreamByRecord(cluster, source)
    expect(copyingUpstream.value).toBe(true)
    expect(editingUpstream.value).toBeNull()
    expect(upstreamForm.name).toBe('复制_svc-a')
    expect(upstreamModalVisible.value).toBe(true)
  })

  it('copyUpstreamByRecord 填充 targets 深拷贝新 key', async () => {
    const cluster = makeCluster({ id: 1 })
    const { copyUpstreamByRecord, upstreamForm } = await makeComposable(cluster)
    const source = makeUpstream({
      id: 3,
      name: 'svc-a',
      load_balance: 'weighted_roundrobin',
      targets: [{ target: '10.0.0.1:8080', weight: 100 }],
    }) as any
    mockApiGet.mockResolvedValue({ data: { total: 1, items: [source] } })
    await copyUpstreamByRecord(cluster, source)
    expect(upstreamForm.targets.length).toBe(1)
    expect(upstreamForm.targets[0].host).toBe('10.0.0.1')
    expect(upstreamForm.targets[0].port).toBe(8080)
    expect(upstreamForm.targets[0].weight).toBe(100)
    // 深拷贝：修改表单不影响源
    upstreamForm.targets[0].host = 'changed'
    expect((source.targets as any)[0].target).toBe('10.0.0.1:8080')
  })

  it('copyUpstreamByRecord 填充高级配置 + toggle 状态', async () => {
    const cluster = makeCluster({ id: 1 })
    const { copyUpstreamByRecord, upstreamForm, toggleChecks, toggleTimeout } = await makeComposable(cluster)
    const source = makeUpstream({
      id: 3,
      name: 'svc-a',
      load_balance: 'weighted_roundrobin',
      checks: { active: { type: 'http' }, passive: {} },
      timeout: { connect: 5, send: 5, read: 5 },
    }) as any
    mockApiGet.mockResolvedValue({ data: { total: 1, items: [source] } })
    await copyUpstreamByRecord(cluster, source)
    expect(toggleChecks.value).toBe(true)
    expect(toggleTimeout.value).toBe(true)
    expect(upstreamForm.checks).toEqual({ active: { type: 'http' }, passive: {} })
    expect(upstreamForm.timeout).toEqual({ connect: 5, send: 5, read: 5 })
  })
})

describe('useClusterUpstreams copy 操作入口与复位', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('handleUpstreamAction 的 copy 调用 copyUpstreamByRecord', async () => {
    const cluster = makeCluster({ id: 1 })
    const { handleUpstreamAction, copyingUpstream, upstreamForm, upstreamModalVisible } = await makeComposable(cluster)
    const source = makeUpstream({ id: 3, name: 'svc-a' }) as any
    mockApiGet.mockResolvedValue({ data: { total: 1, items: [source] } })
    // handleUpstreamAction 同步调用 copyUpstreamByRecord（async），等待其完成
    const p = handleUpstreamAction(cluster, source, 'copy')
    await Promise.resolve()
    await Promise.resolve()
    expect(copyingUpstream.value).toBe(true)
    expect(upstreamForm.name).toBe('复制_svc-a')
    expect(upstreamModalVisible.value).toBe(true)
  })

  it('showAddUpstreamModal 复位 copyingUpstream', async () => {
    const cluster = makeCluster({ id: 1 })
    const { showAddUpstreamModal, copyingUpstream, upstreamForm } = await makeComposable(cluster)
    // 先模拟复制状态
    copyingUpstream.value = true
    upstreamForm.name = '复制_残留'
    await showAddUpstreamModal(cluster)
    expect(copyingUpstream.value).toBe(false)
    expect(upstreamForm.name).toBe('')
  })

  it('editUpstreamByRecord 复位 copyingUpstream', async () => {
    const cluster = makeCluster({ id: 1 })
    const { editUpstreamByRecord, copyingUpstream, upstreamForm } = await makeComposable(cluster)
    copyingUpstream.value = true
    upstreamForm.name = '复制_残留'
    const u = makeUpstream({ id: 3, name: 'svc-a' })
    await editUpstreamByRecord(cluster, u)
    expect(copyingUpstream.value).toBe(false)
    expect(upstreamForm.name).toBe('svc-a')
  })
})

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

  it('勾选 1 行后编辑上游不再误报「请先选择一个上游」', async () => {
    const cluster = makeCluster()
    const c = await makeComposable(cluster)
    const u = makeUpstream({ id: 7, name: 'svc' })
    c.selectUpstreams(cluster, [7], [u])
    expect(cluster.selectedUpstream).toEqual(u)
    await c.editUpstream(cluster)
    expect(mockMessageWarning).not.toHaveBeenCalled()
    expect(c.upstreamModalVisible.value).toBe(true)
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

describe('useClusterUpstreams 校验失败自动切 Tab (4.3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('基础配置校验失败：切回基础 Tab 且不提交', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    await c.showAddUpstreamModal(cluster) // 先开表单，注入 currentClusterId
    c.upstreamModalActiveTab.value = 'advanced'
    c.upstreamFormRef.value = { validate: () => Promise.reject(new Error('validation failed')) }
    await c.handleUpstreamSubmit()
    expect(c.upstreamModalActiveTab.value).toBe('basic')
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('高级配置校验失败：切到高级 Tab 且错误可见', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    await c.showAddUpstreamModal(cluster)
    c.upstreamFormRef.value = { validate: () => Promise.resolve() }
    c.upstreamForm.name = 'svc'
    c.upstreamForm.targets = [{ key: 1, host: '10.0.0.1', port: 80, weight: 100 }]
    c.toggleTimeout.value = true // jsdom 无 DOM 输入框 → readDomValue 取不到值 → 高级校验失败
    c.upstreamModalActiveTab.value = 'basic'
    await c.handleUpstreamSubmit()
    expect(c.upstreamModalActiveTab.value).toBe('advanced')
    expect(c.formErrors.timeout).toContain('请填写完整的超时配置')
    expect(mockApiPost).not.toHaveBeenCalled()
  })
})

describe('useClusterUpstreams 误关保护 (4.4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('无修改直接关闭，不出确认', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    await c.editUpstreamByRecord(cluster, makeUpstream({ id: 3, name: 'svc-a' }))
    expect(c.upstreamModalVisible.value).toBe(true)
    c.closeUpstreamModal()
    expect(c.upstreamModalVisible.value).toBe(false)
    expect(mockShowOverlayModal).not.toHaveBeenCalled()
  })

  it('有修改时确认「更改尚未保存，确定放弃？」，确认后才关闭', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    await c.editUpstreamByRecord(cluster, makeUpstream({ id: 3, name: 'svc-a' }))
    c.upstreamForm.name = 'changed'
    c.closeUpstreamModal()
    expect(mockShowOverlayModal).toHaveBeenCalledTimes(1)
    const opts = mockShowOverlayModal.mock.calls[0][0]
    expect(String(opts.content)).toContain('更改尚未保存，确定放弃？')
    expect(c.upstreamModalVisible.value).toBe(true)
    opts.onOk()
    expect(c.upstreamModalVisible.value).toBe(false)
  })

  it('取消放弃则保持打开', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    await c.showAddUpstreamModal(cluster)
    c.upstreamForm.description = '用户输入'
    c.closeUpstreamModal()
    const opts = mockShowOverlayModal.mock.calls[0][0]
    opts.onCancel?.()
    expect(c.upstreamModalVisible.value).toBe(true)
  })

  it('复制表单同样受误关保护', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    const source = makeUpstream({ id: 3, name: 'svc-a' })
    mockApiGet.mockResolvedValue({ data: { total: 1, items: [source] } })
    await c.copyUpstreamByRecord(cluster, source)
    c.upstreamForm.name = '复制_改名'
    c.closeUpstreamModal()
    expect(mockShowOverlayModal).toHaveBeenCalledTimes(1)
  })
})

describe('useClusterUpstreams 保存后发布引导 (3.1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
    mockOpenPublishModal.mockResolvedValue([])
  })

  const prepareValidForm = async (c: Awaited<ReturnType<typeof makeComposable>>, cluster: Cluster) => {
    await c.showAddUpstreamModal(cluster) // 先开表单，注入 currentClusterId
    c.upstreamFormRef.value = { validate: () => Promise.resolve() }
    c.upstreamForm.name = 'svc'
    c.upstreamForm.targets = [{ key: 1, host: '10.0.0.1', port: 80, weight: 100 }]
  }

  it('编辑保存 toast 统一为「已保存。配置尚未发布…」并弹「稍后/立即发布」引导', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    await prepareValidForm(c, cluster)
    c.editingUpstream.value = makeUpstream({ id: 5, name: 'svc' })
    mockApiPut.mockResolvedValue({ data: { id: 5, name: 'svc' } })
    await c.handleUpstreamSubmit()
    expect(mockMessageSuccess).toHaveBeenCalledWith('已保存。配置尚未发布，需发布后才会在 Edge 节点生效')
    expect(mockShowOverlayModal).toHaveBeenCalledTimes(1)
    const opts = mockShowOverlayModal.mock.calls[0][0]
    expect(String(opts.content)).toContain('配置尚未发布，发布后才会推送到 Edge 节点生效')
    expect(opts.okText).toBe('立即发布')
    expect(opts.cancelText).toBe('稍后')
    expect(c.upstreamModalVisible.value).toBe(false)
    // 不自动发布
    expect(mockOpenPublishModal).not.toHaveBeenCalled()
  })

  it('「立即发布」对刚保存的上游走既有发布链路', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    await prepareValidForm(c, cluster)
    c.editingUpstream.value = makeUpstream({ id: 5, name: 'svc' })
    mockApiPut.mockResolvedValue({ data: { id: 5, name: 'svc' } })
    await c.handleUpstreamSubmit()
    const opts = mockShowOverlayModal.mock.calls[0][0]
    await opts.onOk()
    expect(mockOpenPublishModal).toHaveBeenCalledWith('发布上游: svc', 1)
  })

  it('新建保存同样出引导，发布目标是新建的上游', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    await prepareValidForm(c, cluster)
    c.editingUpstream.value = null
    mockApiPost.mockResolvedValue({ data: { id: 9, name: 'svc' } })
    await c.handleUpstreamSubmit()
    expect(mockMessageSuccess).toHaveBeenCalledWith('已保存。配置尚未发布，需发布后才会在 Edge 节点生效')
    const opts = mockShowOverlayModal.mock.calls[0][0]
    await opts.onOk()
    expect(mockOpenPublishModal).toHaveBeenCalledWith('发布上游: svc', 1)
  })

  it('保存失败不弹引导', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    await prepareValidForm(c, cluster)
    c.editingUpstream.value = makeUpstream({ id: 5, name: 'svc' })
    mockApiPut.mockRejectedValue({ response: { data: { detail: 'boom' } } })
    await c.handleUpstreamSubmit()
    expect(mockMessageError).toHaveBeenCalled()
    expect(mockShowOverlayModal).not.toHaveBeenCalled()
    expect(c.upstreamModalVisible.value).toBe(true)
  })
})

describe('useClusterUpstreams 权重错误文案 (4.5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('权重非法提示「权重需为 1-100 的整数」且不提交', async () => {
    const cluster = makeCluster({ id: 1 })
    const c = await makeComposable(cluster)
    await c.showAddUpstreamModal(cluster) // 先开表单，注入 currentClusterId
    c.upstreamFormRef.value = { validate: () => Promise.resolve() }
    c.upstreamForm.name = 'svc'
    c.upstreamForm.targets = [{ key: 1, host: '10.0.0.1', port: 80, weight: 200 }]
    c.upstreamModalActiveTab.value = 'advanced'
    await c.handleUpstreamSubmit()
    expect(c.targetValidation.value['0'].weight).toBe('权重需为 1-100 的整数')
    expect(c.upstreamModalActiveTab.value).toBe('basic')
    expect(mockApiPost).not.toHaveBeenCalled()
  })
})
