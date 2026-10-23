import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mockGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockGet(...args) },
}))

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const mockDownloadCertFile = vi.fn()
vi.mock('@/utils/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/download')>()
  return { ...actual, downloadCertFile: (...a: unknown[]) => mockDownloadCertFile(...a) }
})

const mockShowDeleteConfirm = vi.fn()
const mockExecuteDeleteWithProgress = vi.fn()
vi.mock('@/composables/useClusterUtils', () => ({
  showDeleteConfirm: (...a: unknown[]) => mockShowDeleteConfirm(...a),
  executeDeleteWithProgress: (...a: unknown[]) => mockExecuteDeleteWithProgress(...a),
  executePublish: vi.fn(),
}))

const stubs = {
  PageHeader: { template: '<div><slot name="actions" /><slot /></div>' },
  SslViewDrawer: true,
  CaCreateDialog: true,
}

const caCert = {
  id: 10,
  name: '企业根CA',
  cluster_id: 1,
  is_ca: true,
  sni: 'Embrace Root CA',
  cert: 'CA-PEM',
  algorithm: 'sm2',
  expire_at: '2031-10-01T00:00:00Z',
  expire_days: 1800,
}

function mockClusters() {
  return Promise.resolve({ data: { items: [{ id: 1, name: 'prod', display_name: '生产集团', group_name: '' }] } })
}

describe('CaCertList 分发页（ssl-cert-management）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn((_options?: ScrollIntoViewOptions) => {})
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return mockClusters()
      if (url === '/ssl') return Promise.resolve({ data: { items: [caCert] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  async function mountPage() {
    const CaCertList = (await import('../CaCertList.vue')).default
    const wrapper = mount(CaCertList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  it('绿色分发横幅：可放心下载分发给用户、不含私钥、与服务器证书划界', async () => {
    const w = await mountPage()
    const banner = w.find('.cert-banner-ok')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('放心下载分发给用户')
    expect(banner.text()).toContain('不含任何私钥')
    expect(banner.text()).toContain('服务器证书')
  })

  it('安装指引含 Chrome 段（浏览器内导入）且不含 Firefox', async () => {
    const w = await mountPage()
    const guide = w.find('.install-guide')
    expect(guide.exists()).toBe(true)
    const text = guide.text()
    expect(text).toContain('Chrome 浏览器')
    expect(text).toContain('证书颁发机构')
    expect(text).not.toContain('Firefox')
    expect(text).toContain('Windows')
    expect(text).toContain('macOS')
    expect(text).toContain('Linux')
  })

  it('空态「暂无 CA 根证书」+ 创建引导；计数文案为「N 个 CA 根证书」', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return mockClusters()
      if (url === '/ssl') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const w = await mountPage()
    expect(w.text()).toContain('暂无 CA 根证书')
    expect(w.findAll('button').some((b) => b.text() === '创建 CA 根证书')).toBe(true)
    expect(w.text()).toContain('共 0 个 CA 根证书')
  })

  it('卡片「下载根证书」→ 单文件直下 {集群名}_{名称}.crt + 成功提示', async () => {
    const w = await mountPage()
    const dlBtn = w.findAll('button').find((b) => b.text() === '下载根证书')
    expect(dlBtn).toBeDefined()
    await dlBtn!.trigger('click')
    expect(mockDownloadCertFile).toHaveBeenCalledTimes(1)
    expect(mockDownloadCertFile).toHaveBeenCalledWith('CA-PEM', '生产集团_企业根CA.crt')
    const { message } = await import('ant-design-vue')
    expect(message.success).toHaveBeenCalled()
  })

  it('删除 CA：先统计引用数，showDeleteConfirm 带引用软提示（N=1）', async () => {
    mockGet.mockImplementation((url: string, config?: any) => {
      if (url === '/clusters') return mockClusters()
      if (url === '/ssl') {
        if (config?.params?.cluster_id === 1) {
          return Promise.resolve({ data: { items: [caCert, { id: 20, name: 'srv1', is_ca: false, ca_cert_id: 10 }] } })
        }
        return Promise.resolve({ data: { items: [caCert] } })
      }
      if (url === '/clusters/1/nodes') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const w = await mountPage()
    const delBtn = w.findAll('button').find((b) => b.text() === '删除')
    await delBtn!.trigger('click')
    await flushPromises()
    expect(mockShowDeleteConfirm).toHaveBeenCalledTimes(1)
    const opts = mockShowDeleteConfirm.mock.calls[0][0]
    expect(opts.extraWarning).toContain('仍被 1 张服务器证书引用')
    expect(opts.extraWarning).toContain('无法再向新用户分发')
    expect(opts.title).toContain('CA 根证书')
  })

  it('删除未被引用的 CA：无 extraWarning', async () => {
    const w = await mountPage()
    const delBtn = w.findAll('button').find((b) => b.text() === '删除')
    await delBtn!.trigger('click')
    await flushPromises()
    const opts = mockShowDeleteConfirm.mock.calls[0][0]
    expect(opts.extraWarning).toBeUndefined()
  })

  it('「查看安装指引」展开面板并滚动定位', async () => {
    const w = await mountPage()
    const guide = w.find('.install-guide').element as HTMLDetailsElement
    expect(guide.open).toBe(false)
    const btn = w.findAll('button').find((b) => b.text() === '查看安装指引')
    await btn!.trigger('click')
    expect(guide.open).toBe(true)
  })
})
