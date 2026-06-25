import { ref } from 'vue'
import { message } from 'ant-design-vue'
import type { StreamProxy, Cluster, PortItem } from '@/types'
import * as streamProxyApi from '@/api/streamProxy'

export function useClusterStreamProxies() {
  const proxies = ref<StreamProxy[]>([])
  const clusters = ref<Cluster[]>([])
  const totalCount = ref(0)
  const loading = ref(false)
  const page = ref(1)
  const pageSize = ref(20)
  const searchText = ref('')
  const clusterFilter = ref<number | string>('')

  async function loadProxies() {
    loading.value = true
    try {
      const params: any = { page: page.value, page_size: pageSize.value }
      if (searchText.value) params.search = searchText.value
      const res = clusterFilter.value
        ? await streamProxyApi.listStreamProxies(Number(clusterFilter.value), params)
        : await Promise.all(
            clusters.value.map(c => streamProxyApi.listStreamProxies(c.id, params).then(r => r.data))
          ).then(all => {
            const merged = all.flatMap(r => r.items)
            return { data: { total: merged.length, items: merged, page: 1, page_size: merged.length } }
          })
      if (clusterFilter.value) {
        proxies.value = (res as any).data.items || []
        totalCount.value = (res as any).data.total || 0
      } else {
        proxies.value = (res as any).items || []
        totalCount.value = (res as any).total || 0
      }
    } catch {
      message.error('加载四层代理列表失败')
    } finally {
      loading.value = false
    }
  }

  async function loadClusters() {
    try {
      const api = (await import('@/api')).default
      const res = await api.get('/clusters')
      clusters.value = res.data?.items || res.data || []
    } catch { /* ignore */ }
  }

  async function createProxy(clusterId: number, data: any): Promise<StreamProxy | null> {
    try {
      const res = await streamProxyApi.createStreamProxy(clusterId, data)
      message.success('四层代理创建成功')
      return res.data
    } catch (e: any) {
      message.error(e.response?.data?.detail || '创建失败')
      return null
    }
  }

  async function updateProxy(clusterId: number, proxyId: number, data: any): Promise<boolean> {
    try {
      await streamProxyApi.updateStreamProxy(clusterId, proxyId, data)
      message.success('更新成功')
      return true
    } catch (e: any) {
      message.error(e.response?.data?.detail || '更新失败')
      return false
    }
  }

  async function deleteProxy(clusterId: number, proxyId: number, opts: { delete_db: boolean; delete_edge?: boolean; node_ids?: number[] }) {
    try {
      await streamProxyApi.deleteStreamProxy(clusterId, proxyId, opts)
      message.success('删除成功')
      await loadProxies()
    } catch (e: any) {
      message.error(e.response?.data?.detail || '删除失败')
    }
  }

  async function publishProxy(clusterId: number, proxyId: number, nodeIds?: number[]) {
    try {
      const res = await streamProxyApi.publishStreamProxy(clusterId, proxyId, nodeIds)
      message.success('发布成功')
      await loadProxies()
      return res.data
    } catch (e: any) {
      message.error(e.response?.data?.detail || '发布失败')
    }
  }

  return {
    proxies, clusters, totalCount, loading, page, pageSize, searchText, clusterFilter,
    loadProxies, loadClusters, createProxy, updateProxy, deleteProxy, publishProxy,
  }
}

export function usePortDetection() {
  const detecting = ref(false)
  const ports = ref<PortItem[]>([])
  const error = ref('')

  async function detect(clusterId: number, nodeId: number): Promise<boolean> {
    detecting.value = true
    error.value = ''
    ports.value = []
    try {
      const res = await streamProxyApi.detectPorts(clusterId, nodeId)
      ports.value = res.data.ports || []
      return true
    } catch (e: any) {
      error.value = e.response?.data?.detail || '端口检测失败'
      return false
    } finally {
      detecting.value = false
    }
  }

  return { detecting, ports, error, detect }
}
