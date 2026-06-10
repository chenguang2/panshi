import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

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

describe('PluginConfigList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_configs') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }] } })
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
})
