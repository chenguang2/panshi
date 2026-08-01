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
})
