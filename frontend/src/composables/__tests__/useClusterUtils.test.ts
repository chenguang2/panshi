import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiDelete = vi.fn()
const mockApiPost = vi.fn()
const mockApiGet = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: vi.fn(),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

function makeCluster() {
  return { id: 1, name: 'c1' }
}

describe('executeDeleteWithProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('sends route_ids in body when routeIds provided (batch mode)', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({ data: { message: '批量删除完成', results: [] } })
    const refreshFn = vi.fn()
    const clearSelectedFn = vi.fn()

    await executeDeleteWithProgress({
      title: '批量删除',
      apiEndpoint: '/clusters/1/routes',
      routeIds: [1, 2, 3],
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn,
      clearSelectedFn,
    })

    expect(mockApiDelete).toHaveBeenCalledWith('/clusters/1/routes', {
      data: { delete_db: true, delete_edge: false, node_ids: undefined, route_ids: [1, 2, 3] },
      timeout: 300_000,
    })
    expect(refreshFn).toHaveBeenCalled()
    expect(clearSelectedFn).toHaveBeenCalled()
  })

  it('does not send route_ids when routeIds absent (single mode regression)', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({
      data: {
        message: '路由已删除',
        results: [{ scope: 'database', status: 'success', message: '数据库记录已删除' }],
      },
    })
    const refreshFn = vi.fn()

    await executeDeleteWithProgress({
      title: '删除路由',
      apiEndpoint: '/clusters/1/routes/5',
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn,
    })

    expect(mockApiDelete).toHaveBeenCalledWith('/clusters/1/routes/5', {
      data: { delete_db: true, delete_edge: false, node_ids: undefined },
      timeout: 300_000,
    })
  })

  it('logs per-route results in batch mode', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({
      data: {
        message: '批量删除完成',
        results: [
          {
            route_id: 1,
            route_name: 'login-api',
            status: 'success',
            results: [
              { scope: 'database', status: 'success' },
              { node: '10.0.0.1:9180', scope: 'edge', status: 'success' },
            ],
          },
          {
            route_id: 2,
            route_name: 'order-api',
            status: 'success',
            results: [
              { scope: 'database', status: 'success' },
              { node: '10.0.0.2:9180', scope: 'edge', status: 'failed', error: 'timeout' },
            ],
          },
        ],
      },
    })

    await executeDeleteWithProgress({
      title: '批量删除',
      apiEndpoint: '/clusters/1/routes',
      routeIds: [1, 2],
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: true,
      nodeIds: [10],
      refreshFn: vi.fn(),
    })

    const modalText = document.body.textContent || ''
    expect(modalText).toContain('login-api')
    expect(modalText).toContain('order-api')
    expect(modalText).toContain('10.0.0.1:9180')
    expect(modalText).toContain('timeout')
  })

  it('marks exception status when any batch route edge fails', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({
      data: {
        message: '批量删除完成',
        results: [
          {
            route_id: 1,
            route_name: 'a',
            status: 'success',
            results: [
              { scope: 'database', status: 'success' },
              { node: '10.0.0.1:9180', scope: 'edge', status: 'failed', error: 'timeout' },
            ],
          },
        ],
      },
    })

    await executeDeleteWithProgress({
      title: '批量删除',
      apiEndpoint: '/clusters/1/routes',
      routeIds: [1],
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: true,
      nodeIds: [10],
      refreshFn: vi.fn(),
    })

    const modalText = document.body.textContent || ''
    expect(modalText).toContain('请手动清理')
  })

  it('shows top-level error reason for failed batch item without sub-results', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({
      data: {
        message: '批量删除完成',
        results: [
          {
            upstream_id: 1,
            upstream_name: 'ref-upstream',
            status: 'failed',
            results: [],
            error: '该上游已被路由引用，请先删除引用路由',
          },
        ],
      },
    })

    await executeDeleteWithProgress({
      title: '批量删除上游',
      apiEndpoint: '/clusters/1/upstreams',
      resourceKey: { field: 'upstream_ids', label: '上游', nameField: 'upstream_name', keys: [1] },
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn: vi.fn(),
    })

    const modalText = document.body.textContent || ''
    expect(modalText).toContain('ref-upstream')
    expect(modalText).toContain('该上游已被路由引用，请先删除引用路由')
  })

  it('shows top-level error reason for failed batch item with mixed sub-results', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({
      data: {
        message: '批量删除完成',
        results: [
          {
            upstream_id: 2,
            upstream_name: 'edge-fail-upstream',
            status: 'failed',
            results: [
              { scope: 'database', status: 'success' },
              { scope: 'edge', status: 'failed', node: '10.0.0.1:9180', error: 'connection refused' },
            ],
          },
        ],
      },
    })

    await executeDeleteWithProgress({
      title: '批量删除上游',
      apiEndpoint: '/clusters/1/upstreams',
      resourceKey: { field: 'upstream_ids', label: '上游', nameField: 'upstream_name', keys: [2] },
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: true,
      nodeIds: [10],
      refreshFn: vi.fn(),
    })

    const modalText = document.body.textContent || ''
    expect(modalText).toContain('connection refused')
  })

  it('sends upstream_ids in body when resourceKey provided (upstream batch mode)', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({ data: { message: '批量删除完成', results: [] } })
    const refreshFn = vi.fn()
    const clearSelectedFn = vi.fn()

    await executeDeleteWithProgress({
      title: '批量删除上游',
      apiEndpoint: '/clusters/1/upstreams',
      resourceKey: { field: 'upstream_ids', label: '上游', nameField: 'upstream_name', keys: [10, 11] },
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn,
      clearSelectedFn,
    })

    expect(mockApiDelete).toHaveBeenCalledWith('/clusters/1/upstreams', {
      data: { delete_db: true, delete_edge: false, node_ids: undefined, upstream_ids: [10, 11] },
      timeout: 300_000,
    })
    expect(refreshFn).toHaveBeenCalled()
    expect(clearSelectedFn).toHaveBeenCalled()
  })

  it('logs per-upstream results with label and nameField from resourceKey', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({
      data: {
        message: '批量删除完成',
        results: [
          {
            upstream_id: 10,
            upstream_name: 'login-api',
            status: 'success',
            results: [
              { scope: 'database', status: 'success' },
              { node: '10.0.0.1:9180', scope: 'edge', status: 'success' },
            ],
          },
          {
            upstream_id: 11,
            upstream_name: 'order-api',
            status: 'success',
            results: [
              { scope: 'database', status: 'success' },
              { scope: 'edge', status: 'skipped' },
            ],
          },
        ],
      },
    })

    await executeDeleteWithProgress({
      title: '批量删除上游',
      apiEndpoint: '/clusters/1/upstreams',
      resourceKey: { field: 'upstream_ids', label: '上游', nameField: 'upstream_name', keys: [10, 11] },
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: true,
      nodeIds: [10],
      refreshFn: vi.fn(),
    })

    const modalText = document.body.textContent || ''
    expect(modalText).toContain('login-api')
    expect(modalText).toContain('order-api')
    expect(modalText).toContain('10.0.0.1:9180')
    expect(modalText).toContain('跳过')
  })

  it('routeIds still works as legacy alias for resourceKey', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({ data: { message: '批量删除完成', results: [] } })

    await executeDeleteWithProgress({
      title: '批量删除',
      apiEndpoint: '/clusters/1/routes',
      routeIds: [1, 2, 3],
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn: vi.fn(),
    })

    expect(mockApiDelete).toHaveBeenCalledWith('/clusters/1/routes', {
      data: { delete_db: true, delete_edge: false, node_ids: undefined, route_ids: [1, 2, 3] },
      timeout: 300_000,
    })
  })

  it('calls clearSelectedFn after refreshFn', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({ data: { message: '批量删除完成', results: [] } })
    const refreshFn = vi.fn()
    const clearSelectedFn = vi.fn()

    await executeDeleteWithProgress({
      title: '批量删除',
      apiEndpoint: '/clusters/1/routes',
      routeIds: [1],
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn,
      clearSelectedFn,
    })

    expect(refreshFn.mock.invocationCallOrder[0]).toBeLessThan(clearSelectedFn.mock.invocationCallOrder[0])
  })

  it('shows validation detail message when API returns 422 array detail', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockRejectedValue({
      response: {
        data: {
          detail: [{ loc: ['body', 'upstream_ids'], msg: 'Field required', type: 'missing' }],
        },
      },
    })

    await executeDeleteWithProgress({
      title: '删除上游',
      apiEndpoint: '/clusters/1/upstreams/5',
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn: vi.fn(),
    })

    const modalText = document.body.textContent || ''
    expect(modalText).toContain('upstream_ids')
    expect(modalText).not.toContain('未知错误')
  })

  it('shows string detail message when API returns 400', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockRejectedValue({
      response: {
        data: { detail: 'upstream_ids 不能为空' },
      },
    })

    await executeDeleteWithProgress({
      title: '删除上游',
      apiEndpoint: '/clusters/1/upstreams',
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn: vi.fn(),
    })

    const modalText = document.body.textContent || ''
    expect(modalText).toContain('upstream_ids 不能为空')
  })

  it('renders progress modal with system custom modal style', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({ data: { message: '批量删除完成', results: [] } })

    await executeDeleteWithProgress({
      title: '删除上游',
      apiEndpoint: '/clusters/1/upstreams',
      resourceKey: { field: 'upstream_ids', label: '上游', nameField: 'upstream_name', keys: [1] },
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn: vi.fn(),
    })

    expect(document.querySelector('.ant-modal')).not.toBeNull()
    expect(document.querySelector('.ant-modal-title')?.textContent).toContain('删除上游')
    expect(document.querySelector('.ant-modal-footer .ant-btn-primary')).not.toBeNull()
  })

  it('renders batch status modal as a table with version and health columns', async () => {
    const { showBatchStatusModal } = await import('../useClusterUtils')
    showBatchStatusModal('批量状态查询', [
      { ip: '10.0.0.1', status: 'success', version: 'v1.2.3', healthy: true },
      { ip: '10.0.0.2', status: 'error', detail: '连接超时', version: '', healthy: false },
    ])

    const modal = document.querySelector('.ant-modal')
    expect(modal).not.toBeNull()
    const text = document.body.textContent || ''
    expect(text).toContain('10.0.0.1')
    expect(text).toContain('v1.2.3')
    expect(text).toContain('健康')
    expect(text).toContain('10.0.0.2')
    expect(text).toContain('连接超时')
    expect(text).toContain('失败')
  })

  it('batch status modal shows failure rows with detail', async () => {
    const { showBatchStatusModal } = await import('../useClusterUtils')
    showBatchStatusModal('批量状态查询', [
      { ip: '10.0.0.9', status: 'error', detail: 'Edge 节点不可达', version: '', healthy: false },
    ])

    const text = document.body.textContent || ''
    expect(text).toContain('10.0.0.9')
    expect(text).toContain('Edge 节点不可达')
  })

  it('batch status modal expands row to show process details', async () => {
    const { showBatchStatusModal } = await import('../useClusterUtils')
    showBatchStatusModal('批量状态查询', [
      {
        ip: '10.0.0.1',
        status: 'success',
        version: 'v1.2.3',
        healthy: true,
        command: 'ansible-playbook ...',
        stdout: 'cpu_usage: 1.5',
        stderr: '',
      },
    ])

    const text = document.body.textContent || ''
    expect(text).toContain('详情')
    // 默认不展开，点击详情后显示命令/stdout
    const detailBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('详情'))
    expect(detailBtn).toBeTruthy()
    detailBtn!.click()
    const expanded = document.body.textContent || ''
    expect(expanded).toContain('ansible-playbook')
    expect(expanded).toContain('cpu_usage')
  })

  it('expanded details wrap long lines without horizontal overflow', async () => {
    const { showBatchStatusModal } = await import('../useClusterUtils')
    const longLine = 'TASK [edge : run] ' + 'x'.repeat(2000)
    showBatchStatusModal('批量状态查询', [
      {
        ip: '10.0.0.1',
        status: 'success',
        version: 'v1.2.3',
        healthy: true,
        command: longLine,
        stdout: 'stdout',
        stderr: '',
      },
    ])

    const detailBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('详情'))
    detailBtn!.click()

    // 详情容器应无水平溢出（超长行被强制换行）
    const detailBox = document.querySelector('.batch-status-detail') as HTMLElement
    expect(detailBox).toBeTruthy()
    expect(detailBox.scrollWidth).toBeLessThanOrEqual(detailBox.clientWidth)
  })

  it('health status column does not wrap vertically', async () => {
    const { showBatchStatusModal } = await import('../useClusterUtils')
    showBatchStatusModal('批量状态查询', [
      { ip: '10.0.0.1', status: 'success', version: 'v1.2.3', healthy: true, detail: '' },
    ])

    const table = document.querySelector('table') as HTMLTableElement
    expect(table).toBeTruthy()
    // table-layout fixed 保证列宽稳定，健康状态列不被长内容挤压
    expect(table.style.tableLayout || getComputedStyle(table).tableLayout).toBe('fixed')
    // 健康状态单元格不折行（white-space nowrap）
    const healthCell = Array.from(document.querySelectorAll('td')).find((td) => td.textContent === '健康')
    expect(healthCell).toBeTruthy()
    expect(getComputedStyle(healthCell!).whiteSpace).toBe('nowrap')
  })
})

