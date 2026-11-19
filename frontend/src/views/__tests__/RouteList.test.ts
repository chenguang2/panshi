import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'
import { aTableStub } from '../../components/__tests__/helpers/aTableStub'
import ClusterSelect from '@/components/ClusterSelect.vue'
import { executePublish } from '@/composables/useClusterUtils'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) },
}))

// 组3 3.1：发布链路 mock（断言 executePublish 契约与 refreshFn 重开版本弹窗；不渲染真实进度弹窗）
vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: vi.fn().mockResolvedValue(undefined),
  showDeleteConfirm: vi.fn(),
  executeDeleteWithProgress: vi.fn().mockResolvedValue(undefined),
  fetchAllClusterNodes: vi.fn(),
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'RouteList', query: mockRouteQuery }),
}))

// 7.9：断言 DNS 行点击不再走 message.warning toast 拦截（改禁用 + tooltip 指路）
vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    message: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
  }
})

// 7.6：深链 ?cluster_id= 用例需要可变 query（RouteListClusterId.test.ts 同款模式）
let mockRouteQuery: Record<string, string> = {}

const stubs = {
  PageHeader: {
    template: '<div class="page-header"><slot name="stats" /><slot name="actions" /></div>',
    props: ['title', 'description'],
  },
  RouteFormModal: {
    name: 'MockRouteForm',
    template: '<div class="mock-route-form" />',
    props: ['visible', 'editingRoute', 'clusters', 'copyingRoute', 'defaultClusterId'],
  },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  PublishConfirmModal: { template: '<div class="mock-publish-modal" />' },
  ACheckboxGroup: {
    name: 'MockCheckboxGroup',
    template: '<div class="mock-checkbox-group"><slot /></div>',
    props: ['value'],
    emits: ['update:value'],
  },
  ACheckbox: {
    name: 'MockCheckbox',
    template: '<label class="mock-checkbox"><slot /></label>',
    props: ['value', 'checked'],
    emits: ['update:checked'],
  },
  ADivider: { template: '<div class="mock-divider" />' },
  // a-popover 桩：内联渲染 #content 槽（真实 antd 弹层走 portal，jsdom 下取不到内容）
  APopover: {
    template: '<div class="mock-popover"><slot /><div class="mock-popover-content"><slot name="content" /></div></div>',
    props: ['open', 'trigger', 'placement'],
  },
}

const MOCK_ROUTES = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      name: '用户API',
      uri: '/api/v1/users/*',
      methods: 'GET,POST',
      cluster_id: 1,
      cluster_name: '生产集群',
      priority: 0,
      current_version: 5,
      created_at: '2024-01-15T10:30:00Z',
      status: 1,
    },
    {
      id: 2,
      name: '订单服务',
      uri: '/api/v1/orders/*',
      methods: 'GET,PUT',
      cluster_id: 1,
      cluster_name: '生产集群',
      priority: 0,
      current_version: 3,
      created_at: '2024-02-10T14:20:00Z',
      status: 1,
    },
  ],
}

describe('RouteList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: MOCK_ROUTES })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      if (url === '/plugins/builtin')
        return Promise.resolve({
          data: {
            plugins: [
              { name: 'limit-req', display_name: '限流' },
              { name: 'key-auth', display_name: '密钥认证' },
            ],
          },
        })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads routes on mount', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()
    expect(mockApiGet).toHaveBeenCalledWith('/routes', expect.any(Object))
  })

  it('renders method filter chips', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('GET')
    expect(wrapper.text()).toContain('POST')
  })

  it('loads plugin options on mount', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()
    expect(mockApiGet).toHaveBeenCalledWith('/plugins/builtin')
  })

  it('renders plugin dropdown in filter bar', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()
    const pluginSelect = wrapper.find('select.plugin-filter')
    expect(pluginSelect.exists()).toBe(true)
    expect(pluginSelect.text()).toContain('限流')
    expect(pluginSelect.text()).toContain('密钥认证')
  })

  it('passes plugin param when filter is selected', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()
    // 列表请求与页头徽标统计副本（page_size=500）分流计数（design D3）
    const listCalls = () =>
      mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes' && c[1]?.params?.page_size !== 500)
    const mountRouteCalls = listCalls().length
    // Simulate user selecting a plugin via DOM
    const select = wrapper.find('select.plugin-filter').element as HTMLSelectElement
    select.value = 'limit-req'
    select.dispatchEvent(new Event('change'))
    await flushPromises()
    // There should be one more /routes call after the change
    expect(listCalls().length).toBe(mountRouteCalls + 1)
    // 组件把选中插件作为 params.plugin 传给 /routes
    const routeCalls = listCalls()
    const lastCall = routeCalls[routeCalls.length - 1]
    expect(lastCall[1].params.plugin).toBe('limit-req')
  })

  // ── Group Filter Tests ──

  itGroupFilterSuite({
    mountPage: async () => {
      const RouteList = (await import('../RouteList.vue')).default
      const wrapper = mount(RouteList, { global: { stubs } })
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    },
    apiGet: mockApiGet,
    listUrl: '/routes',
    expectedGroups: ['线上', '预发'],
    groupParamAssert: 'defined',
  })

  it('loads DNS route data correctly', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes')
        return Promise.resolve({
          data: {
            total: 1,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 3,
                name: 'DNS查询',
                uri: '/dns-query',
                methods: 'GET',
                cluster_id: 1,
                cluster_name: '生产集群',
                plugins: [{ plugin_name: 'dns_upstream' }],
                priority: 0,
                status: 1,
              },
            ],
          },
        })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unknown url'))
    })
    const RouteList = (await import('../RouteList.vue')).default
    // 额外 stub a-table 渲染 bodyCell（name 列），让 DNS 徽章真实参与断言
    const wrapper = mount(RouteList, {
      global: {
        stubs: {
          ...stubs,
          'a-table': {
            template:
              '<table class="mock-a-table"><tbody><template v-for="r in dataSource" :key="r.key || r.id"><tr v-if="r.__groupHeader" data-test="group-header"><td><slot name="bodyCell" :record="r" :column="{ key: \'group\' }" /></td></tr><tr v-else><td><slot name="bodyCell" :record="r" :column="{ key: \'name\' }" /></td></tr></template></tbody></table>',
            props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
          },
        },
      },
    })
    await flushPromises()
    // DNS 路由（plugins 含 dns_upstream）在名称列渲染 DNS 徽章
    const badge = wrapper.find('.dns-route-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('DNS')
  })
})

// ── F2-NEW-08：100 条大数据量渲染 / 分页 / 筛选清空 ──

