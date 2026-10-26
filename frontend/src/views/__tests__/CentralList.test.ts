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
    expect(text).toContain(
      '将对下列节点执行管理面连通性测试（集群挂接区域时自动经区域网关）。结果为管理面连通性（在线/离线），不改变节点运行态（运行中/已停止）：',
    )
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
    expect(labels).toEqual(['详情', '连接测试', '编辑', '更多 ▾', '删除'])
    expect(actionsRow.findAll('button')[0].classes()).toContain('btn-secondary')
  })
})

// ── 组2 2.2：连接测试节点清单走共享全量拉取工具（route-management-ux-batch1 组2）──────
// showConnectionTest 不再显式 page_size: PAGE_SIZE_DROPDOWN(500) 单页拉取，
// >500 节点集群的连接测试清单会被静默截断；改经 fetchAllClusterNodes 分页循环取全。

describe('CentralList.vue 连接测试节点清单全量拉取（route-management-ux-batch1 组2）', () => {
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
    node_count: 501,
    healthy_node_count: 501,
    upstream_count: 0,
    route_count: 0,
    plugin_config_count: 0,
    global_rule_count: 0,
    static_resource_count: 0,
    plugin_metadata_count: 0,
    nodes: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
  })

  it('节点 >500：分页循环续拉 page=2，测试弹窗清单含第 2 页节点', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      ip: `10.1.0.${(i % 254) + 1}`,
      service_port: 16610,
      management_port: 16620,
      status: 1,
    }))
    const page2 = [{ id: 501, ip: '10.9.9.9', service_port: 16610, management_port: 16999, status: 1 }]
    // 页片按请求 page 参数切分（CentralList 挂载期 loadClusters 本就会带 page=1 拉一次节点，
    // 不能按调用次数切分）；按参数切分后无论额外来源，分页循环语义都确定
    mockApiGet.mockImplementation((url: string, cfg?: { params?: { page?: number } }) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [cluster], total: 1 } })
      if (url.startsWith('/clusters/1/nodes')) {
        const page = cfg?.params?.page ?? 1
        return Promise.resolve({ data: { total: 501, items: page === 1 ? page1 : page2 } })
      }
      return Promise.resolve({ data: {} })
    })

    const CentralList = (await import('@/views/CentralList.vue')).default
    const wrapper = mount(CentralList, { global: { plugins: [newRouter()] } })
    await flushPromises()
    await flushPromises()
    await wrapper.vm.$nextTick()

    const openBtn = wrapper.findAll('button').find((b) => b.text().includes('连接测试'))
    expect(openBtn).toBeTruthy()
    await openBtn!.trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()

    // mock 层：分页循环续拉到 page=2（挂载期 loadClusters 另有 page=1/page_size=20 的既有拉取，
    // 不属于工具循环）；工具续拉请求必须 page_size=500（对齐后端 MAX_PAGE_SIZE）
    const nodeCalls = mockApiGet.mock.calls.filter((c) => String(c[0]).startsWith('/clusters/1/nodes'))
    const pages = nodeCalls.map((c) => (c[1] as { params: { page: number } }).params.page)
    expect(pages).toContain(2)
    expect(pages.filter((p) => p === 2)).toHaveLength(1)
    const toolSecondPage = nodeCalls.find((c) => (c[1] as { params: { page: number } }).params.page === 2)
    expect((toolSecondPage![1] as { params: { page_size: number } }).params.page_size).toBe(500)
    // UI 层：清单渲染第 2 页节点（单页 500 会静默截断，10.9.9.9:16999 即铁证）
    const nodeRows = wrapper.findAll('.test-node-row')
    expect(nodeRows.length).toBe(501)
    expect(nodeRows.some((r) => r.text().includes('10.9.9.9:16999'))).toBe(true)
  })
})

// ── central-management-ux-review-fixes 批 3：刷新保状态 + 子表延迟加载 ──────────
// P2-5：loadClusters 重建对象不再把展开面板 Tab 重置回首签（#203 陷阱全局版兜底）；
// 上游子表不再挂载期全量预加载（handleTabClick 按需加载）。