describe('经中继 / 直连 路径标签（发布进度）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('executePublish: 逐节点结果带 route 时追加路径标签', async () => {
    const { executePublish } = await import('../useClusterUtils')
    mockApiPost.mockResolvedValue({
      data: {
        status: 'ok',
        message: '发布完成',
        version: 3,
        results: [
          { node: '10.0.0.1:9180', status: 'success', route: 'relay' },
          { node: '10.0.0.2:9180', status: 'success', route: 'direct' },
        ],
      },
    })

    await executePublish({
      title: '发布上游',
      apiEndpoint: '/clusters/1/upstreams/publish',
      nodeIds: [1, 2],
      refreshFn: vi.fn(),
    })

    const text = document.body.textContent || ''
    expect(text).toContain('经中继')
    expect(text).toContain('直连')
  })

  it('executePublish: 无 route 字段 → 节点日志不含路径标签（向后兼容）', async () => {
    const { executePublish } = await import('../useClusterUtils')
    mockApiPost.mockResolvedValue({
      data: { status: 'ok', message: '发布完成', results: [{ node: '10.0.0.9:9180', status: 'success' }] },
    })

    await executePublish({
      title: '发布上游',
      apiEndpoint: '/clusters/1/upstreams/publish',
      nodeIds: [9],
      refreshFn: vi.fn(),
    })

    const text = document.body.textContent || ''
    expect(text).not.toContain('经中继')
    expect(text).not.toContain('直连')
  })
})

