import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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
  },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'NodeList', query: {} }),
}))

const stubs = {
  'a-table': {
    template:
      '<table class="mock-a-table"><tbody><tr v-for="r in dataSource" :key="r.id"><td>{{ r.ip }}</td><td><slot name="bodyCell" :record="r" :column="{ key: \'ip\' }" /></td><td><slot name="bodyCell" :record="r" :column="{ key: \'actions\' }" /></td></tr></tbody></table>',
    props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size', 'scroll', 'rowSelection'],
  },
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  ADrawer: {
    template: '<div class="mock-drawer" :class="{ open: open }"><slot /></div>',
    props: ['open', 'title', 'placement', 'width'],
  },
  AProgress: { template: '<div class="mock-progress" />', props: ['percent', 'status', 'size'] },
  ATabs: { template: '<div><slot /></div>', props: ['activeKey'] },
  ATabPane: { template: '<div v-if="activeKey === key"><slot /></div>', props: ['key', 'tab'] },
  ConfigDiff: { template: '<div class="mock-config-diff" />', props: ['visible', 'clusterId', 'initialNodeId'] },
  NodeExecutionResultDrawer: { template: '<div class="mock-exec-drawer" />', props: ['visible', 'title'] },
  InstallOpenrestyDialog: {
    name: 'InstallOpenrestyDialog',
    template: '<div class="mock-install-dialog" v-if="visible">InstallOpenrestyDialog</div>',
    props: ['visible', 'node', 'clusterId'],
  },
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
    {
      id: 1,
      cluster_id: 1,
      cluster_name: '生产集群',
      ip: '10.0.0.1',
      service_port: 80,
      management_port: 9180,
      edge_path: '/usr/local/edge',
      status: 1,
      status_detail: { statistic: { edge_version: '2.5.0' } },
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 2,
      cluster_id: 2,
      cluster_name: '预发集群',
      ip: '10.0.0.2',
      service_port: 80,
      management_port: 9180,
      edge_path: '/usr/local/edge',
      status: 0,
      status_detail: {},
      created_at: '2024-01-02T00:00:00Z',
    },
  ],
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
    await flushPromises()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('populates group and cluster filter dropdowns with expected options', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const optionTexts = groupSelect!.findAll('option').map((o) => o.text())
    // 组件结构：全部分组 + groupOptions（去重排序：线上 < 预发）+ 未分组 = 4 项
    expect(optionTexts).toEqual(['全部分组', '线上', '预发', '未分组'])
    // 集群筛选下拉：全部集群 + 3 个集群选项
    const clusterSelect = wrapper.findAll('select').find((s) => s.text().includes('全部集群'))
    expect(clusterSelect).toBeDefined()
    const clusterOptionTexts = clusterSelect!.findAll('option').map((o) => o.text())
    expect(clusterOptionTexts).toEqual(['全部集群', '生产集群', '预发集群', '开发集群'])
  })

  it('renders node table with data', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('tbody tr').exists()).toBe(true)
  })

  it('loads nodes on mount', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    mount(NodeList, { global: { stubs } })
    await flushPromises()
    expect(mockApiGet).toHaveBeenCalledWith('/nodes', expect.any(Object))
  })

  it('loads clusters on mount', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    mount(NodeList, { global: { stubs } })
    await flushPromises()
    expect(mockApiGet).toHaveBeenCalledWith('/clusters')
  })

  it('has reload button inline', async () => {
    const source = (await import('../NodeList.vue')).default
    const wrapper = mount(source, { global: { stubs } })
    await flushPromises()
    // 组件行内操作按钮文案为「⟳ reload」
    const reloadBtn = wrapper.findAll('button').find((b) => b.text().includes('reload'))
    expect(reloadBtn).toBeDefined()
  })

  it('renders detail in template', async () => {
    const source = (await import('../NodeList.vue')).default
    const wrapper = mount(source, { global: { stubs } })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'InstallOpenrestyDialog' }).exists()).toBe(true)
  })

  it('shows add node button', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const buttons = wrapper.findAll('button')
    const addBtn = buttons.find((b) => b.text().includes('添加节点'))
    expect(addBtn).toBeDefined()
  })

  // ── Group Filter Tests ──

  it('renders group filter select before cluster filter', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const selects = wrapper.findAll('select')
    const groupIdx = selects.findIndex((s) => s.text().includes('全部分组'))
    const clusterIdx = selects.findIndex((s) => s.text().includes('全部集群'))
    expect(groupIdx).toBeGreaterThanOrEqual(0)
    expect(clusterIdx).toBeGreaterThanOrEqual(0)
    expect(groupIdx).toBeLessThan(clusterIdx)
  })

  it('always passes group_name in API request', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
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
    await flushPromises()
    const vm = wrapper.vm as any
    vm.handleInstallOpenresty(MOCK_NODES.items[0])
    await wrapper.vm.$nextTick()
    const dialog = wrapper.find('.mock-install-dialog')
    expect(dialog.exists()).toBe(true)
  })

  it('uses normal page_size when group filter is active (no client-side loadAll for group)', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // Simulate selecting a specific group
    const selects = wrapper.findAll('select')
    const groupSelect = selects.find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const selectEl = groupSelect!.element as HTMLSelectElement
    selectEl.value = '线上'
    selectEl.dispatchEvent(new Event('change'))
    await flushPromises()
    await wrapper.vm.$nextTick()
    // Should NOT use page_size=500 (loadAll) just because a group is selected
    const calls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/nodes')
    const lastCall = calls[calls.length - 1]
    // The page_size should be the default 20, not 500
    expect(lastCall[1].params.page_size).not.toBe(500)
  })
})

