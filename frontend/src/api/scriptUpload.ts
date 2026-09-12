import api from '@/api'

export interface UploadedScript {
  upload_id: string
  filename: string
  size: number
  /** 存储形态类型：脚本 = .sh 后缀，分发文件 = 无后缀 */
  kind: 'script' | 'distribute'
  /** 上传时间（ISO 字符串，取自文件 mtime） */
  uploaded_at: string
}

export interface ScriptPreview {
  upload_id: string
  content: string
  filename: string
}

/**
 * Upload a script file for later execution.
 */
export async function uploadScript(file: File): Promise<{ upload_id: string; filename: string; size: number }> {
  const formData = new FormData()
  formData.append('file', file)
  const resp = await api.post('/node-tasks/upload-script', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return resp.data
}

/**
 * Preview uploaded script content.
 */
export async function previewScript(uploadId: string): Promise<ScriptPreview> {
  const resp = await api.get(`/node-tasks/script-preview/${uploadId}`)
  return resp.data
}

/**
 * List all uploaded scripts.
 */
export async function listUploadedScripts(): Promise<UploadedScript[]> {
  const resp = await api.get('/node-tasks/uploaded-scripts')
  return resp.data
}

/**
 * Delete an uploaded script.
 */
export async function deleteUploadedScript(uploadId: string): Promise<void> {
  await api.delete(`/node-tasks/uploaded-scripts/${uploadId}`)
}

export interface TaskFile {
  task_id: number
  /** 任务目录中的存储名（删除时回传） */
  name: string
  /** 展示名：分发文件为原始文件名，脚本为存储名 */
  filename: string
  size: number
  kind: 'script' | 'distribute'
  /** 任务类型（如 distribute_file、cmd_exec 等） */
  task_type: string
  /** 任务创建时间（ISO 字符串） */
  created_at: string | null
}

/**
 * List archived files across task directories (controller copies only).
 */
export async function listTaskFiles(): Promise<TaskFile[]> {
  const resp = await api.get('/node-tasks/task-files')
  return resp.data
}

/**
 * Delete a task's archived source file (controller copy only —
 * files already distributed to nodes and the task itself are untouched).
 */
export async function deleteTaskFile(taskId: number, name: string): Promise<void> {
  await api.delete(`/node-tasks/task-files/${taskId}/${encodeURIComponent(name)}`)
}

/**
 * Upload a distribute file (binary-safe, no encoding conversion).
 */
export async function uploadDistributeFile(file: File): Promise<{ upload_id: string; filename: string; size: number }> {
  const formData = new FormData()
  formData.append('file', file)
  const resp = await api.post('/node-tasks/upload-distribute-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return resp.data
}

/**
 * Preview uploaded distribute file content (returns preview_available: false for binary).
 */
export async function previewDistributeFile(
  uploadId: string,
): Promise<{ upload_id: string; content?: string; preview_available: boolean; filename: string }> {
  const resp = await api.get(`/node-tasks/script-preview/${uploadId}`)
  return resp.data
}
