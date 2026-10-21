import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/utils/download', () => ({
  buildCertZip: vi.fn().mockResolvedValue(new Blob()),
  downloadBlob: vi.fn(),
  downloadPem: vi.fn(),
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
  // fileOptions 由 visible watch 构建，需真实翻转
  await wrapper.setProps({ visible: true })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('SslCertDownloadDialog 中文命名与敏感提示（ssl-ux-review-fixes 6.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('6.2 非国密证书选项为「证书 (cert.pem)」「私钥 (key.pem)」（无加密前缀）', async () => {
    const w = await mountDialog({
      id: 1,
      cluster_id: 3,
      name: 'srv',
      cert: 'C',
      key: '',
      has_private_key: true,
      algorithm: 'rsa',
    })
    const labels = w.findAll('.checkbox-row').map((r) => r.text())
    expect(labels.some((t) => t.includes('证书 (cert.pem)'))).toBe(true)
    expect(labels.some((t) => t.includes('私钥 (key.pem)'))).toBe(true)
    expect(labels.some((t) => t.includes('加密证书'))).toBe(false)
  })

  it('6.2 国密双证书保留「加密/签名」前缀区分', async () => {
    const w = await mountDialog({
      id: 1,
      cluster_id: 3,
      name: 'gm',
      cert: 'C',
      key: '',
      has_private_key: true,
      sign_cert: 'SC',
      sign_key: '',
      has_sign_key: true,
      algorithm: 'sm2',
    })
    const labels = w.findAll('.checkbox-row').map((r) => r.text())
    expect(labels.some((t) => t.includes('加密证书 (cert.pem)'))).toBe(true)
    expect(labels.some((t) => t.includes('加密私钥 (key.pem)'))).toBe(true)
    expect(labels.some((t) => t.includes('签名证书 (sign_cert.pem)'))).toBe(true)
    expect(labels.some((t) => t.includes('签名私钥 (sign_key.pem)'))).toBe(true)
  })

  it('6.2 底部灰字提示「ZIP 内含私钥，属敏感数据，请妥善保管」', async () => {
    const w = await mountDialog({
      id: 1,
      cluster_id: 3,
      name: 'srv',
      cert: 'C',
      key: '',
      has_private_key: true,
      algorithm: 'rsa',
    })
    expect(w.text()).toContain('ZIP 内含私钥，属敏感数据，请妥善保管')
  })
})

describe('SslCertDownloadDialog 私钥按需获取（ssl-ux-review-fixes 9.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchKey.mockResolvedValue({ data: { private_key: 'LIVE-KEY', sign_key: 'LIVE-SIGN' } })
  })

  it('私钥选项按 has_private_key/has_sign_key 判定（掩码后字段恒空仍有选项；无钥无选项）', async () => {
    const withKey = await mountDialog({
      id: 1,
      cluster_id: 3,
      name: 'a',
      cert: 'C',
      key: '',
      has_private_key: true,
      algorithm: 'rsa',
    })
    expect(
      withKey
        .findAll('.checkbox-row')
        .map((r) => r.text())
        .some((t) => t.includes('私钥')),
    ).toBe(true)

    const noKey = await mountDialog({
      id: 2,
      cluster_id: 3,
      name: 'b',
      cert: 'C',
      key: '',
      has_private_key: false,
      algorithm: 'rsa',
    })
    expect(
      noKey
        .findAll('.checkbox-row')
        .map((r) => r.text())
        .some((t) => t.includes('私钥')),
    ).toBe(false)
  })

  it('勾选私钥下载时经按需端点取钥并合并进 ZIP', async () => {
    const w = await mountDialog({
      id: 9,
      cluster_id: 3,
      name: 'srv',
      cert: 'C',
      key: '',
      has_private_key: true,
      algorithm: 'rsa',
    })
    // 默认全选（cert+key），直接下载
    await w.find('.modal-footer .btn-primary').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(mockFetchKey).toHaveBeenCalledWith(3, 9)
    const merged = (await import('@/utils/download')).buildCertZip as any
    expect(merged.mock.calls[0][0].key).toBe('LIVE-KEY')
  })

  it('仅下载证书（取消私钥勾选）不触发取钥', async () => {
    const w = await mountDialog({
      id: 9,
      cluster_id: 3,
      name: 'srv',
      cert: 'C',
      key: '',
      has_private_key: true,
      algorithm: 'rsa',
    })
    const keyRow = w.findAll('.checkbox-row').find((r) => r.text().includes('私钥'))
    await keyRow.find('input').setValue(false)
    await w.find('.modal-footer .btn-primary').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(mockFetchKey).not.toHaveBeenCalled()
  })

  it('下载成功后弹窗自动关闭（handleClose 的下载中守卫不得吞掉成功关窗）', async () => {
    mockFetchKey.mockResolvedValue({ data: { private_key: 'LIVE-KEY' } })
    const w = await mountDialog({
      id: 9,
      cluster_id: 3,
      name: 'srv',
      cert: 'C',
      key: '',
      has_private_key: true,
      algorithm: 'rsa',
    })
    await w.find('.modal-footer .btn-primary').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(w.emitted('close')).toBeDefined()
  })
})
