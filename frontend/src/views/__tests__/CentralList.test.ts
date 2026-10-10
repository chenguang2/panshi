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

// ── F1-NEW-08：节点表单 IP 校验接线（模板 :rules validator 绑定 composable 的真实 validateIP） ──

describe('CentralList.vue 节点表单 IP 校验接线', () => {
  it('表单绑定的 validateIP 拒绝非法 IP 并给出规范错误文案', async () => {
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [], total: 0 } })
      return Promise.resolve({ data: {} })
    })

    const CentralList = (await import('@/views/CentralList.vue')).default
    const router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }],
    })
    const wrapper = mount(CentralList, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    // 打开添加节点弹窗（showAddNodeModal(cluster) 内部先 loadNodes），确认表单状态就绪
    const vm = wrapper.vm as any
    await vm.showAddNodeModal({ id: 1, name: 'demo-cluster', display_name: '演示集群', nodes: [] })
    await flushPromises()
    expect(vm.nodeModalVisible).toBe(true)
    expect(typeof vm.validateIP).toBe('function')

    // 非法输入：AntDV 校验器契约 —— callback(错误文案)
    const invalid = vi.fn()
    vm.validateIP({}, '999.1.1.1', invalid)
    expect(invalid).toHaveBeenCalledTimes(1)
    expect(invalid).toHaveBeenCalledWith('请输入合法的IP地址')

    // 空值走必填分支文案
    const empty = vi.fn()
    vm.validateIP({}, '', empty)
    expect(empty).toHaveBeenCalledWith('请输入IP地址')

    // 合法输入：无参 callback()
    const ok = vi.fn()
    vm.validateIP({}, '10.0.0.1', ok)
    expect(ok).toHaveBeenCalledTimes(1)
    expect(ok.mock.calls[0]).toEqual([])

    wrapper.unmount()
  })
})

// ── B2（cluster-ux-close-loop）：连接测试交互统一 ──────────────────────────
describe('CentralList.vue - 连接测试交互统一（B2）', () => {
  const cluster = {
    id: 1,
    name: 'demo-cluster',
    display_name: '演示集群',
    group_name: '',
    status: 1,
    region_code: 'aoh',
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

  async function openTestModal(opts?: { role?: string; permissions?: string[] }) {
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'u1', role: opts?.role ?? 'admin' }))
    if (opts?.permissions) localStorage.setItem('permissions', JSON.stringify(opts.permissions))
    localStorage.setItem('token', 'mock-token')
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters' || url === '/clusters/my')
        return Promise.resolve({ data: { items: [cluster], total: 1 } })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: { items: [{ id: 10, ip: '192.168.0.14', management_port: 16620, service_port: 16610, status: 1 }] },
        })
      }
      return Promise.resolve({ data: {} })
    })
    const CentralList = (await import('@/views/CentralList.vue')).default
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'Dashboard', component: { template: '<div />' } },
        { path: '/relay-gateways', name: 'RelayGateways', component: { template: '<div />' } },
      ],
    })
    const wrapper = mount(CentralList, { global: { plugins: [router] } })
    await flushPromises()
    const openBtn = wrapper.findAll('button').find((b) => b.text().includes('连接测试'))
    expect(openBtn).toBeTruthy()
    await openBtn!.trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()
    return { wrapper, router }
  }

  async function runTest(results: unknown[], opts?: { postReject?: Error; role?: string; permissions?: string[] }) {
    const ctx = await openTestModal(opts)
    if (opts?.postReject) mockApiPost.mockRejectedValue(opts.postReject)
    else mockApiPost.mockResolvedValue({ data: { results } })
    const runBtn = ctx.wrapper.findAll('button').find((b) => b.text().trim() === '开始测试')
    expect(runBtn).toBeTruthy()
    await runBtn!.trigger('click')
    await flushPromises()
    await ctx.wrapper.vm.$nextTick()
    return ctx
  }

  const lastRow = (wrapper: { findAll: (s: string) => any[] }) => {
    const rows = wrapper.findAll('.test-log-row')
    return rows[rows.length - 1]
  }

  it('引导文案为管理面语义且不出现「TCP 端口连接测试」', async () => {
    const { wrapper } = await openTestModal()
    const text = wrapper.text()
    expect(text).toContain('将对下列节点执行管理面连通性测试（集群挂接区域时自动经区域网关）：')
    expect(text).not.toContain('TCP 端口连接测试')
  })

  it('全部成功 → 总结行绿色且无 ⚠ 提示', async () => {
    const { wrapper } = await runTest([
      { node_id: 10, ip: '192.168.0.14', port: 16620, ok: true, msg: '', route: 'direct' },
    ])
    expect(lastRow(wrapper).classes()).toContain('success')
    expect(wrapper.text()).not.toContain('⚠')
  })

  it('存在失败 → 总结行警示色并追加 ⚠ 失败节点提示', async () => {
    const { wrapper } = await runTest([
      { node_id: 10, ip: '192.168.0.14', port: 16620, ok: false, msg: 'Failed to connect', route: 'direct' },
    ])
    expect(lastRow(wrapper).classes()).toContain('error')
    expect(wrapper.text()).toContain('⚠ 存在 1 个失败节点，请检查失败原因（白名单 403 需先下发网关配置）')
  })

  it('结果区静态提示「测试结果将更新节点的在线状态标记」', async () => {
    const { wrapper } = await runTest([{ node_id: 10, ip: '192.168.0.14', port: 16620, ok: true, msg: '' }])
    expect(wrapper.text()).toContain('测试结果将更新节点的在线状态标记')
  })

  it('白名单 403 失败行下提供「去下发网关配置」快捷动作并跳转中继网关页（admin）', async () => {
    const { wrapper, router } = await runTest([
      {
        node_id: 10,
        ip: '192.168.0.14',
        port: 16620,
        ok: false,
        msg: '目标不在该局网关白名单，请执行配置下发',
        route: 'relay',
      },
    ])
    const action = wrapper.findAll('button').find((b) => b.text().includes('去下发网关配置'))
    expect(action).toBeTruthy()
    await action!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/relay-gateways')
  })

  it('无 relay_gateway 权限的用户不渲染「去下发网关配置」', async () => {
    const { wrapper } = await runTest(
      [
        {
          node_id: 10,
          ip: '192.168.0.14',
          port: 16620,
          ok: false,
          msg: '目标不在该局网关白名单，请执行配置下发',
          route: 'relay',
        },
      ],
      { role: 'user', permissions: [] },
    )
    const action = wrapper.findAll('button').find((b) => b.text().includes('去下发网关配置'))
    expect(action).toBeFalsy()
  })

  it('异常终止 → 总结「测试异常终止，耗时 Xs」', async () => {
    const { wrapper } = await runTest([{ node_id: 10, ip: '192.168.0.14', port: 16620, ok: true, msg: '' }], {
      postReject: Object.assign(new Error('boom'), { response: { data: { detail: '网络中断' } } }),
    })
    expect(lastRow(wrapper).text()).toMatch(/测试异常终止，耗时 [\d.]+s/)
  })
})

