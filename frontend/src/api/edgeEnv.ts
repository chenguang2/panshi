import api from '@/api/index'

export interface EdgeEnvReadResponse {
  node_id: number
  node_ip: string
  content: string
}

export interface EdgeEnvDeployRequest {
  content: string
}

export interface NodeResultItem {
  ip: string
  status: string
  error?: string
  steps?: Record<string, any>[]
}

export interface EdgeEnvDeployResponse {
  version_id: number
  status: string
  node_results: NodeResultItem[]
}

export interface EdgeEnvVersionListItem {
  id: number
  status: string
  deployed_by: string
  deployed_at: string
  node_count: number
  success_count: number
}

export interface EdgeEnvVersionDetail {
  id: number
  cluster_id: number
  content: string
  previous_content?: string
  status: string
  deployed_by: string
  deployed_at: string
  node_results: NodeResultItem[]
}

export interface VersionsListResponse {
  items: EdgeEnvVersionListItem[]
  total: number
  page: number
  page_size: number
}

export function fetchEdgeEnv(clusterId: number, nodeId: number) {
  return api.get<EdgeEnvReadResponse>(`/clusters/${clusterId}/edge-env`, {
    params: { node_id: nodeId },
  })
}

export function deployEdgeEnv(clusterId: number, content: string) {
  return api.post<EdgeEnvDeployResponse>(`/clusters/${clusterId}/edge-env/deploy`, {
    content,
  })
}

export function listVersions(clusterId: number, page = 1, pageSize = 20) {
  return api.get<VersionsListResponse>(`/clusters/${clusterId}/edge-env/versions`, {
    params: { page, page_size: pageSize },
  })
}

export function getVersionDetail(clusterId: number, versionId: number) {
  return api.get<EdgeEnvVersionDetail>(
    `/clusters/${clusterId}/edge-env/versions/${versionId}`
  )
}
