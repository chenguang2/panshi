import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mockGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockGet(...args) },
}))

const stubs = {
  PageHeader: { template: '<div><slot name="actions" /><slot /></div>' },
  SslFormDrawer: true,
  SslViewDrawer: true,
  SslGenerateDialog: true,
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
    ...overrides,
  }
}

describe('SslList reserved SNI (edge.local)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/ssl') return Promise.resolve({ data: { items: [mockCert()] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  async function mountList() {
    const SslList = (await import('../SslList.vue')).default
    const wrapper = mount(SslList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  it('marks edge.local in card SNI as system-reserved', async () => {
    const wrapper = await mountList()
    expect(wrapper.text()).toContain('系统保留')
  })

  it('annotates the edge.local tag but not other SNI tags', async () => {
    const wrapper = await mountList()
    const tags = wrapper.findAll('.ssl-card-row span.sni-tag')
    const edgeTag = tags.find((t) => t.text().includes('edge.local'))!
    expect(edgeTag.text()).toContain('系统保留')
    const apiTag = tags.find((t) => t.text().includes('api.example.com'))!
    expect(apiTag.text()).not.toContain('系统保留')
  })

  it('marks uppercase edge.local case-insensitively', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/ssl') return Promise.resolve({ data: { items: [mockCert({ sni: 'EDGE.LOCAL,api.example.com' })] } })
      return Promise.resolve({ data: {} })
    })
    const wrapper = await mountList()
    expect(wrapper.text()).toContain('系统保留')
  })
})

describe('SslList 证书有效期展示（ux-review H2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountWith(cert: Record<string, any>) {
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/ssl') return Promise.resolve({ data: { items: [mockCert(cert)] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const SslList = (await import('../SslList.vue')).default
    const wrapper = mount(SslList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  it('临期证书（≤30 天）显示剩余天数与临期徽章', async () => {
    const wrapper = await mountWith({ expire_at: '2026-11-01T00:00:00Z', expire_days: 10 })
    expect(wrapper.text()).toContain('剩余 10 天')
    expect(wrapper.find('.ssl-expire-badge.warn').exists()).toBe(true)
    // ssl-ux-review-fixes 6.1：卡片有效期统一 formatDateOnly（slash 形态）
    expect(wrapper.text()).toContain('2026/11/01')
  })

  it('正常证书只显示剩余天数，无临期样式', async () => {
    const wrapper = await mountWith({ expire_at: '2027-01-20T00:00:00Z', expire_days: 100 })
    expect(wrapper.text()).toContain('剩余 100 天')
    expect(wrapper.find('.ssl-expire-badge.warn').exists()).toBe(false)
    expect(wrapper.find('.ssl-expire-badge.danger').exists()).toBe(false)
  })

  it('已过期证书显示已过期徽章', async () => {
    const wrapper = await mountWith({ expire_at: '2026-01-01T00:00:00Z', expire_days: -5 })
    expect(wrapper.text()).toContain('已过期')
    expect(wrapper.find('.ssl-expire-badge.danger').exists()).toBe(true)
  })

  it('无到期信息（解析失败等）不渲染有效期行', async () => {
    const wrapper = await mountWith({})
    expect(wrapper.text()).not.toContain('有效期')
  })
})

describe('SslList 类型信息行分行（ux-review M5）', () => {
  it('算法徽章独立成「算法」行，类型行不再堆叠全部徽章', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/ssl')
        return Promise.resolve({
          data: { items: [mockCert({ algorithm: 'rsa', create_method: 'local_generate' })] },
        })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const SslList = (await import('../SslList.vue')).default
    const wrapper = mount(SslList, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('算法')
    expect(wrapper.text()).toContain('国际 RSA')
    // 类型行的 label 与算法行分离后，同一行不再并排出现「类型server🌐 国际」直拼
    const typeRow = wrapper.findAll('.ssl-card-row').find((r) => r.text().startsWith('类型'))
    expect(typeRow?.text()).not.toContain('国际 RSA')
  })
})