describe('CentralList.vue 刷新保状态与延迟加载（central-management-ux-review-fixes 批3）', () => {
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
    upstream_count: 1,
    route_count: 2,
    plugin_config_count: 0,
    global_rule_count: 0,
    static_resource_count: 0,
    plugin_metadata_count: 0,
    nodes: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [cluster], total: 1 } })
      return Promise.resolve({ data: {} })
    })
  })

  it('挂载不预加载上游子表（节点因卡片节点区渲染保持加载）', async () => {
    const CentralList = (await import('@/views/CentralList.vue')).default
    const wrapper = mount(CentralList, { global: { plugins: [newRouter()] } })
    await flushPromises()
    await flushPromises()
    const urls = mockApiGet.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u === '/clusters/1/upstreams')).toBe(false)
    expect(urls.some((u) => u.startsWith('/clusters/1/nodes'))).toBe(true)
    wrapper.unmount()
  })

  it('顶栏提供「备份下载」入口 → 弹窗 download 模式（批5：两页顶栏对齐）', async () => {
    const CentralList = (await import('@/views/CentralList.vue')).default
    const wrapper = mount(CentralList, { global: { plugins: [newRouter()] } })
    await flushPromises()
    await flushPromises()
    const dlBtn = wrapper.findAll('button').find((b) => b.text() === '备份下载')
    expect(dlBtn, '统一管理顶栏应有「备份下载」按钮').toBeTruthy()
    await dlBtn!.trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent({ name: 'ClusterBackupDialog' })
    expect(dialog.exists()).toBe(true)
    expect(dialog.props('visible')).toBe(true)
    expect(dialog.props('mode')).toBe('download')
    wrapper.unmount()
  })

  it('Tab @refresh 后保持当前 Tab（不再重置回首签）', async () => {
    const CentralList = (await import('@/views/CentralList.vue')).default
    const routesMod = await import('@/views/clusters/ClusterRoutes.vue')
    const wrapper = mount(CentralList, { global: { plugins: [newRouter()] } })
    await flushPromises()
    await flushPromises()

    // 统计格「路由」→ 最大化并切到路由 Tab
    const statCell = wrapper.findAll('.cl-stat-cell').find((c) => c.text().includes('路由'))
    expect(statCell).toBeTruthy()
    await statCell!.trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.dt.active').text()).toContain('路由')

    // 面板内真实刷新路径：ClusterRoutes emit('refresh') → loadClusters 重建对象
    mockApiGet.mockClear()
    const routesComp = wrapper.findComponent(routesMod.default)
    expect(routesComp.exists()).toBe(true)
    routesComp.vm.$emit('refresh')
    await flushPromises()
    await flushPromises()

    // 列表被重新拉取，且当前 Tab 仍为路由（未被重置回「集群节点」）
    expect(mockApiGet.mock.calls.some((c) => String(c[0]) === '/clusters')).toBe(true)
    expect(wrapper.find('.dt.active').text()).toContain('路由')
    wrapper.unmount()
  })
})

// ── central-management-ux-review-fixes 批 7：统一管理分组筛选（与集群管理对齐）────

describe('CentralList.vue 分组筛选（批7：与集群管理对齐）', () => {
  function newRouter() {
    return createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }],
    })
  }

  const clusters = [
    {
      id: 1,
      name: 'alpha',
      display_name: '甲',
      group_name: 'dns',
      status: 1,
      node_count: 0,
      healthy_node_count: 0,
      upstream_count: 0,
      route_count: 0,
      plugin_config_count: 0,
      global_rule_count: 0,
      static_resource_count: 0,
      plugin_metadata_count: 0,
      nodes: [],
    },
    {
      id: 2,
      name: 'beta',
      display_name: '乙',
      group_name: 'dns',
      status: 1,
      node_count: 0,
      healthy_node_count: 0,
      upstream_count: 0,
      route_count: 0,
      plugin_config_count: 0,
      global_rule_count: 0,
      static_resource_count: 0,
      plugin_metadata_count: 0,
      nodes: [],
    },
    {
      id: 3,
      name: 'gamma',
      display_name: '丙',
      group_name: '',
      status: 1,
      node_count: 0,
      healthy_node_count: 0,
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
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: clusters, total: 3 } })
      return Promise.resolve({ data: {} })
    })
  })

  async function mountPage() {
    const CentralList = (await import('@/views/CentralList.vue')).default
    const wrapper = mount(CentralList, { global: { plugins: [newRouter()] } })
    await flushPromises()
    await flushPromises()
    return wrapper
  }

  function groupNames(wrapper: ReturnType<typeof mount>['wrapper']) {
    return wrapper.findAll('.group-name').map((g) => g.text().trim())
  }

  /** 工具栏下拉（排除常驻 DOM 的备份弹窗内下拉）：[0]=分组 [1]=状态 */
  function toolbarSelects(wrapper: ReturnType<typeof mount>['wrapper']) {
    return wrapper.find('.cl-header-actions').findAll('select')
  }

  it('工具栏提供分组筛选（全部分组/未分组/各组），选组后仅显示该组', async () => {
    const wrapper = await mountPage()
    const groupSelect = toolbarSelects(wrapper)[0]
    const options = groupSelect.findAll('option').map((o) => o.text())
    expect(options).toEqual(['全部分组', '未分组', 'dns'])
    // 选 dns → 只剩 dns 组（未分组组头消失），计数同步
    await groupSelect.setValue('dns')
    expect(groupNames(wrapper)).toEqual(['dns'])
    expect(wrapper.text()).toContain('共 2 个集群')
    wrapper.unmount()
  })

  it('未分组选项仅显示未分组集群；重选全部分组恢复（清除筛选仅空态出现，与集群管理同款）', async () => {
    const wrapper = await mountPage()
    const groupSelect = toolbarSelects(wrapper)[0]
    await groupSelect.setValue('__ung__')
    expect(groupNames(wrapper)).toEqual(['未分组'])
    expect(wrapper.text()).toContain('共 1 个集群')
    // 与集群管理同款：清除筛选按钮仅在「筛选结果为空」时出现
    await groupSelect.setValue('dns')
    const searchInput = wrapper.find('.cl-header-actions input')
    await searchInput.setValue('不存在的集群zzz')
    await flushPromises()
    // 空态判定（a-empty 描述文案在 jsdom 不入文本树，用计数与清除按钮断言）
    expect(wrapper.text()).toContain('共 0 个集群')
    const clearBtn = wrapper.findAll('button').find((b) => b.text() === '清除筛选')
    expect(clearBtn, '空态应出现「清除筛选」').toBeTruthy()
    await clearBtn!.trigger('click')
    await flushPromises()
    expect(groupNames(wrapper)).toEqual(['未分组', 'dns'])
    expect(wrapper.text()).toContain('共 3 个集群')
    wrapper.unmount()
  })
})
