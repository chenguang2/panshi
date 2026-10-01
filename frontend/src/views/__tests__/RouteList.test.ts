import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'RouteList', query: {} }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  RouteFormModal: { template: '<div class="mock-route-form" />', props: ['visible', 'editingRoute', 'clusters'] },
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
