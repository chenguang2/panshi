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
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'NodeList', query: {} }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  ADrawer: { template: '<div class="mock-drawer" :class="{ open: open }"><slot /></div>', props: ['open', 'title', 'placement', 'width'] },
  AProgress: { template: '<div class="mock-progress" />', props: ['percent', 'status', 'size'] },
  ATabs: { template: '<div><slot /></div>', props: ['activeKey'] },
  ATabPane: { template: '<div v-if="activeKey === key"><slot /></div>', props: ['key', 'tab'] },
  ConfigDiff: { template: '<div class="mock-config-diff" />', props: ['visible', 'clusterId', 'initialNodeId'] },
  NodeExecutionResultDrawer: { template: '<div class="mock-exec-drawer" />', props: ['visible', 'title'] },
  InstallOpenrestyDialog: { template: '<div class="mock-install-dialog" v-if="visible">InstallOpenrestyDialog</div>', props: ['visible', 'node', 'clusterId'] },
}

const MOCK_CLUSTERS = [
  { id: 1, display_name: '生产集群', name: 'production', group_name: '线上' },
  { id: 2, display_name: '预发集群', name: 'staging', group_name: '预发' },
  { id: 3, display_name: '开发集群', name: 'dev', group_name: '' },
]

const MOCK_NODES = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    { id: 1, cluster_id: 1, cluster_name: '生产集群', ip: '10.0.0.1', service_port: 80, management_port: 9180, edge_path: '/usr/local/edge', status: 1, status_detail: { statistic: { edge_version: '2.5.0' } }, created_at: '2024-01-01T00:00:00Z' },
    { id: 2, cluster_id: 2, cluster_name: '预发集群', ip: '10.0.0.2', service_port: 80, management_port: 9180, edge_path: '/usr/local/edge', status: 0, status_detail: {}, created_at: '2024-01-02T00:00:00Z' },
  ]
}

describe('NodeList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') {
        return Promise.resolve({ data: MOCK_NODES })
      }
      if (url === '/clusters') {
        return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      }
      if (url.startsWith('/clusters/') && url.endsWith('/stats')) {
        return Promise.resolve({ data: { routes: 20, upstreams: 10, plugin_configs: 5, global_rules: 2 } })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('renders page header with title', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('renders cluster filter dropdown', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    const selects = wrapper.findAll('select')
    expect(selects.length).toBeGreaterThanOrEqual(1)
  })

  it('renders node table with data', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('tbody tr').exists()).toBe(true)
  })

  it('loads nodes on mount', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    expect(mockApiGet).toHaveBeenCalledWith('/nodes', expect.any(Object))
  })

  it('loads clusters on mount', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    expect(mockApiGet).toHaveBeenCalledWith('/clusters')
  })

  it('has reload button inline', async () => {
    const source = (await import('../NodeList.vue')).default
    const wrapper = mount(source, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    expect(wrapper.find('button').text()).toBeDefined()
  })

  it('renders detail in template', async () => {
    const source = (await import('../NodeList.vue')).default
    const wrapper = mount(source, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    expect(wrapper.findComponent({ name: 'InstallOpenrestyDialog' }).exists()).toBe(true)
  })

  it('shows add node button', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    const buttons = wrapper.findAll('button')
    const addBtn = buttons.find(b => b.text().includes('添加节点'))
    expect(addBtn).toBeDefined()
  })

  // ── Group Filter Tests ──

  it('renders group filter select before cluster filter', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    const selects = wrapper.findAll('select')
    const groupIdx = selects.findIndex(s => s.text().includes('全部分组'))
    const clusterIdx = selects.findIndex(s => s.text().includes('全部集群'))
    expect(groupIdx).toBeGreaterThanOrEqual(0)
    expect(clusterIdx).toBeGreaterThanOrEqual(0)
    expect(groupIdx).toBeLessThan(clusterIdx)
  })

  it('populates group filter options from cluster group_names', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    const groupSelect = wrapper.findAll('select').find(s => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const options = groupSelect!.findAll('option')
    const optionTexts = options.map(o => o.text())
    expect(optionTexts).toContain('线上')
    expect(optionTexts).toContain('预发')
  })

  it('always passes group_name in API request', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    const calls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/nodes')
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call[1].params.group_name).toBeDefined()
    }
  })

  it('opens InstallOpenrestyDialog when clicking install openresty', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 200))
    const vm = wrapper.vm as any
    vm.handleInstallOpenresty(MOCK_NODES.items[0])
    await wrapper.vm.$nextTick()
    const dialog = wrapper.find('.mock-install-dialog')
    expect(dialog.exists()).toBe(true)
  })

  it('uses normal page_size when group filter is active (no client-side loadAll for group)', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    // Simulate selecting a specific group
    const selects = wrapper.findAll('select')
    const groupSelect = selects.find(s => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const selectEl = groupSelect!.element as HTMLSelectElement
    selectEl.value = '线上'
    selectEl.dispatchEvent(new Event('change'))
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    // Should NOT use page_size=500 (loadAll) just because a group is selected
    const calls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/nodes')
    const lastCall = calls[calls.length - 1]
    // The page_size should be the default 20, not 500
    expect(lastCall[1].params.page_size).not.toBe(500)
  })
})
