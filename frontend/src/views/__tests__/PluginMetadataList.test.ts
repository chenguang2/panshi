import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args), post: (...args: any[]) => mockApiPost(...args) }
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'PluginMetadataList' }),
}))

vi.mock('@/components/PluginEditorDrawer.vue', () => ({
  default: { template: '<div class="mock-editor-drawer" />' },
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  PublishConfirmModal: { template: '<div class="mock-publish-modal" />' },
  'a-modal': { template: '<div v-if="open"><slot /><slot name="footer" /></div>', props: ['open', 'title'], emits: ['ok', 'update:open'] },
  'a-drawer': { template: '<div v-if="open"><slot /></div>', props: ['open', 'title', 'width'], emits: ['close'] },
}

const MOCK_DATA = {
  total: 2, page: 1, page_size: 20,
  items: [
    { id: 1, plugin_name: 'jwt-auth', cluster_id: 1, cluster_name: '生产集群', config_data: { secret: 'abc' }, current_version: 3, updated_at: '2025-01-01T00:00:00Z' },
    { id: 2, plugin_name: 'key-auth', cluster_id: 2, cluster_name: '测试集群', config_data: {}, current_version: null, updated_at: null },
  ]
}

describe('PluginMetadataList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_metadata') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }, { id: 2, display_name: '测试集群' }] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [{ name: 'jwt-auth', enable_metadata: true, description: 'JWT 认证' }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads items on mount', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    mount(PluginMetadataList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    expect(mockApiGet).toHaveBeenCalledWith('/plugin_metadata', expect.any(Object))
  })

  it('renders card grid with items', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.pml-card').length).toBe(2)
    expect(wrapper.text()).toContain('jwt-auth')
  })

  it('shows empty state when no items', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_metadata') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unknown url'))
    })
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('暂无插件元数据')
  })
})
