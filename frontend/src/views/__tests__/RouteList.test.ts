import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

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
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads routes on mount', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/routes', expect.any(Object))
  })

  it('renders method filter chips', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('GET')
    expect(wrapper.text()).toContain('POST')
  })

  it('loads plugin options on mount', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/plugins/builtin')
  })

  it('renders plugin dropdown in filter bar', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    const pluginSelect = wrapper.find('select.plugin-filter')
    expect(pluginSelect.exists()).toBe(true)
    expect(pluginSelect.text()).toContain('限流')
    expect(pluginSelect.text()).toContain('密钥认证')
  })

  it('passes plugin param when filter is selected', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    // After mount, count how many /routes calls we had
    const mountRouteCalls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes').length
    // Simulate user selecting a plugin via DOM
    const select = wrapper.find('select.plugin-filter').element as HTMLSelectElement
    select.value = 'limit-req'
    select.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 300))
    await wrapper.vm.$nextTick()
    // There should be one more /routes call after the change
    const totalRouteCalls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes').length
    expect(totalRouteCalls).toBe(mountRouteCalls + 1)
    // 组件把选中插件作为 params.plugin 传给 /routes
    const routeCalls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes')
    const lastCall = routeCalls[routeCalls.length - 1]
    expect(lastCall[1].params.plugin).toBe('limit-req')
  })

  // ── Group Filter Tests ──

  it('renders group filter select before cluster filter', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const selects = wrapper.findAll('select')
    const groupIdx = selects.findIndex((s) => s.text().includes('全部分组'))
    const clusterIdx = selects.findIndex((s) => s.text().includes('全部集群'))
    expect(groupIdx).toBeGreaterThanOrEqual(0)
    expect(clusterIdx).toBeGreaterThanOrEqual(0)
    expect(groupIdx).toBeLessThan(clusterIdx)
  })

  it('populates group filter options from cluster group_names', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const options = groupSelect!.findAll('option')
    const optionTexts = options.map((o) => o.text())
    expect(optionTexts).toContain('线上')
    expect(optionTexts).toContain('预发')
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
    await new Promise((r) => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    // DNS 路由（plugins 含 dns_upstream）在名称列渲染 DNS 徽章
    const badge = wrapper.find('.dns-route-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('DNS')
  })

  it('always passes group_name in API request', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    const routeCalls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes')
    expect(routeCalls.length).toBeGreaterThan(0)
    for (const call of routeCalls) {
      expect(call[1].params.group_name).toBeDefined()
    }
  })
})
