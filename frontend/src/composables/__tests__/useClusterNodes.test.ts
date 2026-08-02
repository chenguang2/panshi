import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster, Node } from '@/types'

const mockApiPost = vi.fn()
const mockApiGet = vi.fn()
const mockMessageSuccess = vi.fn()
const mockMessageError = vi.fn()
const mockShowBatchResultModal = vi.fn()
const mockShowDeleteConfirm = vi.fn()
const mockExecuteDeleteWithProgress = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('ant-design-vue', () => ({
  message: {
    success: (...args: any[]) => mockMessageSuccess(...args),
    error: (...args: any[]) => mockMessageError(...args),
    warning: vi.fn(),
  },
  Modal: { confirm: vi.fn() },
}))

vi.mock('@/composables/useClusterUtils', () => ({
  showDeleteConfirm: (...args: any[]) => mockShowDeleteConfirm(...args),
  executeDeleteWithProgress: (...args: any[]) => mockExecuteDeleteWithProgress(...args),
  buildDeleteProgressContent: () => '',
  showBatchResultModal: (...args: any[]) => mockShowBatchResultModal(...args),
}))

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 1,
    cluster_id: 1,
    ip: '10.0.0.1',
    service_port: 80,
    management_port: 9180,
    edge_path: '/edge/node1',
    edge_install_path: '',
    status: 1,
    ...overrides,
  }
}

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 1,
    name: 'cluster-1',
    nodes: [],
    nodesPagination: { total: 0, page: 1, pageSize: 20 },
    node_count: 0,
    ...overrides,
  } as Cluster
}

async function makeComposable(cluster: Cluster) {
  const { useClusterNodes } = await import('../useClusterNodes')
  const clusters = ref<Cluster[]>([cluster])
  return useClusterNodes({
    clusters: computed(() => clusters.value),
    onRefresh: vi.fn(),
  })
}