describe('RouteList.vue 100 条大数据量 / 分页 / 筛选清空', () => {
  const TOTAL = 100
  const responses = new Map<string, { data: unknown }>()

  // 行形状取自本文件 MOCK_ROUTES 的真实 /routes 响应结构
  function bulkRoute(id: number) {
    return {
      id,
      name: `e2e-bulk-${String(id).padStart(3, '0')}`,
      uri: `/bulk/api/${id}/*`,
      methods: 'GET',
      cluster_id: 1,
      cluster_name: '生产集群',
      priority: 0,
      current_version: null,
      created_at: '2026-09-14T16:30:45',
      status: 1,
    }
  }

  function routesResponse(page: number) {
    const start = (page - 1) * 20
    return {
      data: {
        total: TOTAL,
        page,
        page_size: 20,
        items: Array.from({ length: 20 }, (_, i) => bulkRoute(start + i + 1)),
      },
    }
  }

  const bulkStubs = {
    ...stubs,
    'a-table': {
      template:
        '<div class="mock-a-table"><template v-for="r in dataSource" :key="r.key || r.id"><div v-if="r.__groupHeader" data-test="group-header"><slot name="bodyCell" :record="r" :column="{ key: \'group\' }" /></div><div v-else class="mock-row"><slot name="bodyCell" :record="r" :column="{ key: \'name\' }" /></div></template><button class="mock-goto-page2" @click="$emit(\'change\', { current: 2, pageSize: 20 })">去第2页</button><button class="mock-goto-page3" @click="$emit(\'change\', { current: 3, pageSize: 20 })">去第3页</button></div>',
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
      emits: ['change'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    responses.clear()
    responses.set('/clusters', {
      data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] },
    })
    responses.set('/plugins/builtin', { data: { plugins: [] } })
    responses.set('/clusters/1/upstreams', { data: { total: 1, items: [{ id: 7, name: 'demo-upstream' }] } })
    mockApiGet.mockImplementation((url: string, config?: { params?: { page?: number } }) => {
      if (url === '/routes') {
        // 服务端分页：按请求 page 返回对应切片
        return Promise.resolve(routesResponse(config?.params?.page ?? 1))
      }
      const hit = responses.get(url)
      if (!hit) return Promise.reject(new Error(`unexpected GET: ${url}`))
      return Promise.resolve(hit)
    })
  })

  async function mountPage() {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: bulkStubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  function rows(wrapper: Awaited<ReturnType<typeof mountPage>>) {
    return wrapper.findAll('.mock-row').map((r) => r.text())
  }

  it('默认渲染第 1 页 20 行，总数显示 100', async () => {
    const wrapper = await mountPage()
    expect(rows(wrapper).length).toBe(20)
    expect(wrapper.text()).toContain('共 100 条路由')
    expect(wrapper.text()).toContain('e2e-bulk-001')
    expect(wrapper.text()).not.toContain('e2e-bulk-021')
    wrapper.unmount()
  })

  it('翻页到第 2 页请求携带 page=2 并渲染第 2 批数据', async () => {
    const wrapper = await mountPage()
    await wrapper.find('.mock-goto-page2').trigger('click')
    await flushPromises()
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    const params = (calls[calls.length - 1][1] as { params: { page: number } }).params
    expect(params.page).toBe(2)
    const texts = rows(wrapper)
    expect(texts.some((t) => t.includes('e2e-bulk-021'))).toBe(true)
    expect(texts.some((t) => t.includes('e2e-bulk-001'))).toBe(false)
    wrapper.unmount()
  })

  it('第 2 页选择集群筛选重置回第 1 页；清空集群选择后不带 cluster_id', async () => {
    const wrapper = await mountPage()
    await wrapper.find('.mock-goto-page2').trigger('click')
    await flushPromises()

    // 选择集群 1：onClusterChange 重置 page=1，并携带 cluster_id + 拉取上游选项
    // ClusterSelect 契约模拟：值事件先于 change（v-model 更新后再触发 onClusterChange）；
    // 真实组件 emit 集群 id（number），此处对齐
    const clusterSelectComp = wrapper.findComponent(ClusterSelect)
    expect(clusterSelectComp.exists()).toBe(true)
    await clusterSelectComp.vm.$emit('update:modelValue', 1)
    await clusterSelectComp.vm.$emit('change', 1)
    await flushPromises()
    let calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    let params = (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
    expect(params.page).toBe(1)
    expect(params.cluster_id).toBe(1)
    expect(mockApiGet.mock.calls.some((c: unknown[]) => c[0] === '/clusters/1/upstreams')).toBe(true)

    // 清空集群选择（选回「全部集群」）：page 保持 1，cluster_id 不再携带
    await clusterSelectComp.vm.$emit('update:modelValue', '')
    await clusterSelectComp.vm.$emit('change', '')
    await flushPromises()
    calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    params = (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
    expect(params.page).toBe(1)
    expect(params.cluster_id).toBeUndefined()
    wrapper.unmount()
  })
})

// ── 组4 4.4：发布状态列 PublishStatusTag + 发布状态筛选「待发布」 ─────────

describe('RouteList.vue 发布状态列与筛选（batch1 组4）', () => {
  const pubStateStubs = {
    ...stubs,
    ATable: aTableStub,
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url === '/routes')
        return Promise.resolve({
          data: {
            total: 3,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 1,
                name: 'r-pub',
                uri: '/pub/*',
                methods: 'GET',
                cluster_id: 1,
                cluster_name: '生产集群',
                priority: 0,
                status: 1,
                current_version: 3,
                published_at: '2026-01-15T10:30:00Z',
                pending_publish: false,
              },
              {
                id: 2,
                name: 'r-pending',
                uri: '/pend/*',
                methods: 'GET',
                cluster_id: 1,
                cluster_name: '生产集群',
                priority: 0,
                status: 1,
                current_version: 2,
                published_at: '2026-01-16T10:30:00Z',
                pending_publish: true,
              },
              {
                id: 3,
                name: 'r-unpub',
                uri: '/unpub/*',
                methods: 'GET',
                cluster_id: 1,
                cluster_name: '生产集群',
                priority: 0,
                status: 1,
                current_version: null,
                published_at: null,
                pending_publish: false,
              },
            ],
          },
        })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('发布状态列：PublishStatusTag 四态（已发布 vX+时间 / 待发布 / 未发布）', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: pubStateStubs } })
    await flushPromises()
    const rows = wrapper.findAll('tr.ant-table-row')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('v3')
    expect(rows[1].text()).toContain('待发布')
    expect(rows[2].text()).toContain('未发布')
  })

  it('状态 chips（filter-architecture D1）：点「待发布」→ 请求携带 publish_status=pending 且该 chip 高亮', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: pubStateStubs } })
    await flushPromises()
    // 状态下拉已下线，改为第二行 chips（全部/未发布/待发布/已发布）
    expect(wrapper.findAll('select').find((s) => s.text().includes('已发布'))).toBeUndefined()
    const chip = wrapper.findAll('.chip-status').find((c) => c.text().includes('待发布'))
    expect(chip, '应有「待发布」状态 chip').toBeDefined()
    await chip!.trigger('click')
    await flushPromises()
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    const params = (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
    expect(params.publish_status).toBe('pending')
    expect(wrapper.findAll('.chip-status.active').map((c) => c.text().includes('待发布'))).toEqual([true])
  })
})

// ── batch1 组5 5.1：独立页服务端排序（A4 可排序收敛 / A5 本地 sorter 假象移除） ──

