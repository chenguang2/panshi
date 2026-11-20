import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mockGet = vi.fn()

const mockPut = vi.fn()
vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockGet(...args), put: (...args: any[]) => mockPut(...args) },
}))

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
  // AppModal（PublishPreviewModal 挂载，batch2）经 Modal 渲染：给可渲染桩，open=false 不产出内容
  Modal: { template: '<div v-if="open"><slot /></div>', props: ['open'] },
}))

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
}))

const stubs = {
  PageHeader: { template: '<div><slot name="actions" /><slot /></div>' },
  SslFormDrawer: true,
  SslViewDrawer: true,
  SslGenerateDialog: { template: '<div class="generate-stub" />' },
  SslCertDownloadDialog: true,
  CaCreateDialog: true,
  VersionManagementModal: true,
  PublishConfirmModal: true,
}

function mockCert(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: 'srv',
    cluster_id: 1,
    cert_type: 'server',
    sni: 'edge.local,api.example.com',
    cert: 'crt',
    key: 'key',
    algorithm: 'rsa',
    expire_at: '2026-11-01T00:00:00Z',
    expire_days: 10,
    ...overrides,
  }
}

const caCert = {
  id: 10,
  name: '企业根CA',
  cluster_id: 1,
  is_ca: true,
  sni: 'Embrace Root CA',
  cert: 'CA-PEM',
  algorithm: 'sm2',
}

function setupGet(items: any[]) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/clusters') {
      return Promise.resolve({ data: { items: [{ id: 1, name: 'prod', display_name: '生产集团', group_name: '' }] } })
    }
    if (url === '/ssl') return Promise.resolve({ data: { items } })
    return Promise.reject(new Error('unexpected GET: ' + url))
  })
}

describe('ServerCertList 分发警示页（ssl-cert-management）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupGet([mockCert(), caCert])
  })

  async function mountPage() {
    const ServerCertList = (await import('../ServerCertList.vue')).default
    const wrapper = mount(ServerCertList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  it('琥珀警示横幅：勿分发、需装 CA 根证书、副本失效、客户端证书指引、跳转按钮', async () => {
    const w = await mountPage()
    const banner = w.find('.cert-banner-warn')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('请勿将服务器证书分发给终端用户')
    expect(banner.text()).toContain('CA 根证书')
    expect(banner.text()).toContain('立即失效')
    const goBtn = banner.findAll('button').find((b) => b.text().includes('前往 CA 根证书下载'))
    expect(goBtn).toBeDefined()
    await goBtn!.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/ssl/ca')
  })

  it('签发 CA 行：ca_cert_id 可解析显示 CA 名并可跳转，无效显示「—」', async () => {
    setupGet([mockCert({ id: 1, ca_cert_id: 10 }), mockCert({ id: 2, name: '外签证书', ca_cert_id: null }), caCert])
    const w = await mountPage()
    const caLinks = w.findAll('.ca-link')
    expect(caLinks).toHaveLength(1)
    expect(caLinks[0].text()).toBe('企业根CA')
    expect(w.text()).toContain('—')
    await caLinks[0].trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/ssl/ca')
  })

  it('保留 SNI 系统保留标注（edge.local）', async () => {
    const w = await mountPage()
    const locked = w.find('.sni-tag-locked')
    expect(locked.exists()).toBe(true)
    expect(locked.text()).toContain('edge.local')
    expect(locked.text()).toContain('系统保留')
  })

  it('有效期仅日期 + 临期徽章（集成卡片）', async () => {
    const w = await mountPage()
    expect(w.text()).toContain('2026/11/01')
    expect(w.text()).toContain('剩余 10 天')
  })

  it('client 证书卡片无「下载证书」按钮（引导查看抽屉）', async () => {
    setupGet([mockCert({ id: 3, name: 'client1', cert_type: 'client' }), caCert])
    const w = await mountPage()
    const card = w.findAll('.l5-panel').find((c) => c.text().includes('client1'))
    // 卡片页推广：下载证书/版本管理入卡脚 ⋯ 菜单（.mi-main 主文案精确断言）
    await card!.find('.lp-foot .op-btn').trigger('click')
    const items = card!.findAll('.l5-menu .mi-main').map((b) => b.text())
    expect(items).not.toContain('下载证书')
    expect(items).not.toContain('版本管理')
    expect(items).toContain('查看')
  })

  it('server 卡片菜单无「下载证书」（下载入口下线，2026-11-20 用户裁决）', async () => {
    const w = await mountPage()
    await w.find('.lp-foot .op-btn').trigger('click')
    const items = w.findAll('.l5-menu .mi-main').map((b) => b.text())
    expect(items).not.toContain('下载证书')
    expect(items).toEqual(['查看', '版本管理', '删除'])
  })

  it('页头动作：「生成证书」保留，「添加已有证书」已移除（2026-11-20 用户裁决）；计数归 chips', async () => {
    const w = await mountPage()
    expect(w.findAll('button').some((b) => b.text().includes('添加已有证书'))).toBe(false)
    expect(w.findAll('button').some((b) => b.text() === '生成证书')).toBe(true)
    // 计数归 chips「全部 N」（AGENTS #86，工具条不再显示「共 N 个」）
    expect(w.text()).toContain('全部')
    expect(w.findAll('.f-chip.chip-status')[0]?.text()).toContain('1')
  })

  it('页头层级：生成证书 = 唯一 primary（平台主路径）', async () => {
    const w = await mountPage()
    const genBtn = w.findAll('button').find((b) => b.text() === '生成证书')
    expect(genBtn, '应有生成证书按钮').toBeTruthy()
    expect(genBtn!.classes()).toContain('btn-primary')
  })

  it('无筛选空态「暂无服务器证书」；筛选空态含「清除筛选」', async () => {
    setupGet([caCert])
    const w = await mountPage()
    expect(w.text()).toContain('暂无服务器证书')
    const search = w.find('input[type="text"]')
    ;(search.element as HTMLInputElement).value = 'zzz'
    await search.trigger('input')
    await flushPromises()
    expect(w.text()).toContain('未找到匹配的证书')
    const clearBtn = w.findAll('button').find((b) => b.text() === '清除筛选')
    await clearBtn!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('暂无服务器证书')
  })

  it('「对话框内创建 CA」成功：停留本页、生成框保持打开、触发 CA 下拉刷新', async () => {
    const w = await mountPage()
    // 打开生成框
    const genBtn = w.findAll('button').find((b) => b.text() === '生成证书')
    await genBtn!.trigger('click')
    expect(w.find('.generate-stub').exists()).toBe(true)
    // 触发 CaCreateDialog success
    const caDialog = w.findComponent({ name: 'CaCreateDialog' })
    expect(caDialog.exists()).toBe(true)
    const sslCallsBefore = mockGet.mock.calls.filter(([u]) => u === '/ssl').length
    caDialog.vm.$emit('success')
    await flushPromises()
    // 未路由跳转（停留本页）且列表刷新
    expect(mockPush).not.toHaveBeenCalledWith('/ssl/ca')
    const sslCallsAfter = mockGet.mock.calls.filter(([u]) => u === '/ssl').length
    expect(sslCallsAfter).toBeGreaterThan(sslCallsBefore)
  })
})

