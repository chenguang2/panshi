import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Cluster, StreamProxy } from '@/types'

vi.mock('ant-design-vue', () => ({
  message: { error: vi.fn(), success: vi.fn() },
}))

const listStreamProxies = vi.fn()
vi.mock('@/api/streamProxy', () => ({
  listStreamProxies: (...args: unknown[]) => listStreamProxies(...args),
}))

import { useClusterStreamProxies } from '../useClusterStreamProxies'

function makeCluster(id: number): Cluster {
  return { id, name: `cluster-${id}`, status: 1, node_count: 0, healthy_node_count: 0, upstream_count: 0, route_count: 0, plugin_config_count: 0, global_rule_count: 0, static_resource_count: 0, plugin_metadata_count: 0 } as Cluster
}

function makeProxy(clusterId: number, name: string): StreamProxy {
  return { id: clusterId * 100 + 1, edge_uuid: `e-${name}`, cluster_id: clusterId, name, listen_port: 9000 + clusterId, load_balance: 'roundrobin', scheme: 'tcp', status: 1 } as StreamProxy
}

function pagedBody(items: StreamProxy[]) {
  return { data: { items, total: items.length, page: 1, page_size: items.length } }
}

beforeEach(() => {
  listStreamProxies.mockReset()
})

describe('useClusterStreamProxies.loadProxies', () => {
  it('未选集群筛选时聚合全部集群的代理列表（跨集群合并不为空）', async () => {
    listStreamProxies.mockImplementation((clusterId: number) =>
      Promise.resolve(pagedBody([makeProxy(clusterId, `p-${clusterId}`)]))
    )
    const { clusters, proxies, totalCount, loadProxies } = useClusterStreamProxies()
    clusters.value = [makeCluster(1), makeCluster(2)]

    await loadProxies()

    expect(listStreamProxies).toHaveBeenCalledTimes(2)
    expect(proxies.value.map(p => p.name).sort()).toEqual(['p-1', 'p-2'])
    expect(totalCount.value).toBe(2)
  })

  it('选择集群筛选时只加载该集群并回填 total', async () => {
    listStreamProxies.mockResolvedValue(pagedBody([makeProxy(7, 'only-7'), makeProxy(7, 'only-7b')]))
    const { clusterFilter, proxies, totalCount, loadProxies } = useClusterStreamProxies()
    clusterFilter.value = 7

    await loadProxies()

    expect(listStreamProxies).toHaveBeenCalledWith(7, expect.anything())
    expect(proxies.value.map(p => p.name)).toEqual(['only-7', 'only-7b'])
    expect(totalCount.value).toBe(2)
  })
})
