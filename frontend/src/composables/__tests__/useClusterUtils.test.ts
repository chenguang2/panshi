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