describe('RouteList.vue 服务端排序（batch1 组5）', () => {
  const sortStubs = {
    ...stubs,
    ATable: {
      name: 'SortStubTable',
      template: `
        <div class="mock-a-table">
          <button class="mock-sort" @click="sort('name', 'ascend')">sort-name-asc</button>
          <button class="mock-sort" @click="sort('name', 'descend')">sort-name-desc</button>
          <button class="mock-sort" @click="sort('name', null)">sort-name-clear</button>
          <button class="mock-sort" @click="sort('priority', 'descend')">sort-priority-desc</button>
          <button class="mock-sort" @click="sort('cluster_name', 'ascend')">sort-cluster-asc</button>
          <button class="mock-goto-page2" @click="$emit('change', { current: 2, pageSize: 20 }, {}, sorter)">去第2页</button>
          <template v-for="r in dataSource" :key="r.key || r.id"><div v-if="r.__groupHeader" data-test="group-header"><slot name="bodyCell" :record="r" :column="{ key: 'group' }" /></div><div v-else class="mock-row"><slot name="bodyCell" :record="r" :column="{ key: 'name' }" /></div></template>
        </div>
      `,
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
      emits: ['change'],
      data(this: any) {
        return { sorter: null as Record<string, string> | null }
      },
      methods: {
        // this: any——plain object 桩无组件 this 类型（aTableStub.ts 同款约定，测试豁免）
        sort(this: any, field: string, order: 'ascend' | 'descend' | null) {
          this.sorter = order ? { field, order } : null
          this.$emit('change', { current: 1, pageSize: 20 }, {}, this.sorter)
        },
      },
    },
  }

  function makeItem(id: number) {
    return {
      id,
      name: `r-${id}`,
      uri: `/api/r${id}/*`,
      methods: 'GET',
      cluster_id: 1,
      cluster_name: '生产集群',
      priority: id,
      current_version: null,
      created_at: '2026-09-14T16:30:45',
      status: 1,
    }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/routes')
        return Promise.resolve({ data: { total: 2, page: 1, page_size: 20, items: [makeItem(1), makeItem(2)] } })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  async function mountPage() {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: sortStubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  async function clickSort(wrapper: Awaited<ReturnType<typeof mountPage>>, label: string) {
    const btn = wrapper.findAll('button.mock-sort').find((b) => b.text() === label)
    expect(btn, `排序按钮 ${label} 存在`).toBeDefined()
    await btn!.trigger('click')
    await flushPromises()
  }

  function lastRouteParams() {
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    return (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
  }

  it('列定义：可排序收敛 name/uri/priority/created_at（sorter: true），集群/上游/状态列无本地 sorter', async () => {
    const wrapper = await mountPage()
    const cols = (wrapper.vm as any).columns as Array<Record<string, unknown>>
    const byKey = (k: string) => cols.find((c) => c.key === k) as Record<string, unknown> | undefined
    expect(byKey('name')?.sorter).toBe(true)
    expect(byKey('uri')?.sorter).toBe(true)
    expect(byKey('priority')?.sorter).toBe(true)
    expect(byKey('created_at')?.sorter).toBe(true)
    expect(byKey('upstream')?.sorter).toBeUndefined()
    expect(byKey('cluster_name')?.sorter).toBeUndefined()
    expect(byKey('publish_status')?.sorter).toBeUndefined()
    wrapper.unmount()
  })

  it('列宽：发布状态定宽 220（批 7「差异」胶囊：partial 态标签 ~170 + 胶囊 ~42 放得下；日期超宽走省略+tooltip）、操作列 110 容纳行内发布+菜单（拍平后不挤）', async () => {
    const wrapper = await mountPage()
    const cols = (wrapper.vm as any).columns as Array<Record<string, unknown>>
    const byKey = (k: string) => cols.find((c) => c.key === k) as Record<string, unknown> | undefined
    expect(byKey('publish_status')?.width).toBe(220)
    expect(byKey('actions')?.width).toBe(110)
    wrapper.unmount()
  })

  it('表头排序透传服务端参数：ascend→sort_by=name&sort_order=asc；descend→desc（平铺钉位）', async () => {
    const wrapper = await mountPage()
    // 排序仅平铺生效（table-sorting）：请求携带排序参数的前提是平铺模式
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    await clickSort(wrapper, 'sort-name-asc')
    expect(lastRouteParams().sort_by).toBe('name')
    expect(lastRouteParams().sort_order).toBe('asc')
    await clickSort(wrapper, 'sort-name-desc')
    expect(lastRouteParams().sort_by).toBe('name')
    expect(lastRouteParams().sort_order).toBe('desc')
    wrapper.unmount()
  })

  it('取消排序（第三态）后请求不再携带 sort_by/sort_order', async () => {
    const wrapper = await mountPage()
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    await clickSort(wrapper, 'sort-name-desc')
    await clickSort(wrapper, 'sort-name-clear')
    expect(lastRouteParams().sort_by).toBeUndefined()
    expect(lastRouteParams().sort_order).toBeUndefined()
    wrapper.unmount()
  })

  it('白名单外字段（cluster_name，本地 sorter 已移除）即使误发也不产生排序参数（值域守卫）', async () => {
    const wrapper = await mountPage()
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    await clickSort(wrapper, 'sort-cluster-asc')
    expect(lastRouteParams().sort_by).toBeUndefined()
    wrapper.unmount()
  })

  it('排序后翻页：page=2 且排序参数保持（同参数重发）', async () => {
    const wrapper = await mountPage()
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    await clickSort(wrapper, 'sort-priority-desc')
    await wrapper.find('.mock-goto-page2').trigger('click')
    await flushPromises()
    expect(lastRouteParams().page).toBe(2)
    expect(lastRouteParams().sort_by).toBe('priority')
    expect(lastRouteParams().sort_order).toBe('desc')
    wrapper.unmount()
  })

  it('分组模式表头点击：一次性提示、请求不带排序参数、排序键保留（跨模式休眠）', async () => {
    const { message } = await import('ant-design-vue')
    const wrapper = await mountPage()
    // 平铺下建立排序键 → 切分组（键保留、请求不带排序参数）
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    await clickSort(wrapper, 'sort-priority-desc')
    expect(lastRouteParams().sort_by).toBe('priority')
    ;(wrapper.vm as any).viewMode = 'group'
    await wrapper.vm.$nextTick()
    // 分组模式下可排序列 sorter 置 false
    const cols = wrapper.findComponent({ name: 'SortStubTable' }).props('columns') as Array<{
      key: unknown
      sorter?: unknown
    }>
    for (const k of ['name', 'uri', 'priority', 'created_at']) {
      expect(cols.find((c) => c.key === k)?.sorter).toBe(false)
    }
    await clickSort(wrapper, 'sort-priority-desc')
    expect(lastRouteParams().sort_by).toBeUndefined()
    // 排序键跨模式保留（休眠而非清除）
    expect((wrapper.vm as any).sortBy).toBe('priority')
    expect((wrapper.vm as any).sortOrder).toBe('desc')
    // 分组模式点可排列表头 → 一次性提示（message.info，数秒自动消失）
    const mockInfo = message.info as unknown as ReturnType<typeof vi.fn>
    mockInfo.mockClear()
    await (wrapper.vm as any).onSortableHeaderClick({ key: 'priority' })
    expect(mockInfo).toHaveBeenCalledTimes(1)
    // 回平铺：原样恢复请求排序参数
    ;(wrapper.vm as any).viewMode = 'flat'
    await flushPromises()
    expect(lastRouteParams().sort_by).toBe('priority')
    expect(lastRouteParams().sort_order).toBe('desc')
    wrapper.unmount()
  })

  it('「清除排序」：仅平铺且存在排序键时可见；点击只清排序不切模式', async () => {
    const wrapper = await mountPage()
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    // 无排序键 → 按钮不可见
    expect(wrapper.find('[data-test="clear-sort"]').exists()).toBe(false)
    await clickSort(wrapper, 'sort-priority-desc')
    expect(wrapper.find('[data-test="clear-sort"]').exists()).toBe(true)
    // 分组模式 → 不可见（排序键保留）
    ;(wrapper.vm as any).viewMode = 'group'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="clear-sort"]').exists()).toBe(false)
    expect((wrapper.vm as any).sortBy).toBe('priority')
    // 回平铺 → 可见，点击清除后恢复默认序且仍为平铺
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="clear-sort"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).sortBy).toBe('')
    expect(lastRouteParams().sort_by).toBeUndefined()
    expect((wrapper.vm as any).viewMode).toBe('flat')
    wrapper.unmount()
  })
})

describe('RouteList.vue 版本恢复发布出口接线（batch1 组3）', () => {
  const vmWiringStubs = {
    ...stubs,
    VersionManagementModal: {
      name: 'MockVersionManagementModal',
      template: '<div class="mock-version-modal" v-if="open" />',
      props: ['open', 'resourceType', 'resourceId', 'clusterId', 'resourceName', 'canPublish'],
      emits: ['update:open', 'version-change', 'published', 'publish-requested'],
    },
    PublishConfirmModal: {
      name: 'MockPublishConfirmModal',
      template: '<div class="mock-publish-modal" v-if="visible" />',
      props: ['visible', 'title', 'clusterId'],
      emits: ['confirm', 'cancel', 'update:visible'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(executePublish).mockResolvedValue(undefined)
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: MOCK_ROUTES })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('版本管理弹窗传 can-publish=true（恢复出口条可见）', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: vmWiringStubs } })
    await flushPromises()
    const vmModal = wrapper.findComponent({ name: 'MockVersionManagementModal' })
    expect(vmModal.exists()).toBe(true)
    expect(vmModal.props('canPublish')).toBe(true)
    wrapper.unmount()
  })

  it('出口条 publish-requested → 以版本弹窗上下文走既有发布链路；成功后刷新列表并重开版本弹窗', async () => {
    vi.mocked(executePublish).mockImplementationOnce(async (opts: any) => {
      await opts.refreshFn()
    })
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: vmWiringStubs } })
    await flushPromises()

    const vm: any = wrapper.vm
    vm.openVersionManagement(MOCK_ROUTES.items[0])
    await flushPromises()
    const vmModal = wrapper.findComponent({ name: 'MockVersionManagementModal' })
    expect(vmModal.props('canPublish')).toBe(true)

    vmModal.vm.$emit('publish-requested')
    await flushPromises()

    // 版本弹窗让位给发布确认弹窗，发布上下文 = 版本弹窗资源（用户API @ cluster 1）
    expect(wrapper.findComponent({ name: 'MockPublishConfirmModal' }).exists()).toBe(true)
    expect(vm.publishVisible).toBe(true)
    expect(vm.publishingRecord).toMatchObject({ id: 1, cluster_id: 1, name: '用户API' })
    expect(vm.publishClusterId).toBe(1)
    expect(vm.vmVisible).toBe(false)

    wrapper.findComponent({ name: 'MockPublishConfirmModal' }).vm.$emit('confirm', [7])
    await flushPromises()

    expect(executePublish).toHaveBeenCalledTimes(1)
    expect(executePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '发布路由: 用户API',
        apiEndpoint: '/clusters/1/routes/1/publish',
        nodeIds: [7],
      }),
    )
    // refreshFn：列表已刷新 + 版本弹窗重开（重开触发既有 open watch 重载版本列表并复位出口条）
    const listLoads = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes').length
    expect(listLoads).toBeGreaterThanOrEqual(2)
    expect(vm.vmVisible).toBe(true)
    wrapper.unmount()
  })
})

