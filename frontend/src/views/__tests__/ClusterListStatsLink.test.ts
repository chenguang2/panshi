import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

const mockStorage: Record<string, string> = {}

function mockLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => { mockStorage[key] = value },
    removeItem: (key: string) => { delete mockStorage[key] },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) },
    get length() { return Object.keys(mockStorage).length },
    key: (i: number) => Object.keys(mockStorage)[i] ?? null,
  })
}

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) }
}))

const MOCK_CLUSTERS = {
  total: 1, page: 1, page_size: 20,
  items: [{
    id: 5, name: 'prod-cluster', display_name: '生产集群',
    status: 1, group_name: '生产',
    node_count: 5, healthy_node_count: 3,
    upstream_count: 12, route_count: 8,
    plugin_config_count: 4, global_rule_count: 2,
    plugin_metadata_count: 6, static_resource_count: 1,
    nodes: [
      { id: 1, ip: '192.168.1.1', service_port: 80, management_port: 16620, status: 1 },
    ],
  }]
}

describe('ClusterList.vue - 集群卡片统计链接', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters' || url === '/clusters/my') {
        return Promise.resolve({ data: MOCK_CLUSTERS })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: 'Home', component: { template: '<div />' } },
      { path: '/nodes', name: 'NodeList', component: { template: '<div />' } },
      { path: '/upstreams', name: 'UpstreamList', component: { template: '<div />' } },
      { path: '/routes', name: 'RouteList', component: { template: '<div />' } },
      { path: '/plugin-configs', name: 'PluginConfigList', component: { template: '<div />' } },
      { path: '/global-rules', name: 'GlobalRuleList', component: { template: '<div />' } },
      { path: '/plugin-metadata', name: 'PluginMetadataList', component: { template: '<div />' } },
      { path: '/static-resources', name: 'StaticResourceList', component: { template: '<div />' } },
    ]
  })

  it('统计数字应渲染为 router-link', async () => {
    const ClusterList = await import('@/views/ClusterList.vue')
    const wrapper = mount(ClusterList.default, {
      global: { plugins: [router], stubs: { ClusterFormModal: true } }
    })
    await router.isReady()
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()

    const links = wrapper.findAll('a')
    const statLinks = links.filter(l => {
      const href = l.attributes('href') || ''
      return ['/nodes', '/upstreams', '/routes', '/plugin-configs',
              '/global-rules', '/plugin-metadata', '/static-resources']
        .some(path => href.startsWith(path))
    })
    expect(statLinks.length).toBeGreaterThanOrEqual(7)
  })

  it('路由链接应携带正确的 cluster_id 参数', async () => {
    const ClusterList = await import('@/views/ClusterList.vue')
    const wrapper = mount(ClusterList.default, {
      global: { plugins: [router], stubs: { ClusterFormModal: true } }
    })
    await router.isReady()
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()

    const routeLink = wrapper.find('a[href^="/routes?cluster_id=5"]')
    expect(routeLink.exists()).toBe(true)
  })

  it('节点统计 "3/5" 也应渲染为链接', async () => {
    const ClusterList = await import('@/views/ClusterList.vue')
    const wrapper = mount(ClusterList.default, {
      global: { plugins: [router], stubs: { ClusterFormModal: true } }
    })
    await router.isReady()
    await new Promise(r => setTimeout(r, 200))
    await wrapper.vm.$nextTick()

    const nodeLink = wrapper.find('a[href^="/nodes?cluster_id=5"]')
    expect(nodeLink.exists()).toBe(true)
  })
})
