import { ref } from 'vue'
import api from '@/api'
import { downloadBlob } from '@/utils/download'

export interface BackupDownloadOptions {
  include_secrets: boolean
  include_files: boolean
}

export interface BackupWarning {
  name: string
  type: string
  reason: string
}

export interface ImportBackupResult {
  cluster_id: number
  warnings: string[]
  pending_items: BackupWarning[]
}

function todayStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

export function useClusterBackup() {
  const error = ref<string>('')
  const downloading = ref(false)
  const importing = ref(false)

  async function downloadBackup(
    clusterId: number,
    clusterName: string,
    options: BackupDownloadOptions,
  ): Promise<{ warnings: string[] } | null> {
    downloading.value = true
    error.value = ''
    try {
      const res = await api.get(`/clusters/${clusterId}/backup`, {
        params: {
          include_secrets: options.include_secrets,
          include_files: options.include_files,
        },
        responseType: 'blob',
      })
      downloadBlob(res.data as Blob, `${clusterName}_备份_${todayStamp()}.json`)
      // 尝试从 blob 中读取导出警告（后端将 warnings 写入文档）
      let warnings: string[] = []
      try {
        const text = await (res.data as Blob).text()
        const doc = JSON.parse(text)
        if (Array.isArray(doc?.warnings)) warnings = doc.warnings
      } catch {
        // 非 JSON blob（不应发生）——忽略
      }
      return { warnings }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      error.value = err.response?.data?.detail || err.message || '备份下载失败'
      return null
    } finally {
      downloading.value = false
    }
  }

  async function importBackup(file: File, targetClusterName: string): Promise<ImportBackupResult | null> {
    importing.value = true
    error.value = ''
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('target_cluster_name', targetClusterName)
      const res = await api.post('/clusters/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data as ImportBackupResult
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: { errors?: string[] } | string } }; message?: string }
      const detail = err.response?.data?.detail
      if (typeof detail === 'object' && detail?.errors && Array.isArray(detail.errors)) {
        error.value = detail.errors.join('；')
      } else {
        error.value = typeof detail === 'string' ? detail : err.message || '导入失败'
      }
      return null
    } finally {
      importing.value = false
    }
  }

  return { error, downloading, importing, downloadBackup, importBackup }
}
