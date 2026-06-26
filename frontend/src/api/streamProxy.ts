import api from '@/api/index'
import type { StreamProxy, PortItem } from '@/types'

export interface StreamProxyListResponse {
  total: number
  page: number
  page_size: number
  items: StreamProxy[]
}

export function listStreamProxies(clusterId: number, params?: { page?: number; page_size?: number; search?: string }) {
  return api.get<StreamProxyListResponse>(`/clusters/${clusterId}/stream-proxies`, { params })
}

export function createStreamProxy(clusterId: number, data: Partial<StreamProxy>) {
  return api.post<StreamProxy>(`/clusters/${clusterId}/stream-proxies`, data)
}

export function getStreamProxy(clusterId: number, proxyId: number) {
  return api.get<StreamProxy>(`/clusters/${clusterId}/stream-proxies/${proxyId}`)
}

export function updateStreamProxy(clusterId: number, proxyId: number, data: Partial<StreamProxy>) {
  return api.put<StreamProxy>(`/clusters/${clusterId}/stream-proxies/${proxyId}`, data)
}

export function deleteStreamProxy(clusterId: number, proxyId: number, data: { delete_db: boolean; delete_edge?: boolean; node_ids?: number[] }) {
  return api.request({ method: 'DELETE', url: `/clusters/${clusterId}/stream-proxies/${proxyId}`, data })
}

export function publishStreamProxy(clusterId: number, proxyId: number, nodeIds?: number[]) {
  return api.post(`/clusters/${clusterId}/stream-proxies/${proxyId}/publish`, { node_ids: nodeIds })
}

export function getStreamProxyHistory(clusterId: number, proxyId: number) {
  return api.get(`/clusters/${clusterId}/stream-proxies/${proxyId}/history`)
}

export function rollbackStreamProxy(clusterId: number, proxyId: number, version: number) {
  return api.post(`/clusters/${clusterId}/stream-proxies/${proxyId}/rollback/${version}`)
}

export function deleteStreamProxyHistory(clusterId: number, proxyId: number, historyId: number) {
  return api.delete(`/clusters/${clusterId}/stream-proxies/${proxyId}/history/${historyId}`)
}

export function detectPorts(clusterId: number, nodeId: number, excludeProxyId?: number) {
  return api.post<{ ports: PortItem[] }>(`/clusters/${clusterId}/stream-proxies/detect-ports`, { node_id: nodeId, exclude_proxy_id: excludeProxyId })
}