// ── 组2 2.2：删除确认节点清单走共享全量拉取工具 fetchAllClusterNodes ─────────────
// deleteRoute 不再内联单页 api.get 拉 /clusters/{id}/nodes（后端单页封顶 500，
// >500 节点集群的删除确认清单会被静默截断），改经共享工具分页循环取全。

describe('RouteList.vue 删除确认节点清单全量拉取（route-management-ux-batch1 组2）', () => {
  const deleteStubs = {
    ...stubs,
    'a-table': {
      template:
        '<table class="mock-a-table"><tbody><template v-for="r in dataSource" :key="r.key || r.id"><tr v-if="r.__groupHeader" data-test="group-header"></tr><tr v-else><td><slot name="bodyCell" :record="r" :column="{ key: \'actions\' }" /></td></tr></template></tbody></table>',
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
    },
    'a-dropdown': { template: '<div class="mock-dropdown"><slot name="overlay" /></div>' },
    'a-menu': { template: '<div class="mock-menu"><slot /></div>' },
    'a-menu-item': {
      template: '<div class="mock-menu-item" @click="$emit(\'click\', $event)"><slot /></div>',
      emits: ['click'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: MOCK_ROUTES })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('deleteRoute 经 fetchAllClusterNodes 取节点清单并传给删除确认弹窗（不内联拉节点接口）', async () => {
    const { fetchAllClusterNodes, showDeleteConfirm } = await import('@/composables/useClusterUtils')
    const nodes = [
      { id: 11, ip: '10.0.0.11', management_port: 9180 },
      { id: 12, ip: '10.0.0.12', management_port: 9180 },
      { id: 13, ip: '10.0.0.13', management_port: 9180 },
    ]
    vi.mocked(fetchAllClusterNodes).mockResolvedValue(nodes as never)

    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: deleteStubs } })
    await flushPromises()

    const delItem = wrapper.findAll('.mock-menu-item').find((b) => b.text().trim().startsWith('删除'))
    expect(delItem, '行操作菜单应有删除项').toBeTruthy()
    await delItem!.trigger('click')
    await flushPromises()

    // 走共享工具（按路由所在集群 1 全量取数），清单完整传给确认弹窗
    expect(vi.mocked(fetchAllClusterNodes)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchAllClusterNodes)).toHaveBeenCalledWith(1)
    expect(vi.mocked(showDeleteConfirm)).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(showDeleteConfirm).mock.calls[0][0] as { nodes?: unknown[] }
    expect(arg.nodes).toHaveLength(3)
    // 不再内联调用节点接口（数据获取统一由共享工具承担）
    expect(mockApiGet.mock.calls.some((c: unknown[]) => String(c[0]).includes('/nodes'))).toBe(false)
    wrapper.unmount()
  })
})

// ── 6.2：集群下拉随授权收敛（route-management-ux-batch1 组6，钉住测试）────────
// 独立页集群下拉数据源 = GET /clusters 用户视角（clusters.py 对非 admin 按 UserCluster
// 收敛），RouteList 不做二次过滤——下拉选项集必须与授权集群集一一对应（不多不少）。
// 6.1 已核验数据源同源；本组仅组件测试钉住，admin 全量行为不变。

describe('RouteList.vue 集群下拉随授权收敛（batch1 组6 6.2）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: { total: 0, page: 1, page_size: 20, items: [] } })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 5, display_name: '授权集群甲' },
              { id: 9, display_name: '授权集群乙' },
            ],
          },
        })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('集群下拉选项集 == 授权集群集（不多不少，组件不做二次过滤）', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()

    // 集群下拉选项集 == 授权集群集（ClusterSelect 不做二次过滤；不多不少）
    const clusterSelectEl = wrapper.find('.cluster-select')
    expect(clusterSelectEl.exists()).toBe(true)
    // 选项集 == 注入集群集（ClusterSelect 不做二次过滤；不多不少），value 契约：全部集群=''、集群项=集群 id
    // （未解析的自定义标签以原生元素落在 DOM，直接用原生查询断言）
    const optionEls = Array.from(clusterSelectEl.element.querySelectorAll('a-select-option'))
    // 排序跟随默认 locale collation（en-US/ICU 下「乙」先于「甲」），与 ClusterSelect 排序契约一致
    expect(optionEls.map((el) => el.textContent?.trim())).toEqual(['全部集群', '授权集群乙', '授权集群甲'])
    expect(optionEls.map((el) => el.getAttribute('value'))).toEqual(['', '9', '5'])
    wrapper.unmount()
  })
})

// ── 7.2：列表空态双形态（route-management-ux-batch1 组7，C8）────────────────
// 无筛选空态「尚未创建路由 + 新建路由」；有筛选空态「没有符合条件路由 + 清空筛选」；
// 清空筛选必须重置全部筛选含分组下拉（C8）。

describe('RouteList.vue 空态双形态与清空筛选（batch1 7.2）', () => {
  const emptyStubs = {
    ...stubs,
    ATable: {
      name: 'EmptyStubTable',
      template:
        '<div class="mock-a-table"><slot v-if="dataSource.length" name="bodyCell" :record="dataSource[0]" :column="{ key: \'name\' }" /><slot v-else name="emptyText" /></div>',
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
      emits: ['change'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: { total: 0, page: 1, page_size: 20, items: [] } })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  async function mountEmpty() {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: emptyStubs } })
    await flushPromises()
    return wrapper
  }

  function lastRouteParams(): Record<string, unknown> {
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    return (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
  }

  it('无筛选空态：显示「尚未创建路由」+ 新建路由按钮，点击打开新建弹窗', async () => {
    const wrapper = await mountEmpty()
    expect(wrapper.text()).toContain('尚未创建路由')
    expect(wrapper.text()).not.toContain('没有符合条件路由')
    const btn = wrapper.findAll('button').find((b) => b.text() === '新建路由')
    expect(btn, '空态应有「新建路由」按钮').toBeDefined()
    await btn!.trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MockRouteForm' }).props('visible')).toBe(true)
    wrapper.unmount()
  })

  it('有筛选空态：显示「没有符合条件路由」+ 清空筛选按钮', async () => {
    const wrapper = await mountEmpty()
    const publishedChip = wrapper.findAll('.chip-status').find((c) => c.text().includes('已发布'))
    await publishedChip!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('没有符合条件路由')
    expect(wrapper.text()).not.toContain('尚未创建路由')
    const btn = wrapper.findAll('button').find((b) => b.text() === '清空筛选')
    expect(btn, '有筛选空态应有「清空筛选」按钮').toBeDefined()
    wrapper.unmount()
  })

  it('清空筛选：重置全部筛选（含分组下拉回「全部分组」，C8）并重查', async () => {
    const wrapper = await mountEmpty()

    // 设置三个筛选：分组=线上、发布状态=已发布（chip）、方法=GET（下拉）
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    await groupSelect!.setValue('线上')
    await flushPromises()
    expect(lastRouteParams().group_name).toBe('线上')
    const publishedChip = wrapper.findAll('.chip-status').find((c) => c.text().includes('已发布'))
    await publishedChip!.trigger('click')
    await flushPromises()
    const methodSelect = wrapper.find('select.method-filter')
    await methodSelect.setValue('GET')
    await flushPromises()
    expect(lastRouteParams().publish_status).toBe('published')
    expect(lastRouteParams().method).toBe('GET')

    const clearBtn = wrapper.findAll('button').find((b) => b.text() === '清空筛选')
    await clearBtn!.trigger('click')
    await flushPromises()

    expect(lastRouteParams().group_name).toBe('__all__')
    expect(lastRouteParams().publish_status).toBeUndefined()
    expect(lastRouteParams().method).toBeUndefined()
    // 分组下拉 UI 同步复位（C8：清空含分组下拉）
    const groupSelectAfter = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    expect((groupSelectAfter!.element as HTMLSelectElement).value).toBe('__all__')
    // 回到无筛选空态
    expect(wrapper.text()).toContain('尚未创建路由')
    wrapper.unmount()
  })
})

// ── 7.3：方法筛选 chips 收敛 + 全量「方法」下拉（route-management-ux-batch1 组7）──
// chips 收敛为常驻 全部/GET/POST/PUT/DELETE/PATCH；下拉含全量方法（与表单方法集一致），
// 与 chips 同值双向联动（选 chips=设下拉值；改下拉=清/设 chips 对应项）。

