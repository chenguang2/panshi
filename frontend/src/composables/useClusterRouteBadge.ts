import { computed, ref, watchEffect, type Ref } from 'vue'
import { useFeaturesStore } from '@/stores/features'
import { listRelayGateways } from '@/api/relay'
import type { Cluster } from '@/types'

export interface RouteBadge {
  label: string
  cls: string
}

/**
 * 集群卡片路径徽章（cluster-ux-close-loop 3.5 收敛）：ClusterList / CentralList 共用。
 *
 * 徽章降噪（3.4）：仅在「中继特性开启且区域列表拉取成功」且「集群已绑定区域」时返回
 * `{经中继 · 区域名, badge-success}`；其余情况一律 null（不渲染徽章——直连是缺省态，
 * 展示「直连」徽章属于噪音）。区域名缺失时回退区域码。
 *
 * 组件内不发请求的约束归 ClusterCard；本 composable 承担区域列表的按需拉取
 * （存在绑定区域的集群时才拉一次，失败静默降级为 null）。
 */
export function useClusterRouteBadge(clusters: Ref<Cluster[]>) {
  const featuresStore = useFeaturesStore()
  const relayFeatureOn = computed(() => featuresStore.features.relay_gateway === true)
  const regionNames = ref<Record<string, string>>({})
  const relayUsable = ref(false)
  let relayFetchStarted = false

  watchEffect(() => {
    if (!relayFeatureOn.value) {
      relayUsable.value = false
      return
    }
    if (relayFetchStarted) return
    if (!clusters.value.some((c) => !!c.region_code)) return
    relayFetchStarted = true
    Promise.resolve()
      .then(() => listRelayGateways())
      .then((res) => {
        const map: Record<string, string> = {}
        for (const g of res.data) map[g.code] = g.name
        regionNames.value = map
        relayUsable.value = true
      })
      .catch(() => {
        relayUsable.value = false
      })
  })

  function routeBadge(c: Cluster): RouteBadge | null {
    if (!relayUsable.value || !c.region_code) return null
    const name = regionNames.value[c.region_code] || c.region_code
    return { label: `经中继 · ${name}`, cls: 'badge-success' }
  }

  return { relayUsable, regionNames, relayFeatureOn, routeBadge }
}
