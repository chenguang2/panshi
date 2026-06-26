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

const MOCK_PROXIES = {
  total: 2, page: 1, page_size: 20,
  items: [
    { id: 1, name: 'mysql-proxy', cluster_id: 1, cluster_name: '生产集群', listen_port: 9970, scheme: 'tcp', load_balance: 'weighted_roundrobin', targets: [{ target: '10.0.1.1:3306', weight: 100 }], current_version: 2, published_at: '2024-01-15T10:30:00Z' },
    { id: 2, name: 'redis-proxy', cluster_id: 2, cluster_name: '预发集群', listen_port: 9971, scheme: 'tcp', load_balance: 'chash', targets: [{ target: '10.0.2.1:6379', weight: 100 }], current_version: null, published_at: null },
  ]
}

describe('StreamProxyList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/stream-proxies')) return Promise.resolve({ data: MOCK_PROXIES })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }, { id: 2, display_name: '预发集群', group_name: '预发' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('renders page header', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads proxies on mount', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalled()
  })

  it('renders group filter select before cluster filter', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const selects = wrapper.findAll('select')
    const groupIdx = selects.findIndex(s => s.text().includes('全部分组'))
    const clusterIdx = selects.findIndex(s => s.text().includes('全部集群'))
    expect(groupIdx).toBeGreaterThanOrEqual(0)
    expect(clusterIdx).toBeGreaterThanOrEqual(0)
    expect(groupIdx).toBeLessThan(clusterIdx)
  })

  it('populates group filter options from cluster group_names', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const groupSelect = wrapper.findAll('select').find(s => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const options = groupSelect!.findAll('option')
    const optionTexts = options.map(o => o.text())
    expect(optionTexts).toContain('线上')
    expect(optionTexts).toContain('预发')
  })
})