describe('RouteList.vue 方法筛选收敛与全量下拉（batch1 7.3）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: { total: 0, page: 1, page_size: 20, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  async function mountPage() {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  function lastRouteParams(): Record<string, unknown> {
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    return (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
  }

  function activeChipLabels(wrapper: Awaited<ReturnType<typeof mountPage>>): string[] {
    return wrapper.findAll('.f-chip.active').map((c) => c.text().trim())
  }

  it('第二行改为状态 chips（4 枚，带计数后缀），方法 chips 已下线', async () => {
    const wrapper = await mountPage()
    const chips = wrapper.findAll('.chip-status').map((c) => c.text().replace(/\d+/g, '').trim())
    expect(chips).toEqual(['全部', '未发布', '待发布', '已发布'])
    // 方法不再是 chips：chip 行内不出现 GET/POST 等
    expect(wrapper.find('[data-test="status-chip-row"]').text()).not.toContain('GET')
    wrapper.unmount()
  })

  it('「方法」下拉是方法的唯一入口：含全量 10 项，选中即带 method 参数', async () => {
    const wrapper = await mountPage()

    const methodSelect = wrapper.find('select.method-filter')
    expect(methodSelect.exists()).toBe(true)
    const options = methodSelect.findAll('option')
    expect(options.map((o) => (o.element as HTMLOptionElement).value)).toEqual([
      '',
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'HEAD',
      'OPTIONS',
      'CONNECT',
      'TRACE',
    ])
    expect(options[0].text().trim()).toBe('全部方法')

    await methodSelect.setValue('HEAD')
    await flushPromises()
    expect(lastRouteParams().method).toBe('HEAD')

    await methodSelect.setValue('')
    await flushPromises()
    expect(lastRouteParams().method).toBeUndefined()
    wrapper.unmount()
  })
})

// ── 7.5：搜索 placeholder 补「域名」（route-management-ux-batch1 组7，C6）──────

describe('RouteList.vue 搜索 placeholder（batch1 7.5）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: { total: 0, page: 1, page_size: 20, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('搜索 placeholder 覆盖域名（后端 host 前缀匹配已支持）', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()
    const input = wrapper.find('.search-input-wrap input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('搜索名称、URI、描述、域名...')
    wrapper.unmount()
  })
})

// ── 7.6：深链 ?cluster_id= —— 只做过滤 + 新建预选，不自动开弹窗 ────────────────
// 2026-10-26 缺陷修复：原实现进页自动打开新建弹窗，与 cluster-stat-links 卡片统计格
// 的「查看」语义撞车（集群管理卡片点「路由」→ 弹新建窗）；且自动开窗分支无任何真实
// 消费方。规格（route-management「Deep link preselects cluster」）= 深链进入后用户
// 手动点「新建路由」时预选该集群；?cluster_id= 本身与其余 6 页一致仅做过滤。

describe('RouteList.vue 深链 cluster_id：过滤 + 新建预选（batch1 7.6 修正）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: { total: 0, page: 1, page_size: 20, items: [] } })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 5, display_name: '生产集群' },
              { id: 9, display_name: '乙' },
            ],
          },
        })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('授权内集群：进页不自动开弹窗；手动点「新建路由」预选该集群', async () => {
    mockRouteQuery = { cluster_id: '5' }
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()

    // 修复点：深链不再自动打开新建弹窗（卡片统计格「查看」语义）
    const vm = wrapper.vm as { formModalVisible: boolean; editingRoute: unknown }
    expect(vm.formModalVisible).toBe(false)
    // 既有行为保持：列表请求仍按深链集群过滤
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    expect((calls[calls.length - 1][1] as { params: { cluster_id?: unknown } }).params.cluster_id).toBe('5')

    // 规格场景：深链进入后手动点「新建路由」→ 预选该集群
    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('新建路由'))
    expect(createBtn).toBeTruthy()
    await createBtn!.trigger('click')
    await flushPromises()
    expect(vm.formModalVisible).toBe(true)
    expect(vm.editingRoute).toBeNull()
    const form = wrapper.findComponent({ name: 'MockRouteForm' })
    expect(form.props('defaultClusterId')).toBe(5)
    wrapper.unmount()
  })

  it('未授权/不存在集群：不开弹窗不预选（列表仍按 cluster_id 过滤）', async () => {
    mockRouteQuery = { cluster_id: '999' }
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()

    const vm = wrapper.vm as { formModalVisible: boolean }
    expect(vm.formModalVisible).toBe(false)
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    expect((calls[calls.length - 1][1] as { params: { cluster_id?: unknown } }).params.cluster_id).toBe('999')
    // 未授权集群不进预选：手动新建时不带 defaultClusterId
    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('新建路由'))
    await createBtn!.trigger('click')
    await flushPromises()
    const form = wrapper.findComponent({ name: 'MockRouteForm' })
    expect(form.props('defaultClusterId')).toBeNull()
    wrapper.unmount()
  })
})

// ── 7.9（独立页）：DNS 行 ⋯ 禁用 + tooltip 指路（route-management-ux-batch1 组7）──
// 删除 toast 拦截（alertDnsRoute → message.warning），改行内禁用 + tooltip 指路。

