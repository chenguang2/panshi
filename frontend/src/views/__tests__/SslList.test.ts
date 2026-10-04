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
    expect(wrapper.text()).toContain('2026-11-01')
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
