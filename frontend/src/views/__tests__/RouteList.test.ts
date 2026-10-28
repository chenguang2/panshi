import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'
import { aTableStub } from '../../components/__tests__/helpers/aTableStub'
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
    message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  }
})

// 7.6：深链 ?cluster_id= 用例需要可变 query（RouteListClusterId.test.ts 同款模式）
let mockRouteQuery: Record<string, string> = {}

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  RouteFormModal: {
    name: 'MockRouteForm',
    template: '<div class="mock-route-form" />',
    props: ['visible', 'editingRoute', 'clusters', 'copyingRoute', 'defaultClusterId'],
  },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  PublishConfirmModal: { template: '<div class="mock-publish-modal" />' },
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
    // After mount, count how many /routes calls we had
    const mountRouteCalls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes').length
    // Simulate user selecting a plugin via DOM
    const select = wrapper.find('select.plugin-filter').element as HTMLSelectElement
    select.value = 'limit-req'
    select.dispatchEvent(new Event('change'))
    await flushPromises()
    // There should be one more /routes call after the change
    const totalRouteCalls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes').length
    expect(totalRouteCalls).toBe(mountRouteCalls + 1)
    // 组件把选中插件作为 params.plugin 传给 /routes
    const routeCalls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes')
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
              '<table class="mock-a-table"><tbody><tr v-for="r in dataSource" :key="r.id"><td><slot name="bodyCell" :record="r" :column="{ key: \'name\' }" /></td></tr></tbody></table>',
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
        '<div class="mock-a-table"><div v-for="r in dataSource" :key="r.id" class="mock-row"><slot name="bodyCell" :record="r" :column="{ key: \'name\' }" /></div><button class="mock-goto-page2" @click="$emit(\'change\', { current: 2, pageSize: 20 })">去第2页</button><button class="mock-goto-page3" @click="$emit(\'change\', { current: 3, pageSize: 20 })">去第3页</button></div>',
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
    const clusterSelect = wrapper.findAll('select').find((s) => s.text().includes('全部集群'))
    expect(clusterSelect).toBeDefined()
    await clusterSelect!.setValue('1')
    await flushPromises()
    let calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    let params = (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
    expect(params.page).toBe(1)
    expect(params.cluster_id).toBe(1)
    expect(mockApiGet.mock.calls.some((c: unknown[]) => c[0] === '/clusters/1/upstreams')).toBe(true)

    // 清空集群选择（选回「全部集群」）：page 保持 1，cluster_id 不再携带
    await clusterSelect!.setValue('')
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

  it('发布状态筛选含「待发布」选项（值 pending），选择后请求携带 publish_status=pending', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: pubStateStubs } })
    await flushPromises()
    const publishSelect = wrapper.findAll('select').find((s) => s.text().includes('已发布'))
    expect(publishSelect).toBeDefined()
    const pendingOption = publishSelect!.findAll('option').find((o) => o.element.value === 'pending')
    expect(pendingOption?.text()).toBe('待发布')
    await publishSelect!.setValue('pending')
    await flushPromises()
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/routes')
    const params = (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
    expect(params.publish_status).toBe('pending')
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
          <div v-for="r in dataSource" :key="r.id" class="mock-row"><slot name="bodyCell" :record="r" :column="{ key: 'name' }" /></div>
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

  it('列宽：发布状态定宽 160（日期超宽走省略+tooltip）、操作列 110 容纳行内发布+菜单（拍平后不挤）', async () => {
    const wrapper = await mountPage()
    const cols = (wrapper.vm as any).columns as Array<Record<string, unknown>>
    const byKey = (k: string) => cols.find((c) => c.key === k) as Record<string, unknown> | undefined
    expect(byKey('publish_status')?.width).toBe(160)
    expect(byKey('actions')?.width).toBe(110)
    wrapper.unmount()
  })

  it('表头排序透传服务端参数：ascend→sort_by=name&sort_order=asc；descend→desc', async () => {
    const wrapper = await mountPage()
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
    await clickSort(wrapper, 'sort-name-desc')
    await clickSort(wrapper, 'sort-name-clear')
    expect(lastRouteParams().sort_by).toBeUndefined()
    expect(lastRouteParams().sort_order).toBeUndefined()
    wrapper.unmount()
  })

  it('白名单外字段（cluster_name，本地 sorter 已移除）即使误发也不产生排序参数（值域守卫）', async () => {
    const wrapper = await mountPage()
    await clickSort(wrapper, 'sort-cluster-asc')
    expect(lastRouteParams().sort_by).toBeUndefined()
    wrapper.unmount()
  })

  it('排序后翻页：page=2 且排序参数保持（同参数重发）', async () => {
    const wrapper = await mountPage()
    await clickSort(wrapper, 'sort-priority-desc')
    await wrapper.find('.mock-goto-page2').trigger('click')
    await flushPromises()
    expect(lastRouteParams().page).toBe(2)
    expect(lastRouteParams().sort_by).toBe('priority')
    expect(lastRouteParams().sort_order).toBe('desc')
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
        '<table class="mock-a-table"><tbody><tr v-for="r in dataSource" :key="r.id"><td><slot name="bodyCell" :record="r" :column="{ key: \'actions\' }" /></td></tr></tbody></table>',
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

    const delItem = wrapper.findAll('.mock-menu-item').find((b) => b.text() === '删除')
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

    const clusterSelect = wrapper.findAll('select').find((s) => s.text().includes('全部集群'))
    expect(clusterSelect).toBeDefined()
    const options = clusterSelect!.findAll('option')
    expect(options.map((o) => o.text().trim())).toEqual(['全部集群', '授权集群甲', '授权集群乙'])
    expect(options.map((o) => (o.element as HTMLOptionElement).value)).toEqual(['', '5', '9'])
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
    const publishSelect = wrapper.findAll('select').find((s) => s.text().includes('已发布'))
    await publishSelect!.setValue('published')
    await flushPromises()
    expect(wrapper.text()).toContain('没有符合条件路由')
    expect(wrapper.text()).not.toContain('尚未创建路由')
    const btn = wrapper.findAll('button').find((b) => b.text() === '清空筛选')
    expect(btn, '有筛选空态应有「清空筛选」按钮').toBeDefined()
    wrapper.unmount()
  })

  it('清空筛选：重置全部筛选（含分组下拉回「全部分组」，C8）并重查', async () => {
    const wrapper = await mountEmpty()

    // 设置三个筛选：分组=线上、发布状态=已发布、方法 chip=GET
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    await groupSelect!.setValue('线上')
    await flushPromises()
    expect(lastRouteParams().group_name).toBe('线上')
    const publishSelect = wrapper.findAll('select').find((s) => s.text().includes('已发布'))
    await publishSelect!.setValue('published')
    await flushPromises()
    const getChip = wrapper.findAll('.filter-chip').find((c) => c.text() === 'GET')
    await getChip!.trigger('click')
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
    return wrapper.findAll('.filter-chip.active').map((c) => c.text().trim())
  }

  it('chips 收敛为常驻 6 个：全部/GET/POST/PUT/DELETE/PATCH', async () => {
    const wrapper = await mountPage()
    const chips = wrapper.findAll('.filter-chip').map((c) => c.text().trim())
    expect(chips).toEqual(['全部', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
    wrapper.unmount()
  })

  it('「方法」下拉含全量方法，与 chips 同值双向联动', async () => {
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

    // chips → 下拉：点 POST chip，下拉值同步为 POST
    const postChip = wrapper.findAll('.filter-chip').find((c) => c.text() === 'POST')
    await postChip!.trigger('click')
    await flushPromises()
    expect((methodSelect.element as HTMLSelectElement).value).toBe('POST')
    expect(lastRouteParams().method).toBe('POST')

    // 下拉 → chips：选 HEAD（无对应 chip）→ 无任何 chip 高亮（「全部」仅在 method 为空时亮）
    await methodSelect.setValue('HEAD')
    await flushPromises()
    expect(lastRouteParams().method).toBe('HEAD')
    expect(activeChipLabels(wrapper)).toEqual([])

    // 下拉 → chips：清回「全部方法」→「全部」chip 高亮、参数不带 method
    await methodSelect.setValue('')
    await flushPromises()
    expect(lastRouteParams().method).toBeUndefined()
    expect(activeChipLabels(wrapper)).toEqual(['全部'])
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
        '<table class="mock-a-table"><tbody><tr v-for="r in dataSource" :key="r.id"><td><slot name="bodyCell" :record="r" :column="{ key: \'actions\' }" /></td></tr></tbody></table>',
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
        '<table class="mock-a-table"><tbody><tr v-for="r in dataSource" :key="r.id"><td><slot name="bodyCell" :record="r" :column="{ key: \'actions\' }" /></td></tr></tbody></table>',
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
    const pubBtn = normalRow.findAll('button.mock-btn').find((b) => b.text() === '发布')
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

    const rows = wrapper.findAll('.mock-a-table tbody tr')
    const menuItems = rows[1].findAll('.mock-menu-item').map((i) => i.text())
    expect(menuItems).toEqual(['编辑', '版本管理', '复制路由', '删除'])
    expect(menuItems).not.toContain('发布')
  })

  it('DNS 行：发布与 ⋯ 全部禁用 + tooltip 指路（7.9 模式延伸到拍平按钮）', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs: flatStubs } })
    await flushPromises()

    const rows = wrapper.findAll('.mock-a-table tbody tr')
    const dnsRow = rows[0]
    const btns = dnsRow.findAll('button.mock-btn')
    expect(btns.length).toBe(2) // 发布 + ⋯
    for (const b of btns) expect(b.attributes('disabled')).toBeDefined()
    const tips = dnsRow.findAll('.mock-tooltip')
    expect(tips.length).toBe(2)
    for (const t of tips) expect(t.attributes('title')).toBe('DNS 路由请在「DNS 代理」页管理')
    wrapper.unmount()
  })
})
