import api from '@/api'
import { downloadBlob } from '@/utils/download'

interface NodeTaskListParams {
  status?: string
  task_type?: string
  /** 关键字：任务号 / 节点 IP / params 原文（命令、路径等），后端 `q` 参数 */
  q?: string
  /** 仅看某个集群的任务（跨集群列表的集群筛选） */
  cluster_id?: number
  /** 创建时间下界（naive UTC 的 ISO 时间串，如 2026-10-25T09:00:00） */
  created_from?: string
  created_to?: string
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
  /** 失败归因（后端按 rc/stderr 生成；成功为 null） */
  failure_reason?: string | null
  /** 已重试次数（>0 表示存在历史尝试留档日志） */
  attempt?: number
  logs: Array<{ t: string; level: string; line: string }>
  stdout?: string | null
  stderr?: string | null
  command?: string | null
  log_file?: string | null
  log_line_count?: number | null
  started_at?: string | null
  finished_at?: string | null
}

export interface NodeTaskData {
  id: number
  cluster_id: number
  /** 集群名（后端 JOIN ps_cluster；集群已删除时为 null，列表显示「—」） */
  cluster_name?: string | null
  task_type: string
  status: string
  params: Record<string, unknown>
  total_nodes: number
  success_nodes: number
  failed_nodes: number
  /** 跳过节点数（后端 test suite 语义：主机不在清单/前置不满足时跳过） */
  skipped_nodes: number
  cancelled_nodes: number
  /** 失败归因摘要（后端按子项 stderr/归因生成；无失败为 null） */
  failure_summary?: string | null
  /** 已请求取消（后端由 cancel_requested_at 推导）：running + 该字段为 true → 界面「取消中」 */
  cancel_requested?: boolean
  cancel_requested_at?: string | null
  created_by?: number | null
  /** 发起人用户名（历史任务为 NULL，列表显示「—」） */
  created_by_name?: string | null
  created_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  items?: NodeTaskItemData[]
}

interface TaskListResponse {
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

export interface NodeTaskAuditEntry {
  id: number
  username: string | null
  action: string
  detail: string | null
  ip_address: string | null
  created_at: string
}

/** 任务操作审计（详情页「操作记录」区块；后端按时间升序返回） */
export async function getNodeTaskAudit(taskId: number): Promise<NodeTaskAuditEntry[]> {
  const res = await api.get(`/node-tasks/${taskId}/audit`)
  return res.data
}

export async function createNodeTask(
  clusterId: number,
  taskType: string,
  nodeIds: number[],
  params: Record<string, unknown> = {},
  archiveUploadId?: string,
): Promise<NodeTaskData> {
  const res = await api.post(`/clusters/${clusterId}/node-tasks`, {
    task_type: taskType,
    node_ids: nodeIds,
    params,
    ...(archiveUploadId ? { archive_upload_id: archiveUploadId } : {}),
  })
  return res.data
}

export async function cancelNodeTask(taskId: number): Promise<void> {
  await api.post(`/node-tasks/${taskId}/cancel`)
}

export async function retryNodeTask(taskId: number, nodeIds?: number[]): Promise<void> {
  await api.post(`/node-tasks/${taskId}/retry`, nodeIds ? { node_ids: nodeIds } : {})
}

export async function deleteNodeTask(taskId: number): Promise<{ deleted: number[] }> {
  const res = await api.delete(`/node-tasks/${taskId}`)
  return res.data
}

export async function batchDeleteNodeTasks(taskIds: number[]): Promise<{ deleted: number[]; skipped: number[] }> {
  const res = await api.post('/node-tasks/batch-delete', { task_ids: taskIds })
  return res.data
}

export interface TaskItemLogOptions {
  /** 只取末尾 N 行（0/未传 = 全文） */
  tail?: number
  /** 读某次历史尝试的留档日志（第 N 次执行），不传 = 本次 */
  attempt?: number
}

export async function fetchTaskItemLog(
  taskId: number,
  nodeId: number,
  options: TaskItemLogOptions = {},
): Promise<string> {
  const params: Record<string, number> = {}
  if (options.tail && options.tail > 0) params.tail = options.tail
  if (options.attempt && options.attempt > 0) params.attempt = options.attempt
  const res = await api.get(`/node-tasks/${taskId}/items/${nodeId}/log`, { params, responseType: 'text' })
  return typeof res.data === 'string' ? res.data : ''
}

/** 下载单节点本次（或某次历史尝试）日志：后端 `download=true` 走附件名 */
export async function downloadTaskItemLog(taskId: number, nodeId: number, attempt?: number): Promise<void> {
  const params: Record<string, unknown> = { download: true }
  if (attempt && attempt > 0) params.attempt = attempt
  const res = await api.get(`/node-tasks/${taskId}/items/${nodeId}/log`, { params, responseType: 'blob' })
  const suffix = attempt && attempt > 0 ? `-attempt${attempt}` : ''
  downloadBlob(res.data as Blob, `task-${taskId}-node${nodeId}${suffix}.log`)
}

/** 整任务日志打包导出（zip，含各节点活动日志与历史尝试留档） */
export async function downloadTaskLogsArchive(taskId: number): Promise<void> {
  const res = await api.get(`/node-tasks/${taskId}/logs/archive`, { responseType: 'blob' })
  downloadBlob(res.data as Blob, `task-${taskId}-logs.zip`)
}

export interface TaskStreamEvent {
  type: string
  task_id: number
  node_id?: number
  status?: string
  rc?: number | null
  line?: string
  progress?: number
  success_nodes?: number
  failed_nodes?: number
  cancelled_nodes?: number
}

export function parseTaskEvent(raw: string): TaskStreamEvent | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const json = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
  try {
    return JSON.parse(json) as TaskStreamEvent
  } catch {
    return null
  }
}