// ── 发布进度诚实化（route-management-ux-batch1 7.8，裁决 A）──────────────────
// 去固定假步骤（10→30→70→100）与 400ms 人为延迟；过程行「正在同步 N 个节点...」
// N=选中节点数（C2 钉死，非集群节点总数）；不确定态进度；完成一次性出结果；终态渲染不动。

describe('发布进度诚实化（route-management-ux-batch1 7.8）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('过程行「正在同步 N 个节点...」N=选中节点数（nodeIds.length）', async () => {
    const { executePublish } = await import('../useClusterUtils')
    mockApiPost.mockResolvedValue({ data: { status: 'ok', message: '发布完成' } })

    await executePublish({
      title: '发布路由: r1',
      apiEndpoint: '/clusters/1/routes/5/publish',
      nodeIds: [1, 2, 3],
      refreshFn: vi.fn(),
    })

    const text = document.body.textContent || ''
    expect(text).toContain('正在同步 3 个节点')
    expect(text).not.toContain('正在同步 0 个节点')
  })

  it('执行中不出现假步骤与假文案（10%/30%/70%、「正在构建发布配置」、100%），完成一次性出结果', async () => {
    const { executePublish } = await import('../useClusterUtils')
    let release!: (v: unknown) => void
    mockApiPost.mockImplementation(() => new Promise((resolve) => (release = resolve)))

    const task = executePublish({
      title: '发布路由: r1',
      apiEndpoint: '/clusters/1/routes/5/publish',
      nodeIds: [1, 2, 3],
      refreshFn: vi.fn(),
    })
    await vi.waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1))

    const during = document.body.textContent || ''
    expect(during).toContain('正在同步 3 个节点')
    expect(during).not.toContain('正在构建发布配置')
    expect(during).not.toContain('10%')
    expect(during).not.toContain('30%')
    expect(during).not.toContain('70%')
    expect(during).not.toContain('100%')
    expect(during).not.toContain('✅')

    release({ data: { status: 'ok', message: '发布完成' } })
    await task

    const after = document.body.textContent || ''
    expect(after).toContain('✅ 发布成功!')
  })
})

describe('发布/删除 长超时与 in-flight 锁（M7）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('executePublish: api.post 收到按请求 300s 超时覆盖（不吃全局 30s）', async () => {
    const { executePublish } = await import('../useClusterUtils')
    mockApiPost.mockResolvedValue({ data: { status: 'ok', message: '发布完成' } })

    await executePublish({
      title: '发布上游',
      apiEndpoint: '/clusters/1/upstreams/publish',
      nodeIds: [1],
      refreshFn: vi.fn(),
    })

    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/upstreams/publish', { node_ids: [1] }, { timeout: 300_000 })
  })

  it('executeDeleteWithProgress: api.delete 收到按请求 300s 超时覆盖', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({ data: { message: '路由已删除', results: [] } })

    await executeDeleteWithProgress({
      title: '删除路由',
      apiEndpoint: '/clusters/1/routes/5',
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn: vi.fn(),
    })

    expect(mockApiDelete).toHaveBeenCalledWith('/clusters/1/routes/5', expect.objectContaining({ timeout: 300_000 }))
  })

  it('executePublish 进行中二次调用被拒：不发第二次请求、告警一次、完成后锁释放', async () => {
    const { executePublish } = await import('../useClusterUtils')
    const { message } = await import('ant-design-vue')
    const warnSpy = vi.spyOn(message, 'warning')
    let release!: (v: unknown) => void
    mockApiPost.mockImplementation(
      (_url: string) =>
        new Promise((resolve) => {
          release = resolve
        }),
    )

    // 第一次调用进入 in-flight（入口同步置位，随后 await 400ms 模拟延时）
    const first = executePublish({
      title: '发布上游',
      apiEndpoint: '/clusters/1/upstreams/publish',
      nodeIds: [1],
      refreshFn: vi.fn(),
    })
    // 等第一次调用真正发出请求（穿过 400ms 入口延时）
    await vi.waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1))
    // 第二次并发调用：应立即被拒
    const second = await executePublish({
      title: '发布上游-并发',
      apiEndpoint: '/clusters/2/upstreams/publish',
      nodeIds: [2],
      refreshFn: vi.fn(),
    })

    expect(second).toBeUndefined()
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    // URL 感知：只放行了第一次调用的端点
    expect(mockApiPost.mock.calls[0][0]).toBe('/clusters/1/upstreams/publish')
    expect(warnSpy).toHaveBeenCalledWith('已有发布/删除任务进行中，请稍候')

    release({ data: { status: 'ok', message: '发布完成' } })
    await first
    warnSpy.mockClear()

    // 完成后锁释放：可再次发起
    mockApiPost.mockResolvedValue({ data: { status: 'ok', message: '发布完成' } })
    await executePublish({
      title: '发布上游-再次',
      apiEndpoint: '/clusters/3/upstreams/publish',
      nodeIds: [3],
      refreshFn: vi.fn(),
    })
    expect(mockApiPost).toHaveBeenCalledTimes(2)
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('executeDeleteWithProgress 进行中二次调用被拒：不发第二次请求、告警一次', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    const { message } = await import('ant-design-vue')
    const warnSpy = vi.spyOn(message, 'warning')
    let release!: (v: unknown) => void
    mockApiDelete.mockImplementation(
      (_url: string) =>
        new Promise((resolve) => {
          release = resolve
        }),
    )

    const first = executeDeleteWithProgress({
      title: '删除路由',
      apiEndpoint: '/clusters/1/routes/5',
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn: vi.fn(),
    })
    await vi.waitFor(() => expect(mockApiDelete).toHaveBeenCalledTimes(1))
    const second = await executeDeleteWithProgress({
      title: '删除路由-并发',
      apiEndpoint: '/clusters/2/routes/6',
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: false,
      nodeIds: [],
      refreshFn: vi.fn(),
    })

    expect(second).toBeUndefined()
    expect(mockApiDelete).toHaveBeenCalledTimes(1)
    expect(mockApiDelete.mock.calls[0][0]).toBe('/clusters/1/routes/5')
    expect(warnSpy).toHaveBeenCalledWith('已有发布/删除任务进行中，请稍候')

    release({ data: { message: '路由已删除', results: [] } })
    await first
    warnSpy.mockRestore()
  })
})