// ── F1-NEW-05：搜索 / 清空 / 页码重置链路 ──

describe('NodeList.vue 搜索 / 清空 / 页码重置链路', () => {
  const responses = new Map<string, { data: unknown }>()

  // 与外层 mockApiGet 共享 vi.fn，但本 describe 用 Map 注册（未注册 URL 直接 reject）
  const tableStubs = {
    ...stubs,
    'a-table': {
      template:
        '<table class="mock-a-table"><tbody><tr v-for="r in dataSource" :key="r.id"><td>{{ r.ip }}</td><td><slot name="bodyCell" :record="r" :column="{ key: \'ip\' }" /></td></tr></tbody><tfoot><button class="mock-goto-page2" @click="$emit(\'change\', { current: 2, pageSize: 20 })">去第2页</button><button class="mock-goto-page3" @click="$emit(\'change\', { current: 3, pageSize: 20 })">去第3页</button></tfoot></table>',
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size', 'scroll', 'rowSelection'],
      emits: ['change'],
    },
  }

  const pageNodes = (ids: number[]) => ({
    total: 60,
    page: 1,
    page_size: 20,
    items: ids.map((id) => ({
      id,
      cluster_id: 1,
      cluster_name: '生产集群',
      ip: `10.0.0.${id}`,
      service_port: 80,
      management_port: 9180,
      edge_path: '/usr/local/edge',
      status: 1,
      status_detail: {},
      created_at: '2024-01-01T00:00:00Z',
    })),
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    responses.clear()
    // mock 数据形状取自本文件 MOCK_NODES（真实 /nodes 响应结构）
    responses.set('/nodes', { data: pageNodes([1, 2]) })
    responses.set('/clusters', { data: { total: 1, items: [MOCK_CLUSTERS[0]] } })
    mockApiGet.mockImplementation((url: string) => {
      const hit = responses.get(url)
      if (!hit) return Promise.reject(new Error(`unexpected GET: ${url}`))
      return Promise.resolve(hit)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function mountPage() {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs: tableStubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  function nodesCalls() {
    return mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/nodes')
  }

  function lastParams() {
    const calls = nodesCalls()
    expect(calls.length, '应至少发起过一次 /nodes 请求').toBeGreaterThan(0)
    return (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
  }

  function searchInput(wrapper: Awaited<ReturnType<typeof mountPage>>) {
    return wrapper.findAll('input').find((i) => i.attributes('placeholder')?.includes('搜索'))
  }

  it('翻页到第 3 页请求携带 page=3 并渲染当页行', async () => {
    const wrapper = await mountPage()
    await wrapper.find('.mock-goto-page3').trigger('click')
    await flushPromises()
    expect(lastParams().page).toBe(3)
    expect(wrapper.findAll('tbody tr').length).toBe(2)
    wrapper.unmount()
  })

  it('输入搜索词（防抖后）携带 search 且页码重置为 1', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    await wrapper.find('.mock-goto-page3').trigger('click')
    await flushPromises()
    expect(lastParams().page).toBe(3)

    const input = await searchInput(wrapper)
    await input!.setValue('10.0')
    // 防抖 300ms 内不发起请求
    vi.advanceTimersByTime(299)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    const params = lastParams()
    expect(params.search).toBe('10.0')
    expect(params.page).toBe(1)
    wrapper.unmount()
  })

  it('清空搜索后不再携带 search 参数且保持第 1 页', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    const input = await searchInput(wrapper)
    await input!.setValue('web')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(lastParams().search).toBe('web')

    await input!.setValue('')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    const params = lastParams()
    expect(params.page).toBe(1)
    expect(params.search).toBeUndefined()
    wrapper.unmount()
  })
})

// ── SEC-04：XSS 渲染转义哨兵 ──────────────────────────────────────────────
// 节点 ip / 所属集群名（用户可控文本）注入脚本载荷后，必须以纯文本渲染（TC-SEC-04）。
// mock 形状取自真实后端 GET /nodes（curl 核实：ip/cluster_name/edge_path/status_detail/...）。
describe('NodeList.vue - XSS 渲染转义哨兵（SEC-04）', () => {
  const XSS_PAYLOADS = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>']

  it.each(XSS_PAYLOADS)('ip 与集群名注入 %s → 纯文本渲染，无 script 节点 / onerror 属性', async (payload) => {
    setActivePinia(createPinia())
    const poisoned = JSON.parse(JSON.stringify(MOCK_NODES))
    poisoned.items[0].ip = payload
    poisoned.items[0].cluster_name = payload
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: poisoned })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      if (url.startsWith('/clusters/') && url.endsWith('/stats')) {
        return Promise.resolve({ data: { routes: 20, upstreams: 10, plugin_configs: 5, global_rules: 2 } })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })

    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()

    // 转义哨兵：字面量进入 textContent（Vue mustache 转义），未变成真实节点/事件属性
    expect(wrapper.text()).toContain(payload)
    expect(wrapper.element.querySelectorAll('script')).toHaveLength(0)
    expect(wrapper.element.querySelectorAll('[onerror]')).toHaveLength(0)
  })
})
