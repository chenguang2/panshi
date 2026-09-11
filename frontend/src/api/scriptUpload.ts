import api from '@/api'

export interface UploadedScript {
  upload_id: string
  filename: string
  size: number
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