describe('发布失败/部分成功「重新发布」出口（upstream-ux-close-loop 3.4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  function findRepublishButton(): HTMLButtonElement | undefined {
    return Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('重新发布'))
  }

  it('partial 终态显示「重新发布」，点击后以相同参数重发且不双弹窗', async () => {
    const { executePublish } = await import('../useClusterUtils')
    mockApiPost
      .mockResolvedValueOnce({
        data: {
          status: 'partial',
          message: '部分节点发布失败',
          version: 3,
          results: [
            { node: '10.0.0.1:9180', status: 'success' },
            { node: '10.0.0.2:9180', status: 'failed', error: 'timeout' },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { status: 'ok', message: '发布完成', version: 4 } })
    const refreshFn = vi.fn()

    await executePublish({
      title: '发布上游: u1',
      apiEndpoint: '/clusters/1/upstreams/5/publish',
      nodeIds: [1, 2],
      refreshFn,
    })

    // 部分成功终态：「重新发布」按钮出现
    const btn = findRepublishButton()
    expect(btn).toBeTruthy()
    expect(document.body.textContent || '').toContain('部分成功')

    // 点击 → 关闭当前结果弹窗，以相同参数重发一次
    btn!.click()
    await vi.waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(2))

    // URL + payload 感知（约定 #43）：两次调用参数完全一致
    expect(mockApiPost.mock.calls[1][0]).toBe('/clusters/1/upstreams/5/publish')
    expect(mockApiPost.mock.calls[1][1]).toEqual({ node_ids: [1, 2] })

    // 重发全成功后：按钮消失，DOM 只剩一个弹窗（旧结果弹窗已关闭，无双弹窗）
    await vi.waitFor(() => {
      expect(findRepublishButton()).toBeUndefined()
      expect(document.querySelectorAll('.ant-modal').length).toBe(1)
    })
  })

  it('整体失败（请求异常）终态显示「重新发布」', async () => {
    const { executePublish } = await import('../useClusterUtils')
    mockApiPost.mockRejectedValueOnce({ response: { data: { detail: '连接失败' } } })

    await executePublish({
      title: '发布上游: u1',
      apiEndpoint: '/clusters/1/upstreams/5/publish',
      nodeIds: [1],
      refreshFn: vi.fn(),
    })

    expect(findRepublishButton()).toBeTruthy()
    expect(document.body.textContent || '').toContain('连接失败')
  })

  it('全部成功终态不显示「重新发布」', async () => {
    const { executePublish } = await import('../useClusterUtils')
    mockApiPost.mockResolvedValue({ data: { status: 'ok', message: '发布完成', version: 2 } })

    await executePublish({
      title: '发布上游: u1',
      apiEndpoint: '/clusters/1/upstreams/5/publish',
      nodeIds: [1],
      refreshFn: vi.fn(),
    })

    expect(findRepublishButton()).toBeUndefined()
  })
})

describe('删除确认 scope 风险提示（upstream-ux-close-loop 4.7）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('未勾选 Edge 节点时提示「仅删除平台记录，Edge 节点将继续运行该上游」', async () => {
    const { showDeleteConfirm } = await import('../useClusterUtils')
    showDeleteConfirm({
      title: '确定要删除上游 "u1" 吗？',
      apiEndpoint: '/clusters/1/upstreams/5',
      nodes: [{ id: 1, ip: '10.0.0.1', management_port: 9180 }],
      onOk: vi.fn(),
    })

    const text = document.body.textContent || ''
    expect(text).toContain('仅删除平台记录，Edge 节点将继续运行该上游')
  })

  it('勾选 Edge 节点后提示消失', async () => {
    const { showDeleteConfirm } = await import('../useClusterUtils')
    showDeleteConfirm({
      title: '确定要删除上游 "u1" 吗？',
      apiEndpoint: '/clusters/1/upstreams/5',
      nodes: [{ id: 1, ip: '10.0.0.1', management_port: 9180 }],
      onOk: vi.fn(),
    })

    // checkbox 顺序：0=数据库 1=Edge 节点（节点子选择初始隐藏但也在 DOM）
    const edgeCheckbox = document.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement
    edgeCheckbox.click()

    const text = document.body.textContent || ''
    expect(text).not.toContain('仅删除平台记录')
  })

  it('资源类型未知时兜底通用文案', async () => {
    const { showDeleteConfirm } = await import('../useClusterUtils')
    showDeleteConfirm({
      title: '确定要删除集群 "c1" 吗？',
      apiEndpoint: '/clusters/1',
      onOk: vi.fn(),
    })

    const text = document.body.textContent || ''
    expect(text).toContain('Edge 节点将继续运行该资源')
    expect(text).not.toContain('该上游')
  })
})

describe('删除确认通用附加警示行 extraWarning（global-rule-ux-close-loop 3.1）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  function findExtraWarningDiv(): HTMLElement | undefined {
    return Array.from(document.querySelectorAll('div')).find(
      (el) =>
        (el.getAttribute('style') || '').includes('var(--warning-bg)') && (el.textContent || '').includes('作用于集群'),
    )
  }

  it('传入 extraWarning：黄底警示行渲染完整文案，置于 scope 勾选区上方', async () => {
    const { showDeleteConfirm } = await import('../useClusterUtils')
    showDeleteConfirm({
      title: '确定要删除全局规则 "gr1" 吗？',
      apiEndpoint: '/clusters/1/global_rules/5',
      extraWarning: '全局规则作用于集群「c1」的全部路由；勾选 Edge 删除并执行后，所有路由将立即失去这组插件配置',
      onOk: vi.fn(),
    })

    const warningDiv = findExtraWarningDiv()
    expect(warningDiv, 'extraWarning 警示行必须渲染').toBeTruthy()
    // 样式复刻既有 isCluster 集群警示行（黄底）；jsdom 会规范化 style 空格，两侧均去空白后比对
    const style = (warningDiv!.getAttribute('style') || '').replace(/\s/g, '')
    expect(style).toContain('background:var(--warning-bg)')
    expect(style).toContain('border:1pxsolidvar(--warning)')
    expect(warningDiv!.textContent).toContain('所有路由将立即失去这组插件配置')

    // 置于 scope 区（数据库/Edge 勾选区）上方
    const scopeDiv = Array.from(document.querySelectorAll('div')).find((el) =>
      (el.textContent || '').trim().startsWith('数据库'),
    )
    expect(scopeDiv, 'scope 勾选区应存在').toBeTruthy()
    expect(warningDiv!.compareDocumentPosition(scopeDiv!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('extraWarning 未传或为空串：完全不渲染（既有资源默认行为不变，向后兼容）', async () => {
    const { showDeleteConfirm } = await import('../useClusterUtils')

    showDeleteConfirm({
      title: '确定要删除上游 "u1" 吗？',
      apiEndpoint: '/clusters/1/upstreams/5',
      onOk: vi.fn(),
    })
    expect(findExtraWarningDiv()).toBeUndefined()

    document.body.innerHTML = ''
    showDeleteConfirm({
      title: '确定要删除上游 "u2" 吗？',
      apiEndpoint: '/clusters/1/upstreams/6',
      extraWarning: '',
      onOk: vi.fn(),
    })
    expect(findExtraWarningDiv()).toBeUndefined()
  })

  it('isCluster 既有硬编码警示行不受 extraWarning 引入影响（回归）', async () => {
    const { showDeleteConfirm } = await import('../useClusterUtils')
    showDeleteConfirm({
      title: '确定要删除集群 "c1" 吗？',
      apiEndpoint: '/clusters/1',
      isCluster: true,
      onOk: vi.fn(),
    })

    const text = document.body.textContent || ''
    expect(text).toContain('删除集群将同时移除平台内该集群的全部资源记录与版本历史')
  })
})

describe('经中继 / 直连 路径标签（删除进度）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  async function runDelete(results: unknown[]) {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({ data: { message: '路由已删除', results } })
    await executeDeleteWithProgress({
      title: '删除路由',
      apiEndpoint: '/clusters/1/routes/5',
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: true,
      nodeIds: [10],
      refreshFn: vi.fn(),
    })
    return document.body.textContent || ''
  }

  it('edge + route=relay → 节点行尾（经中继）', async () => {
    const text = await runDelete([{ scope: 'edge', node: '10.0.0.1:9180', status: 'success', route: 'relay' }])
    expect(text).toContain('10.0.0.1:9180: ✅ （经中继）')
  })

  it('edge + route=direct → 节点行尾（直连）', async () => {
    const text = await runDelete([{ scope: 'edge', node: '10.0.0.2:9180', status: 'success', route: 'direct' }])
    expect(text).toContain('10.0.0.2:9180: ✅ （直连）')
  })

  it('edge 无 route 字段 → 不显示任何路径标注（向后兼容）', async () => {
    const text = await runDelete([{ scope: 'edge', node: '10.0.0.9:9180', status: 'success' }])
    expect(text).toContain('10.0.0.9:9180: ✅')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })

  it('带 detail 的 edge 行：标注追加在行尾', async () => {
    const text = await runDelete([
      { scope: 'edge', node: '10.0.0.1:9180', status: 'success', route: 'relay', details: { routes: 1 } },
    ])
    expect(text).toContain('10.0.0.1:9180: ✅ (路由:1 上游:0 插件组:0 全局规则:0 插件元数据:0) （经中继）')
  })

  it('scope=database 条目即使带 route 也不标注', async () => {
    const text = await runDelete([{ scope: 'database', status: 'success', message: '数据库已删除', route: 'relay' }])
    expect(text).toContain('数据库: 数据库已删除')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })

  it('edge 段 skipped 提示条目（无 node 字段）：渲染提示文案，不计入节点统计、无 undefined', async () => {
    // 后端 delete_on_nodes 无活跃节点时返回 scope=edge + status=skipped + message（无 node 字段）
    const text = await runDelete([{ scope: 'edge', status: 'skipped', message: '集群中没有活跃的 Edge 节点' }])
    expect(text).toContain('集群中没有活跃的 Edge 节点')
    // 提示条目不是节点行：不得出现 undefined 节点名，也不输出「总计」节点统计行
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('总计')
    expect(text).not.toContain('❌')
  })

  it('edge 段 skipped 提示与真实节点行混合：提示行 + 节点行 + 统计各自正确', async () => {
    const text = await runDelete([
      { scope: 'edge', status: 'skipped', message: '集群中没有活跃的 Edge 节点' },
      { scope: 'edge', node: '10.0.0.1:9180', status: 'success' },
    ])
    expect(text).toContain('集群中没有活跃的 Edge 节点')
    expect(text).toContain('10.0.0.1:9180: ✅')
    expect(text).not.toContain('undefined')
    expect(text).toContain('总计: 1 个节点, 成功 1 个, 失败 0 个')
  })
})

