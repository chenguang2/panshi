import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import api from '@/api'
import { listNodeTasks, listClusterTasks, getNodeTask, createNodeTask, cancelNodeTask, retryNodeTask, parseTaskEvent } from '../useNodeTasks'

describe('useNodeTasks API wrappers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('listNodeTasks calls GET /node-tasks', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { total: 1, items: [] } })
    const res = await listNodeTasks({ status: 'running' })
    expect(api.get).toHaveBeenCalledWith('/node-tasks', { params: { status: 'running', page: 1, page_size: 20 } })
    expect(res.total).toBe(1)
  })

  it('listClusterTasks calls GET /clusters/{id}/node-tasks', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { total: 0, items: [] } })
    await listClusterTasks(3, {})
    expect(api.get).toHaveBeenCalledWith('/clusters/3/node-tasks', expect.any(Object))
  })

  it('getNodeTask calls GET /node-tasks/{id}', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { id: 7 } })
    const res = await getNodeTask(7)
    expect(api.get).toHaveBeenCalledWith('/node-tasks/7')
    expect(res.id).toBe(7)
  })

  it('createNodeTask POSTs task payload', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 9 } })
    const res = await createNodeTask(1, 'start', [1, 2], { prefix: '/x' })
    expect(api.post).toHaveBeenCalledWith('/clusters/1/node-tasks', {
      task_type: 'start', node_ids: [1, 2], params: { prefix: '/x' },
    })
    expect(res.id).toBe(9)
  })

  it('cancelNodeTask POSTs to cancel', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    await cancelNodeTask(5)
    expect(api.post).toHaveBeenCalledWith('/node-tasks/5/cancel')
  })

  it('retryNodeTask POSTs to retry with optional node_ids', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    await retryNodeTask(5, [2])
    expect(api.post).toHaveBeenCalledWith('/node-tasks/5/retry', { node_ids: [2] })
  })
})

describe('parseTaskEvent', () => {
  it('parses a node_update SSE payload', () => {
    const evt = parseTaskEvent('data: {"type":"node_update","task_id":1,"node_id":5,"status":"running","progress":40,"line":"started"}')
    expect(evt).toEqual({ type: 'node_update', task_id: 1, node_id: 5, status: 'running', progress: 40, line: 'started' })
  })

  it('parses a done event', () => {
    const evt = parseTaskEvent('data: {"type":"done","task_id":2,"status":"success"}')
    expect(evt.type).toBe('done')
    expect(evt.status).toBe('success')
  })

  it('returns null for non-data lines', () => {
    expect(parseTaskEvent(': heartbeat')).toBeNull()
    expect(parseTaskEvent('')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseTaskEvent('data: {broken')).toBeNull()
  })
})
