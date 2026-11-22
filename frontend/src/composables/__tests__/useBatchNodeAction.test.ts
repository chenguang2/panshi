import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()
const mockConcurrencyOf = vi.fn((_name: string, defaultVal: number) => defaultVal)

vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockApiPost(...args),
    put: vi.fn(),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}))

vi.mock('@/stores/features', () => ({
  useFeaturesStore: () => ({
    has: () => false,
    concurrencyOf: (...args: unknown[]) => mockConcurrencyOf(...(args as [string, number])),
  }),
}))

// mock 形状取自真实后端：per-node 动作响应（rc/stdout/stderr/command）与
// 批量端点 POST /clusters/{cid}/nodes/action 响应（results[]: node_id/ip/status/rc/detail，cluster_nodes.py:486）。
const okActionData = { rc: 0, stdout: 'ok', stderr: '', command: 'cmd' }

function makeNodes(...ids: number[]) {
  return ids.map((id) => ({ id, cluster_id: 1, ip: `10.0.0.${id}` }))
}

describe('useBatchNodeAction（batch3 1.4 / D4 共享批量核心）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockConcurrencyOf.mockImplementation((_name: string, defaultVal: number) => defaultVal)
  })

  describe('createBatchProgressState', () => {
    it('返回 visible/title/items/expandedKey 四个 ref', async () => {
      const { createBatchProgressState } = await import('../useBatchNodeAction')
      const s = createBatchProgressState()
      expect(s.visible.value).toBe(false)
      expect(s.title.value).toBe('')
      expect(s.items.value).toEqual([])
      expect(s.expandedKey.value).toBeNull()
    })
  })

  describe('runBatchNodeAction', () => {
    it('重置进度并按节点逐个调用单节点端点，返回成功/失败汇总', async () => {
      const { runBatchNodeAction, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      mockApiPost.mockImplementation((url: string) => {
        if (url.endsWith('/1/start') || url.endsWith('/2/start')) return Promise.resolve({ data: okActionData })
        return Promise.reject(new Error('unexpected url: ' + url))
      })

      const summary = await runBatchNodeAction(makeNodes(1, 2), 'start', '启动', { progress })

      expect(progress.title.value).toBe('批量启动节点')
      expect(progress.visible.value).toBe(true)
      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/1/start')
      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/2/start')
      expect(progress.items.value).toHaveLength(2)
      // 身份标签字段 = label（节点域承载 IP；上游/路由域承载名称）
      expect(progress.items.value.map((i) => i.label)).toEqual(['10.0.0.1', '10.0.0.2'])
      expect(progress.items.value.every((i) => i.status === 'success')).toBe(true)
      expect(summary).toEqual({ total: 2, success: 2, failed: 0 })
    })

    it('并发受 features clamp（batch_action=10、max_playbooks=2 → 实际并发 2）', async () => {
      mockConcurrencyOf.mockImplementation((name: string, defaultVal: number) => {
        if (name === 'batch_action') return 10
        if (name === 'max_playbooks') return 2
        return defaultVal
      })
      const { runBatchNodeAction, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      let inFlight = 0
      let maxInFlight = 0
      const resolveFns: Array<() => void> = []
      mockApiPost.mockImplementation(() => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        return new Promise((resolve) => {
          resolveFns.push(() => {
            inFlight--
            resolve({ data: okActionData })
          })
        })
      })

      const actionPromise = runBatchNodeAction(makeNodes(1, 2, 3, 4, 5), 'start', '启动', { progress })
      await flushPromises()
      expect(maxInFlight).toBeLessThanOrEqual(2)
      expect(resolveFns.length).toBe(2)
      for (let round = 0; round < 5; round++) {
        const fn = resolveFns.shift()
        if (fn) fn()
        await flushPromises()
      }
      await actionPromise
      expect(maxInFlight).toBeLessThanOrEqual(2)
      expect(progress.items.value.every((i) => i.status === 'success')).toBe(true)
    })

    it('单节点失败不中断其余节点，失败项记录原因', async () => {
      const { runBatchNodeAction, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      mockApiPost.mockImplementation((url: string) => {
        if (url.endsWith('/1/start')) return Promise.resolve({ data: okActionData })
        if (url.endsWith('/2/start')) return Promise.reject({ response: { data: { detail: '连接超时' } } })
        return Promise.reject(new Error('unexpected'))
      })

      const summary = await runBatchNodeAction(makeNodes(1, 2), 'start', '启动', { progress })

      expect(summary).toEqual({ total: 2, success: 1, failed: 1 })
      expect(progress.items.value[0].status).toBe('success')
      expect(progress.items.value[1].status).toBe('error')
      expect(progress.items.value[1].logs.join('')).toContain('连接超时')
    })
  })

  describe('runBatchNodeStatus', () => {
    it('逐节点 statistic 后返回结果行并收起进度弹窗', async () => {
      const { runBatchNodeStatus, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      mockApiPost.mockImplementation((url: string) => {
        if (url.endsWith('/1/statistic') || url.endsWith('/2/statistic')) {
          return Promise.resolve({
            data: { rc: 0, statistic: { edge_version: 'v1.2.3' }, stdout: 's', stderr: '', command: 'c' },
          })
        }
        return Promise.reject(new Error('unexpected url: ' + url))
      })

      const nodes = makeNodes(1, 2).map((n) => ({ ...n, management_port: 9180, status: 1 }))
      const rows = await runBatchNodeStatus(nodes, { progress })

      expect(progress.title.value).toBe('批量状态查询节点')
      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/1/statistic', { ports: '9180' })
      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/2/statistic', { ports: '9180' })
      expect(progress.visible.value).toBe(false)
      expect(progress.items.value.every((i) => i.status === 'success')).toBe(true)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({ ip: '10.0.0.1', status: 'success', version: 'v1.2.3', healthy: true })
    })
  })

  describe('runClusterGroupedBatchAction（batch3 D5 集群分组）', () => {
    it('按集群逐个调用批量端点，items 合并所有集群节点', async () => {
      const { runClusterGroupedBatchAction, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      mockApiPost.mockImplementation((url: string, body?: { node_ids?: number[] }) => {
        if (url === '/clusters/1/nodes/action' && body?.node_ids?.length === 2) {
          return Promise.resolve({
            data: {
              action: 'start',
              results: [
                { node_id: 1, ip: '10.0.0.1', status: 'success', rc: 0, stdout: 'ok', stderr: '', command: 'cmd' },
                { node_id: 2, ip: '10.0.0.2', status: 'success', rc: 0, stdout: 'ok', stderr: '', command: 'cmd' },
              ],
            },
          })
        }
        if (url === '/clusters/2/nodes/action' && body?.node_ids?.length === 1) {
          return Promise.resolve({
            data: {
              action: 'start',
              results: [
                { node_id: 3, ip: '10.0.0.3', status: 'success', rc: 0, stdout: 'ok', stderr: '', command: 'cmd' },
              ],
            },
          })
        }
        return Promise.reject(new Error('unexpected url: ' + url))
      })

      const summaries = await runClusterGroupedBatchAction(
        [
          { clusterId: 1, clusterName: '集群A', nodes: makeNodes(1, 2) },
          { clusterId: 2, clusterName: '集群B', nodes: [makeNodes(3)[0]] },
        ],
        'start',
        '启动',
        { progress },
      )

      expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/action', { action: 'start', node_ids: [1, 2] })
      expect(mockApiPost).toHaveBeenCalledWith('/clusters/2/nodes/action', { action: 'start', node_ids: [3] })
      expect(progress.items.value).toHaveLength(3)
      expect(progress.items.value.every((i) => i.status === 'success')).toBe(true)
      expect(summaries).toEqual([
        { clusterName: '集群A', total: 2, success: 2, failed: 0 },
        { clusterName: '集群B', total: 1, success: 1, failed: 0 },
      ])
    })

    it('集群级调用失败不中断整体（F4）：该集群节点项标失败并记「集群级失败（原因）」，其余集群继续', async () => {
      const { runClusterGroupedBatchAction, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      mockApiPost.mockImplementation((url: string) => {
        if (url === '/clusters/1/nodes/action') return Promise.reject({ response: { data: { detail: '网关不可达' } } })
        if (url === '/clusters/2/nodes/action') {
          return Promise.resolve({
            data: {
              action: 'start',
              results: [
                { node_id: 3, ip: '10.0.0.3', status: 'success', rc: 0, stdout: 'ok', stderr: '', command: 'cmd' },
              ],
            },
          })
        }
        return Promise.reject(new Error('unexpected url: ' + url))
      })

      const summaries = await runClusterGroupedBatchAction(
        [
          { clusterId: 1, clusterName: '集群A', nodes: makeNodes(1, 2) },
          { clusterId: 2, clusterName: '集群B', nodes: [makeNodes(3)[0]] },
        ],
        'start',
        '启动',
        { progress },
      )

      // 集群 B 仍被执行
      expect(mockApiPost).toHaveBeenCalledWith('/clusters/2/nodes/action', { action: 'start', node_ids: [3] })
      // 集群 A 的两个节点项均为失败态并带集群级失败原因
      expect(progress.items.value[0].status).toBe('error')
      expect(progress.items.value[1].status).toBe('error')
      expect(progress.items.value[0].logs.join('')).toContain('集群级失败（网关不可达）')
      expect(progress.items.value[2].status).toBe('success')
      expect(summaries[0]).toMatchObject({ clusterName: '集群A', success: 0, failed: 2, clusterError: '网关不可达' })
      expect(summaries[1]).toMatchObject({ clusterName: '集群B', success: 1, failed: 0 })
    })

    it('批量端点内单节点 error 结果 → 该项失败并记录 detail', async () => {
      const { runClusterGroupedBatchAction, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      mockApiPost.mockResolvedValue({
        data: {
          action: 'start',
          results: [
            { node_id: 1, ip: '10.0.0.1', status: 'success', rc: 0, stdout: 'ok', stderr: '', command: 'cmd' },
            { node_id: 2, ip: '10.0.0.2', status: 'error', detail: 'SSH 认证失败' },
          ],
        },
      })

      const summaries = await runClusterGroupedBatchAction(
        [{ clusterId: 1, clusterName: '集群A', nodes: makeNodes(1, 2) }],
        'start',
        '启动',
        { progress },
      )

      expect(progress.items.value[0].status).toBe('success')
      expect(progress.items.value[1].status).toBe('error')
      expect(progress.items.value[1].logs.join('')).toContain('SSH 认证失败')
      expect(summaries[0]).toEqual({ clusterName: '集群A', total: 2, success: 1, failed: 1 })
    })
  })

  // ── runClusterGroupedBatchDelete（节点批量条补入口，2026-11-21）──────────────
  // mock 形状取自真实后端 cluster_nodes.py::delete_nodes_batch（curl 实测）：
  // { message, results: [{ node_id, node_ip, status, results: [{ scope, status, message }] }] }
  describe('runClusterGroupedBatchDelete', () => {
    const okDelete = (ids: number[], ipOf: (id: number) => string) => ({
      data: {
        message: `批量删除完成: ${ids.length} 条节点`,
        results: ids.map((id) => ({
          node_id: id,
          node_ip: ipOf(id),
          status: 'success',
          results: [
            { scope: 'database', status: 'success', message: '数据库记录已删除' },
            { scope: 'edge', status: 'skipped', message: '节点是 Edge 运行时，无对应的 Edge API 删除操作' },
          ],
        })),
      },
    })

    it('按 cluster_id 分组顺序调集合端点，语义固定删库不联动 Edge，逐节点成功', async () => {
      const { runClusterGroupedBatchDelete, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      mockApiDelete.mockImplementation((url: string, cfg: { data: { node_ids: number[] } }) => {
        if (url === '/clusters/1/nodes') return Promise.resolve(okDelete([1, 2], (id) => `10.0.0.${id}`))
        if (url === '/clusters/2/nodes') return Promise.resolve(okDelete(cfg.data.node_ids, () => '10.0.0.3'))
        return Promise.reject(new Error('unexpected url: ' + url))
      })

      const summaries = await runClusterGroupedBatchDelete(
        [
          { clusterId: 1, clusterName: '集群A', nodes: makeNodes(1, 2) },
          { clusterId: 2, clusterName: '集群B', nodes: [makeNodes(3)[0]] },
        ],
        { progress },
      )

      expect(mockApiDelete).toHaveBeenCalledWith('/clusters/1/nodes', {
        data: { node_ids: [1, 2], delete_db: true, delete_edge: false },
      })
      expect(mockApiDelete).toHaveBeenCalledWith('/clusters/2/nodes', {
        data: { node_ids: [3], delete_db: true, delete_edge: false },
      })
      expect(progress.visible.value).toBe(true)
      expect(progress.title.value).toBe('批量删除节点')
      expect(progress.items.value.every((i) => i.status === 'success')).toBe(true)
      expect(progress.items.value[0].logs.join('')).toContain('数据库记录已删除')
      expect(summaries).toEqual([
        { clusterName: '集群A', total: 2, success: 2, failed: 0 },
        { clusterName: '集群B', total: 1, success: 1, failed: 0 },
      ])
    })

    it('单条 status=failed → 该项失败并带后端原因，其余条仍成功', async () => {
      const { runClusterGroupedBatchDelete, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      mockApiDelete.mockResolvedValue({
        data: {
          message: '批量删除完成: 2 条节点',
          results: [
            {
              node_id: 1,
              node_ip: '10.0.0.1',
              status: 'success',
              results: [{ scope: 'database', status: 'success', message: '数据库记录已删除' }],
            },
            { node_id: 2, node_ip: '10.0.0.2', status: 'failed', error: '节点不存在', results: [] },
          ],
        },
      })

      const summaries = await runClusterGroupedBatchDelete(
        [{ clusterId: 1, clusterName: '集群A', nodes: makeNodes(1, 2) }],
        { progress },
      )

      expect(progress.items.value[0].status).toBe('success')
      expect(progress.items.value[1].status).toBe('error')
      expect(progress.items.value[1].logs.join('')).toContain('节点不存在')
      expect(summaries[0]).toEqual({ clusterName: '集群A', total: 2, success: 1, failed: 1 })
    })

    it('集群级调用失败不中断整体：该项集群全部失败（含 getApiErrorMessage 原因），下一集群继续', async () => {
      const { runClusterGroupedBatchDelete, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      mockApiDelete.mockImplementation((url: string, cfg: { data: { node_ids: number[] } }) => {
        if (url === '/clusters/1/nodes') return Promise.reject({ response: { data: { detail: '集群不存在' } } })
        if (url === '/clusters/2/nodes') return Promise.resolve(okDelete(cfg.data.node_ids, () => '10.0.0.3'))
        return Promise.reject(new Error('unexpected url: ' + url))
      })

      const summaries = await runClusterGroupedBatchDelete(
        [
          { clusterId: 1, clusterName: '集群A', nodes: makeNodes(1, 2) },
          { clusterId: 2, clusterName: '集群B', nodes: [makeNodes(3)[0]] },
        ],
        { progress },
      )

      expect(progress.items.value[0].status).toBe('error')
      expect(progress.items.value[1].status).toBe('error')
      expect(progress.items.value[0].logs.join('')).toContain('集群级失败（集群不存在）')
      expect(progress.items.value[2].status).toBe('success')
      expect(summaries[0]).toMatchObject({ clusterName: '集群A', success: 0, failed: 2, clusterError: '集群不存在' })
      expect(summaries[1]).toMatchObject({ clusterName: '集群B', success: 1, failed: 0 })
    })

    it('后端漏返回某节点结果 → 该项标失败（不得静默留在 pending）', async () => {
      const { runClusterGroupedBatchDelete, createBatchProgressState } = await import('../useBatchNodeAction')
      const progress = createBatchProgressState()
      mockApiDelete.mockResolvedValue({
        data: {
          message: '批量删除完成: 1 条节点',
          results: [
            {
              node_id: 1,
              node_ip: '10.0.0.1',
              status: 'success',
              results: [{ scope: 'database', status: 'success', message: '数据库记录已删除' }],
            },
          ],
        },
      })

      const summaries = await runClusterGroupedBatchDelete(
        [{ clusterId: 1, clusterName: '集群A', nodes: makeNodes(1, 2) }],
        { progress },
      )

      expect(progress.items.value[1].status).toBe('error')
      expect(progress.items.value[1].logs.join('')).toContain('后端未返回该节点的删除结果')
      expect(summaries[0]).toEqual({ clusterName: '集群A', total: 2, success: 1, failed: 1 })
    })
  })

  describe('formatClusterBatchSummary', () => {
    it('按集群拼接汇总文案', async () => {
      const { formatClusterBatchSummary } = await import('../useBatchNodeAction')
      expect(
        formatClusterBatchSummary([
          { clusterName: '集群A', total: 3, success: 2, failed: 1 },
          { clusterName: '集群B', total: 3, success: 3, failed: 0 },
        ]),
      ).toBe('集群 集群A：2 成功 1 失败；集群 集群B：3 成功')
    })
  })
})