describe('删除集群编排 deleteClusterWithConfirm（cluster-ux-close-loop B1）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  function primaryBtn(): HTMLButtonElement {
    return document.querySelector('.ant-modal-footer .ant-btn-primary') as HTMLButtonElement
  }

  it('节点/统计接口均失败：确认弹窗照常弹出，提示齐全，确认后仍执行真实删除', async () => {
    const { deleteClusterWithConfirm } = await import('../useClusterUtils')
    mockApiGet.mockImplementation((url: string) => Promise.reject(new Error(`down: ${url}`)))
    mockApiDelete.mockResolvedValue({ data: { message: '集群已删除', results: [] } })
    const refreshFn = vi.fn()

    await deleteClusterWithConfirm({ id: 1, name: 'c1' }, { refreshFn })

    const text = document.body.textContent || ''
    // 清单区降级提示（spec cluster-delete-stats 场景2）
    expect(text).toContain('资源统计加载失败，不影响删除')
    // 节点明细不可用降级提示（spec cluster-delete-nodes 场景2）
    expect(text).toContain('节点明细不可用，Edge 删除将由后端遍历全部活跃节点')
    // 集群专属警示（黄底行，spec cluster-delete-confirm 场景2）
    expect(text).toContain('删除集群将同时移除平台内该集群的全部资源记录与版本历史')
    // 集群专属「仅删除平台记录」scope 文案
    expect(text).toContain('仅删除平台记录：该集群及全部资源记录从平台移除')
    expect(mockApiDelete).not.toHaveBeenCalled()

    // 勾选「数据库」→ 确认删除 → 名称确认 → 真实删除请求发出
    const dbCheckbox = document.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement
    dbCheckbox.click()
    primaryBtn().click()
    await vi.waitFor(() => expect(document.querySelector('.ant-modal input[type="text"]')).toBeTruthy())
    const nameInput = document.querySelector('.ant-modal input[type="text"]') as HTMLInputElement
    nameInput.value = 'c1'
    nameInput.dispatchEvent(new Event('input'))
    await vi.waitFor(() => expect(primaryBtn().disabled).toBe(false))
    primaryBtn().click()

    await vi.waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith(
        '/clusters/1',
        expect.objectContaining({ data: { delete_db: true, delete_edge: false, node_ids: undefined } }),
      ),
    )
    expect(refreshFn).toHaveBeenCalled()
  })

  it('统计成功：清单显示中文「静态资源」标签与合计行', async () => {
    const { deleteClusterWithConfirm } = await import('../useClusterUtils')
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/nodes')) return Promise.resolve({ data: { items: [] } })
      if (url.includes('/stats'))
        return Promise.resolve({
          data: { nodes: 1, routes: 2, static_resources: 3, config_versions: 4 },
        })
      return Promise.reject(new Error(`unexpected: ${url}`))
    })

    await deleteClusterWithConfirm({ id: 1, name: 'c1' }, { refreshFn: vi.fn() })

    const text = document.body.textContent || ''
    expect(text).toContain('静态资源')
    expect(text).toContain('配置版本历史')
    expect(text).toContain('合计')
    expect(text).toContain('10 条记录')
    expect(text).not.toContain('static_resources')
  })

  it('节点明细不可用时勾选 Edge：可直接确认（delete_edge=true、node_ids 不传）', async () => {
    const { deleteClusterWithConfirm } = await import('../useClusterUtils')
    mockApiGet.mockImplementation((url: string) => Promise.reject(new Error(`down: ${url}`)))
    mockApiDelete.mockResolvedValue({ data: { message: '集群已删除', results: [] } })

    await deleteClusterWithConfirm({ id: 2, name: 'c2' }, { refreshFn: vi.fn() })

    const edgeCheckbox = document.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement
    edgeCheckbox.click()
    await vi.waitFor(() => expect(primaryBtn().disabled).toBe(false))
    primaryBtn().click()
    await vi.waitFor(() => expect(document.querySelector('.ant-modal input[type="text"]')).toBeTruthy())
    const nameInput = document.querySelector('.ant-modal input[type="text"]') as HTMLInputElement
    nameInput.value = 'c2'
    nameInput.dispatchEvent(new Event('input'))
    await vi.waitFor(() => expect(primaryBtn().disabled).toBe(false))
    primaryBtn().click()

    await vi.waitFor(() =>
      expect(mockApiDelete).toHaveBeenCalledWith(
        '/clusters/2',
        expect.objectContaining({ data: { delete_db: false, delete_edge: true, node_ids: undefined } }),
      ),
    )
  })

  it('节点可用但未勾选任何节点：确认按钮禁用（存量语义不回归）', async () => {
    const { deleteClusterWithConfirm } = await import('../useClusterUtils')
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/nodes'))
        return Promise.resolve({ data: { items: [{ id: 7, ip: '10.0.0.7', management_port: 9180 }] } })
      if (url.includes('/stats')) return Promise.resolve({ data: { nodes: 1 } })
      return Promise.reject(new Error(`unexpected: ${url}`))
    })

    await deleteClusterWithConfirm({ id: 1, name: 'c1' }, { refreshFn: vi.fn() })

    // 初始：未勾任何项 → 禁用
    expect(primaryBtn().disabled).toBe(true)
    // 勾选 Edge 但未勾节点 → 仍禁用
    const edgeCheckbox = document.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement
    edgeCheckbox.click()
    expect(primaryBtn().disabled).toBe(true)
    // 勾选节点 → 解禁
    const nodeCheckbox = document.querySelectorAll('input[type="checkbox"]')[2] as HTMLInputElement
    nodeCheckbox.click()
    expect(primaryBtn().disabled).toBe(false)
  })

  it('名称确认以 display_name 优先：输入系统名不通过、输入显示名通过', async () => {
    const { deleteClusterWithConfirm } = await import('../useClusterUtils')
    mockApiGet.mockImplementation((url: string) => Promise.reject(new Error(`down: ${url}`)))

    await deleteClusterWithConfirm({ id: 1, name: 'sys-c1', display_name: '显示名' }, { refreshFn: vi.fn() })

    const dbCheckbox = document.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement
    dbCheckbox.click()
    primaryBtn().click()
    await vi.waitFor(() => expect(document.querySelector('.ant-modal input[type="text"]')).toBeTruthy())
    const nameInput = document.querySelector('.ant-modal input[type="text"]') as HTMLInputElement

    nameInput.value = 'sys-c1'
    nameInput.dispatchEvent(new Event('input'))
    expect(primaryBtn().disabled).toBe(true)

    nameInput.value = '显示名'
    nameInput.dispatchEvent(new Event('input'))
    expect(primaryBtn().disabled).toBe(false)
  })
})

