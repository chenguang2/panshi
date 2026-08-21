import { describe, it, expect, vi, beforeEach } from 'vitest'

// The `database` api module (../database) is not imported at top level because
// it does not exist yet (TDD red phase). We dynamically import it after the
// api/index mock is installed.
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}))

async function loadModule() {
  return await import('../database')
}

describe('database api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getDatabaseStatus calls GET /database/status', async () => {
    const db = await loadModule()
    mockGet.mockResolvedValue({ data: { active: null, connections_count: 0, version: 1 } })
    await db.getDatabaseStatus()
    expect(mockGet).toHaveBeenCalledWith('/database/status')
  })

  it('listConnections calls GET /database/connections', async () => {
    const db = await loadModule()
    mockGet.mockResolvedValue({ data: [] })
    await db.listConnections()
    expect(mockGet).toHaveBeenCalledWith('/database/connections')
  })

  it('createConnection posts type/name to /database/connections', async () => {
    const db = await loadModule()
    await db.createConnection({ type: 'postgres', name: 'pg', host: 'localhost', port: 5432 })
    expect(mockPost).toHaveBeenCalledWith('/database/connections', expect.objectContaining({ type: 'postgres', name: 'pg' }))
  })

  it('updateConnection puts to /database/connections/{id}', async () => {
    const db = await loadModule()
    await db.updateConnection('conn_1', { name: 'renamed' })
    expect(mockPut).toHaveBeenCalledWith('/database/connections/conn_1', { name: 'renamed' })
  })

  it('deleteConnection deletes /database/connections/{id}', async () => {
    const db = await loadModule()
    await db.deleteConnection('conn_1')
    expect(mockDelete).toHaveBeenCalledWith('/database/connections/conn_1')
  })

  it('testConnection posts to /database/connections/{id}/test', async () => {
    const db = await loadModule()
    mockPost.mockResolvedValue({ data: { success: true, detail: '连接成功' } })
    const res = await db.testConnection('conn_1')
    expect(mockPost).toHaveBeenCalledWith('/database/connections/conn_1/test')
    expect(res.data.success).toBe(true)
  })

  it('switchDatabase posts connection_id to /database/switch', async () => {
    const db = await loadModule()
    await db.switchDatabase('conn_2')
    expect(mockPost).toHaveBeenCalledWith('/database/switch', { connection_id: 'conn_2' })
  })

  it('migrateDatabase posts source/target/mode/include_logs/confirmed_clear', async () => {
    const db = await loadModule()
    await db.migrateDatabase('conn_s', 'conn_t', { mode: 'replace', include_logs: false, confirmed_clear: true })
    expect(mockPost).toHaveBeenCalledWith('/database/migrate', {
      source_id: 'conn_s', target_id: 'conn_t', mode: 'replace', include_logs: false, confirmed_clear: true,
    })
  })

  it('exportDatabase posts source_id to /database/export', async () => {
    const db = await loadModule()
    await db.exportDatabase('conn_1')
    expect(mockPost).toHaveBeenCalledWith('/database/export', { source_id: 'conn_1' })
  })

  it('importDatabase posts archive_path/target_id/confirmed_clear to /database/import', async () => {
    const db = await loadModule()
    await db.importDatabase({ archive_path: '/data/archives/x.zip', target_id: 'conn_t', confirmed_clear: true })
    expect(mockPost).toHaveBeenCalledWith('/database/import', {
      archive_path: '/data/archives/x.zip', target_id: 'conn_t', confirmed_clear: true,
    })
  })

  it('getMigrationHistory calls GET /database/history', async () => {
    const db = await loadModule()
    mockGet.mockResolvedValue({ data: [] })
    await db.getMigrationHistory()
    expect(mockGet).toHaveBeenCalledWith('/database/history')
  })
})