// ── cluster-ux-close-loop B5：导入 imported → 关闭弹窗时刷新列表 ──
describe('CentralList.vue - 备份导入闭环（B5）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
  })

  it('监听 imported：关闭备份弹窗后刷新集群列表', async () => {
    let clusterCalls = 0
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') {
        clusterCalls += 1
        return Promise.resolve({ data: { items: [], total: 0 } })
      }
      return Promise.resolve({ data: {} })
    })
    const CentralList = (await import('../CentralList.vue')).default
    const wrapper = mount(CentralList, {
      global: {
        plugins: [
          createRouter({
            history: createWebHistory(),
            routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }],
          }),
        ],
      },
    })
    await flushPromises()
    expect(clusterCalls).toBe(1)

    const dialog = wrapper.findComponent({ name: 'ClusterBackupDialog' })
    expect(dialog.exists()).toBe(true)
    dialog.vm.$emit('imported', 9)
    dialog.vm.$emit('close')
    await flushPromises()
    expect(clusterCalls).toBe(2)
  })
})

// ── cluster-ux-close-loop B6：空状态两分支 / actions 顺序 ──
describe('CentralList.vue - 空状态与 actions 统一（B6）', () => {
  const oneCluster = [
    {
      id: 1,
      name: 'alpha',
      display_name: '甲',
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
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
  })

  async function mountCentral(items: typeof oneCluster) {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items, total: items.length } })
      if (url.startsWith('/clusters/1/nodes'))
        return Promise.resolve({
          data: { items: [{ id: 10, ip: '192.168.0.14', management_port: 16620, service_port: 16610, status: 1 }] },
        })
      return Promise.resolve({ data: {} })
    })
    const router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }],
    })
    const pinia = createPinia()
    setActivePinia(pinia)
    const CentralListComponent = (await import('../CentralList.vue')).default
    return mount(CentralListComponent, { global: { plugins: [pinia, router] } })
  }

  it('从未创建：空列表显示「还没有集群」+「新建集群」按钮', async () => {
    const wrapper = await mountCentral([])
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text() === '新建集群')).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('筛选空：显示「清除筛选」，点击后恢复未筛选空态', async () => {
    const wrapper = await mountCentral(oneCluster)
    await flushPromises()
    const search = wrapper.find('input[placeholder*="搜索"]')
    await search.setValue('不存在的集群')
    await flushPromises()
    const clearBtn = wrapper.findAll('button').find((b) => b.text() === '清除筛选')
    expect(clearBtn).toBeTruthy()
    // 清除筛选后回到未筛选空态（topbar「+ 新建集群」常驻，不受分支影响）
    await clearBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text() === '清除筛选')).toBe(false)
  })

  it('卡片 actions 统一顺序「详情 / 连接测试 / 编辑 / 删除」，详情为 btn-secondary', async () => {
    const wrapper = await mountCentral(oneCluster)
    await flushPromises()
    const actionsRow = wrapper.find('.cl-card-actions')
    expect(actionsRow.exists()).toBe(true)
    const labels = actionsRow.findAll('button').map((b) => b.text())
    expect(labels).toEqual(['详情', '连接测试', '编辑', '删除'])
    expect(actionsRow.findAll('button')[0].classes()).toContain('btn-secondary')
  })
})
