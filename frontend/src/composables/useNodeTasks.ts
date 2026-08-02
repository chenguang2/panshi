import api from '@/api'

export interface NodeTaskListParams {
  status?: string
  task_type?: string
  page?: number
  page_size?: number
}

export interface NodeTaskItemData {
  id: number
  node_id: number
  ip: string
  node_name?: string | null
  status: string
  rc?: number | null
  logs: Array<{ t: string; level: string; line: string }>
  stdout?: string | null
  stderr?: string | null
  command?: string | null
  started_at?: string | null
  finished_at?: string | null
}

export interface NodeTaskData {
  id: number
  cluster_id: number
  task_type: string
  status: string
  params: Record<string, unknown>
  total_nodes: number
  success_nodes: number
  failed_nodes: number
  cancelled_nodes: number
  created_by?: number | null
  created_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  items?: NodeTaskItemData[]
}

export interface TaskListResponse {
  total: number
  items: NodeTaskData[]
}

export async function listNodeTasks(params: NodeTaskListParams = {}): Promise<TaskListResponse> {
  const res = await api.get('/node-tasks', {
    params: { page: 1, page_size: 20, ...params },
  })
  return res.data
}

export async function listClusterTasks(clusterId: number, params: NodeTaskListParams = {}): Promise<TaskListResponse> {
  const res = await api.get(`/clusters/${clusterId}/node-tasks`, {
    params: { page: 1, page_size: 20, ...params },
  })
  return res.data
}

export async function getNodeTask(taskId: number): Promise<NodeTaskData> {
  const res = await api.get(`/node-tasks/${taskId}`)
  return res.data
}

export async function createNodeTask(
  clusterId: number,
  taskType: string,
  nodeIds: number[],
  params: Record<string, unknown> = {},
): Promise<NodeTaskData> {
  const res = await api.post(`/clusters/${clusterId}/node-tasks`, {
    task_type: taskType,
    node_ids: nodeIds,
    params,
  })
  return res.data
}

export async function cancelNodeTask(taskId: number): Promise<void> {
  await api.post(`/node-tasks/${taskId}/cancel`)
}

export async function retryNodeTask(taskId: number, nodeIds?: number[]): Promise<void> {
  await api.post(`/node-tasks/${taskId}/retry`, nodeIds ? { node_ids: nodeIds } : {})
}

export interface TaskStreamEvent {
  type: string
  task_id: number
  node_id?: number
  status?: string
  progress?: number
  line?: string
}

export function parseTaskEvent(raw: string): TaskStreamEvent | null {
  const trimmed = raw.trim()
  if (!trimmed || !trimmed.startsWith('data: ')) return null
  try {
    return JSON.parse(trimmed.slice(6)) as TaskStreamEvent
  } catch {
    return null
  }
}
