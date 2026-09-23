import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { useFeaturesStore } from '@/stores/features'

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockListRelayGateways = vi.fn()
vi.mock('@/api/relay', () => ({
  listRelayGateways: (...args: any[]) => mockListRelayGateways(...args),
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

describe('ClusterList.vue - 集群管理页面', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
  })

  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }],
  })

  it('应该渲染页面标题"集群管理"', async () => {
    const ClusterList = await import('@/views/ClusterList.vue')
    const wrapper = mount(ClusterList.default, {
      global: { plugins: [router] },
    })
    await router.isReady()
    expect(wrapper.text()).toContain('集群管理')
  })

  it('应该显示新建集群按钮', async () => {
    const ClusterList = await import('@/views/ClusterList.vue')
    const wrapper = mount(ClusterList.default, {
      global: { plugins: [router] },
    })
    await router.isReady()
    expect(wrapper.text()).toContain('新建集群')
  })
})

describe('ClusterList.vue - 经中继 / 直连 徽章', () => {
  function makeCluster(region_code: string) {
    return {
      id: 1,
      name: 'demo-cluster',
      display_name: '演示集群',
      group_name: '',
      status: 1,
      region_code,
      node_count: 0,
      healthy_node_count: 0,
      upstream_count: 0,
      route_count: 0,
      plugin_config_count: 0,
      global_rule_count: 0,
      static_resource_count: 0,
      plugin_metadata_count: 0,
      nodes: [],
    }
  }

  function newRouter() {
    return createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }],
    })
  }

  async function mountWith(
    clusters: unknown[],
    opts: { relayOn?: boolean; relayFail?: boolean; regionNames?: { code: string; name: string }[] } = {},
  ) {
    const { relayOn = true, relayFail = false, regionNames = [{ code: 'aoh', name: '上海局' }] } = opts
    setActivePinia(createPinia())
    const features = useFeaturesStore()
    features.features = { relay_gateway: relayOn }
    features.loaded = true

    mockApiGet.mockResolvedValue({ data: { items: clusters } })
    if (relayFail) mockListRelayGateways.mockRejectedValue(new Error('403'))
    else mockListRelayGateways.mockResolvedValue({ data: regionNames })

    const ClusterList = (await import('@/views/ClusterList.vue')).default
    const router = newRouter()
    const wrapper = mount(ClusterList, { global: { plugins: [router] } })
    await flushPromises()
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
  })

  it('区域非空 + 中继启用 → 显示「经中继 · 区域名」', async () => {
    const wrapper = await mountWith([makeCluster('aoh')])
    expect(wrapper.find('.cl-route-badge').text()).toBe('经中继 · 上海局')
  })

  it('区域为空 → 显示「直连」', async () => {
    const wrapper = await mountWith([makeCluster('')])
    expect(wrapper.find('.cl-route-badge').text()).toBe('直连')
  })

  it('中继未启用（区域残留）→ 一律「直连」', async () => {
    const wrapper = await mountWith([makeCluster('aoh')], { relayOn: false })
    expect(wrapper.find('.cl-route-badge').text()).toBe('直连')
  })

  it('listRelayGateways 失败 → 按未启用处理并显示「直连」', async () => {
    const wrapper = await mountWith([makeCluster('aoh')], { relayFail: true })
    expect(wrapper.find('.cl-route-badge').text()).toBe('直连')
  })

  it('取不到区域名 → 退化为显示 region_code', async () => {
    const wrapper = await mountWith([makeCluster('zzz')], { regionNames: [{ code: 'aoh', name: '上海局' }] })
    expect(wrapper.find('.cl-route-badge').text()).toBe('经中继 · zzz')
  })
})
