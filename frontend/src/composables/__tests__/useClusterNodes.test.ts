import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster, Node } from '@/types'

// 2026-11-22（A 推广清理）：本文件原覆盖面板专属 composable 的表格态（列/列宽/动作/批量/表单/
// 导入/执行抽屉/validateIP），那些成员已随面板 Tab 改渲染 NodeList 的 scoped 形态而全部删除。
// 现存覆盖 = 仍被生产的三个面：loadNodes（集群卡片节点预览）、nginxState/nodeCell*（状态格判定）、
// createCancelNodeInstallHandler（取消安装），外加共享胶水 useClusterListCore 的翻页/排序语义。

const mockApiPost = vi.fn()
const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

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

/** URL 感知注册：命中 match 的请求返回 data，其余一律 reject（防 mock 无差别吞掉错误 URL） */
function apiOk(mock: ReturnType<typeof vi.fn>, match: (url: string) => boolean, data: unknown) {
  mock.mockImplementation((url: string) =>
    match(url) ? Promise.resolve(data) : Promise.reject(new Error(`unexpected API call: ${url}`)),
  )
}

async function makeComposable() {
  const { useClusterNodes } = await import('../useClusterNodes')
  return useClusterNodes()
}

// ── loadNodes 请求参数与分页回写（集群卡片节点预览区的数据来源） ──

describe('useClusterNodes loadNodes 请求参数与分页回写', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function loadWith(cluster: Cluster, data: unknown) {
    apiOk(mockApiGet, (u) => /\/nodes$/.test(u), { data })
    const { loadNodes } = await makeComposable()
    await loadNodes(cluster)
  }

  it('默认发送 page=1/page_size=20 并回写 pagination 与 items', async () => {
    const cluster = makeCluster()
    await loadWith(cluster, { total: 101, page: 1, page_size: 20, items: [makeNode({ id: 3 })] })

    expect(mockApiGet).toHaveBeenCalledWith('/clusters/1/nodes', { params: { page: 1, page_size: 20 } })
    expect(cluster.nodes).toEqual([makeNode({ id: 3 })])
    expect(cluster.nodesPagination).toEqual({ total: 101, page: 1, pageSize: 20 })
  })

  it('沿用 nodesPagination 现值作为 page/page_size', async () => {
    const cluster = makeCluster({ nodesPagination: { total: 0, page: 2, pageSize: 50 } })
    await loadWith(cluster, { total: 101, page: 2, page_size: 50, items: [] })

    expect(mockApiGet).toHaveBeenCalledWith('/clusters/1/nodes', { params: { page: 2, page_size: 50 } })
  })

  it('有搜索词时发送 search/search_field', async () => {
    const cluster = makeCluster({ nodesSearch: '10.0', nodesSearchField: 'ip' })
    await loadWith(cluster, { total: 0, page: 1, page_size: 20, items: [] })

    expect(mockApiGet).toHaveBeenCalledWith('/clusters/1/nodes', {
      params: { page: 1, page_size: 20, search: '10.0', search_field: 'ip' },
    })
  })

  it('搜索字段为空时只发送 search', async () => {
    const cluster = makeCluster({ nodesSearch: '10.0' })
    await loadWith(cluster, { total: 0, page: 1, page_size: 20, items: [] })

    expect(mockApiGet).toHaveBeenCalledWith('/clusters/1/nodes', {
      params: { page: 1, page_size: 20, search: '10.0' },
    })
  })

  it('有排序时发送 sort_by/sort_order', async () => {
    const cluster = makeCluster({ nodesSortBy: 'ip', nodesSortOrder: 'desc' })
    await loadWith(cluster, { total: 0, page: 1, page_size: 20, items: [] })

    expect(mockApiGet).toHaveBeenCalledWith('/clusters/1/nodes', {
      params: { page: 1, page_size: 20, sort_by: 'ip', sort_order: 'desc' },
    })
  })
})

