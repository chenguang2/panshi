import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiDelete = vi.fn()
vi.mock('@/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: (...args: any[]) => mockApiDelete(...args) },
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
    })
  })

  it('logs per-route results in batch mode', async () => {
    const { executeDeleteWithProgress } = await import('../useClusterUtils')
    mockApiDelete.mockResolvedValue({
      data: {
        message: '批量删除完成',
        results: [
          {
            route_id: 1, route_name: 'login-api', status: 'success',
            results: [
              { scope: 'database', status: 'success' },
              { node: '10.0.0.1:9180', scope: 'edge', status: 'success' },
            ],
          },
          {
            route_id: 2, route_name: 'order-api', status: 'success',
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
            route_id: 1, route_name: 'a', status: 'success',
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
            upstream_id: 1, upstream_name: 'ref-upstream', status: 'failed',
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
            upstream_id: 2, upstream_name: 'edge-fail-upstream', status: 'failed',
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
            upstream_id: 10, upstream_name: 'login-api', status: 'success',
            results: [
              { scope: 'database', status: 'success' },
              { node: '10.0.0.1:9180', scope: 'edge', status: 'success' },
            ],
          },
          {
            upstream_id: 11, upstream_name: 'order-api', status: 'success',
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
          detail: [
            { loc: ['body', 'upstream_ids'], msg: 'Field required', type: 'missing' },
          ],
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

    expect(document.querySelector('.modal-overlay .modal')).not.toBeNull()
    expect(document.querySelector('.modal-header h2')?.textContent).toContain('删除上游')
    expect(document.querySelector('.modal-footer .btn-primary')).not.toBeNull()
  })

  it('renders batch status modal as a table with version and health columns', async () => {
    const { showBatchStatusModal } = await import('../useClusterUtils')
    showBatchStatusModal('批量状态查询', [
      { ip: '10.0.0.1', status: 'success', version: 'v1.2.3', healthy: true },
      { ip: '10.0.0.2', status: 'error', detail: '连接超时', version: '', healthy: false },
    ])

    const modal = document.querySelector('.modal-overlay .modal')
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
        ip: '10.0.0.1', status: 'success', version: 'v1.2.3', healthy: true,
        command: 'ansible-playbook ...', stdout: 'cpu_usage: 1.5', stderr: '',
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
        ip: '10.0.0.1', status: 'success', version: 'v1.2.3', healthy: true,
        command: longLine, stdout: 'stdout', stderr: '',
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