describe('ServerCertList 匹配名单同步（ssl-cert-rollback-consistency）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPut.mockResolvedValue({ status: 200, data: {} })
    setupGet([
      mockCert({
        id: 1,
        sni: 'edge.local,qcg.com',
        dns_sans: ['edge.local', 'qcg.com', 'g.gkpt.cars'],
        ip_sans: ['192.168.0.13'],
        sni_mismatch: true,
      }),
      caCert,
    ])
  })

  it('卡片 sni_mismatch=true 渲染警示行与同步按钮', async () => {
    const ServerCertList = (await import('../ServerCertList.vue')).default
    const w = mount(ServerCertList, { global: { stubs } })
    await flushPromises()
    const card = w.findAll('.l5-panel').find((c) => c.text().includes('srv'))
    expect(card!.text()).toContain('匹配名单与证书 SAN 不一致')
    expect(card!.findAll('button').some((b) => b.text() === '同步')).toBe(true)
  })

  it('点击同步 → PUT 携带 SAN 推导 sni → 刷新', async () => {
    const ServerCertList = (await import('../ServerCertList.vue')).default
    const w = mount(ServerCertList, { global: { stubs } })
    await flushPromises()
    const cardComp = w.findAllComponents({ name: 'SslCertCard' }).find((c) => c.props('cert')?.name === 'srv')
    expect(cardComp).toBeDefined()
    const sslCallsBefore = mockGet.mock.calls.filter(([u]) => u === '/ssl').length
    cardComp!.vm.$emit('sync-sni', cardComp!.props('cert'))
    await flushPromises()
    expect(mockPut).toHaveBeenCalledWith('/clusters/1/ssl/1', {
      sni: 'edge.local,qcg.com,g.gkpt.cars,192.168.0.13',
    })
    const sslCallsAfter = mockGet.mock.calls.filter(([u]) => u === '/ssl').length
    expect(sslCallsAfter).toBeGreaterThan(sslCallsBefore)
  })

  it('SAN 字段缺失时不发 PUT', async () => {
    setupGet([mockCert({ id: 9, sni: 'edge.local,x.com', dns_sans: undefined, ip_sans: undefined }), caCert])
    const ServerCertList = (await import('../ServerCertList.vue')).default
    const w = mount(ServerCertList, { global: { stubs } })
    await flushPromises()
    const cardComp = w.findAllComponents({ name: 'SslCertCard' }).find((c) => c.props('cert')?.name === 'srv')
    cardComp!.vm.$emit('sync-sni', cardComp!.props('cert'))
    await flushPromises()
    expect(mockPut).not.toHaveBeenCalled()
  })
})
