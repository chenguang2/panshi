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

  it('安装指引：四张平台卡（Windows/macOS/Chrome·Edge/Linux），不含 Firefox', async () => {
    const w = await mountPage()
    const guide = w.find('.install-guide')
    expect(guide.exists()).toBe(true)
    const cards = guide.findAll('.p-card')
    expect(cards.length).toBe(4)
    expect(cards.map((c) => c.find('.p-name').text())).toEqual(['Windows', 'macOS', 'Chrome / Edge 浏览器', 'Linux'])
    const text = guide.text()
    // Chrome/Edge 独立卡：双浏览器地址入口 + 导入路径 + 信任勾选
    expect(text).toContain('chrome://settings/security')
    expect(text).toContain('edge://settings/privacy')
    expect(text).toContain('证书颁发机构')
    expect(text).toContain('信任此 CA 标识网站')
    // Windows 卡安装卡点（UAC）与存储位置
    expect(text).toContain('本地计算机')
    expect(text).toContain('受信任的根证书颁发机构')
    expect(text).toContain('UAC')
    // Linux 双命令 + RHEL/CentOS 兼容提示
    expect(text).toContain('sudo cp')
    expect(text).toContain('sudo update-ca-certificates')
    expect(text).toContain('update-ca-trust')
    // Firefox 维持移除（ssl-cert-management 既定裁决，2026-11-22 重申）
    expect(text).not.toContain('Firefox')
  })

  it('验证条：安装成功判断 + 失败排查', async () => {
    const w = await mountPage()
    const strip = w.find('.verify-strip')
    expect(strip.exists()).toBe(true)
    const t = strip.text()
    expect(t).toContain('如何确认安装成功')
    expect(t).toContain('您的连接不是专用连接')
    expect(t).toContain('完全退出后重开')
  })

  it('summary 行 V1 开合可发现性：chev 块 + 「点此展开」提示', async () => {
    const w = await mountPage()
    const summary = w.find('.install-guide summary')
    expect(summary.find('.chev').exists()).toBe(true)
    expect(summary.text()).toContain('点此展开')
    expect(summary.text()).toContain('复制全部文本')
  })

  it('复制全部文本：程序性展开面板后取正文纯文本写剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const w = await mountPage()
    const guide = w.find('.install-guide')
    expect((guide.element as HTMLDetailsElement).open).toBe(false)
    const btn = w.findAll('button').find((b) => b.text() === '复制全部文本')
    await btn!.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('受信任的根证书颁发机构')
    expect(copied).toContain('chrome://settings/security')
    expect(copied).toContain('如何确认安装成功')
    // 不含 summary 自身文案（按钮/提示语不进复制产物）
    expect(copied).not.toContain('复制全部文本')
    expect(copied).not.toContain('点此展开')
    const { message } = await import('ant-design-vue')
    expect(message.success).toHaveBeenCalled()
  })

  it('Linux 单条命令复制：两条 copy-cmd 分别写入对应命令', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const w = await mountPage()
    const btns = w.findAll('.copy-cmd')
    expect(btns.length).toBe(2)
    await btns[0].trigger('click')
    expect(writeText).toHaveBeenCalledWith('sudo cp <证书名>.crt /usr/local/share/ca-certificates/')
    await btns[1].trigger('click')
    expect(writeText).toHaveBeenCalledWith('sudo update-ca-certificates')
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
    // 卡片页推广（2026-11-20）：删除入卡脚 ⋯ 菜单（r5 危险组）——先开菜单再点
    await w.find('.lp-foot .op-btn').trigger('click')
    const delBtn = w.findAll('.l5-menu .mi-main').find((b) => b.text() === '删除')
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
    await w.find('.lp-foot .op-btn').trigger('click')
    const delBtn = w.findAll('.l5-menu .mi-main').find((b) => b.text() === '删除')
    await delBtn!.trigger('click')
    await flushPromises()
    const opts = mockShowDeleteConfirm.mock.calls[0][0]
    expect(opts.extraWarning).toBeUndefined()
  })

  it('「查看安装指引」按钮已移除（2026-11-20 用户裁决；指引折叠面板本体保留、summary 点击展开）', async () => {
    const w = await mountPage()
    expect(w.findAll('button').some((b) => b.text() === '查看安装指引')).toBe(false)
    const guide = w.find('.install-guide')
    expect(guide.exists()).toBe(true)
    // summary 点击仍可展开（面板自身可用）
    await guide.find('summary').trigger('click')
    expect((guide.element as HTMLDetailsElement).open).toBe(true)
  })
})
