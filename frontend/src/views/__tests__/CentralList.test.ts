import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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

describe('CentralList.vue - 连接测试 · 经中继 / 直连 标注', () => {
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
      if (url === '/clusters') return Promise.resolve({ data: { items: [cluster], total: 1 } })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: { items: [{ id: 10, ip: '192.168.0.14', management_port: 16620, service_port: 16610, status: 1 }] },
        })
      }
      return Promise.resolve({ data: {} })
    })
    mockApiPost.mockResolvedValue({ data: { results } })

    const CentralList = (await import('@/views/CentralList.vue')).default
    const router = newRouter()
    const wrapper = mount(CentralList, { global: { plugins: [router] } })
    await flushPromises()
    await flushPromises()
    await wrapper.vm.$nextTick()

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

  it('无 route 字段 → 不显示任何路径标注（向后兼容）', async () => {
    const wrapper = await runConnectionTest([{ node_id: 10, ip: '192.168.0.14', port: 16620, ok: true, msg: '' }])
    const text = wrapper.text()
    expect(text).toContain('192.168.0.14:16620 连接成功')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })
})