// ── 状态值中文映射（plugin-group-ux-close-loop L5，仅展示层）────────────────────

describe('发布/删除进度状态值中文映射（L5，以 edge_sync 真实产出为准）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('逐节点 success/failed/skipped/pending → 成功/失败/跳过/执行中', async () => {
    const { executePublish } = await import('../useClusterUtils')
    mockApiPost.mockResolvedValue({
      data: {
        status: 'ok',
        message: '发布完成',
        results: [
          { node: '10.0.0.1:9180', status: 'success' },
          { node: '10.0.0.2:9180', status: 'failed', error: 'connect timeout' },
          { node: '10.0.0.3:9180', status: 'skipped' },
          { node: '10.0.0.4:9180', status: 'pending' },
        ],
      },
    })

    await executePublish({
      title: '发布插件组',
      apiEndpoint: '/clusters/1/plugin_configs/5/publish',
      nodeIds: [1, 2, 3, 4],
      refreshFn: vi.fn(),
    })

    const text = document.body.textContent || ''
    expect(text).toContain('10.0.0.1:9180: 成功')
    expect(text).toContain('10.0.0.2:9180: 失败 - connect timeout')
    expect(text).toContain('10.0.0.3:9180: 跳过')
    expect(text).toContain('10.0.0.4:9180: 执行中')
    // 原始英文枚举不再直出
    expect(text).not.toContain(': success')
    expect(text).not.toContain(': failed')
  })

  it('顶层无活跃节点 error/ok → 状态: 失败/成功', async () => {
    const { executePublish } = await import('../useClusterUtils')
    mockApiPost.mockResolvedValue({ data: { status: 'error', message: '无可发布节点' } })

    await executePublish({
      title: '发布插件组',
      apiEndpoint: '/clusters/1/plugin_configs/5/publish',
      nodeIds: [1],
      refreshFn: vi.fn(),
    })
    let text = document.body.textContent || ''
    expect(text).toContain('状态: 失败')

    document.body.innerHTML = ''
    mockApiPost.mockResolvedValue({ data: { status: 'ok', message: '发布完成' } })
    await executePublish({
      title: '发布插件组',
      apiEndpoint: '/clusters/1/plugin_configs/5/publish',
      nodeIds: [1],
      refreshFn: vi.fn(),
    })
    text = document.body.textContent || ''
    expect(text).toContain('状态: 成功')
  })

  it('删除批量腿：顶层枚举映射中文（success→成功/failed→失败），未知枚举原样回显', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({
      data: {
        message: '批量删除完成',
        results: [
          { id: 1, route_name: 'route-a', status: 'success' },
          { id: 2, route_name: 'route-b', status: 'failed', error: 'db locked' },
          { id: 3, route_name: 'route-c', status: 'exotic_status' },
        ],
      },
    })

    await executeDeleteWithProgress({
      title: '批量删除路由',
      apiEndpoint: '/clusters/1/routes',
      routeIds: [1, 2, 3],
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: true,
      nodeIds: [],
      refreshFn: vi.fn(),
    })

    const text = document.body.textContent || ''
    expect(text).toContain('删除路由 route-a: 成功')
    expect(text).toContain('删除路由 route-b: 失败 / db locked')
    // 未知枚举不在映射表 → 原样回显，不吞信息
    expect(text).toContain('删除路由 route-c: exotic_status')
  })
})

// ── 插件组删除前置引用检查（决策 A/B，主页面与集群子页共享实现）──────────────────

describe('deletePluginConfigWithReferenceCheck（插件组删除引用分流）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('引用非空：阻断提示列出路由名，无任何删除入口，操作仅「我知道了」', async () => {
    const { deletePluginConfigWithReferenceCheck } = await import('../useClusterUtils')
    mockApiGet.mockResolvedValue({
      data: {
        name: 'rate-limit',
        referenced_by: [
          { route_id: 1, route_name: 'route-a' },
          { route_id: 2, route_name: 'route-b' },
          { route_id: 3, route_name: 'route-c' },
          { route_id: 4, route_name: 'route-d' },
          { route_id: 5, route_name: 'route-e' },
        ],
      },
    })
    const onUnreferenced = vi.fn()

    await deletePluginConfigWithReferenceCheck({
      apiEndpoint: '/clusters/1/plugin_configs/5',
      onUnreferenced,
    })

    expect(onUnreferenced).not.toHaveBeenCalled()
    const overlay = Array.from(document.body.querySelectorAll('.modal-overlay')).find((el) =>
      (el.textContent || '').includes('仍被 5 条路由引用'),
    )
    expect(overlay).toBeTruthy()
    const text = overlay!.textContent || ''
    expect(text).toContain('插件组「rate-limit」')
    expect(text).toContain('route-a')
    expect(text).toContain('route-c')
    // 超 3 条折叠「等」
    expect(text).toContain('等 5 条路由')
    expect(text).not.toContain('route-d')
    // 网关侧与平台侧均不允许删除（防路由插件引用悬空）
    expect(text).toContain('网关侧与平台侧均不允许删除')
    // 无任何删除入口：操作仅「我知道了」（× 关闭钮除外），无「取消」
    const actionButtons = Array.from(overlay!.querySelectorAll('button'))
      .filter((b) => !b.className.includes('modal-close'))
      .map((b) => b.textContent || '')
    expect(actionButtons).toEqual(['我知道了'])

    // 点击「我知道了」仅关闭提示：不走任何删除流程
    const okBtn = Array.from(overlay!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('我知道了'),
    ) as HTMLButtonElement
    okBtn!.click()
    await vi.waitFor(() => expect(document.body.querySelector('.modal-overlay')).toBeNull())
    expect(onUnreferenced).not.toHaveBeenCalled()
    expect(mockApiDelete).not.toHaveBeenCalled()
  })

  it('无引用：走既有流程（onUnreferenced）', async () => {
    const { deletePluginConfigWithReferenceCheck } = await import('../useClusterUtils')
    mockApiGet.mockResolvedValue({ data: { name: 'free-pg', referenced_by: [] } })
    const onUnreferenced = vi.fn()

    await deletePluginConfigWithReferenceCheck({
      apiEndpoint: '/clusters/1/plugin_configs/5',
      onUnreferenced,
    })

    expect(onUnreferenced).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('.modal-overlay')).toBeNull()
  })

  it('引用查询失败：兜底走既有流程（后端 PLG-07 守卫仍是最终防线）', async () => {
    const { deletePluginConfigWithReferenceCheck } = await import('../useClusterUtils')
    mockApiGet.mockRejectedValue(new Error('boom'))
    const onUnreferenced = vi.fn()

    await deletePluginConfigWithReferenceCheck({
      apiEndpoint: '/clusters/1/plugin_configs/5',
      onUnreferenced,
    })

    expect(onUnreferenced).toHaveBeenCalledTimes(1)
  })
})

