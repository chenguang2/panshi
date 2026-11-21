import api from '@/api'
import type { Node } from '@/types'

interface NodeListParams {
  page?: number
  pageSize?: number
  groupName?: string
  search?: string
  clusterId?: number
  status?: number
  /** 平铺视图排序键：ip | cluster（分组视图不下发） */
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

interface NodeCreatePayload {
  ip: string
  service_port: number
  management_port: number
  ssh_port?: number
  edge_path: string
  openresty_path?: string
  status: number
  cluster_id?: number
}

interface NodeUpdatePayload {
  ip?: string
  service_port?: number
  management_port?: number
  ssh_port?: number
  edge_path?: string
  openresty_path?: string
  status?: number
}

interface NodeDeletePayload {
  delete_db: boolean
  delete_edge: boolean
}

export interface NodeListResponse {
  total: number
  page: number
  page_size: number
  items: Node[]
}

export function listNodes(params: NodeListParams = {}) {
  return api.get<NodeListResponse>('/nodes', {
    params: {
      page: params.page || 1,
      page_size: params.pageSize || 20,
      group_name: params.groupName || '__all__',
      ...(params.search ? { search: params.search } : {}),
      ...(params.clusterId ? { cluster_id: params.clusterId } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
      ...(params.sortBy ? { sort_by: params.sortBy } : {}),
      ...(params.sortBy ? { sort_order: params.sortOrder || 'asc' } : {}),
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

interface NodeBatchDeletePayload {
  node_ids: number[]
  delete_db: boolean
  delete_edge: boolean
}

/**
 * 批量删除同一集群内的多个节点（集合端点 DELETE /clusters/{cluster_id}/nodes）。
 * 语义固定 `delete_db=true` / `delete_edge=false`：节点是 Edge 运行时，后端 Edge 阶段恒 skipped
 * （cluster_nodes.py::delete_nodes_batch），故不提供 Edge 勾选项。
 */
export function deleteNodesBatch(clusterId: number, payload: NodeBatchDeletePayload) {
  return api.delete(`/clusters/${clusterId}/nodes`, { data: payload })
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
