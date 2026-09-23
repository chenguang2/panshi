import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { useFeaturesStore } from '@/stores/features'

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

describe('ClusterList.vue - 连接测试 · 经中继 / 直连 标注', () => {
  function newRouter() {
    return createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }],
    })
  }

  const cluster = {
    id: 1,
    name: 'demo-cluster',
    display_name: '演示集群',
    group_name: '',
    status: 1,
    node_count: 1,
    healthy_node_count: 1,
    upstream_count: 0,
    route_count: 0,
    plugin_config_count: 0,
    global_rule_count: 0,
    static_resource_count: 0,
    plugin_metadata_count: 0,
    nodes: [],
  }

  async function runConnectionTest(results: unknown[]) {
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [cluster] } })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: { items: [{ id: 10, ip: '192.168.0.14', management_port: 16620, service_port: 16610, status: 1 }] },
        })
      }
      return Promise.resolve({ data: {} })
    })
    mockApiPost.mockResolvedValue({ data: { results } })

    const ClusterList = (await import('@/views/ClusterList.vue')).default
    const router = newRouter()
    const wrapper = mount(ClusterList, { global: { plugins: [router] } })
    await flushPromises()
    await flushPromises()

    const openBtn = wrapper.findAll('button').find((b) => b.text().includes('连接测试'))
    expect(openBtn).toBeTruthy()
    await openBtn!.trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()

    const runBtn = wrapper.findAll('button').find((b) => b.text().trim() === '开始测试')
    expect(runBtn).toBeTruthy()
    await runBtn!.trigger('click')
    await flushPromises()
    return wrapper
  }

  const rows = (wrapper: { findAll: (s: string) => { text: () => string }[] }) =>
    wrapper.findAll('.test-log-row').map((r) => r.text())

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('route=relay → 结果行尾（经中继）', async () => {
    const wrapper = await runConnectionTest([
      { node_id: 10, ip: '192.168.0.14', port: 16620, ok: true, msg: '', route: 'relay', relay_via: 'aoh-gw' },
    ])
    expect(rows(wrapper).some((t) => t.includes('192.168.0.14:16620 连接成功（经中继）'))).toBe(true)
  })

  it('route=direct → 结果行尾（直连）', async () => {
    const wrapper = await runConnectionTest([
      { node_id: 10, ip: '192.168.0.14', port: 16620, ok: true, msg: '', route: 'direct' },
    ])
    expect(rows(wrapper).some((t) => t.includes('192.168.0.14:16620 连接成功（直连）'))).toBe(true)
  })

  it('失败行同样带标注（经中继 + 白名单 msg）', async () => {
    const wrapper = await runConnectionTest([
      {
        node_id: 10,
        ip: '192.168.0.14',
        port: 16620,
        ok: false,
        msg: '目标不在该局网关白名单，请执行配置下发',
        route: 'relay',
      },
    ])
    expect(rows(wrapper).some((t) => t.includes('连接失败 — 目标不在该局网关白名单，请执行配置下发（经中继）'))).toBe(
      true,
    )
  })

  it('无 route 字段 → 不显示任何路径标注（向后兼容）', async () => {
    const wrapper = await runConnectionTest([{ node_id: 10, ip: '192.168.0.14', port: 16620, ok: true, msg: '' }])
    const text = wrapper.text()
    expect(text).toContain('192.168.0.14:16620 连接成功')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })
})