// ── 版本弹窗「立即发布恢复的配置」出口接线（version-modal-publish-exit-wiring 3.3）──
describe('SslList · 版本弹窗发布出口接线', () => {
  const vmStubs = {
    ...stubs,
    VersionManagementModal: {
      name: 'VersionManagementModal',
      props: ['open', 'canPublish', 'resourceId', 'resourceName'],
      template: '<div class="mock-version-modal" />',
    },
    PublishConfirmModal: {
      name: 'PublishConfirmModal',
      template: '<div class="mock-publish-modal" />',
      props: ['visible', 'title', 'clusterId'],
    },
  }

  it('版本弹窗接收 canPublish=true，publish-requested → 打开本页发布确认弹窗（上下文正确）', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/ssl') return Promise.resolve({ data: { items: [mockCert()] } })
      return Promise.resolve({ data: {} })
    })
    const SslList = (await import('../SslList.vue')).default
    const wrapper = mount(SslList, { global: { stubs: vmStubs } })
    await flushPromises()
    const vmBtn = wrapper.findAll('button').find((b) => b.text().trim() === '版本管理')
    expect(vmBtn).toBeTruthy()
    await vmBtn!.trigger('click')
    const vmm = wrapper.findComponent({ name: 'VersionManagementModal' })
    expect(vmm.props('canPublish')).toBe(true)
    expect(vmm.props('resourceId')).toBe(1)
    vmm.vm.$emit('publish-requested')
    await wrapper.vm.$nextTick()
    const pm = wrapper.findComponent({ name: 'PublishConfirmModal' })
    expect(pm.props('visible')).toBe(true)
    expect(pm.props('clusterId')).toBe(1)
    // 版本弹窗必须先关闭（Teleport 到 body 末尾的版本弹窗恒压住视图内发布框）
    expect(vmm.props('open')).toBe(false)
  })
})

describe('SslList 发布状态四态（ssl-ux-review-fixes 组 2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountWith(cert: Record<string, any>) {
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/ssl') return Promise.resolve({ data: { items: [mockCert(cert)] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const SslList = (await import('../SslList.vue')).default
    const wrapper = mount(SslList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  it('2.2 pending_publish=true：状态标签为「待发布」（title=配置已修改，发布后生效）', async () => {
    const w = await mountWith({ current_version: 2, published_at: '2026-10-20T08:00:00Z', pending_publish: true })
    const pending = w.find('.ps-tag.ps-pending')
    expect(pending.exists()).toBe(true)
    expect(pending.attributes('title')).toBe('配置已修改，发布后生效')
  })

  it('2.2 pending_publish=false 且已发布：显示 vX + 发布时间，无待发布态', async () => {
    const w = await mountWith({ current_version: 2, published_at: '2026-10-20T08:00:00Z', pending_publish: false })
    expect(w.find('.ps-tag.ps-pending').exists()).toBe(false)
    expect(w.find('.ps-tag.ps-published').exists()).toBe(true)
  })

  it('2.3 已发布证书不再渲染独立「已发布」徽章（双徽章冗余去除）', async () => {
    const w = await mountWith({ current_version: 2, published_at: '2026-10-20T08:00:00Z' })
    const badges = w.findAll('.ssl-card-meta .badge').map((b) => b.text().trim())
    expect(badges).not.toContain('已发布')
    expect(w.find('.ssl-card-meta .status-dot.online').exists()).toBe(false)
  })

  it('2.3 未发布证书状态标签为「未发布」（单一来源）', async () => {
    const w = await mountWith({})
    expect(w.find('.ps-tag.ps-unpublished').exists()).toBe(true)
  })
})

describe('SslList 技术原值中文化（ssl-ux-review-fixes 组 4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountWith(cert: Record<string, any>) {
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/ssl') return Promise.resolve({ data: { items: [mockCert(cert)] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const SslList = (await import('../SslList.vue')).default
    const wrapper = mount(SslList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  function rowByLabel(wrapper: any, label: string) {
    return wrapper.findAll('.ssl-card-row').find((r: any) => r.find('label').text() === label)
  }

  it('4.2 卡片「协议」渲染 TLSv1.2 / TLSv1.3 分隔形态（无引号方括号）', async () => {
    const w = await mountWith({ ssl_protocols: '["TLSv1.2","TLSv1.3"]' })
    const row = rowByLabel(w, '协议')
    expect(row).toBeDefined()
    expect(row.text()).toContain('TLSv1.2 / TLSv1.3')
    expect(row.text()).not.toContain('[')
  })

  it('4.2 非法 JSON 协议值原样回退', async () => {
    const w = await mountWith({ ssl_protocols: 'TLSv1.2' })
    const row = rowByLabel(w, '协议')
    expect(row.text()).toContain('TLSv1.2')
  })

  it('4.1 卡片「类型」显示中文（服务端/客户端）', async () => {
    const w = await mountWith({ cert_type: 'server' })
    expect(rowByLabel(w, '类型').text()).toContain('服务端')
    const w2 = await mountWith({ cert_type: 'client' })
    expect(rowByLabel(w2, '类型').text()).toContain('客户端')
  })

  it('4.3 CA 卡片隐藏「SNI」「类型」行、显示「CN」行', async () => {
    const w = await mountWith({ is_ca: true, sni: 'CN=embrace-root' })
    // CA 卡片在「CA 根证书」Tab 下展示（全部证书 Tab 过滤非 CA）
    await w
      .findAll('.dt')
      .find((t: any) => t.text() === 'CA 根证书')
      .trigger('click')
    await flushPromises()
    expect(rowByLabel(w, 'SNI')).toBeUndefined()
    expect(rowByLabel(w, '类型')).toBeUndefined()
    const cn = rowByLabel(w, 'CN')
    expect(cn).toBeDefined()
    expect(cn.text()).toContain('CN=embrace-root')
  })
})

