import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster, Node } from '@/types'

const mockApiPost = vi.fn()
const mockApiGet = vi.fn()
const mockMessageSuccess = vi.fn()
const mockMessageError = vi.fn()
const mockShowBatchResultModal = vi.fn()
const mockShowBatchStatusModal = vi.fn()
const mockShowDeleteConfirm = vi.fn()
const mockExecuteDeleteWithProgress = vi.fn()
const mockConcurrencyOf = vi.fn((name: string, defaultVal: number) => defaultVal)

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/stores/features', () => ({
  useFeaturesStore: () => ({
    has: () => false,
    concurrencyOf: (...args: any[]) => mockConcurrencyOf(...args),
  }),
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
  showBatchStatusModal: (...args: any[]) => mockShowBatchStatusModal(...args),
}))

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 1,
    cluster_id: 1,
    ip: '10.0.0.1',
    service_port: 80,
    management_port: 9180,
    edge_path: '/edge/node1',
    openresty_path: '',
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
    mockConcurrencyOf.mockImplementation((name: string, defaultVal: number) => defaultVal)
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
        { ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/edge/a', openresty_path: '', status: 1, valid: true },
        { ip: '10.0.0.2', service_port: 80, management_port: 9180, edge_path: '/edge/b', openresty_path: '', status: 1, valid: true },
        { ip: '10.0.0.3', service_port: 80, management_port: 9180, edge_path: '/edge/c', openresty_path: '', status: 1, valid: false },
      ])

      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/batch', {
        nodes: [
          { ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/edge/a', openresty_path: '', status: 1 },
          { ip: '10.0.0.2', service_port: 80, management_port: 9180, edge_path: '/edge/b', openresty_path: '', status: 1 },
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
        { ip: 'bad', service_port: 80, management_port: 9180, edge_path: '/edge/a', openresty_path: '', status: 1, valid: false },
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
        { ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/edge/a', openresty_path: '', status: 1, valid: true },
        { ip: '10.0.0.2', service_port: 80, management_port: 9180, edge_path: '/edge/a', openresty_path: '', status: 1, valid: true },
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
        { ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/edge/a', openresty_path: '', status: 1, valid: true },
        { ip: '10.0.0.2', service_port: 80, management_port: 9180, edge_path: '/edge/b', openresty_path: '', status: 1, valid: true },
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

    it('provides fixed edge_path and openresty_path defaults without autoEdgePath', async () => {
      const cluster = makeCluster()
      const { nodeImportDefaults } = await makeComposable(cluster)
      expect(nodeImportDefaults.edge_path).toBe('/edge')
      expect(nodeImportDefaults.openresty_path).toBe('/usr/local/nginx')
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

  describe('batchNodeAction', () => {
    it('opens progress modal and calls per-node endpoint with concurrency limit', async () => {
      const cluster = makeCluster({
        nodes: [makeNode({ id: 1, ip: '10.0.0.1' }), makeNode({ id: 2, ip: '10.0.0.2' })],
        selectedNodeKeys: [1, 2],
      })
      const { batchNodeAction, batchProgressVisible, batchProgressItems } = await makeComposable(cluster)
      mockApiPost.mockImplementation((url: string) => {
        if (url.endsWith('/1/start') || url.endsWith('/2/start')) {
          return Promise.resolve({ data: { rc: 0, stdout: 'ok', stderr: '', command: 'cmd' } })
        }
        return Promise.reject(new Error('unexpected url: ' + url))
      })
      mockApiGet.mockResolvedValue({ data: { total: 2, items: [] } })

      await batchNodeAction(cluster, 'start', '启动')

      // 每个节点独立调用单节点端点
      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/1/start')
      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/2/start')
      expect(batchProgressVisible.value).toBe(true)
      const items = batchProgressItems.value
      expect(items).toHaveLength(2)
      expect(items[0].status).toBe('success')
      expect(items[1].status).toBe('success')
      expect(cluster.selectedNodeKeys).toEqual([])
      expect(cluster.selectedNode).toBeNull()
    })

    it('limits concurrent requests and queues remaining nodes', async () => {
      const cluster = makeCluster({
        nodes: [
          makeNode({ id: 1, ip: '10.0.0.1' }),
          makeNode({ id: 2, ip: '10.0.0.2' }),
          makeNode({ id: 3, ip: '10.0.0.3' }),
          makeNode({ id: 4, ip: '10.0.0.4' }),
          makeNode({ id: 5, ip: '10.0.0.5' }),
          makeNode({ id: 6, ip: '10.0.0.6' }),
        ],
        selectedNodeKeys: [1, 2, 3, 4, 5, 6],
      })
      const { batchNodeAction, batchProgressItems } = await makeComposable(cluster)

      // 追踪每个请求的 in-flight 并发数
      let inFlight = 0
      let maxInFlight = 0
      const resolveFns: Array<() => void> = []
      mockApiPost.mockImplementation(() => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        return new Promise((resolve) => {
          resolveFns.push(() => {
            inFlight--
            resolve({ data: { rc: 0, stdout: 'ok', stderr: '', command: 'cmd' } })
          })
        })
      })
      mockApiGet.mockResolvedValue({ data: { total: 6, items: [] } })

      const actionPromise = batchNodeAction(cluster, 'start', '启动')

      // 等待首批请求发出，断言并发被限制在 5 以内
      await new Promise((r) => setTimeout(r, 100))
      expect(maxInFlight).toBeLessThanOrEqual(5)
      // 首批只应发出 5 个（并发上限），第 6 个排队
      expect(resolveFns.length).toBe(5)

      // 逐个释放已收集的，每释放一个应补发一个排队请求
      for (let round = 0; round < 6; round++) {
        const fn = resolveFns.shift()
        if (fn) fn()
        await new Promise((r) => setTimeout(r, 30))
      }
      await actionPromise

      expect(maxInFlight).toBeLessThanOrEqual(5)
      const items = batchProgressItems.value
      expect(items).toHaveLength(6)
      expect(items.every((i) => i.status === 'success')).toBe(true)
    })

    it('clamps concurrency to max_playbooks when batch_action is larger', async () => {
      mockConcurrencyOf.mockImplementation((name: string, defaultVal: number) => {
        if (name === 'batch_action') return 10
        if (name === 'max_playbooks') return 2
        return defaultVal
      })
      const cluster = makeCluster({
        nodes: [
          makeNode({ id: 1, ip: '10.0.0.1' }),
          makeNode({ id: 2, ip: '10.0.0.2' }),
          makeNode({ id: 3, ip: '10.0.0.3' }),
          makeNode({ id: 4, ip: '10.0.0.4' }),
          makeNode({ id: 5, ip: '10.0.0.5' }),
        ],
        selectedNodeKeys: [1, 2, 3, 4, 5],
      })
      const { batchNodeAction, batchProgressItems } = await makeComposable(cluster)

      let inFlight = 0
      let maxInFlight = 0
      const resolveFns: Array<() => void> = []
      mockApiPost.mockImplementation(() => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        return new Promise((resolve) => {
          resolveFns.push(() => {
            inFlight--
            resolve({ data: { rc: 0, stdout: 'ok', stderr: '', command: 'cmd' } })
          })
        })
      })
      mockApiGet.mockResolvedValue({ data: { total: 5, items: [] } })

      const actionPromise = batchNodeAction(cluster, 'start', '启动')

      await new Promise((r) => setTimeout(r, 100))
      // batch_action=10 但 max_playbooks=2 → 实际并发被 clamp 到 2
      expect(maxInFlight).toBeLessThanOrEqual(2)
      expect(resolveFns.length).toBe(2)

      for (let round = 0; round < 5; round++) {
        const fn = resolveFns.shift()
        if (fn) fn()
        await new Promise((r) => setTimeout(r, 30))
      }
      await actionPromise

      expect(maxInFlight).toBeLessThanOrEqual(2)
      const items = batchProgressItems.value
      expect(items).toHaveLength(5)
      expect(items.every((i) => i.status === 'success')).toBe(true)
    })

    it('marks a node failed when its per-node call rejects', async () => {
      const cluster = makeCluster({
        nodes: [makeNode({ id: 1, ip: '10.0.0.1' }), makeNode({ id: 2, ip: '10.0.0.2' })],
        selectedNodeKeys: [1, 2],
      })
      const { batchNodeAction, batchProgressItems } = await makeComposable(cluster)
      mockApiPost.mockImplementation((url: string) => {
        if (url.endsWith('/1/start')) return Promise.resolve({ data: { rc: 0, stdout: 'ok', stderr: '', command: 'c' } })
        if (url.endsWith('/2/start')) return Promise.reject({ response: { data: { detail: '连接超时' } } })
        return Promise.reject(new Error('unexpected'))
      })
      mockApiGet.mockResolvedValue({ data: { total: 2, items: [] } })

      await batchNodeAction(cluster, 'start', '启动')

      const items = batchProgressItems.value
      expect(items[0].status).toBe('success')
      expect(items[1].status).toBe('error')
      expect(items[1].logs.join('')).toContain('连接超时')
    })

    it('warns when no nodes checked', async () => {
      const cluster = makeCluster()
      const { batchNodeAction } = await makeComposable(cluster)
      await batchNodeAction(cluster, 'start', '启动')
      expect(mockApiPost).not.toHaveBeenCalled()
    })
  })

  describe('batchNodeStatus', () => {
    it('uses progress modal with concurrency then shows status table with parsed rows', async () => {
      const cluster = makeCluster({
        nodes: [makeNode({ id: 1, ip: '10.0.0.1' }), makeNode({ id: 2, ip: '10.0.0.2' })],
        selectedNodeKeys: [1, 2],
      })
      const { batchNodeStatus, batchProgressVisible, batchProgressItems } = await makeComposable(cluster)
      mockApiPost.mockImplementation((url: string) => {
        if (url.endsWith('/1/statistic') || url.endsWith('/2/statistic')) {
          return Promise.resolve({
            data: { rc: 0, statistic: { edge_version: 'v1.2.3', nginx_running: true }, stdout: 's', stderr: '', command: 'c' },
          })
        }
        return Promise.reject(new Error('unexpected url: ' + url))
      })
      mockApiGet.mockResolvedValue({ data: { total: 2, items: [] } })

      await batchNodeStatus(cluster)

      // 并发调用单节点 statistic 端点
      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/1/statistic', { ports: '9180' })
      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/2/statistic', { ports: '9180' })
      // 过程弹窗已关闭（完成后转结果表格），但 items 记录了执行结果
      expect(batchProgressVisible.value).toBe(false)
      const items = batchProgressItems.value
      expect(items).toHaveLength(2)
      expect(items[0].status).toBe('success')
      expect(items[1].status).toBe('success')
      // 最终结果表格展示版本/健康
      expect(mockShowBatchStatusModal).toHaveBeenCalledTimes(1)
      const rows = mockShowBatchStatusModal.mock.calls[0][1]
      expect(rows[0]).toMatchObject({ ip: '10.0.0.1', version: 'v1.2.3', healthy: true })
      // 收集了过程信息供详情展开
      expect(rows[0].command).toBe('c')
      expect(rows[0].stdout).toBe('s')
    })

    it('fills failure reason when rc is non-zero with stderr', async () => {
      const cluster = makeCluster({
        nodes: [makeNode({ id: 1, ip: '10.0.0.1' })],
        selectedNodeKeys: [1],
      })
      const { batchNodeStatus } = await makeComposable(cluster)
      mockApiPost.mockResolvedValue({
        data: {
          rc: 4,
          statistic: {},
          stdout: 'PLAY [Run edge]\nTASK [edge : run]\nfatal: [10.0.0.1]: FAILED! => connection refused',
          stderr: '',
          command: 'cmd',
        },
      })
      mockApiGet.mockResolvedValue({ data: { total: 1, items: [] } })

      await batchNodeStatus(cluster)

      const rows = mockShowBatchStatusModal.mock.calls[0][1]
      expect(rows[0].status).toBe('error')
      expect(rows[0].detail).toContain('connection refused')
      // 摘要不应包含整段 stdout（只提取关键行）
      expect(rows[0].detail).not.toContain('PLAY [Run edge]')
    })
  })
})

describe('useClusterNodes ssh_port', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('nodeForm 默认 ssh_port 为 22', async () => {
    const cluster = makeCluster()
    const { nodeForm } = await makeComposable(cluster)
    expect(nodeForm.ssh_port).toBe(22)
  })

  it('copyNode 回填 ssh_port', async () => {
    const cluster = makeCluster()
    const { copyNode, nodeForm } = await makeComposable(cluster)
    const source = makeNode({ id: 5, ip: '10.0.0.5', ssh_port: 1122 } as any)
    copyNode(cluster, source)
    expect(nodeForm.ssh_port).toBe(1122)
  })

  it('编辑节点回填 ssh_port', async () => {
    const cluster = makeCluster()
    const { editNode, nodeForm } = await makeComposable(cluster)
    const node = makeNode({ id: 5, ip: '10.0.0.5', ssh_port: 2022 } as any)
    editNode(cluster, node)
    expect(nodeForm.ssh_port).toBe(2022)
  })

  it('handleNodeSubmit 提交含 ssh_port', async () => {
    const cluster = makeCluster({ id: 1 })
    const { handleNodeSubmit, nodeForm, editingNode, nodeFormRef, editNode } = await makeComposable(cluster)
    const mockPut = vi.fn().mockResolvedValue({ data: { id: 9 } })
    const { default: api } = await import('@/api')
    ;(api.put as any) = mockPut
    nodeFormRef.value = { validate: async () => true } as any
    // editNode 设置 currentClusterId + editingNode（走 PUT 分支）
    const node = makeNode({ id: 5, ip: '10.0.0.5', ssh_port: 22 } as any)
    editNode(cluster, node)
    nodeForm.ssh_port = 1122
    await handleNodeSubmit()
    const payload = mockPut.mock.calls[0][1]
    expect(payload.ssh_port).toBe(1122)
  })
})
