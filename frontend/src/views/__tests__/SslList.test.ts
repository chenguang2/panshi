import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockGet(...args) }
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
    id: 1, name: 'srv', cluster_id: 1, cert_type: 'server',
    sni: 'edge.local,api.example.com', cert: 'crt', key: 'key',
    algorithm: 'rsa', ...overrides,
  }
}

describe('SslList reserved SNI (edge.local)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/ssl') return Promise.resolve({ data: { items: [mockCert()] } })
      return Promise.resolve({ data: {} })
    })
  })

  async function mountList() {
    const SslList = (await import('../SslList.vue')).default
    const wrapper = mount(SslList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('marks edge.local in card SNI as system-reserved', async () => {
    const wrapper = await mountList()
    expect(wrapper.text()).toContain('系统保留')
  })

  it('annotates the edge.local tag but not other SNI tags', async () => {
    const wrapper = await mountList()
    const tags = wrapper.findAll('.ssl-card-row span.sni-tag')
    const edgeTag = tags.find(t => t.text().includes('edge.local'))!
    expect(edgeTag.text()).toContain('系统保留')
    const apiTag = tags.find(t => t.text().includes('api.example.com'))!
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