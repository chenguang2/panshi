import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) }
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'GlobalRuleList' }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  GlobalRuleFormModal: { template: '<div class="mock-form-modal" />' },
  GlobalRuleViewDrawer: { template: '<div class="mock-view-drawer" />' },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  PublishConfirmModal: { template: '<div class="mock-publish-modal" />' },
}

const MOCK_DATA = {
  total: 2, page: 1, page_size: 20,
  items: [
    { id: 1, name: 'global-rate-limit', cluster_id: 1, cluster_name: '生产集群', description: '全局限流', plugins: { cors: {} }, current_version: 3 },
    { id: 2, name: 'global-ip-block', cluster_id: 1, cluster_name: '生产集群', description: 'IP 黑名单', plugins: {}, current_version: null },
  ]
}

describe('GlobalRuleList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/global_rules') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header', async () => {
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const wrapper = mount(GlobalRuleList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads global rules on mount', async () => {
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const wrapper = mount(GlobalRuleList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/global_rules', expect.any(Object))
  })
})
