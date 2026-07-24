import api from '@/api/index'
import type { StreamProxy, PortItem } from '@/types'

export interface DnsProxyListResponse {
  total: number
  page: number
  page_size: number
  items: StreamProxy[]
}

export function listDnsProxies(clusterId: number, params?: { page?: number; page_size?: number; search?: string }) {
  return api.get<DnsProxyListResponse>(`/clusters/${clusterId}/dns-proxies`, { params })
}

export function createDnsProxy(clusterId: number, data: Partial<StreamProxy>) {
  return api.post<StreamProxy>(`/clusters/${clusterId}/dns-proxies`, data)
}

export function getDnsProxy(clusterId: number, proxyId: number) {
  return api.get<StreamProxy>(`/clusters/${clusterId}/dns-proxies/${proxyId}`)
}

export function updateDnsProxy(clusterId: number, proxyId: number, data: Partial<StreamProxy>) {
  return api.put<StreamProxy>(`/clusters/${clusterId}/dns-proxies/${proxyId}`, data)
}

export function deleteDnsProxy(clusterId: number, proxyId: number, data: { delete_db: boolean; delete_edge?: boolean; node_ids?: number[] }) {
  return api.request({ method: 'DELETE', url: `/clusters/${clusterId}/dns-proxies/${proxyId}`, data })
}

export function publishDnsProxy(clusterId: number, proxyId: number, nodeIds?: number[]) {
  return api.post(`/clusters/${clusterId}/dns-proxies/${proxyId}/publish`, { node_ids: nodeIds })
}

export function getDnsProxyHistory(clusterId: number, proxyId: number) {
  return api.get(`/clusters/${clusterId}/dns-proxies/${proxyId}/history`)
}

export function rollbackDnsProxy(clusterId: number, proxyId: number, version: number) {
  return api.post(`/clusters/${clusterId}/dns-proxies/${proxyId}/rollback/${version}`)
}

export function deleteDnsProxyHistory(clusterId: number, proxyId: number, historyId: number) {
  return api.delete(`/clusters/${clusterId}/dns-proxies/${proxyId}/history/${historyId}`)
}