describe('RouteList.vue 独立页 DNS 行操作禁用与指路（batch1 7.9）', () => {
  const dnsPageStubs = {
    ...stubs,
    'a-table': {
      template:
        '<table class="mock-a-table"><tbody><template v-for="r in dataSource" :key="r.key || r.id"><tr v-if="r.__groupHeader" data-test="group-header"></tr><tr v-else><td><slot name="bodyCell" :record="r" :column="{ key: \'actions\' }" /></td></tr></template></tbody></table>',
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
    },
    'a-dropdown': { template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>' },
    'a-menu': { template: '<div class="mock-menu"><slot /></div>' },
    'a-menu-item': {
      template: '<div class="mock-menu-item" @click="$emit(\'click\', $event)"><slot /></div>',
      emits: ['click'],
    },
    'a-tooltip': { template: '<span class="mock-tooltip" :title="title"><slot /></span>', props: ['title'] },
    'a-button': {
      template: '<button class="mock-btn" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
      props: ['disabled', 'type', 'size', 'danger'],
      emits: ['click'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes')
        return Promise.resolve({
          data: {
            total: 2,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 3,
                name: 'DNS查询',
                uri: '/dns-query',
                methods: 'GET',
                cluster_id: 1,
                cluster_name: '生产集群',
                plugins: [{ plugin_name: 'dns_upstream' }],
                priority: 0,
                status: 1,
              },
              {
                id: 1,
                name: '普通路由',
                uri: '/api/*',
                methods: 'GET',
                cluster_id: 1,
                cluster_name: '生产集群',
                priority: 0,
                status: 1,
              },
            ],
          },
        })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('DNS 行 ⋯ 禁用 + tooltip 指路「DNS 代理」页；普通行不受影响；不再走 toast 拦截', async () => {
    const { message } = await import('ant-design-vue')
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: dnsPageStubs } })
    await flushPromises()
    // 行内动作解剖断言钉平铺（默认分组模式组头行会插入 tbody 首位，contract 10.2）
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('.mock-a-table tbody tr')
    expect(rows.length).toBe(2)

    const dnsTip = rows[0].find('.mock-tooltip')
    expect(dnsTip.exists()).toBe(true)
    expect(dnsTip.attributes('title')).toBe('DNS 路由请在「DNS 代理」页管理')
    const dnsBtn = rows[0].find('button.mock-btn')
    expect(dnsBtn.attributes('disabled')).toBeDefined()
    await dnsBtn.trigger('click')
    expect(message.warning).not.toHaveBeenCalled()

    const normalBtn = rows[1].find('button.mock-btn')
    expect(normalBtn.exists()).toBe(true)
    expect(normalBtn.attributes('disabled')).toBeUndefined()
    expect(rows[1].find('.mock-tooltip').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('RouteList.vue 行内发布拍平（列表操作统一·方案 A）', () => {
  const flatStubs = {
    ...stubs,
    'a-table': {
      template:
        '<table class="mock-a-table"><tbody><template v-for="r in dataSource" :key="r.key || r.id"><tr v-if="r.__groupHeader" data-test="group-header"></tr><tr v-else><td><slot name="bodyCell" :record="r" :column="{ key: \'actions\' }" /></td></tr></template></tbody></table>',
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
    },
    'a-dropdown': { template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>' },
    'a-menu': { template: '<div class="mock-menu"><slot /></div>' },
    'a-menu-item': {
      template: '<div class="mock-menu-item" @click="$emit(\'click\', $event)"><slot /></div>',
      emits: ['click'],
    },
    'a-tooltip': { template: '<span class="mock-tooltip" :title="title"><slot /></span>', props: ['title'] },
    'a-button': {
      template: '<button class="mock-btn" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
      props: ['disabled', 'type', 'size', 'danger'],
      emits: ['click'],
    },
    PublishConfirmModal: {
      name: 'MockPublishConfirmModal',
      template: '<div class="mock-publish-modal" v-if="visible" />',
      props: ['visible', 'title', 'clusterId'],
      emits: ['confirm', 'cancel', 'update:visible'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes')
        return Promise.resolve({
          data: {
            total: 2,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 3,
                name: 'DNS查询',
                uri: '/dns-query',
                methods: 'GET',
                cluster_id: 1,
                cluster_name: '生产集群',
                plugins: [{ plugin_name: 'dns_upstream' }],
                priority: 0,
                status: 1,
              },
              {
                id: 1,
                name: '普通路由',
                uri: '/api/*',
                methods: 'GET',
                cluster_id: 1,
                cluster_name: '生产集群',
                priority: 0,
                status: 1,
              },
            ],
          },
        })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('普通行：行内「发布」按钮可达，点击打开发布确认弹窗', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: flatStubs } })
    await flushPromises()

    const rows = wrapper.findAll('.mock-a-table tbody tr')
    const normalRow = rows[1]
    // r7：发布主按钮改为设计 .op-pub（原生 button），不再走 a-button 桩
    const pubBtn = normalRow.find('button.op-pub')
    expect(pubBtn, '行内应有「发布」按钮（不再收进菜单）').toBeTruthy()
    expect(pubBtn!.attributes('disabled')).toBeUndefined()

    await pubBtn!.trigger('click')
    await flushPromises()
    const modal = wrapper.findComponent({ name: 'MockPublishConfirmModal' })
    expect(modal.exists()).toBe(true)
    expect((modal.props('title') as string) || '').toContain('普通路由')
  })

  it('菜单收敛为 编辑/版本管理/复制路由/删除（与上游页同序，发布移出行内）', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: flatStubs } })
    await flushPromises()
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('.mock-a-table tbody tr')
    // 主行文案按 menu-item-stack 主行提取（解释行是 small，不参与收敛断言）
    const menuItems = rows[1].findAll('.mock-menu-item').map((i) => {
      const span = i.find('.menu-item-stack span')
      return (span.exists() ? span.text() : i.text()).trim()
    })
    expect(menuItems).toEqual(['编辑', '版本管理', '复制路由', '删除'])
    expect(menuItems).not.toContain('发布')
    // 分级解释落地：版本管理/删除带常驻解释，编辑/复制保持单行
    expect(rows[1].text()).toContain('历史版本查看与回滚')
    expect(rows[1].text()).toContain('删平台配置，可同步删 Edge 已发布配置（弹窗可选）')
  })

  it('DNS 行：发布与 ⋯ 全部禁用 + tooltip 指路（7.9 模式延伸到拍平按钮）', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: flatStubs } })
    await flushPromises()
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('.mock-a-table tbody tr')
    const dnsRow = rows[0]
    // r7：发布改为 .op-pub（原生 button），⋯ 仍为 a-button 桩
    const pubBtn = dnsRow.find('button.op-pub')
    const triggerBtn = dnsRow.find('button.action-trigger-btn')
    expect(pubBtn.exists(), 'DNS 行应有发布按钮').toBe(true)
    expect(triggerBtn.exists(), 'DNS 行应有 ⋯ 触发器').toBe(true)
    for (const b of [pubBtn, triggerBtn]) expect(b.attributes('disabled')).toBeDefined()
    const tips = dnsRow.findAll('.mock-tooltip')
    expect(tips.length).toBe(2)
    for (const t of tips) expect(t.attributes('title')).toBe('DNS 路由请在「DNS 代理」页管理')
    wrapper.unmount()
  })
})

