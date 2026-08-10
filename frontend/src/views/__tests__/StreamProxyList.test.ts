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

  it('renders protocol badge for tcp/udp/tls schemes', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/stream-proxies') return Promise.resolve({ data: { total: 3, page: 1, page_size: 20, items: [
        { id: 1, name: 'tcp-p', cluster_id: 1, listen_port: 9970, scheme: 'tcp', load_balance: 'roundrobin', targets: [], current_version: null, published_at: null },
        { id: 2, name: 'udp-p', cluster_id: 1, listen_port: 9971, scheme: 'udp', load_balance: 'roundrobin', targets: [], current_version: null, published_at: null },
        { id: 3, name: 'tls-p', cluster_id: 1, listen_port: 9972, scheme: 'tls', load_balance: 'roundrobin', targets: [], current_version: null, published_at: null },
      ] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: 'c', group_name: '' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    const texts = wrapper.text()
    expect(texts).toContain('TCP')
    expect(texts).toContain('UDP')
    expect(texts).toContain('TLS')
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

  it('always passes group_name in API request', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    const calls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/stream-proxies')
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call[1].params.group_name).toBeDefined()
    }
  })

  it('always uses global /stream-proxies endpoint with cluster_id param (not scoped endpoint)', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    // Simulate selecting a cluster
    const selects = wrapper.findAll('select')
    const clusterSelect = selects.find(s => s.text().includes('全部集群'))
    expect(clusterSelect).toBeDefined()
    const selectEl = clusterSelect!.element as HTMLSelectElement
    selectEl.value = '1'
    selectEl.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    // All calls should go to /stream-proxies (global) with cluster_id param
    // NOT to /clusters/{id}/stream-proxies (scoped)
    const globalCalls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/stream-proxies')
    const scopedCalls = mockApiGet.mock.calls.filter((c: any[]) => c[0].includes('/clusters/') && c[0].includes('/stream-proxies'))
    expect(scopedCalls.length).toBe(0)
    expect(globalCalls.length).toBeGreaterThan(0)
    // The last global call should have cluster_id param
    const lastCall = globalCalls[globalCalls.length - 1]
    expect(lastCall[1].params.cluster_id).toBeDefined()
  })

  it('does not conditionally display count on group filter — always uses totalCount from server', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const selects = wrapper.findAll('select')
    const groupSelect = selects.find(s => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const selectEl = groupSelect!.element as HTMLSelectElement
    selectEl.value = '线上'
    selectEl.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const countSpan = wrapper.findAll('span.text-sm.text-muted').find(s => s.text().includes('共'))
    expect(countSpan).toBeDefined()
    expect(countSpan!.text()).toContain('2')
  })
})

describe('StreamProxyList.vue 批量管理', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/stream-proxies')) return Promise.resolve({ data: MOCK_PROXIES })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }, { id: 2, display_name: '预发集群', group_name: '预发' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('点击「批量管理」进入批量模式，卡片浮现勾选框', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 150))
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.sp-checkbox').length).toBe(0)

    const batchBtn = wrapper.findAll('button').find(b => b.text().includes('批量管理'))
    expect(batchBtn).toBeDefined()
    await batchBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.sp-checkbox').length).toBe(2)
    expect(wrapper.find('.sp-batch-bar').exists()).toBe(true)
  })

  it('勾选卡片后计数更新、批量删除按钮启用', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 150))
    await wrapper.vm.$nextTick()

    await wrapper.findAll('button').find(b => b.text().includes('批量管理'))!.trigger('click')
    await wrapper.vm.$nextTick()

    const checkboxes = wrapper.findAll('.sp-checkbox')
    await checkboxes[0].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.sp-card.selected').length).toBe(1)
    expect(wrapper.find('.sp-batch-bar').text()).toContain('1')

    const delBtn = wrapper.findAll('button').find(b => b.text().includes('批量删除'))
    expect(delBtn).toBeDefined()
    expect((delBtn!.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('批量模式下全选当前筛选结果 toggle', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 150))
    await wrapper.vm.$nextTick()

    await wrapper.findAll('button').find(b => b.text().includes('批量管理'))!.trigger('click')
    await wrapper.vm.$nextTick()

    const selectAllBtn = wrapper.findAll('button, a').find(b => b.text().includes('全选当前筛选结果'))
    expect(selectAllBtn).toBeDefined()
    await selectAllBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.sp-card.selected').length).toBe(2)

    await selectAllBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sp-card.selected').length).toBe(0)
  })

  it('退出批量管理清空选择', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 150))
    await wrapper.vm.$nextTick()

    await wrapper.findAll('button').find(b => b.text().includes('批量管理'))!.trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.sp-checkbox')[0].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sp-card.selected').length).toBe(1)

    await wrapper.findAll('button').find(b => b.text().includes('退出批量管理'))!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sp-checkbox').length).toBe(0)
    expect(wrapper.findAll('.sp-card.selected').length).toBe(0)
  })
})
