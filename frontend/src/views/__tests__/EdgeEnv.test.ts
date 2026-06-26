import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
  }
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  MonacoEditor: { template: '<div class="mock-editor" />' },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
}

const MOCK_CLUSTERS = {
  items: [
    { id: 1, display_name: '生产集群', group_name: '线上' },
    { id: 2, display_name: '预发集群', group_name: '预发' },
  ]
}

describe('EdgeEnv.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('renders page header', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('renders group filter select', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const selects = wrapper.findAll('select')
    const groupIdx = selects.findIndex(s => s.text().includes('全部分组'))
    expect(groupIdx).toBeGreaterThanOrEqual(0)
  })

  it('renders search input in filter bar', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const inputs = wrapper.findAll('input')
    const searchInput = inputs.find(i => i.attributes('placeholder')?.includes('搜索'))
    expect(searchInput).toBeDefined()
  })

  it('populates group filter from cluster group_names', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
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
