import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  }
}))

describe('nodes API module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listNodes calls GET /nodes with params', async () => {
    mockApiGet.mockResolvedValue({ data: { total: 0, page: 1, page_size: 20, items: [] } })
    const { listNodes } = await import('../nodes')
    await listNodes({ page: 1, pageSize: 20 })
    expect(mockApiGet).toHaveBeenCalledWith('/nodes', { params: { page: 1, page_size: 20 } })
  })

  it('listNodes forwards cluster_id filter', async () => {
    mockApiGet.mockResolvedValue({ data: { total: 0, page: 1, page_size: 20, items: [] } })
    const { listNodes } = await import('../nodes')
    await listNodes({ clusterId: 2 })
    expect(mockApiGet).toHaveBeenCalledWith('/nodes', { params: { cluster_id: 2, page: 1, page_size: 20 } })
  })

  it('listNodes forwards search and status filters', async () => {
    mockApiGet.mockResolvedValue({ data: { total: 0, page: 1, page_size: 20, items: [] } })
    const { listNodes } = await import('../nodes')
    await listNodes({ search: '10.0', status: 1 })
    expect(mockApiGet).toHaveBeenCalledWith('/nodes', { params: { search: '10.0', status: 1, page: 1, page_size: 20 } })
  })

  it('createNode calls POST /clusters/{clusterId}/nodes', async () => {
    mockApiPost.mockResolvedValue({ data: { id: 1 } })
    const { createNode } = await import('../nodes')
    await createNode(1, { ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/usr/local/edge', status: 1 })
    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes', {
      ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/usr/local/edge', status: 1,
    })
  })

  it('updateNode calls PUT /clusters/{clusterId}/nodes/{nodeId}', async () => {
    mockApiPut.mockResolvedValue({ data: { id: 1 } })
    const { updateNode } = await import('../nodes')
    await updateNode(1, 1, { service_port: 8080 })
    expect(mockApiPut).toHaveBeenCalledWith('/clusters/1/nodes/1', { service_port: 8080 })
  })

  it('deleteNode calls DELETE /clusters/{clusterId}/nodes/{nodeId}', async () => {
    mockApiDelete.mockResolvedValue({ data: {} })
    const { deleteNode } = await import('../nodes')
    await deleteNode(1, 1, { delete_db: true, delete_edge: false })
    expect(mockApiDelete).toHaveBeenCalledWith('/clusters/1/nodes/1', {
      data: { delete_db: true, delete_edge: false },
    })
  })

  it('startNode calls POST /clusters/{clusterId}/nodes/{nodeId}/start', async () => {
    mockApiPost.mockResolvedValue({ data: {} })
    const { startNode } = await import('../nodes')
    await startNode(1, 1)
    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/1/start')
  })

  it('stopNode calls POST /clusters/{clusterId}/nodes/{nodeId}/stop', async () => {
    mockApiPost.mockResolvedValue({ data: {} })
    const { stopNode } = await import('../nodes')
    await stopNode(1, 1)
    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/1/stop')
  })

  it('queryNodeStatus calls POST /clusters/{clusterId}/nodes/{nodeId}/statistic', async () => {
    mockApiPost.mockResolvedValue({ data: {} })
    const { queryNodeStatus } = await import('../nodes')
    await queryNodeStatus(1, 1)
    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/1/statistic', { ports: '9180' })
  })
})
