import api from '@/api/index'
import type { SslCertificate, SslCertificateCreate, SslCertificateUpdate, SslListResponse } from '@/types/ssl'

export function listSslCertificates(clusterId?: number) {
  if (clusterId) {
    return api.get<SslListResponse>(`/clusters/${clusterId}/ssl`)
  }
  return api.get<SslListResponse>('/ssl')
}

export function createSslCertificate(clusterId: number, data: SslCertificateCreate) {
  return api.post<SslCertificate>(`/clusters/${clusterId}/ssl`, data)
}

export function getSslCertificate(clusterId: number, certId: number) {
  return api.get<SslCertificate>(`/clusters/${clusterId}/ssl/${certId}`)
}

export function updateSslCertificate(clusterId: number, certId: number, data: SslCertificateUpdate) {
  return api.put<SslCertificate>(`/clusters/${clusterId}/ssl/${certId}`, data)
}

export function deleteSslCertificate(clusterId: number, certId: number, data?: { delete_db?: boolean; delete_edge?: boolean; node_ids?: number[] }) {
  return api.request({ method: 'DELETE', url: `/clusters/${clusterId}/ssl/${certId}`, data })
}

export function publishSslCertificate(clusterId: number, certId: number, nodeIds?: number[]) {
  return api.post(`/clusters/${clusterId}/ssl/${certId}/publish`, { node_ids: nodeIds })
}

export function getSslHistory(clusterId: number, certId: number) {
  return api.get(`/clusters/${clusterId}/ssl/${certId}/history`)
}
