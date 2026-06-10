import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

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
}

const MOCK_CLUSTERS = [
  { id: 1, display_name: '生产集群', name: 'production' },
  { id: 2, display_name: '预发集群', name: 'staging' },
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

  it('shows add node button', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    const buttons = wrapper.findAll('button')
    const addBtn = buttons.find(b => b.text().includes('添加节点'))
    expect(addBtn).toBeDefined()
  })
})