// ── route-save-publish-guidance 1.6：表单保存后的「立即发布」→ 既有发布链路 ──────
// 表单只负责 emit publish-requested；页面把它接进行内发布同一套弹窗与 executePublish，
// 保证「保存后立即发布」与行内发布的节点选择/进度/失败汇总完全一致（不新造发布实现）。
describe('RouteList.vue 表单保存后发布引导接线（route-save-publish-guidance）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(executePublish).mockResolvedValue(undefined)
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: MOCK_ROUTES })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('publish-requested → 打开既有 PublishConfirmModal；确认后 executePublish 打该路由发布端点', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()

    const vm: any = wrapper.vm
    wrapper.findComponent({ name: 'MockRouteForm' }).vm.$emit('publish-requested', {
      clusterId: 1,
      routeId: 2,
      name: '订单服务',
      currentVersion: 3,
    })
    await flushPromises()

    expect(vm.publishVisible, '必须打开既有发布确认弹窗（用户确认后才发布）').toBe(true)
    expect(vm.publishClusterId).toBe(1)
    expect(vm.publishingRecord).toMatchObject({
      id: 2,
      cluster_id: 1,
      name: '订单服务',
      current_version: 3,
    })

    await vm.onPublish([7])
    await flushPromises()
    expect(executePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '发布路由: 订单服务',
        apiEndpoint: '/clusters/1/routes/2/publish',
        nodeIds: [7],
      }),
    )
    wrapper.unmount()
  })

  it('routeId 缺失（异常载荷）不打开发布弹窗，避免误发到空 id', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()

    const vm: any = wrapper.vm
    wrapper.findComponent({ name: 'MockRouteForm' }).vm.$emit('publish-requested', {
      clusterId: 1,
      routeId: null,
      name: '订单服务',
      currentVersion: null,
    })
    await flushPromises()

    expect(vm.publishVisible).toBeFalsy()
    expect(executePublish).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

// === column-personalization-rollout：路由列表列个性化（含 sorter 手势冲突抑制） ===
describe('RouteList 列个性化（column-personalization-rollout）', () => {
  const colDragTableStub = {
    name: 'ColDragTableStub',
    props: {
      dataSource: { type: Array, default: () => [] },
      columns: { type: Array, default: () => [] },
      scroll: { type: Object, default: null },
      tableLayout: { type: String, default: undefined },
    },
    template: `
      <div class="ant-table-wrapper">
        <div class="ant-table">
          <div class="ant-table-content">
            <table>
              <thead class="ant-table-thead">
                <tr>
                  <th v-for="col in columns" :key="col.key" :data-col="col.key" @click="$emit('change', { sorter: { field: col.key, order: 'ascend' } })">
                    <slot name="headerCell" :column="col" :title="col.title" />
                  </th>
                </tr>
              </thead>
              <tbody class="ant-table-tbody">
                <template v-for="(r, i) in dataSource" :key="r.key || r.id">
                  <tr v-if="r.__groupHeader" data-test="group-header"></tr>
                  <tr v-else class="ant-table-row">
                    <td v-for="col in columns" :key="col.key"><slot name="bodyCell" :column="col" :record="r" :index="i" /></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `,
  }

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  async function mountRoute() {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, {
      attachTo: document.body,
      global: { stubs: { ...stubs, ATable: colDragTableStub } },
    })
    await flushPromises()
    return wrapper
  }

  function patchRects(wrapper: ReturnType<typeof mount>) {
    wrapper.findAll('th[data-col]').forEach((th) => {
      th.element.getBoundingClientRect = function (this: HTMLElement) {
        const parent = this.parentElement as HTMLElement
        const idx = [...parent.children].indexOf(this)
        return {
          left: idx * 100,
          right: idx * 100 + 100,
          width: 100,
          top: 0,
          bottom: 40,
          height: 40,
          x: idx * 100,
          y: 0,
          toJSON: () => {},
        } as DOMRect
      }
    })
  }

  it('表格横向滚动/fixed 布局/竖线共享类/#名称固定左、操作固定右（平铺钉位）', async () => {
    const wrapper = await mountRoute()
    // fixed 语义仅平铺承载（分组模式 colSpan 通栏剥离 fixed，contract 10.6）
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    const table = wrapper.findComponent({ name: 'ColDragTableStub' })
    // 平铺态多一列「集群」（设计宽 116 / 缩放下限 96，分组视图无此列）→ 最小宽 762 + 96 = 858（批 7 publish_status 110→220）
    expect(table.props('scroll')).toEqual({ x: 858 })
    expect(table.props('tableLayout')).toBe('fixed')
    const cols = table.props('columns') as Array<{ key: unknown; width?: number; fixed?: string }>
    const byKey = Object.fromEntries(cols.map((c) => [String(c.key), c]))
    expect(byKey['index']).toMatchObject({ width: 45, fixed: 'left' })
    expect(byKey['name']).toMatchObject({ width: 170, fixed: 'left' })
    expect(byKey['actions']).toMatchObject({ width: 110, fixed: 'right' })
    // L2 列集合：分组态移除集群列（组头替代），平铺态补回「集群」列（行内标识）+ 方法+URI 合并「请求匹配」
    expect(cols.map((c) => String(c.key))).toEqual([
      'index',
      'name',
      'cluster',
      'uri',
      'upstream',
      'priority',
      'publish_status',
      'created_at',
      'actions',
    ])
    expect(byKey['uri']).toMatchObject({ title: '请求匹配' })
    expect(wrapper.find('.route-table').classes()).toContain('grid-table')
    wrapper.unmount()
  })

  it('拖拽移动实时换位；拖后点击不触发排序（sorter 手势冲突抑制）', async () => {
    const wrapper = await mountRoute()
    patchRects(wrapper)
    const table = wrapper.findComponent({ name: 'ColDragTableStub' })
    const keySeq = () => (table.props('columns') as Array<{ key: unknown }>).map((c) => String(c.key))
    const ths = () => wrapper.findAll('th[data-col]')
    // 拖前点击 URI 表头：change（排序入口）照常触发
    const uriTh = ths().find((t) => t.attributes('data-col') === 'uri')!
    await uriTh.trigger('click')
    const emittedBefore = table.emitted('change')?.length ?? 0
    expect(emittedBefore).toBeGreaterThan(0)
    // 拖「请求匹配」（矩形 200-300）标题到「优先级」（400-500）左半 → 实时换位
    const uriWrap = uriTh.find('.th-resize-wrap')!
    await uriWrap.trigger('mousedown', { clientX: 250 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 420 }))
    await flushPromises()
    const seq = keySeq()
    expect(seq.indexOf('uri')).toBe(seq.indexOf('priority') - 1)
    // 拖后点击：被 capture 拦截，change 不再触发（排序不被误触发）
    await uriTh.trigger('click')
    expect(table.emitted('change')?.length ?? 0).toBe(emittedBefore)
    // Esc 取消
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(keySeq()).not.toEqual(seq)
    wrapper.unmount()
  }, 15_000)

  it('真实拖拽序列（位移→mouseup→补发 click）不触发排序；纯点击不受拦截', async () => {
    const wrapper = await mountRoute()
    patchRects(wrapper)
    const table = wrapper.findComponent({ name: 'ColDragTableStub' })
    const ths = () => wrapper.findAll('th[data-col]')
    const uriTh = ths().find((t) => t.attributes('data-col') === 'uri')!
    const uriWrap = uriTh.find('.th-resize-wrap')!
    // 纯点击路径：mousedown→mouseup 无位移 → endColumnMove 拆除拦截器 → click 正常触发排序入口
    await uriWrap.trigger('mousedown', { clientX: 250 })
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 250 }))
    await flushPromises()
    const baseCount = table.emitted('change')?.length ?? 0
    await uriTh.trigger('click')
    expect(table.emitted('change')?.length ?? 0).toBe(baseCount + 1)
    // 真实拖拽路径：位移 → mouseup（此时拦截器必须仍在位）→ 补发 click 被拦截
    await uriWrap.trigger('mousedown', { clientX: 250 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 420 }))
    await flushPromises()
    const duringDrag = table.emitted('change')?.length ?? 0
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 420 }))
    await flushPromises()
    await uriTh.trigger('click')
    expect(table.emitted('change')?.length ?? 0).toBe(duringDrag)
    // 拦截器吃掉一次 click 后自移除：下一次点击恢复正常
    await uriTh.trigger('click')
    expect(table.emitted('change')?.length ?? 0).toBe(duringDrag + 1)
    // 兜底守卫：补发 click 未到来时（拖拽换位可能替换 mousedown 目标，浏览器不派发 click），
    // 滞留拦截器由下一次 mousedown 拆除——随后的正常点击不受影响
    await uriWrap.trigger('mousedown', { clientX: 250 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 420 }))
    await flushPromises()
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 420 }))
    await flushPromises()
    // 不派发补发 click，直接进入下一次交互：一次不落在拖拽起始元素上的普通按下
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }))
    const beforeGuard = table.emitted('change')?.length ?? 0
    await uriTh.trigger('click')
    expect(table.emitted('change')?.length ?? 0).toBe(beforeGuard + 1)
    wrapper.unmount()
  }, 15_000)
  it('列配置弹窗：显示字段勾选、搜索开关与弹窗内「重置列宽」（合并列双键）', async () => {
    const wrapper = await mountRoute()
    const table = wrapper.findComponent({ name: 'ColDragTableStub' })
    const keys = () => (table.props('columns') as Array<{ key: unknown }>).map((c) => String(c.key))
    const colWidth = (key: string): number | unknown =>
      (table.props('columns') as Array<{ key: unknown; width?: number }>).find((c) => String(c.key) === key)?.width
    // methods 不再单独成列（合并进「请求匹配」），但仍是独立勾选键
    expect(keys()).not.toContain('methods')
    expect(keys()).toContain('uri')
    // 弹窗结构与节点管理一致：显示字段 / 搜索 / 拖宽提示 / 重置列宽
    const content = wrapper.find('.mock-popover-content')
    expect(content.text()).toContain('显示字段')
    expect(content.text()).toContain('显示搜索框')
    expect(content.text()).toContain('拖动表头右缘可调整列宽')
    expect(content.findAll('button').some((b) => b.text() === '重置列宽')).toBe(true)
    // 取消勾选「方法」→ 合并列仍渲染（URI 段保留），仅方法 chips 段消失（contract 10.1）
    const groups = wrapper.findAllComponents({ name: 'MockCheckboxGroup' })
    expect(groups.length).toBe(1)
    const all = groups[0].props('value') as string[]
    expect(all).toContain('methods')
    groups[0].vm.$emit(
      'update:value',
      all.filter((k) => k !== 'methods'),
    )
    await flushPromises()
    expect(keys()).toContain('uri')
    expect((wrapper.vm as any).isMethodsSelected()).toBe(false)
    expect((wrapper.vm as any).isUriSelected()).toBe(true)
    // 两个键都取消 → 合并列整列不渲染
    const all2 = (groups[0].props('value') as string[]).filter((k) => k !== 'uri')
    groups[0].vm.$emit('update:value', all2)
    await flushPromises()
    expect(keys()).not.toContain('uri')
    // 恢复勾选（拖宽断言需要 uri 列在位）
    groups[0].vm.$emit('update:value', all)
    await flushPromises()
    // 拖宽后经弹窗重置恢复默认
    const uriTh = wrapper.findAll('th[data-col]').find((t) => t.attributes('data-col') === 'uri')!
    await uriTh.find('.col-resize-handle').trigger('mousedown', { clientX: 300 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 360 }))
    await flushPromises()
    expect(colWidth('uri')).toBe(316) // 256 + 60
    await content
      .findAll('button')
      .find((b) => b.text() === '重置列宽')!
      .trigger('click')
    await flushPromises()
    expect(colWidth('uri')).toBe(256)
    // 搜索开关
    const toggle = wrapper.findAllComponents({ name: 'MockCheckbox' }).find((c) => c.text().includes('显示搜索框'))!
    toggle.vm.$emit('update:checked', false)
    await flushPromises()
    expect(wrapper.find('input[placeholder="搜索名称、URI、描述、域名..."]').exists()).toBe(false)
    wrapper.unmount()
  }, 15_000)
})

