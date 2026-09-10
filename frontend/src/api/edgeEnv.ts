import api from '@/api/index'
import { consumeSSEDataLines, extractSSEErrorMessage } from '@/utils/sse'

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
  steps?: Record<string, unknown>[]
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
  return api.get<EdgeEnvVersionDetail>(`/clusters/${clusterId}/edge-env/versions/${versionId}`)
}

export function readEdgeEnvStream(
  clusterId: number,
  nodeId: number,
  onEvent: (data: Record<string, unknown>) => void,
  onError?: (err: string) => void,
): AbortController {
  const controller = new AbortController()
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  // v3 8B-3：SSE 行解析收敛到 utils/sse.ts（原手写 fetch+getReader 循环已删除）
  void (async () => {
    try {
      const response = await fetch(
        `/api/v1/clusters/${clusterId}/edge-env/read-stream?node_id=${nodeId}`,
        { headers, signal: controller.signal },
      )
      if (!response.ok) {
        onError?.(await extractSSEErrorMessage(response))
        return
      }
      await consumeSSEDataLines(response, (raw) => {
        try {
          onEvent(JSON.parse(raw))
        } catch {
          /* 忽略非法 JSON 事件 */
        }
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      onError?.((e as Error)?.message || '读取失败')
    }
  })()

  return controller
}
