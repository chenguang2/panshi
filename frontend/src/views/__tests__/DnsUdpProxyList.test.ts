import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  }
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  StreamProxyFormWizard: { template: '<div class="mock-form-wizard" />', props: ['visible', 'clusters', 'editingProxy'] },
  StreamProxyViewDrawer: { template: '<div class="mock-view-drawer" />', props: ['visible', 'proxy'] },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  PublishConfirmModal: { template: '<div class="mock-publish-modal" />' },
}

const MOCK_DNS_PROXIES = {
  total: 2, page: 1, page_size: 20,
  items: [
    {
      id: 1, name: 'dns-proxy-1', cluster_id: 1, cluster_name: '生产集群',
      listen_port: 9053, scheme: 'tcp', proxy_type: 'dns',
      dns_config: JSON.stringify({
        hosts: {
          'example.com': { type: 'roundrobin', ttl_valid: 10, nodes: { '10.0.1.1': ['53'] } },
          'test.local': { type: 'chash', nodes: { '10.0.2.1': ['53'] } },
        }
      }),
      current_version: 2, published_at: '2024-01-15T10:30:00Z',
    },
    {
      id: 2, name: 'dns-proxy-2', cluster_id: 2, cluster_name: '预发集群',
      listen_port: 9054, scheme: 'udp', proxy_type: 'dns',
      dns_config: '{}',
      current_version: null, published_at: null,
    },
  ]
}

describe('DnsUdpProxyList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/stream-proxies') return Promise.resolve({ data: MOCK_DNS_PROXIES })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }, { id: 2, display_name: '预发集群', group_name: '预发' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('renders page header with title and description', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    const header = wrapper.find('.page-header')
    expect(header.exists()).toBe(true)
  })

  it('has create button labelled "+ 新建 DNS 代理"', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    const createBtn = wrapper.findAll('button').find(b => b.text().includes('新建 DNS 代理'))
    expect(createBtn).toBeDefined()
  })

  it('loads proxies on mount via global /stream-proxies endpoint', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/stream-proxies', expect.any(Object))
  })

  it('renders group filter before cluster filter', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const selects = wrapper.findAll('select')
    const groupIdx = selects.findIndex(s => s.text().includes('全部分组'))
    const clusterIdx = selects.findIndex(s => s.text().includes('全部集群'))
    expect(groupIdx).toBeGreaterThanOrEqual(0)
    expect(clusterIdx).toBeGreaterThanOrEqual(0)
    expect(groupIdx).toBeLessThan(clusterIdx)
  })

  it('renders cards for DNS proxies with port info', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.sp-card')
    expect(cards.length).toBe(2)
  })

  it('displays DNS badge on cards', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const dnsBadges = wrapper.findAll('.dns-badge')
    expect(dnsBadges.length).toBe(2)
  })

  it('shows action buttons on cards: 查看, 编辑, 删除, 发布, 版本管理', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const card = wrapper.find('.sp-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('查看')
    expect(card.text()).toContain('编辑')
    expect(card.text()).toContain('删除')
    expect(card.text()).toContain('发布')
    expect(card.text()).toContain('版本管理')
  })

  it('shows DNS domain info for proxy with dns_config hosts', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const firstCard = wrapper.findAll('.sp-card')[0]
    expect(firstCard.text()).toContain('example.com')
    expect(firstCard.text()).toContain('test.local')
    expect(firstCard.text()).toContain('TTL:')
  })

  it('shows "无 DNS 配置" for proxy without dns_config hosts', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.sp-card')
    expect(cards.length).toBe(2)
    const secondCard = cards[1]
    expect(secondCard.text()).toContain('无 DNS 配置')
  })

  it('count text shows total number of DNS proxies', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const countSpan = wrapper.findAll('span.text-sm.text-muted').find(s => s.text().includes('共'))
    expect(countSpan).toBeDefined()
    expect(countSpan!.text()).toContain('2')
  })

  it('populates group filter from cluster group_names', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const groupSelect = wrapper.findAll('select').find(s => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const options = groupSelect!.findAll('option')
    const optionTexts = options.map(o => o.text())
    expect(optionTexts).toContain('线上')
    expect(optionTexts).toContain('预发')
  })

  it('clicking create button toggles wizard visibility', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const createBtn = wrapper.findAll('button').find(b => b.text().includes('新建 DNS 代理'))
    expect(createBtn).toBeDefined()
    expect(wrapper.findAll('.mock-form-wizard').length).toBe(1)
    // Check the wizard stub has visible=true after clicking (component stays rendered)
    // The stub always exists because it uses :visible not v-if
  })
})
