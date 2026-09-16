import api from '@/api/index'
import { consumeSSEDataLines, extractSSEErrorMessage } from '@/utils/sse'

interface NodeResultItem {
  ip: string
  status: string
  error?: string
  steps?: Record<string, unknown>[]
}

interface EdgeEnvDeployResponse {
  version_id: number
  status: string
  node_results: NodeResultItem[]
}

interface EdgeEnvVersionDetail {
  id: number
  cluster_id: number
  content: string
  previous_content?: string
  status: string
  deployed_by: string
  deployed_at: string
  node_results: NodeResultItem[]
}

export function deployEdgeEnv(clusterId: number, content: string) {
  return api.post<EdgeEnvDeployResponse>(`/clusters/${clusterId}/edge-env/deploy`, {
    content,
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
      const response = await fetch(`/api/v1/clusters/${clusterId}/edge-env/read-stream?node_id=${nodeId}`, {
        headers,
        signal: controller.signal,
      })
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
