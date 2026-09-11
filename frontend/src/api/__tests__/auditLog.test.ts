import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

async function loadModule() {
  return await import('../auditLog')
}

describe('auditLog api — 归档清理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('previewArchiveAuditLogs calls POST /system/operations/archive/preview', async () => {
    const api = await loadModule()
    mockPost.mockResolvedValue({ data: { count: 2, oldest: null, newest: null } })
    await api.previewArchiveAuditLogs('2025-06-01')
    expect(mockPost).toHaveBeenCalledWith('/system/operations/archive/preview', { before: '2025-06-01' })
  })

  it('archiveAuditLogs calls POST /system/operations/archive', async () => {
    const api = await loadModule()
    mockPost.mockResolvedValue({ data: { archived: 2, task_id: 't1', file: 'a.csv' } })
    await api.archiveAuditLogs('2025-06-01')
    expect(mockPost).toHaveBeenCalledWith('/system/operations/archive', { before: '2025-06-01' })
  })

  it('downloadExport fetches blob with auth header (not top-level navigation)', async () => {
    const api = await loadModule()
    mockGet.mockResolvedValue({ data: new Blob(['a,b']) })
    await api.downloadExport('task-1')
    // 必须走 axios 实例（自动带 Authorization 头 + blob 响应），不能用 window.location 导航
    expect(mockGet).toHaveBeenCalledWith('/system/operations/export/task-1/download', {
      responseType: 'blob',
    })
  })
})
