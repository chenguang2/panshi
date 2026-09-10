/**
 * 集群基础查询 API 模块 —— 列表与节点下拉等高频共享查询。
 * v3 8C-1：多个全局列表视图的内联 axios 调用迁移至此。
 */
import api from '@/api/index'
import type { Cluster, Node } from '@/types'

export function listClusters(params: { keyword?: string; page?: number; page_size?: number } = {}) {
  return api.get<{ total: number; items: Cluster[] }>('/clusters', { params })
}

export function getCluster(clusterId: number) {
  return api.get<Cluster>(`/clusters/${clusterId}`)
}

export function getClusterStats(clusterId: number) {
  return api.get<Record<string, number>>(`/clusters/${clusterId}/stats`)
}

export function getClusterNodes(clusterId: number, params: { page?: number; page_size?: number } = {}) {
  return api.get<{ total: number; items: Node[] }>(`/clusters/${clusterId}/nodes`, { params })
}
