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

  const pageTitle = computed(() => proxyType.value === 'dns' ? 'DNS 代理' : '四层代理')
  const pageDesc = computed(() => proxyType.value === 'dns'
    ? '管理集群级的 DNS 代理规则'
    : '管理集群级的 TCP/UDP/TLS 四层转发规则')

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

  // ── 批量管理模式 ──
  const batchMode = ref(false)
  const selectedProxyIds = ref<number[]>([])

  const groupProxies = computed(() => {
    if (groupFilter.value === '__all__' || groupFilter.value === '__ung__') return []
    return proxies.value
      .filter((p: any) => (p.cluster_group_name || '') === groupFilter.value)
      .map((p: any) => p.id as number)
  })

  const filteredProxies = computed(() => displayedProxies.value.map((p: any) => p.id as number))

  const selectedProxies = computed(() => {
    const idSet = new Set(selectedProxyIds.value)
    return proxies.value.filter((p: any) => idSet.has(p.id as number))
  })

  const allGroupSelected = computed(() => {
    const g = groupProxies.value
    if (g.length === 0) return false
    return g.every((id) => selectedProxyIds.value.includes(id))
  })

  const allFilteredSelected = computed(() => {
    const f = filteredProxies.value
    if (f.length === 0) return false
    return f.every((id) => selectedProxyIds.value.includes(id))
  })

  const showGroupSelectAll = computed(() => groupFilter.value !== '__all__' && groupFilter.value !== '__ung__')

  function toggleBatchMode() {
    if (batchMode.value) {
      selectedProxyIds.value = []
    }
    batchMode.value = !batchMode.value
  }

  function toggleProxy(id: number) {
    if (selectedProxyIds.value.includes(id)) {
      selectedProxyIds.value = selectedProxyIds.value.filter((x) => x !== id)
    } else {
      selectedProxyIds.value = [...selectedProxyIds.value, id]
    }
  }

  function toggleSelectAllGroup() {
    if (allGroupSelected.value) {
      const g = new Set(groupProxies.value)
      selectedProxyIds.value = selectedProxyIds.value.filter((id) => !g.has(id))
    } else {
      const merged = new Set([...selectedProxyIds.value, ...groupProxies.value])
      selectedProxyIds.value = Array.from(merged)
    }
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected.value) {
      const f = new Set(filteredProxies.value)
      selectedProxyIds.value = selectedProxyIds.value.filter((id) => !f.has(id))
    } else {
      const merged = new Set([...selectedProxyIds.value, ...filteredProxies.value])
      selectedProxyIds.value = Array.from(merged)
    }
  }

  function clearSelection() {
    selectedProxyIds.value = []
  }

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

  const itemLabel = computed(() => proxyType.value === 'dns' ? 'DNS 代理' : '四层代理')
  const createButtonText = computed(() => `+ 新建 ${itemLabel.value}`)

  return {
    proxies, clusters, totalCount, loading,
    searchText, clusterFilter, groupFilter,
    pageTitle, pageDesc, itemLabel, createButtonText,
    groupOptions, filteredClusters, displayedProxies,
    batchMode, selectedProxyIds, selectedProxies,
    groupProxies, filteredProxies,
    allGroupSelected, allFilteredSelected, showGroupSelectAll,
    toggleBatchMode, toggleProxy,
    toggleSelectAllGroup, toggleSelectAllFiltered, clearSelection,
    loadProxies, loadClusters,
    proxyType,
  }
}