// ── list-pages-console-restyle：集群分组 / 双模式 / 页头徽标 / V2 工具条 ─────────────
describe('RouteList.vue 集群分组与双模式（list-pages-console-restyle）', () => {
  const groupRoutes = {
    total: 4,
    page: 1,
    page_size: 20,
    items: [
      {
        id: 1,
        name: 'alpha',
        uri: '/a/*',
        methods: 'GET',
        cluster_id: 1,
        cluster_name: '生产集群',
        priority: 10,
        current_version: 3,
        published_at: '2026-01-15T10:30:00Z',
        pending_publish: false,
        status: 1,
      },
      // partial 态真实形状：pending=false + last_publish_status=partial（PublishStatusTag 判定序：待发布优先于 partial）
      {
        id: 2,
        name: 'beta',
        uri: '/b/*',
        methods: 'GET,POST,PUT,DELETE',
        cluster_id: 1,
        cluster_name: '生产集群',
        priority: 0,
        current_version: 2,
        published_at: '2026-01-16T10:30:00Z',
        pending_publish: false,
        last_publish_status: 'partial',
        status: 1,
      },
      {
        id: 3,
        name: 'gamma',
        uri: '/c/*',
        methods: 'POST',
        cluster_id: 2,
        cluster_name: '预发集群',
        priority: 5,
        current_version: 1,
        published_at: '2026-01-17T10:30:00Z',
        pending_publish: true,
        status: 1,
      },
      {
        id: 4,
        name: 'delta',
        uri: '/d/*',
        methods: 'GET',
        cluster_id: 2,
        cluster_name: '预发集群',
        priority: 1,
        current_version: null,
        published_at: null,
        pending_publish: false,
        status: 1,
      },
    ],
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: groupRoutes })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  const routeStubs = {
    ...stubs,
    ATable: {
      name: 'GroupStubTable',
      template: `
        <div class="mock-a-table">
          <template v-for="r in dataSource" :key="r.key || r.id">
            <div v-if="r.__groupHeader" data-test="group-header"><slot name="bodyCell" :record="r" :column="{ key: 'group' }" /></div>
            <div v-else class="mock-row"><slot name="bodyCell" :record="r" :column="{ key: 'uri' }" /></div>
          </template>
        </div>
      `,
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
    },
  }

  async function mountPage() {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: routeStubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('默认分组渲染：组头芯片 = 数量+已发布+待发布+部分失败（PublishStatusTag 同序判定）', async () => {
    const wrapper = await mountPage()
    expect((wrapper.vm as any).viewMode).toBe('group')
    const headers = wrapper.findAll('[data-test="group-header"]')
    expect(headers).toHaveLength(2)
    const prod = headers[0].text()
    expect(prod).toContain('生产集群')
    expect(prod).toContain('2 路由')
    expect(prod).toContain('1 已发布')
    expect(prod).toContain('1 部分失败')
    expect(prod).not.toContain('待发布')
    const staging = headers[1].text()
    expect(staging).toContain('预发集群')
    expect(staging).toContain('2 路由')
    expect(staging).toContain('1 待发布')
    expect(staging).not.toContain('部分失败')
    expect(staging).not.toContain('已发布')
    const colKeys = wrapper.findComponent({ name: 'GroupStubTable' }).props('columns') as Array<{ key: string }>
    expect(colKeys.map((c) => c.key)).not.toContain('cluster_name')
    expect(colKeys.map((c) => c.key)).not.toContain('methods')
    expect(colKeys.map((c) => c.key)).toContain('uri')
    wrapper.unmount()
  })

  it('组内固定序 = 优先级升序（跨集群组互不影响）', async () => {
    const wrapper = await mountPage()
    // 合并列行的可识别锚 = pipe-uri（URI 段）；生产组 beta(P0)→alpha(P10)，预发组 delta(P1)→gamma(P5)
    const uris = wrapper.findAll('.mock-row .pipe-uri').map((u) => u.text())
    expect(uris).toEqual(['/b/*', '/a/*', '/d/*', '/c/*'])
    wrapper.unmount()
  })

  it('请求匹配合并列：方法 chips 段 + URI 段；取消「方法」勾选仅剩 URI；两键全关整列消失', async () => {
    const wrapper = await mountPage()
    // 默认两键勾选：beta（4 方法 >3 → slice(0,3) + 溢出计数）行渲染 chips 与 pipe-uri
    const betaRow = wrapper.findAll('.mock-row').find((r) => r.find('.pipe-uri').text() === '/b/*')
    expect(betaRow).toBeDefined()
    expect(betaRow!.findAll('.m-tag').map((m) => m.text())).toEqual(['GET', 'POST', 'PUT', '+1'])
    expect(betaRow!.find('.pipe-uri').text()).toBe('/b/*')
    // 取消「方法」→ chips 段消失、URI 段保留
    ;(wrapper.vm as any).columnsSelected = [
      'index',
      'name',
      'uri',
      'upstream',
      'priority',
      'publish_status',
      'created_at',
      'actions',
    ]
    await wrapper.vm.$nextTick()
    const betaRow2 = wrapper.findAll('.mock-row').find((r) => r.find('.pipe-uri').text() === '/b/*')
    expect(betaRow2!.findAll('.m-tag')).toHaveLength(0)
    expect(betaRow2!.find('.pipe-uri').text()).toBe('/b/*')
    // uri 也取消 → 合并列整列消失
    ;(wrapper.vm as any).columnsSelected = [
      'index',
      'name',
      'upstream',
      'priority',
      'publish_status',
      'created_at',
      'actions',
    ]
    await wrapper.vm.$nextTick()
    const colKeys = wrapper.findComponent({ name: 'GroupStubTable' }).props('columns') as Array<{ key: string }>
    expect(colKeys.map((c) => c.key)).not.toContain('uri')
    wrapper.unmount()
  })

  it('四步主流程：切平铺（排序键休眠恢复生效）→ 切分组（组内固定序）→ 回平铺（排序原样恢复）', async () => {
    const wrapper = await mountPage()
    const lastParams = () => {
      const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
      return (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
    }
    // ① 切平铺：重查且不带排序参数（尚未排序）
    await wrapper.find('[data-test="view-mode-flat"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-test="group-header"]')).toHaveLength(0)
    expect(lastParams().sort_by).toBeUndefined()
    // ② 平铺下排序
    ;(wrapper.vm as any).sortBy = 'priority'
    ;(wrapper.vm as any).sortOrder = 'asc'
    await (wrapper.vm as any).loadRoutes()
    await flushPromises()
    expect(lastParams().sort_by).toBe('priority')
    // ③ 切分组：组头恢复，请求不带排序参数（休眠），排序键保留
    await wrapper.find('[data-test="view-mode-group"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-test="group-header"]')).toHaveLength(2)
    expect(lastParams().sort_by).toBeUndefined()
    expect((wrapper.vm as any).sortBy).toBe('priority')
    // ④ 回平铺：排序参数原样恢复
    await wrapper.find('[data-test="view-mode-flat"]').trigger('click')
    await flushPromises()
    expect(lastParams().sort_by).toBe('priority')
    expect(lastParams().sort_order).toBe('asc')
    wrapper.unmount()
  })

  it('页头只留总数徽标，状态分布交给第二行 chips（filter-architecture D3）', async () => {
    const wrapper = await mountPage()
    const stats = wrapper.findAll('[data-test="page-stat"]').map((s) => s.text())
    // 页头 = 补充维度「涉及 N 上游」（G3-甲）
    expect(stats[0]).toContain('上游')
    expect(stats.join(' ')).not.toContain('已发布')
    expect(stats.join(' ')).not.toContain('待发布')
    expect(stats.join(' ')).not.toContain('未发布')
    // chips 行不再承载「共 N 条路由」（与分页条重复，r8-3.2 裁决）
    expect(wrapper.find('[data-test="route-count"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-count"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('刷新按钮：重拉列表+统计副本，不重置筛选/排序键/视图模式（D6）', async () => {
    const wrapper = await mountPage()
    const callsBefore = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes').length
    await wrapper.find('[data-test="toolbar-refresh"]').trigger('click')
    await flushPromises()
    const callsAfter = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes').length
    expect(callsAfter).toBeGreaterThan(callsBefore)
    expect((wrapper.vm as any).viewMode).toBe('group')
    wrapper.unmount()
  })
})

describe('RouteList 插件引用深链（批 7 bug4A：?plugin= 预选「全部插件」下拉）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: { total: 0, page: 1, page_size: 20, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }] } })
      // 插件下拉选项集 = /plugins/builtin（约束 #204：深链值必须命中 option 才有选中态）
      if (url === '/plugins/builtin')
        return Promise.resolve({ data: { plugins: [{ name: 'cors', display_name: 'CORS' }] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('?plugin=<name> → pluginFilter 预选 + 首屏请求携带 plugin 参数（服务端过滤）', async () => {
    mockRouteQuery = { plugin: 'cors' }
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()
    // 下拉预选（原生 select.l5-select，值 = 插件名）
    const pluginSelect = wrapper.findAll('select').find((s) => s.text().includes('全部插件'))
    expect(pluginSelect).toBeDefined()
    expect((pluginSelect!.element as HTMLSelectElement).value).toBe('cors')
    // 请求带 plugin 参数（服务端过滤）
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    expect(calls.length).toBeGreaterThan(0)
    expect((calls[calls.length - 1][1] as { params: Record<string, unknown> }).params).toMatchObject({ plugin: 'cors' })
    mockRouteQuery = {}
    wrapper.unmount()
  })
})
