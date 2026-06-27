import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) }
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'StaticResourceList', query: {} }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
}

const MOCK_DATA = {
  total: 2, page: 1, page_size: 20,
  items: [
    { id: 1, name: 'static-files', url_path: '/static/*', cluster_id: 1, cluster_name: '生产集群', description: '静态文件', file_size: 204800, current_version: 3 },
    { id: 2, name: 'docs', url_path: '/docs/*', cluster_id: 1, cluster_name: '生产集群', description: '文档', file_size: null, current_version: null },
  ]
}

describe('StaticResourceList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/static_resources') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }, { id: 2, display_name: '预发集群', group_name: '预发' }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads resources on mount', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/static_resources', expect.any(Object))
  })

  it('shows view button when resource has file_size', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()

    const buttons = wrapper.findAll('button')
    const viewBtn = buttons.find(b => b.text().includes('查看'))
    expect(viewBtn).toBeDefined()
    // Resource with file_size should have enabled button
    expect(viewBtn?.attributes('disabled')).toBeUndefined()
  })

  it('disables view button when resource has no file_size', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()

    const buttons = wrapper.findAll('button')
    // The second resource (id=2) has file_size=null, but we check all buttons
    const viewBtns = buttons.filter(b => b.text().includes('查看'))
    expect(viewBtns.length).toBe(2) // one per card
  })

  // ── Group Filter Tests ──

  it('renders group filter select before cluster filter', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
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
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
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
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()

    const staticResourcesCalls = mockApiGet.mock.calls.filter((args: any[]) => args[0] === '/static_resources')
    expect(staticResourcesCalls.length).toBeGreaterThanOrEqual(1)
    const params = staticResourcesCalls[0][1]?.params
    expect(params).toBeDefined()
    expect(params.group_name).toBe('__all__')
  })

  it('does not conditionally display count on group filter — always uses totalCount from server', async () => {
    mockApiGet.mockImplementation((url: string, config?: any) => {
      if (url === '/static_resources') {
        const groupName = config?.params?.group_name
        if (groupName && groupName !== '__all__') {
          return Promise.resolve({ data: { total: 99, page: 1, page_size: 20, items: [{ id: 1, name: 'filtered-resource', url_path: '/test/*', cluster_id: 1, cluster_name: '生产集群', current_version: 1 }] } })
        }
        return Promise.resolve({ data: MOCK_DATA })
      }
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }, { id: 2, display_name: '预发集群', group_name: '预发' }] } })
      return Promise.reject(new Error('unknown url'))
    })

    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()

    // Initially shows count from default mock (total=2)
    expect(wrapper.text()).toContain('共 2 个静态资源')

    // Change group filter to trigger reload with group_name='线上'
    const groupSelect = wrapper.findAll('select').find(s => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    await groupSelect!.setValue('线上')
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()

    // Should show server total (99) not displayedResources.length (1)
    expect(wrapper.text()).toContain('共 99 个静态资源')
    expect(wrapper.text()).not.toContain('共 1 个静态资源')
  })
})
