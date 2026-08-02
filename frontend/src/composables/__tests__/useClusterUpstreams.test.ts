import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster, Upstream, Route } from '@/types'

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
    actionsSelected: ref(['edit', 'delete', 'publish', 'version']),
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
  const currentClusterId = ref<number | null>(null)
  return useClusterUpstreams({
    clusters: computed(() => clusters.value),
    currentClusterId,
    versionModalVisible: ref(false),
    versionModalType: ref('upstream'),
    versionModalResourceId: ref(null),
    versionModalClusterId: ref(null),
    versionModalResourceName: ref(''),
    versionModalEdgeUuid: ref(''),
    openPublishModal: async () => [],
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
        upstreams: [makeUpstream({ id: 1, name: 'a' }), makeUpstream({ id: 2, name: 'b' }), makeUpstream({ id: 3, name: 'c' })],
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
        field: 'upstream_ids', label: '上游', nameField: 'upstream_name', keys: [1, 2],
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
