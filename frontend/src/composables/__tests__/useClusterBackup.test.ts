import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
  },
}))

const mockDownloadBlob = vi.fn()
vi.mock('@/utils/download', () => ({
  downloadBlob: (...args: any[]) => mockDownloadBlob(...args),
}))

import { useClusterBackup } from '@/composables/useClusterBackup'

describe('useClusterBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('downloadBackup', () => {
    it('请求备份接口并携带选项参数', async () => {
      mockApiGet.mockResolvedValue({ data: new Blob(['{}']) })
      const { downloadBackup } = useClusterBackup()
      await downloadBackup(7, 'demo', { include_secrets: true, include_files: false })
      expect(mockApiGet).toHaveBeenCalledWith('/clusters/7/backup', {
        params: { include_secrets: true, include_files: false },
        responseType: 'blob',
      })
    })

    it('以 集群名_备份_日期.json 命名触发下载', async () => {
      mockApiGet.mockResolvedValue({ data: new Blob(['{}']) })
      const { downloadBackup } = useClusterBackup()
      await downloadBackup(7, 'demo', { include_secrets: false, include_files: false })
      expect(mockDownloadBlob).toHaveBeenCalledTimes(1)
      const filename = mockDownloadBlob.mock.calls[0][1] as string
      expect(filename).toMatch(/^demo_备份_\d{8}\.json$/)
    })

    it('导出警告通过返回值暴露', async () => {
      mockApiGet.mockResolvedValue({
        data: new Blob([JSON.stringify({ warnings: ['文件缺失'] })]),
      })
      const { downloadBackup } = useClusterBackup()
      const result = await downloadBackup(7, 'demo', { include_secrets: false, include_files: true })
      expect(result?.warnings).toEqual(['文件缺失'])
    })

    it('失败时返回 null 并设置 error', async () => {
      mockApiGet.mockRejectedValue(new Error('boom'))
      const { downloadBackup, error } = useClusterBackup()
      const result = await downloadBackup(7, 'demo', { include_secrets: false, include_files: false })
      expect(result).toBeNull()
      expect(error.value).toBe('boom')
    })
  })

  describe('importBackup', () => {
    it('以 multipart 提交文件与目标集群名', async () => {
      mockApiPost.mockResolvedValue({
        data: { cluster_id: 9, warnings: [], pending_items: [] },
      })
      const { importBackup } = useClusterBackup()
      const file = new File(['{}'], 'backup.json')
      const result = await importBackup(file, 'restored')
      expect(mockApiPost).toHaveBeenCalledTimes(1)
      const [url, body, config] = mockApiPost.mock.calls[0]
      expect(url).toBe('/clusters/import')
      expect(body).toBeInstanceOf(FormData)
      expect(body.get('target_cluster_name')).toBe('restored')
      expect(body.get('file')).toBe(file)
      expect(config.headers['Content-Type']).toBe('multipart/form-data')
      expect(result?.cluster_id).toBe(9)
    })

    it('校验错误聚合到 error 并返回 null', async () => {
      mockApiPost.mockRejectedValue({
        response: { status: 400, data: { detail: { errors: ['format 不匹配'] } } },
      })
      const { importBackup, error } = useClusterBackup()
      const result = await importBackup(new File(['{}'], 'b.json'), 'x')
      expect(result).toBeNull()
      expect(error.value).toContain('format 不匹配')
    })
  })
})