// ── 共享胶水 useClusterListCore 的翻页/排序语义（生产侧唯一消费方 = loadNodes 的 keys） ──

describe('useClusterListCore 翻页排序（节点 keys）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function makeCore() {
    const { useClusterListCore } = await import('../useClusterResource')
    return useClusterListCore<Node>({
      noun: '节点',
      endpoint: 'nodes',
      keys: {
        items: 'nodes',
        pagination: 'nodesPagination',
        loading: 'nodesLoading',
        search: 'nodesSearch',
        searchField: 'nodesSearchField',
        sortBy: 'nodesSortBy',
        sortOrder: 'nodesSortOrder',
        selected: 'selectedNode',
        selectedKeys: 'selectedNodeKeys',
      },
      sortFieldMap: { ip: 'ip', service_port: 'service_port', management_port: 'management_port' },
    })
  }

  it('handleTableChange 回写分页并按排序参数重载', async () => {
    const cluster = makeCluster({ nodesPagination: { total: 50, page: 1, pageSize: 20 } })
    apiOk(mockApiGet, (u) => /\/nodes$/.test(u), { data: { total: 50, page: 3, page_size: 10, items: [] } })
    const core = await makeCore()

    core.handleTableChange(cluster, { current: 3, pageSize: 10 }, { field: 'ip', order: 'descend' })
    await flushPromises()

    expect(cluster.nodesPagination).toEqual({ total: 50, page: 3, pageSize: 10 })
    expect(mockApiGet).toHaveBeenLastCalledWith('/clusters/1/nodes', {
      params: { page: 3, page_size: 10, sort_by: 'ip', sort_order: 'desc' },
    })
  })

  it('翻页（sorter 为空）时重置排序且不带 sort 参数', async () => {
    const cluster = makeCluster({
      nodesSortBy: 'ip',
      nodesSortOrder: 'desc',
      nodesPagination: { total: 50, page: 1, pageSize: 20 },
    })
    apiOk(mockApiGet, (u) => /\/nodes$/.test(u), { data: { total: 50, page: 2, page_size: 20, items: [] } })
    const core = await makeCore()

    core.handleTableChange(cluster, { current: 2, pageSize: 20 }, {})
    await flushPromises()

    expect(cluster.nodesSortBy).toBe('')
    expect(cluster.nodesSortOrder).toBe('asc')
    expect(mockApiGet).toHaveBeenLastCalledWith('/clusters/1/nodes', { params: { page: 2, page_size: 20 } })
  })
})

describe('nginxState 运行态三元判定', () => {
  it('nginx_running=true → running（即使 status=0）', async () => {
    const { nginxState } = await import('../useClusterNodes')
    expect(nginxState({ status: 0, status_detail: { nginx: { nginx_running: true } } })).toBe('running')
  })

  it('nginx_running=false → stopped（不回退 status===1 假绿）', async () => {
    const { nginxState } = await import('../useClusterNodes')
    expect(nginxState({ status: 1, status_detail: { nginx: { nginx_running: false } } })).toBe('stopped')
  })

  it('status_detail 无 nginx 运行态信息 → unchecked（新节点不假绿「运行中」）', async () => {
    const { nginxState } = await import('../useClusterNodes')
    expect(nginxState({ status: 1, status_detail: { statistic: { edge_version: '2.5.0' } } })).toBe('unchecked')
    expect(nginxState({ status: 1, status_detail: { nginx: {} } })).toBe('unchecked')
  })

  it('无 status_detail 字段 → unchecked', async () => {
    const { nginxState } = await import('../useClusterNodes')
    expect(nginxState({ status: 1 })).toBe('unchecked')
    expect(nginxState({ status: 0 })).toBe('unchecked')
  })

  it('nginx_running=null（解析失败占位）→ unchecked', async () => {
    const { nginxState } = await import('../useClusterNodes')
    expect(nginxState({ status: 1, status_detail: { nginx: { nginx_running: null } } })).toBe('unchecked')
  })
})

