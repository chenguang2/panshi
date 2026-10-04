// 方案 A（用户拍板）：统一管理统计格点击 → 打开本页该集群多 Tab 资源浏览器并直切对应 Tab，
// 不再跳全局资源列表页。集群管理（ClusterList）不受影响（不传 stat-click，保持 router-link）。
// mock 形状取自真实后端（/clusters 列表 + /clusters/{id}/nodes|upstreams|routes 分页），URL 感知（约定 #43）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockStorage: Record<string, string> = {}

function mockLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value
    },
    removeItem: (key: string) => {
      delete mockStorage[key]
    },
    clear: () => {
      Object.keys(mockStorage).forEach((k) => delete mockStorage[k])
    },
    get length() {
      return Object.keys(mockStorage).length
    },
    key: (i: number) => Object.keys(mockStorage)[i] ?? null,
  })
}

const cluster = {
  id: 1,
  name: 'demo-cluster',
  display_name: '演示集群',
  description: '',
  group_name: '生产',
  status: 1,
  region_code: '',
  node_count: 1,
  healthy_node_count: 1,
  upstream_count: 2,
  route_count: 3,
  plugin_config_count: 4,
  global_rule_count: 5,
  plugin_metadata_count: 6,
  static_resource_count: 7,
  nodes: [{ id: 10, cluster_id: 1, ip: '192.168.0.14', service_port: 16610, management_port: 16620, status: 1 }],
}

async function mountPage(): Promise<VueWrapper> {
  setActivePinia(createPinia())
  mockLocalStorage()
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
  localStorage.setItem('token', 'mock-token')
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/clusters') return Promise.resolve({ data: { items: [cluster], total: 1 } })
    if (url.startsWith('/clusters/1/nodes')) return Promise.resolve({ data: { items: cluster.nodes, total: 1 } })
    if (url.startsWith('/clusters/1/upstreams')) return Promise.resolve({ data: { items: [], total: 0 } })
    if (url.startsWith('/clusters/1/routes')) return Promise.resolve({ data: { items: [], total: 0 } })
    return Promise.resolve({ data: {} })
  })

  const CentralList = (await import('@/views/CentralList.vue')).default
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  const wrapper = mount(CentralList, { global: { plugins: [router] } })
  await router.isReady()
  await flushPromises()
  await flushPromises()
  return wrapper
}

function statCells(wrapper: VueWrapper) {
  return wrapper.findAll('.cl-card .cl-stat-cell.cl-stat-link')
}

describe('统一管理 · 统计格点击 → 本页集群详情 Tab（方案 A）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('默认（未点击）：不出现展开视图', async () => {
    const wrapper = await mountPage()
    expect(statCells(wrapper).length).toBe(7)
    expect(wrapper.find('.card-expanded').exists()).toBe(false)
    wrapper.unmount()
  })

  it('点击「上游」格 → 打开该集群多 Tab 浏览器并直切上游 Tab', async () => {
    const wrapper = await mountPage()
    await statCells(wrapper)[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.card-expanded[data-cluster-id="1"]').exists()).toBe(true)
    expect(wrapper.find('.card-expanded .dt.active').text()).toContain('上游')
    wrapper.unmount()
  })

  it('点击「路由」格 → 直切路由 Tab', async () => {
    const wrapper = await mountPage()
    await statCells(wrapper)[2].trigger('click')
    await flushPromises()
    expect(wrapper.find('.card-expanded[data-cluster-id="1"]').exists()).toBe(true)
    expect(wrapper.find('.card-expanded .dt.active').text()).toContain('路由')
    wrapper.unmount()
  })

  it('点击「插件元数据」格 → 直切 globalPlugins Tab（cell 与 Tab 标签同为插件元数据）', async () => {
    const wrapper = await mountPage()
    await statCells(wrapper)[5].trigger('click')
    await flushPromises()
    const active = wrapper.find('.card-expanded .dt.active')
    expect(active.text()).toContain('插件元数据')
    wrapper.unmount()
  })
})