describe('SslList 卡片列表残余修复（ssl-ux-review-fixes 组 6）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountWith(cert: Record<string, any>, items: Record<string, any>[] | null = null) {
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/ssl') return Promise.resolve({ data: { items: items || [mockCert(cert)] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const SslList = (await import('../SslList.vue')).default
    const wrapper = mount(SslList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  function rowByLabel(wrapper: any, label: string) {
    return wrapper.findAll('.ssl-card-row').find((r: any) => r.find('label').text() === label)
  }

  it('6.1 卡片有效期仅日期（2026/11/01 形态），过期徽章「已过期 5 天」', async () => {
    const w = await mountWith({ expire_at: '2026-11-01T00:00:00Z', expire_days: 10 })
    expect(rowByLabel(w, '有效期').text()).toContain('2026/11/01')
    const w2 = await mountWith({ expire_at: '2026-01-01T00:00:00Z', expire_days: -5 })
    expect(rowByLabel(w2, '有效期').text()).toContain('已过期 5 天')
  })

  it('6.3 CA Tab 下生成成功自动切回「全部证书」', async () => {
    const w = await mountWith({ is_ca: true })
    await w
      .findAll('.dt')
      .find((t: any) => t.text() === 'CA 根证书')
      .trigger('click')
    await flushPromises()
    const vm: any = w.vm
    await vm.onGenerateSuccess({ id: 5, algorithm: 'rsa' })
    await flushPromises()
    expect(vm.activeTab).toBe('all')
  })

  it('6.4 client 证书卡片隐藏「版本管理」', async () => {
    const w = await mountWith({ cert_type: 'client' })
    const btns = w.findAll('.ssl-card-actions button').map((b: any) => b.text())
    expect(btns.some((t: string) => t.includes('版本管理'))).toBe(false)
    const w2 = await mountWith({ cert_type: 'server' })
    const btns2 = w2.findAll('.ssl-card-actions button').map((b: any) => b.text())
    expect(btns2.some((t: string) => t.includes('版本管理'))).toBe(true)
  })

  it('6.5 激活筛选且无匹配：空态「未找到匹配的证书」+「清除筛选」重置', async () => {
    // 造 1 张在册证书 + 搜索不匹配串：验证过滤后空态（非列表本身为空的假空态）
    const w = await mountWith({}, [mockCert({ name: 'real-cert' })])
    const input = w.find('.search-input-wrap input')
    input.element.value = '不存在的证书'
    await input.trigger('input')
    await flushPromises()
    expect(w.text()).toContain('未找到匹配的证书')
    const clearBtn = w.findAll('button').find((b: any) => b.text() === '清除筛选')
    expect(clearBtn).toBeDefined()
    const callsBefore = mockGet.mock.calls.length
    await clearBtn.trigger('click')
    await flushPromises()
    expect((w.vm as any).searchText).toBe('')
    expect(mockGet.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(w.text()).toContain('real-cert')
  })

  it('6.6 集群筛选非空时打开生成/添加弹窗预选该集群', async () => {
    const w = await mountWith({})
    const vm: any = w.vm
    vm.clusterFilter = '2'
    await w.vm.$nextTick()
    await w
      .findAll('button')
      .find((b: any) => b.text() === '生成证书')
      .trigger('click')
    const gen = w.findComponent({ name: 'SslGenerateDialog' })
    expect(gen.props('initialClusterId')).toBe('2')
    await w
      .findAll('button')
      .find((b: any) => b.text().includes('添加已有证书'))
      .trigger('click')
    const form = w.findComponent({ name: 'SslFormDrawer' })
    expect(form.props('initialClusterId')).toBe('2')
  })

  it('6.7 CA Tab 空态文案为「当前范围还没有 CA 根证书」', async () => {
    const w = await mountWith({}, [])
    await w
      .findAll('.dt')
      .find((t: any) => t.text() === 'CA 根证书')
      .trigger('click')
    await flushPromises()
    expect(w.text()).toContain('当前范围还没有 CA 根证书')
  })
})
