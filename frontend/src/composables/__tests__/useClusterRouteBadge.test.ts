// 路径徽章 composable（cluster-ux-close-loop 3.5）—— 两页唯一实现。
// 徽章降噪：中继关闭 / 区域数据缺失 / 集群未绑区域 → 一律 null（不渲染）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useFeaturesStore } from '@/stores/features'
import { useClusterRouteBadge } from '@/composables/useClusterRouteBadge'
import type { Cluster } from '@/types'

vi.mock('@/api/relay', () => ({
  listRelayGateways: vi.fn(() =>
    Promise.resolve({
      data: [
        { code: 'aoh', name: '安徽局' },
        { code: 'zj', name: '浙江局' },
      ],
    }),
  ),
}))

function makeCluster(over: Partial<Cluster> = {}): Cluster {
  return {
    id: 5,
    name: 'c5',
    status: 1,
    region_code: 'aoh',
    node_count: 1,
    healthy_node_count: 1,
    upstream_count: 0,
    route_count: 0,
    plugin_config_count: 0,
    global_rule_count: 0,
    plugin_metadata_count: 0,
    static_resource_count: 0,
    ...over,
  }
}

async function setupClusters(clusters: Cluster[], relayOn = true) {
  const store = useFeaturesStore()
  store.features = { ...(store.features as Record<string, unknown>), relay_gateway: relayOn } as typeof store.features
  const list = ref<Cluster[]>(clusters)
  const badge = useClusterRouteBadge(list)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  return badge
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useClusterRouteBadge - 徽章降噪（3.4/3.5）', () => {
  it('中继开关关闭 → 一律 null', async () => {
    const { routeBadge } = await setupClusters([makeCluster()], false)
    expect(routeBadge(makeCluster())).toBeNull()
  })

  it('集群未绑区域 → null（不渲染「直连」徽章）', async () => {
    const { routeBadge } = await setupClusters([makeCluster({ region_code: '' })])
    expect(routeBadge(makeCluster({ region_code: '' }))).toBeNull()
    expect(routeBadge(makeCluster({ region_code: null }))).toBeNull()
  })

  it('中继可用且已绑区域 → {经中继 · 区域名, badge-success}', async () => {
    const { routeBadge } = await setupClusters([makeCluster()])
    const b = routeBadge(makeCluster())
    expect(b).toEqual({ label: '经中继 · 安徽局', cls: 'badge-success' })
  })

  it('区域名缺失时回退区域码', async () => {
    const { routeBadge } = await setupClusters([makeCluster()])
    const b = routeBadge(makeCluster({ region_code: 'unknown-region' }))
    expect(b).toEqual({ label: '经中继 · unknown-region', cls: 'badge-success' })
  })
})
