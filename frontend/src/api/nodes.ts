import api from '@/api'

export interface NodeListParams {
  page?: number
  pageSize?: number
  search?: string
  clusterId?: number
  status?: number
}

export interface NodeCreatePayload {
  ip: string
  service_port: number
  management_port: number
  edge_path: string
  status: number
  cluster_id?: number
}

export interface NodeUpdatePayload {
  ip?: string
  service_port?: number
  management_port?: number
  edge_path?: string
  status?: number
}

export interface NodeDeletePayload {
  delete_db: boolean
  delete_edge: boolean
}

export interface NodeListResponse {
  total: number
  page: number
  page_size: number
  items: any[]
}

export function listNodes(params: NodeListParams = {}) {
  return api.get<NodeListResponse>('/nodes', {
    params: {
      page: params.page || 1,
      page_size: params.pageSize || 20,
      ...(params.search ? { search: params.search } : {}),
      ...(params.clusterId ? { cluster_id: params.clusterId } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
    },
  })
}

export function createNode(clusterId: number, payload: NodeCreatePayload) {
  return api.post(`/clusters/${clusterId}/nodes`, payload)
}

export function updateNode(clusterId: number, nodeId: number, payload: NodeUpdatePayload) {
  return api.put(`/clusters/${clusterId}/nodes/${nodeId}`, payload)
}

export function deleteNode(clusterId: number, nodeId: number, payload: NodeDeletePayload) {
  return api.delete(`/clusters/${clusterId}/nodes/${nodeId}`, { data: payload })
}

export function startNode(clusterId: number, nodeId: number) {
  return api.post(`/clusters/${clusterId}/nodes/${nodeId}/start`)
}

export function stopNode(clusterId: number, nodeId: number) {
  return api.post(`/clusters/${clusterId}/nodes/${nodeId}/stop`)
}

export function queryNodeStatus(clusterId: number, nodeId: number, ports?: string) {
  return api.post(`/clusters/${clusterId}/nodes/${nodeId}/statistic`, { ports: ports || '9180' })
}

export function getClusterNodes(clusterId: number, params: NodeListParams = {}) {
  return api.get(`/clusters/${clusterId}/nodes`, {
    params: {
      page: params.page || 1,
      page_size: params.pageSize || 20,
      ...(params.search ? { search: params.search } : {}),
    },
  })
}
