import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

const mockBuildCertZip = vi.fn().mockResolvedValue(new Blob(['zip-bytes']))
const mockDownloadBlob = vi.fn()
const mockDownloadCertFile = vi.fn()

vi.mock('@/utils/download', () => ({
  buildCertZip: (...a: unknown[]) => mockBuildCertZip(...a),
  downloadBlob: (...a: unknown[]) => mockDownloadBlob(...a),
  downloadCertFile: (...a: unknown[]) => mockDownloadCertFile(...a),
  downloadPem: vi.fn(),
  buildCertFileName: vi.fn((_c: unknown, n: string) => `集群_${n}.crt`),
}))

const mockFetchKey = vi.fn()
vi.mock('@/api/ssl', () => ({
  fetchSslPrivateKey: (...args: any[]) => mockFetchKey(...args),
}))

async function mountDialog(cert: Record<string, any>) {
  const SslCertDownloadDialog = (await import('../SslCertDownloadDialog.vue')).default
  const wrapper = mount(SslCertDownloadDialog, {
    props: { visible: false, cert },
  })
  await wrapper.setProps({ visible: true })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('SslCertDownloadDialog 分发语义重做（ssl-cert-management）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildCertZip.mockResolvedValue(new Blob(['zip-bytes']))
  })

  it('对话框无私钥选项（has_private_key/has_sign_key 无论真假都不出现）', async () => {
    const w = await mountDialog({
      id: 1,
      cluster_id: 3,
      name: 'srv',
      cert: 'C',
      has_private_key: true,
      has_sign_key: true,
      sign_cert: 'SC',
      algorithm: 'sm2',
    })
    const labels = w.findAll('.checkbox-row').map((r) => r.text())
    expect(labels.some((t) => t.includes('私钥'))).toBe(false)
    expect(labels.some((t) => t.includes('签名私钥'))).toBe(false)
    expect(labels.some((t) => t.includes('key.pem'))).toBe(false)
    expect(mockFetchKey).not.toHaveBeenCalled()
  })

  it('单证体系选项「服务器证书 {名称}.crt」，无「加密」前缀', async () => {
    const w = await mountDialog({ id: 1, cluster_id: 3, name: 'srv', cert: 'C', algorithm: 'rsa' })
    const labels = w.findAll('.checkbox-row').map((r) => r.text())
    expect(labels.some((t) => t.includes('服务器证书') && t.includes('srv.crt'))).toBe(true)
    expect(labels.some((t) => t.includes('加密证书'))).toBe(false)
  })

  it('国密双证书显示加密+签名两个 .crt 选项', async () => {
    const w = await mountDialog({
      id: 1,
      cluster_id: 3,
      name: 'gm',
      cert: 'C',
      sign_cert: 'SC',
      algorithm: 'sm2',
    })
    const labels = w.findAll('.checkbox-row').map((r) => r.text())
    expect(labels.some((t) => t.includes('服务器证书') && t.includes('gm.crt'))).toBe(true)
    expect(labels.some((t) => t.includes('签名证书') && t.includes('gm_sign.crt'))).toBe(true)
  })

  it('固定失效警示 + 终端用户指引 + 「下载 CA 根证书」按钮（点击 emit download-ca）', async () => {
    const w = await mountDialog({ id: 1, cluster_id: 3, name: 'srv', cert: 'C', algorithm: 'rsa' })
    expect(w.text()).toContain('当前版本')
    expect(w.text()).toContain('失效')
    expect(w.text()).toContain('CA 根证书')
    const caBtn = w.findAll('button').find((b) => b.text().includes('下载 CA 根证书'))
    expect(caBtn).toBeDefined()
    await caBtn!.trigger('click')
    expect(w.emitted('download-ca')).toHaveLength(1)
  })

  it('私钥去向说明：仅平台部署使用，查看抽屉高风险获取', async () => {
    const w = await mountDialog({ id: 1, cluster_id: 3, name: 'srv', cert: 'C', algorithm: 'rsa' })
    expect(w.text()).toContain('私钥不随证书下载')
    expect(w.text()).toContain('查看')
  })

  it('非国密单证书直下单文件 .crt（不打 zip、不调 jszip）', async () => {
    const w = await mountDialog({ id: 1, cluster_id: 3, name: 'srv', cert: 'C', algorithm: 'rsa' })
    const dlBtn = w.findAll('button').find((b) => b.text().includes('下载 .crt'))
    expect(dlBtn).toBeDefined()
    await dlBtn!.trigger('click')
    expect(mockDownloadCertFile).toHaveBeenCalledTimes(1)
    expect(mockBuildCertZip).not.toHaveBeenCalled()
    expect(mockDownloadBlob).not.toHaveBeenCalled()
  })

  it('国密双证书打 zip：内部仅证书文件（.crt），无 key 选项可选', async () => {
    const w = await mountDialog({
      id: 1,
      cluster_id: 3,
      name: 'gm',
      cert: 'C',
      sign_cert: 'SC',
      algorithm: 'sm2',
    })
    const dlBtn = w.findAll('button').find((b) => b.text().includes('下载 ZIP'))
    expect(dlBtn).toBeDefined()
    await dlBtn!.trigger('click')
    expect(mockBuildCertZip).toHaveBeenCalledTimes(1)
    const source = mockBuildCertZip.mock.calls[0][0] as Record<string, string>
    const selected = mockBuildCertZip.mock.calls[0][1] as string[]
    expect(selected).toEqual(['cert', 'sign_cert'])
    expect(source).not.toHaveProperty('key')
    expect(source).not.toHaveProperty('sign_key')
    expect(mockDownloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'gm_certs.zip')
  })

  it('下载成功 toast 含重新分发提醒并自动关窗', async () => {
    const { message } = await import('ant-design-vue')
    const w = await mountDialog({ id: 1, cluster_id: 3, name: 'srv', cert: 'C', algorithm: 'rsa' })
    const dlBtn = w.findAll('button').find((b) => b.text().includes('下载 .crt'))
    await dlBtn!.trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(message.success).toHaveBeenCalled()
    const content = String((message.success as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(content).toContain('失效')
    expect(w.emitted('close')).toHaveLength(1)
  })
})
