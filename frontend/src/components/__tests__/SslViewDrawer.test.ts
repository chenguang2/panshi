import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/api', () => ({
  default: { get: vi.fn() },
}))

const mockFetchKey = vi.fn()
vi.mock('@/api/ssl', () => ({
  fetchSslPrivateKey: (...args: any[]) => mockFetchKey(...args),
}))

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

const stubs = {
  ADescriptions: { template: '<div><slot /></div>' },
  ADescriptionsItem: {
    props: ['label'],
    template: '<div class="desc-item" :data-label="label"><slot /></div>',
  },
  ATag: { template: '<span class="atag"><slot /></span>' },
  ADivider: { template: '<div><slot /></div>' },
}

function baseCert(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: 'srv',
    cluster_id: 1,
    sni: 'edge.local,a.example.com',
    cert: 'CERT-PEM',
    private_key: '',
    key: '',
    has_private_key: true,
    has_sign_key: false,
    cert_type: 'server',
    algorithm: 'rsa',
    is_ca: false,
    ssl_protocols: '["TLSv1.2","TLSv1.3"]',
    ...overrides,
  }
}

async function mountView(cert: Record<string, any>) {
  const SslViewDrawer = (await import('../SslViewDrawer.vue')).default
  const wrapper = mount(SslViewDrawer, {
    props: { visible: true, cert },
    global: { stubs: { ...stubs, Teleport: true } },
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('SslViewDrawer 查看抽屉关键属性（ssl-ux-review-fixes 组 3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('3.1 SSL 视图含「有效期」行（仅日期 + 到期徽章语义）', async () => {
    const w = await mountView(baseCert({ expire_at: '2026-11-01T00:00:00Z', expire_days: 10 }))
    const row = w.find('.desc-item[data-label="有效期"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('2026/11/01')
    expect(row.text()).toContain('剩余 10 天')
  })

  it('3.1 expire_at=null：显示「—（无法解析）」而非整行隐藏', async () => {
    const w = await mountView(baseCert({ expire_at: null, expire_days: null }))
    const row = w.find('.desc-item[data-label="有效期"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('无法解析')
  })

  it('3.1 SSL 视图含「算法」行', async () => {
    const w = await mountView(baseCert({ algorithm: 'rsa' }))
    const row = w.find('.desc-item[data-label="算法"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('RSA')
  })

  it('3.2 CA 视图含「有效期」行', async () => {
    const w = await mountView(baseCert({ is_ca: true, expire_at: '2027-01-01T00:00:00Z', expire_days: 70 }))
    const row = w.find('.desc-item[data-label="有效期"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('2027/01/01')
  })

  it('3.2 CA 视图「状态：CA 根证书」行改为「类型」语义', async () => {
    const w = await mountView(baseCert({ is_ca: true }))
    const typeRow = w.find('.desc-item[data-label="类型"]')
    expect(typeRow.exists()).toBe(true)
    expect(typeRow.text()).toContain('CA 根证书')
    expect(w.find('.desc-item[data-label="状态"]').exists()).toBe(false)
  })
})

describe('SslViewDrawer 技术原值中文化（ssl-ux-review-fixes 组 4）', () => {
  it('4.4 查看抽屉 SNI 标签化（复用卡片拆分与保留标记）', async () => {
    const w = await mountView(baseCert())
    const sniRow = w.find('.desc-item[data-label="SNI"]')
    expect(sniRow.findAll('.sni-tag').length).toBe(2)
    expect(sniRow.text()).toContain('edge.local')
    expect(sniRow.text()).toContain('系统保留')
    expect(sniRow.text()).not.toContain(',')
  })

  it('4.4 查看抽屉证书类型中文显示', async () => {
    const w = await mountView(baseCert({ cert_type: 'server' }))
    expect(w.find('.desc-item[data-label="证书类型"]').text()).toContain('服务端')
    const w2 = await mountView(baseCert({ cert_type: 'client' }))
    expect(w2.find('.desc-item[data-label="证书类型"]').text()).toContain('客户端')
  })

  it('4.2 查看抽屉「SSL 协议」渲染分隔形态', async () => {
    const w = await mountView(baseCert({ ssl_protocols: '["TLSv1.2","TLSv1.3"]' }))
    expect(w.find('.desc-item[data-label="SSL 协议"]').text()).toContain('TLSv1.2 / TLSv1.3')
  })
})

describe('SslViewDrawer 私钥按需获取（ssl-ux-review-fixes 9.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchKey.mockResolvedValue({ data: { private_key: 'LIVE-KEY', sign_key: 'LIVE-SIGN' } })
  })

  it('👁 显示经按需端点取钥后展示明文（不再直读掩码字段）', async () => {
    const w = await mountView(baseCert({ cluster_id: 5 }))
    const showBtn = w.findAll('button').find((b) => b.text().includes('显示'))
    await showBtn!.trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
    expect(mockFetchKey).toHaveBeenCalledWith(5, 1)
    expect(w.text()).toContain('LIVE-KEY')
    expect(w.text()).not.toContain('••••••••••••••••')
  })

  it('无私钥（has_private_key=false）不渲染私钥区', async () => {
    const w = await mountView(baseCert({ has_private_key: false }))
    expect(w.text()).not.toContain('私钥内容 (PEM)')
  })

  it('📥 下载私钥经按需端点取钥', async () => {
    const w = await mountView(baseCert({ cluster_id: 5 }))
    const keyHeader = w.findAll('.section-header').find((h) => h.text().includes('私钥内容 (PEM)'))
    expect(keyHeader).toBeDefined()
    const dlBtn = keyHeader!.findAll('button').find((b) => b.text().includes('下载'))
    await dlBtn!.trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(mockFetchKey).toHaveBeenCalledWith(5, 1)
  })

  it('CA 私钥确认下载走统一按需端点（不再调 /ssl/{id}/ca-key）', async () => {
    const w = await mountView(baseCert({ is_ca: true, cert_type: 'server', has_private_key: true }))
    const caBtn = w.findAll('button').find((b) => b.text().includes('下载 CA 私钥'))
    expect(caBtn).toBeDefined()
    await caBtn!.trigger('click')
    await w.vm.$nextTick()
    // 确认弹窗内「确认下载」
    const confirmBtn = w.findAll('button').find((b) => b.text().includes('确认下载'))
    await confirmBtn!.trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(mockFetchKey).toHaveBeenCalled()
  })
})
