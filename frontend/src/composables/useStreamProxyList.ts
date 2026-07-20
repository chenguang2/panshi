import { ref, computed, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import { PAGE_SIZE_CARD_GRID } from '@/constants'

export function useStreamProxyList(proxyType: Ref<'normal' | 'dns'>) {
  const proxies = ref<any[]>([])
  const clusters = ref<any[]>([])
  const totalCount = ref(0)
  const loading = ref(false)
  const searchText = ref('')
  const clusterFilter = ref<string | number>('')
  const groupFilter = ref('__all__')

  const pageTitle = computed(() => proxyType.value === 'dns' ? 'DNS 代理' : 'TCP 代理')
  const pageDesc = computed(() => proxyType.value === 'dns'
    ? '管理集群级的 DNS 代理规则'
    : '管理集群级的 TCP/UDP 四层代理转发规则')

  const groupOptions = computed(() => {
    const names = new Set(clusters.value.map((c: any) => c.group_name || ''))
    return Array.from(names).filter(Boolean).sort()
  })

  const filteredClusters = computed(() => {
    if (groupFilter.value === '__all__') return clusters.value
    if (groupFilter.value === '__ung__') return clusters.value.filter((c: any) => !c.group_name)
    return clusters.value.filter((c: any) => c.group_name === groupFilter.value)
  })

  const displayedProxies = computed(() => {
    return [...proxies.value].sort((a: any, b: any) => {
      const ga = a.cluster_group_name || ''
      const gb = b.cluster_group_name || ''
      if (ga && !gb) return 1
      if (!ga && gb) return -1
      return ga.localeCompare(gb)
    })
  })

  async function loadProxies() {
    loading.value = true
    try {
      const params: Record<string, any> = { page_size: PAGE_SIZE_CARD_GRID, group_name: groupFilter.value, proxy_type: proxyType.value }
      if (clusterFilter.value) params.cluster_id = clusterFilter.value
      if (searchText.value) params.search = searchText.value
      const res = await api.get('/stream-proxies', { params })
      proxies.value = res.data.items || []
      totalCount.value = res.data.total || 0
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : (e?.message || `加载${pageTitle.value}失败`)
      message.error(msg)
    } finally {
      loading.value = false
    }
  }

  async function loadClusters() {
    try {
      const res = await api.get('/clusters')
      clusters.value = res.data?.items || res.data || []
    } catch { /* ignore */ }
  }

  const itemLabel = computed(() => proxyType.value === 'dns' ? 'DNS 代理' : 'TCP 代理')
  const createButtonText = computed(() => `+ 新建 ${itemLabel.value}`)

  return {
    proxies, clusters, totalCount, loading,
    searchText, clusterFilter, groupFilter,
    pageTitle, pageDesc, itemLabel, createButtonText,
    groupOptions, filteredClusters, displayedProxies,
    loadProxies, loadClusters,
    proxyType,
  }
}