describe('useClusterNodes batch import', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  describe('copyNode', () => {
    it('opens add modal with node fields pre-filled and ip cleared', async () => {
      const cluster = makeCluster()
      const { copyNode, nodeForm, nodeModalVisible, editingNode } = await makeComposable(cluster)
      const source = makeNode({ id: 5, ip: '10.0.0.5', service_port: 8080, management_port: 9181, edge_path: '/edge/app', status: 0 })

      copyNode(cluster, source)

      expect(nodeModalVisible.value).toBe(true)
      expect(editingNode.value).toBeNull()
      expect(nodeForm.ip).toBe('')
      expect(nodeForm.service_port).toBe(8080)
      expect(nodeForm.management_port).toBe(9181)
      expect(nodeForm.edge_path).toBe('/edge/app')
      expect(nodeForm.status).toBe(0)
    })
  })

  describe('importNodes', () => {
    it('posts valid rows to batch endpoint and refreshes node_count', async () => {
      const cluster = makeCluster()
      const { importNodes } = await makeComposable(cluster)
      mockApiPost.mockResolvedValue({ data: { message: '成功创建 2 条，失败 1 条', results: [] } })
      mockApiGet.mockResolvedValue({ data: { total: 2, items: [makeNode(), makeNode({ id: 2, ip: '10.0.0.2' })] } })

      await importNodes(cluster, [
        { ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/edge/a', edge_install_path: '', status: 1, valid: true },
        { ip: '10.0.0.2', service_port: 80, management_port: 9180, edge_path: '/edge/b', edge_install_path: '', status: 1, valid: true },
        { ip: '10.0.0.3', service_port: 80, management_port: 9180, edge_path: '/edge/c', edge_install_path: '', status: 1, valid: false },
      ])

      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/batch', {
        nodes: [
          { ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/edge/a', edge_install_path: '', status: 1 },
          { ip: '10.0.0.2', service_port: 80, management_port: 9180, edge_path: '/edge/b', edge_install_path: '', status: 1 },
        ],
      })
      expect(mockMessageSuccess).toHaveBeenCalledWith(expect.stringContaining('成功创建 2 条'))
      expect(mockApiGet).toHaveBeenCalledWith('/clusters/1/nodes')
      expect(cluster.node_count).toBe(2)
    })

    it('does not call API when no valid rows', async () => {
      const cluster = makeCluster()
      const { importNodes } = await makeComposable(cluster)

      await importNodes(cluster, [
        { ip: 'bad', service_port: 80, management_port: 9180, edge_path: '/edge/a', edge_install_path: '', status: 1, valid: false },
      ])

      expect(mockApiPost).not.toHaveBeenCalled()
    })

    it('shows batch result modal with failure reasons when some nodes fail', async () => {
      const cluster = makeCluster()
      const { importNodes } = await makeComposable(cluster)
      mockApiPost.mockResolvedValue({
        data: {
          message: '成功创建 1 条，失败 1 条',
          results: [
            { ip: '10.0.0.1', status: 'success' },
            { ip: '10.0.0.2', status: 'failed', error: '该集群已存在相同 IP、Edge 路径与服务端口的节点' },
          ],
        },
      })
      mockApiGet.mockResolvedValue({ data: { total: 1, items: [makeNode()] } })

      await importNodes(cluster, [
        { ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/edge/a', edge_install_path: '', status: 1, valid: true },
        { ip: '10.0.0.2', service_port: 80, management_port: 9180, edge_path: '/edge/a', edge_install_path: '', status: 1, valid: true },
      ])

      expect(mockShowBatchResultModal).toHaveBeenCalledTimes(1)
      const modalArg = mockShowBatchResultModal.mock.calls[0][0]
      expect(modalArg).toContain('成功创建 1 条，失败 1 条')
      const items = mockShowBatchResultModal.mock.calls[0][1]
      expect(items).toHaveLength(2)
      expect(items[1]).toMatchObject({ ip: '10.0.0.2', status: 'failed', error: expect.stringContaining('已存在') })
    })

    it('does not show result modal when all nodes succeed', async () => {
      const cluster = makeCluster()
      const { importNodes } = await makeComposable(cluster)
      mockApiPost.mockResolvedValue({
        data: {
          message: '成功创建 2 条，失败 0 条',
          results: [
            { ip: '10.0.0.1', status: 'success' },
            { ip: '10.0.0.2', status: 'success' },
          ],
        },
      })
      mockApiGet.mockResolvedValue({ data: { total: 2, items: [makeNode(), makeNode({ id: 2, ip: '10.0.0.2' })] } })

      await importNodes(cluster, [
        { ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/edge/a', edge_install_path: '', status: 1, valid: true },
        { ip: '10.0.0.2', service_port: 80, management_port: 9180, edge_path: '/edge/b', edge_install_path: '', status: 1, valid: true },
      ])

      expect(mockShowBatchResultModal).not.toHaveBeenCalled()
      expect(mockMessageSuccess).toHaveBeenCalled()
    })
  })

  describe('batch import state', () => {
    it('switching to batch mode clears editingNode', async () => {
      const { nextTick } = await import('vue')
      const cluster = makeCluster()
      const { nodeImportMode, editingNode, editNode } = await makeComposable(cluster)
      editNode(cluster, makeNode({ id: 9 }))
      expect(editingNode.value).not.toBeNull()

      nodeImportMode.value = 'batch'
      await nextTick()

      expect(editingNode.value).toBeNull()
    })

    it('provides fixed edge_path and edge_install_path defaults without autoEdgePath', async () => {
      const cluster = makeCluster()
      const { nodeImportDefaults } = await makeComposable(cluster)
      expect(nodeImportDefaults.edge_path).toBe('/edge')
      expect(nodeImportDefaults.edge_install_path).toBe('/usr/local/nginx')
      expect((nodeImportDefaults as Record<string, unknown>).autoEdgePath).toBeUndefined()
    })
  })

  describe('selectNodes', () => {
    it('clears selectedNode when zero keys', async () => {
      const cluster = makeCluster({ selectedNode: makeNode({ id: 5 }) })
      const { selectNodes } = await makeComposable(cluster)
      selectNodes(cluster, [], [])
      expect(cluster.selectedNodeKeys).toEqual([])
      expect(cluster.selectedNode).toBeNull()
    })

    it('sets selectedNode to the single row when one key', async () => {
      const cluster = makeCluster()
      const { selectNodes } = await makeComposable(cluster)
      const n = makeNode({ id: 7 })
      selectNodes(cluster, [7], [n])
      expect(cluster.selectedNodeKeys).toEqual([7])
      expect(cluster.selectedNode).toEqual(n)
    })

    it('clears selectedNode when two or more keys', async () => {
      const cluster = makeCluster({ selectedNode: makeNode({ id: 1 }) })
      const { selectNodes } = await makeComposable(cluster)
      selectNodes(cluster, [1, 2], [makeNode({ id: 1 }), makeNode({ id: 2 })])
      expect(cluster.selectedNodeKeys).toEqual([1, 2])
      expect(cluster.selectedNode).toBeNull()
    })
  })

  describe('deleteNodes', () => {
    it('warns when no node is checked', async () => {
      const cluster = makeCluster()
      const { deleteNodes } = await makeComposable(cluster)
      deleteNodes(cluster)
      expect(mockShowDeleteConfirm).not.toHaveBeenCalled()
    })

    it('lists up to 3 node IPs in confirm title', async () => {
      const cluster = makeCluster({
        nodes: [makeNode({ id: 1, ip: '10.0.0.1' }), makeNode({ id: 2, ip: '10.0.0.2' }), makeNode({ id: 3, ip: '10.0.0.3' })],
        selectedNodeKeys: [1, 2, 3],
      })
      const { deleteNodes } = await makeComposable(cluster)
      deleteNodes(cluster)
      const opts = mockShowDeleteConfirm.mock.calls[0][0]
      expect(opts.title).toContain('10.0.0.1')
      expect(opts.title).toContain('10.0.0.2')
      expect(opts.title).toContain('10.0.0.3')
    })

    it('truncates title with 等 N 条 when more than 3 nodes', async () => {
      const cluster = makeCluster({
        nodes: [1, 2, 3, 4].map((i) => makeNode({ id: i, ip: `10.0.0.${i}` })),
        selectedNodeKeys: [1, 2, 3, 4],
      })
      const { deleteNodes } = await makeComposable(cluster)
      deleteNodes(cluster)
      const opts = mockShowDeleteConfirm.mock.calls[0][0]
      expect(opts.title).toContain('等 4 条')
    })

    it('calls executeDeleteWithProgress with resourceKey on confirm', async () => {
      const cluster = makeCluster({
        nodes: [makeNode({ id: 1, ip: '10.0.0.1' }), makeNode({ id: 2, ip: '10.0.0.2' })],
        selectedNodeKeys: [1, 2],
      })
      const { deleteNodes } = await makeComposable(cluster)
      deleteNodes(cluster)
      const opts = mockShowDeleteConfirm.mock.calls[0][0]
      expect(opts.apiEndpoint).toBe('/clusters/1/nodes')
      expect((opts as Record<string, unknown>).nodes).toBeUndefined()
      await opts.onOk(true, true, [10])
      expect(mockExecuteDeleteWithProgress).toHaveBeenCalledTimes(1)
      const progressOpts = mockExecuteDeleteWithProgress.mock.calls[0][0]
      expect(progressOpts.resourceKey).toEqual({
        field: 'node_ids', label: '节点', nameField: 'node_ip', keys: [1, 2],
      })
    })
  })

  describe('search/sort clears selection (D8)', () => {
    it('clears selectedNodeKeys and selectedNode when search param changes', async () => {
      const cluster = makeCluster({ selectedNodeKeys: [1], selectedNode: makeNode({ id: 1 }) })
      const { loadNodes } = await makeComposable(cluster)
      await loadNodes(cluster)
      cluster.nodesSearch = 'a'
      await loadNodes(cluster)
      expect(cluster.selectedNodeKeys).toEqual([])
      expect(cluster.selectedNode).toBeNull()
    })

    it('clears selection when sort param changes', async () => {
      const cluster = makeCluster({
        selectedNodeKeys: [1],
        selectedNode: makeNode({ id: 1 }),
        nodesSortBy: 'ip',
        nodesSortOrder: 'asc',
      })
      const { handleNodeTableChange } = await makeComposable(cluster)
      handleNodeTableChange(cluster, { current: 1, pageSize: 20 }, { field: 'created_at', order: 'descend' })
      expect(cluster.selectedNodeKeys).toEqual([])
      expect(cluster.selectedNode).toBeNull()
    })

    it('keeps selection when only page changes', async () => {
      const cluster = makeCluster({
        selectedNodeKeys: [1],
        nodesPagination: { total: 50, page: 1, pageSize: 20 },
      })
      const { handleNodeTableChange } = await makeComposable(cluster)
      handleNodeTableChange(cluster, { current: 2, pageSize: 20 }, {})
      expect(cluster.selectedNodeKeys).toEqual([1])
    })
  })
})