describe('createCancelNodeInstallHandler（batch3 1.2）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  function makeDeps() {
    const execTargetNode = ref<{ id: number; cluster_id: number; ip: string } | null>({
      id: 1,
      cluster_id: 1,
      ip: '10.0.0.1',
    })
    const cancelling = ref(false)
    const execLogs = ref<string[]>([])
    const execProgress = reactive<{
      percent: number
      status: 'active' | 'success' | 'exception'
      indeterminate: boolean
    }>({ percent: 0, status: 'active', indeterminate: false })
    const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number | null } | null>(null)
    const installStream = { cancel: vi.fn() }
    return { execTargetNode, cancelling, execLogs, execProgress, execResult, installStream }
  }

  async function clickConfirmCancel() {
    const okBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('确认取消'),
    ) as HTMLButtonElement
    expect(okBtn, '应弹出危险红确认').toBeDefined()
    expect(okBtn!.className).toContain('btn-danger')
    okBtn!.click()
  }

  it('确认后 POST cancel-install，渲染步骤日志与终态，finally 复位 cancelling 并 cancel 流', async () => {
    mockApiPost.mockResolvedValue({
      data: {
        status: 'ok',
        steps: [
          { command: 'pkill -f install-edge', status: 'success', stdout: 'killed', stderr: '' },
          { command: 'rm -f /tmp/lock', status: 'skipped', stdout: '', stderr: '' },
        ],
      },
    })
    const deps = makeDeps()
    const { createCancelNodeInstallHandler } = await import('../useClusterNodes')
    const handler = createCancelNodeInstallHandler(deps)
    handler()
    await clickConfirmCancel()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))

    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/1/cancel-install')
    const logs = deps.execLogs.value.join('\n')
    expect(logs).toContain('取消安装结果')
    expect(logs).toContain('pkill -f install-edge')
    expect(logs).toContain('✅ 安装已取消')
    expect(deps.execProgress.percent).toBe(100)
    expect(deps.execProgress.status).toBe('success')
    expect(deps.execProgress.indeterminate).toBe(false)
    expect(deps.execResult.value!.rc).toBe(0)
    expect(deps.cancelling.value).toBe(false)
    expect(deps.installStream.cancel).toHaveBeenCalled()
    // 弹窗在 onOk 完成后关闭
    expect(document.querySelector('.modal-overlay')).toBeNull()
  })

  it('status=skipped 时提示「没有运行中的安装进程」', async () => {
    mockApiPost.mockResolvedValue({ data: { status: 'skipped', steps: [] } })
    const deps = makeDeps()
    const { createCancelNodeInstallHandler } = await import('../useClusterNodes')
    createCancelNodeInstallHandler(deps)()
    await clickConfirmCancel()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    expect(deps.execLogs.value.join('\n')).toContain('没有运行中的安装进程')
  })

  it('失败路径：detail 进日志、终态 exception、rc=-1', async () => {
    mockApiPost.mockRejectedValue({ response: { data: { detail: 'SSH 连接失败' } } })
    const deps = makeDeps()
    const { createCancelNodeInstallHandler } = await import('../useClusterNodes')
    createCancelNodeInstallHandler(deps)()
    await clickConfirmCancel()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    expect(deps.execLogs.value.join('\n')).toContain('❌ SSH 连接失败')
    expect(deps.execProgress.status).toBe('exception')
    expect(deps.execResult.value!.rc).toBe(-1)
    expect(deps.cancelling.value).toBe(false)
  })

  it('无目标节点或正在取消时不弹确认', async () => {
    const deps = makeDeps()
    deps.execTargetNode.value = null
    const { createCancelNodeInstallHandler } = await import('../useClusterNodes')
    createCancelNodeInstallHandler(deps)()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.querySelector('.modal-overlay')).toBeNull()
    expect(mockApiPost).not.toHaveBeenCalled()
  })
})