// ── 节点删除确认变体 showNodeDeleteConfirm（node-management-ux-batch1 1.2）──────────
// 与通用 showDeleteConfirm 同款 AppModal 形态，但语义固定：删除数据库必选、无任何
// scope 勾选框（Edge/OpenResty 进程不受影响是「告知」不是「选项」），三层后果前置。

describe('showNodeDeleteConfirm（节点删除确认变体）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  function modalText(): string {
    return document.body.textContent || ''
  }

  it('标题「删除节点 {ip}」，三层后果文案完整前置', async () => {
    const { showNodeDeleteConfirm } = await import('../useClusterUtils')
    showNodeDeleteConfirm({ ip: '10.0.0.5', onOk: vi.fn() })

    const text = modalText()
    expect(text).toContain('删除节点 10.0.0.5')
    // 三层后果：平台记录 / 进程不受影响 / 白名单与发布
    expect(text).toContain('平台管理记录将被删除，不可恢复，如需恢复须重新添加节点')
    expect(text).toContain('节点机上的 Edge/OpenResty 进程不受影响，将继续运行（脱离平台监控）')
    expect(text).toContain('该节点将从下次发布与中继网关白名单中移除')
    // 引导文案：先停流量再删除
    expect(text).toContain('如需先停止流量，请先执行『停止』操作')
  })

  it('复用 AppModal 形态（约定 #25）：danger 确认按钮、可取消关闭', async () => {
    const { showNodeDeleteConfirm } = await import('../useClusterUtils')
    showNodeDeleteConfirm({ ip: '10.0.0.5', onOk: vi.fn() })

    const okBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('确认删除'),
    )
    expect(okBtn, 'AppModal 底部应有 danger 确认按钮').toBeTruthy()
    expect(okBtn!.className).toContain('ant-btn-dangerous')

    const cancelBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').replace(/\s/g, '').includes('取消'),
    )
    expect(cancelBtn, 'AppModal 底部应有取消按钮').toBeTruthy()
  })

  it('无任何勾选框：删除数据库固定为是，确认即可执行（不依赖勾选）', async () => {
    const { showNodeDeleteConfirm } = await import('../useClusterUtils')
    const onOk = vi.fn()
    showNodeDeleteConfirm({ ip: '10.0.0.5', onOk })

    expect(document.body.querySelectorAll('input[type="checkbox"]').length).toBe(0)

    const okBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('确认删除'),
    ) as HTMLButtonElement
    okBtn!.click()
    await vi.waitFor(() => expect(onOk).toHaveBeenCalledTimes(1))
    // 固定语义：删除数据库=是，删除 Edge=否
    expect(onOk).toHaveBeenCalledWith(true, false, [])
    await vi.waitFor(() => expect(document.body.textContent || '').not.toContain('删除节点 10.0.0.5'))
  })

  it('点击取消：仅关闭，onOk 不触发', async () => {
    const { showNodeDeleteConfirm } = await import('../useClusterUtils')
    const onOk = vi.fn()
    showNodeDeleteConfirm({ ip: '10.0.0.5', onOk })

    const cancelBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').replace(/\s/g, '').includes('取消'),
    ) as HTMLButtonElement
    cancelBtn!.click()
    await vi.waitFor(() => expect(document.body.textContent || '').not.toContain('删除节点 10.0.0.5'))
    expect(onOk).not.toHaveBeenCalled()
  })
})

// ── 全量拉取集群节点工具 fetchAllClusterNodes（route-management-ux-batch1 组2）────────
// 契约：分页循环拉取（page=1..N，page_size=500 封顶）聚合全部节点；任一页失败 → 整体抛错
// （不返回部分清单）；聚合数量与后端 total 不符 → 抛错（防静默截断）。

describe('fetchAllClusterNodes 全量拉取集群节点（route-management-ux-batch1 组2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  function makeNodes(from: number, count: number) {
    return Array.from({ length: count }, (_, i) => {
      const id = from + i
      return {
        id,
        ip: `10.${Math.floor(id / 254) % 254}.${(id % 254) + 1}.9`,
        service_port: 16610,
        management_port: 16620,
        status: 1,
      }
    })
  }

  it('单页（total ≤ 500）：一次请求取全，参数 page=1 & page_size=500', async () => {
    const { fetchAllClusterNodes } = await import('../useClusterUtils')
    mockApiGet.mockResolvedValue({ data: { total: 3, items: makeNodes(1, 3) } })

    const nodes = await fetchAllClusterNodes(7)

    expect(nodes).toHaveLength(3)
    expect(nodes.map((n: { id: number }) => n.id)).toEqual([1, 2, 3])
    expect(mockApiGet).toHaveBeenCalledTimes(1)
    expect(mockApiGet).toHaveBeenCalledWith('/clusters/7/nodes', { params: { page: 1, page_size: 500 } })
  })

  it('0 节点（total=0）：返回空数组，不抛错', async () => {
    const { fetchAllClusterNodes } = await import('../useClusterUtils')
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })

    const nodes = await fetchAllClusterNodes(7)

    expect(nodes).toEqual([])
    expect(mockApiGet).toHaveBeenCalledTimes(1)
  })

  it('多页聚合（total=600 > 500）：续拉 page=2 并按序合并全部节点', async () => {
    const { fetchAllClusterNodes } = await import('../useClusterUtils')
    const page1 = makeNodes(1, 500)
    const page2 = makeNodes(501, 100)
    mockApiGet.mockImplementation((_url: string, cfg?: { params?: { page?: number } }) =>
      Promise.resolve({ data: { total: 600, items: cfg?.params?.page === 1 ? page1 : page2 } }),
    )

    const nodes = await fetchAllClusterNodes(7)

    expect(nodes).toHaveLength(600)
    expect(nodes[0].id).toBe(1)
    expect(nodes[499].id).toBe(500)
    expect(nodes[599].id).toBe(600)
    const pages = mockApiGet.mock.calls.map((c) => (c[1] as { params: { page: number } }).params.page)
    expect(pages).toEqual([1, 2])
    for (const call of mockApiGet.mock.calls) {
      expect((call[1] as { params: { page_size: number } }).params.page_size).toBe(500)
    }
  })

  it('任一页失败（第 2 页）：整体抛错，不返回部分清单', async () => {
    const { fetchAllClusterNodes } = await import('../useClusterUtils')
    mockApiGet.mockImplementation((_url: string, cfg?: { params?: { page?: number } }) =>
      cfg?.params?.page === 1
        ? Promise.resolve({ data: { total: 600, items: makeNodes(1, 500) } })
        : Promise.reject(new Error('第 2 页拉取失败')),
    )

    await expect(fetchAllClusterNodes(7)).rejects.toThrow('第 2 页拉取失败')
  })

  it('聚合数量与 total 不符：抛错防静默截断', async () => {
    const { fetchAllClusterNodes } = await import('../useClusterUtils')
    mockApiGet.mockImplementation((_url: string, cfg?: { params?: { page?: number } }) => {
      const page = cfg?.params?.page ?? 1
      if (page === 1) return Promise.resolve({ data: { total: 600, items: makeNodes(1, 500) } })
      if (page === 2) return Promise.resolve({ data: { total: 600, items: makeNodes(501, 50) } })
      return Promise.resolve({ data: { total: 600, items: [] } })
    })

    await expect(fetchAllClusterNodes(7)).rejects.toThrow('节点清单拉取不完整')
    await expect(fetchAllClusterNodes(7)).rejects.toThrow('期望 600 个，实际 550 个')
  })

  it('旧响应形状缺 total：按单页处理不抛错（向后兼容）', async () => {
    const { fetchAllClusterNodes } = await import('../useClusterUtils')
    mockApiGet.mockResolvedValue({ data: { items: makeNodes(1, 2) } })

    const nodes = await fetchAllClusterNodes(7)

    expect(nodes).toHaveLength(2)
    expect(mockApiGet).toHaveBeenCalledTimes(1)
  })
})

