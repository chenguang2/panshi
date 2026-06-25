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

export function readEdgeEnvStream(
  clusterId: number,
  nodeId: number,
  onEvent: (data: any) => void,
  onError?: (err: string) => void,
): AbortController {
  const controller = new AbortController()
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  fetch(`/api/v1/clusters/${clusterId}/edge-env/read-stream?node_id=${nodeId}`, {
    headers,
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      let errMsg = `请求失败 (${response.status})`
      try { const j = JSON.parse(errText); errMsg = j.detail || errMsg } catch { /* */ }
      onError?.(errMsg)
      return
    }
    const reader = response.body?.getReader()
    if (!reader) { onError?.('浏览器不支持流式读取'); return }

    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const raw of lines) {
        const trimmed = raw.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        try { onEvent(JSON.parse(trimmed.slice(6))) } catch { /* */ }
      }
    }
  }).catch((e) => {
    if (e.name !== 'AbortError') onError?.(e.message || '读取失败')
  })

  return controller
}
