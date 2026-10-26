import { ref } from 'vue'
import api from '@/api'
import { downloadBlob } from '@/utils/download'

interface BackupDownloadOptions {
  include_secrets: boolean
  include_files: boolean
}

interface BackupWarning {
  name: string
  type: string
  reason: string
}

interface ImportBackupResult {
  cluster_id: number
  warnings: string[]
  pending_items: BackupWarning[]
}

function todayStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/**
 * 同会话下载 ↔ 导入的完整性校验和登记表（central-management-ux-review-fixes P1-3）。
 * 键 = 下载文件名；模块级（跨弹窗开关存活，会话内有效）。导入时命中即自动附带
 * expected_checksum，文件被篡改/损坏时后端返回明确「校验和不符」而非静默导入。
 * 无记录（跨会话/外来文件）不附带，行为与既往一致。
 */
const checksumRegistry = new Map<string, string>()

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
    const filename = `${clusterName}_备份_${todayStamp()}.json`
    try {
      const res = await api.get(`/clusters/${clusterId}/backup`, {
        params: {
          include_secrets: options.include_secrets,
          include_files: options.include_files,
        },
        responseType: 'blob',
      })
      downloadBlob(res.data as Blob, filename)
      // 登记完整性校验和（P1-3）：响应头 X-Backup-Checksum → 同会话导入自动附带
      const checksum = (res.headers as Record<string, string> | undefined)?.['x-backup-checksum']
      if (checksum) checksumRegistry.set(filename, checksum)
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
      // 同会话下载的文件自动附带校验和（P1-3）；无记录则不附带（行为不变）
      const checksum = checksumRegistry.get(file.name)
      if (checksum) form.append('expected_checksum', checksum)
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
