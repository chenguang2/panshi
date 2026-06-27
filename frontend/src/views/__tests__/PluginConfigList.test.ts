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
  useRoute: () => ({ name: 'PluginConfigList', query: {} }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  PluginEntityFormModal: { template: '<div class="mock-form-modal" />', props: ['visible', 'editingConfig', 'clusters'] },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
}

const MOCK_DATA = {
  total: 2, page: 1, page_size: 20,
  items: [
    { id: 1, name: 'rate-limit-config', cluster_id: 1, cluster_name: '生产集群', description: '限流配置', plugins: { cors: {} }, current_version: 3, published_at: '2024-01-15T10:30:00Z' },
    { id: 2, name: 'jwt-config', cluster_id: 1, cluster_name: '生产集群', description: 'JWT 配置', plugins: { jwt: {} }, current_version: null, published_at: null },
  ]
}

// total deliberately differs from items.length to test server-count vs client-count
const MOCK_DATA_FILTERED = {
  total: 99, page: 1, page_size: 20,
  items: [
    { id: 1, name: 'rate-limit-config', cluster_id: 1, cluster_name: '生产集群', description: '限流配置', plugins: { cors: {} }, current_version: 3, published_at: '2024-01-15T10:30:00Z' },
  ]
}

describe('PluginConfigList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string, config?: any) => {
      if (url === '/plugin_configs') {
        const groupName = config?.params?.group_name
        if (groupName && groupName !== '__all__') {
          return Promise.resolve({ data: MOCK_DATA_FILTERED })
        }
        return Promise.resolve({ data: MOCK_DATA })
      }
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }, { id: 2, display_name: '预发集群', group_name: '预发' }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads plugin configs on mount', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/plugin_configs', expect.any(Object))
  })

  // ── Group Filter Tests ──

  it('renders group filter select before cluster filter', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
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
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
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
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    const calls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/plugin_configs')
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call[1].params.group_name).toBeDefined()
    }
  })

  it('does not conditionally display count on group filter — always uses totalCount from server', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    // Select a specific group
    const selects = wrapper.findAll('select')
    const groupSelect = selects.find(s => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const selectEl = groupSelect!.element as HTMLSelectElement
    selectEl.value = '线上'
    selectEl.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    // The count text should contain totalCount from server, not displayedConfigs.length
    const countSpan = wrapper.findAll('span.text-sm.text-muted').find(s => s.text().includes('共'))
    expect(countSpan).toBeDefined()
    // Should show server totalCount (99), not items.length (1)
    expect(countSpan!.text()).toContain('99')
  })
})