describe('删除确认 Edge 后果行 edgeConsequenceHint（ssl-ux-review-fixes 6.8）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('未传 edgeConsequenceHint：勾选 Edge 后无后果行（其它域 DOM 不变）', async () => {
    const { showDeleteConfirm } = await import('../useClusterUtils')
    showDeleteConfirm({
      title: '确定要删除上游 "u1" 吗？',
      apiEndpoint: '/clusters/1/upstreams/5',
      nodes: [{ id: 1, ip: '10.0.0.1', management_port: 9180 }],
      onOk: vi.fn(),
    })
    const edgeCheckbox = document.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement
    edgeCheckbox.click()
    expect(document.body.textContent || '').not.toContain('无法建立 TLS 连接')
  })

  it('SSL 传入后果文案：勾选 Edge 后显示后果行，未勾选不显示', async () => {
    const { showDeleteConfirm } = await import('../useClusterUtils')
    showDeleteConfirm({
      title: '确定要删除 SSL 证书 "srv" 吗？',
      apiEndpoint: '/clusters/1/ssl/3',
      nodes: [{ id: 1, ip: '10.0.0.1', management_port: 9180 }],
      edgeConsequenceHint: '将从所选节点移除该证书，使用它的 HTTPS 域名将无法建立 TLS 连接',
      onOk: vi.fn(),
    })
    expect(document.body.textContent || '').not.toContain('无法建立 TLS 连接')
    const edgeCheckbox = document.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement
    edgeCheckbox.click()
    expect(document.body.textContent || '').toContain('将从所选节点移除该证书，使用它的 HTTPS 域名将无法建立 TLS 连接')
  })
})

// ── 部分失败重试 + 删除确认节点标识（stream-proxy-ux-review-fixes 批 3）──
describe('executeDeleteWithProgress 重试删除（retryable）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('部分失败 + retryable：终态渲染「重试删除」按钮，点击仅对失败节点重跑且 delete_db=false', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    // 3 节点选 3，其中 2 失败；库删除成功
    const results = [
      { scope: 'database', status: 'success', message: '已删除' },
      { scope: 'edge', status: 'success', node: '10.0.0.1:9180' },
      { scope: 'edge', status: 'failed', node: '10.0.0.2:9180', error: 'timeout' },
      { scope: 'edge', status: 'failed', node: '10.0.0.3:9180', error: 'conn refused' },
    ]
    mockApiDelete.mockResolvedValueOnce({ data: { message: 'ok', results } })
    mockApiDelete.mockResolvedValueOnce({
      data: { message: 'ok', results: [{ scope: 'edge', status: 'success', node: '10.0.0.2:9180' }] },
    })

    const opts = {
      title: '删除四层代理: x',
      apiEndpoint: '/clusters/1/stream-proxies/9',
      cluster: {
        id: 1,
        nodes: [
          { id: 11, ip: '10.0.0.1', management_port: 9180 },
          { id: 12, ip: '10.0.0.2', management_port: 9180 },
          { id: 13, ip: '10.0.0.3', management_port: 9180 },
        ],
      },
      deleteDb: true,
      deleteEdge: true,
      nodeIds: [11, 12, 13],
      refreshFn: vi.fn(),
      retryable: true as const,
    }
    await executeDeleteWithProgress(opts)

    // 终态按钮「重试删除」已渲染
    const retryBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === '重试删除')
    expect(retryBtn).toBeTruthy()
    ;(retryBtn as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 50))
    await vi.waitFor(() => {
      expect(mockApiDelete).toHaveBeenCalledTimes(2)
    })
    const secondCall = mockApiDelete.mock.calls[1]
    expect(secondCall[1].data.delete_db).toBe(false)
    expect(secondCall[1].data.delete_edge).toBe(true)
    expect([...secondCall[1].data.node_ids].sort()).toEqual([12, 13])
  })

  it('部分失败但未开 retryable：不渲染重试按钮（既有消费方行为不变）', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({
      data: {
        message: 'ok',
        results: [
          { scope: 'database', status: 'success', message: '已删除' },
          { scope: 'edge', status: 'failed', node: '10.0.0.2:9180', error: 'timeout' },
        ],
      },
    })
    await executeDeleteWithProgress({
      title: 'x',
      apiEndpoint: '/clusters/1/upstreams/1',
      cluster: makeCluster(),
      deleteDb: true,
      deleteEdge: true,
      nodeIds: [1],
      refreshFn: vi.fn(),
    })
    const retryBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === '重试删除')
    expect(retryBtn).toBeFalsy()
  })
})

describe('showDeleteConfirm 节点在线标识与默认全选（opt-in）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('defaultSelectOnline + status：在线默认勾选、离线默认不选且带标识；全选在线/取消全选可用', async () => {
    const { showDeleteConfirm } = await import('../useClusterUtils')
    showDeleteConfirm({
      title: '删除确认',
      apiEndpoint: '/clusters/1/stream-proxies/9',
      nodes: [
        { id: 1, ip: '10.0.0.1', management_port: 9180, status: 1 },
        { id: 2, ip: '10.0.0.2', management_port: 9180, status: 0 },
      ],
      defaultSelectOnline: true,
      subsetConsequence: '未选中的 {n} 个节点将保留该转发规则并继续承载流量',
      onOk: () => {},
    })
    // 节点区在勾选「同时删除 Edge 节点」（第二个 scope checkbox）后才可见
    const scopeBoxes = [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]
    scopeBoxes[1].click()
    await Promise.resolve()
    const text = document.body.textContent ?? ''
    expect(text).toContain('在线')
    expect(text).toContain('离线')
    expect(text).toContain('未选中的 1 个节点将保留该转发规则并继续承载流量')
    expect(text).toContain('全选在线')
    // 在线默认勾选（前两个 checkbox 是 数据库/Edge scope，节点框从下标 2 起）
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]
    expect(boxes[2].checked).toBe(true)
    expect(boxes[3].checked).toBe(false)
  })

  it('未传 opt-in 参数的既有消费方：DOM 不变（无在线/离线标识）', async () => {
    const { showDeleteConfirm } = await import('../useClusterUtils')
    showDeleteConfirm({
      title: '删除确认',
      apiEndpoint: '/clusters/1/upstreams/1',
      nodes: [
        { id: 1, ip: '10.0.0.1', management_port: 9180 },
        { id: 2, ip: '10.0.0.2', management_port: 9180 },
      ],
      onOk: () => {},
    })
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('全选在线')
    expect(text).not.toContain('未选中的')
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]
    expect(boxes.every((b) => !b.checked)).toBe(true)
  })
})
