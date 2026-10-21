import api from '@/api/index'
import type {
  SslCertificate,
  SslCertificateCreate,
  SslCertificateUpdate,
  SslCertificateGenerateRequest,
  SslCertificateGenerateResponse,
  SslPrivateKeyResponse,
  SslPemPreviewResponse,
} from '@/types/ssl'

export function createSslCertificate(clusterId: number, data: SslCertificateCreate) {
  return api.post<SslCertificate>(`/clusters/${clusterId}/ssl`, data)
}

export function updateSslCertificate(clusterId: number, certId: number, data: SslCertificateUpdate) {
  return api.put<SslCertificate>(`/clusters/${clusterId}/ssl/${certId}`, data)
}

export function deleteSslCertificate(
  clusterId: number,
  certId: number,
  data?: { delete_db?: boolean; delete_edge?: boolean; node_ids?: number[] },
) {
  return api.request({ method: 'DELETE', url: `/clusters/${clusterId}/ssl/${certId}`, data })
}

export function publishSslCertificate(clusterId: number, certId: number, nodeIds?: number[]) {
  return api.post(`/clusters/${clusterId}/ssl/${certId}/publish`, { node_ids: nodeIds })
}

export function generateSslCertificate(clusterId: number, data: SslCertificateGenerateRequest) {
  return api.post<SslCertificateGenerateResponse>(`/clusters/${clusterId}/ssl/generate`, data)
}

/** ssl-ux-review-fixes 9.2/9.3：私钥按需端点（全证书类型含 CA；国密返回加密+签名双私钥） */
export function fetchSslPrivateKey(clusterId: number, certId: number) {
  return api.get<SslPrivateKeyResponse>(`/clusters/${clusterId}/ssl/${certId}/key`)
}

/** ssl-ux-review-fixes 10.1：PEM 即时预览（纯解析不落库；cert/key 均可选） */
export function previewSslPem(clusterId: number, data: { cert?: string; key?: string }) {
  return api.post<SslPemPreviewResponse>(`/clusters/${clusterId}/ssl/preview`, data)
}
