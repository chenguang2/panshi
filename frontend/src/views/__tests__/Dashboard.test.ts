import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import type { Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useFeaturesStore } from '@/stores/features'
import { aTableStub } from '@/components/__tests__/helpers/aTableStub'
import { formatMonthDayTime } from '@/utils/format'

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockListNodes = vi.fn()
vi.mock('@/api/nodes', () => ({
  listNodes: (...args: any[]) => mockListNodes(...args),
}))

// ── a-table 桩：复用仓库共享 aTableStub（真实 Table 在 jsdom 缺 matchMedia 会连挂），
//    追加 loading / customRow 语义切片（TableCard :loading 透传与最近路由行点击断言需要）
const dashboardTableStub = {
  ...aTableStub,
  props: {
    ...aTableStub.props,
    pagination: { type: [Object, Boolean], default: null },
    loading: { type: Boolean, default: false },
    customRow: { type: Function, default: null },
  },
  methods: {
    ...aTableStub.methods,
    rowAttrs(this: any, r: Record<string, unknown>): Record<string, unknown> {
      return this.customRow ? this.customRow(r) : {}
    },
  },
  template: aTableStub.template
    .replace(
      '<div class="ant-table-wrapper">',
      '<div class="ant-table-wrapper"><div v-if="loading" class="stub-table-loading">table-loading</div>',
    )
    .replace('<tr class="ant-table-row">', '<tr class="ant-table-row" v-bind="rowAttrs(r)">'),
}

// ── mock 形状依据（约定 #43，2026-10-10 curl 实测开发后端）：
//    GET /dashboard/stats → 平铺 9 计数；GET /dashboard/recent-routes → {items:[{id,name,uri,status,cluster_name}]}
//    GET /clusters → {items:[cluster]}；listNodes → {total,page,page_size,items:[node]}，
//    node 含 status_detail（对象或 null）/cluster_name/ip/service_port
const STATS = {
  clusters: 2,
  nodes: 4,
  nodes_online: 4,
  nodes_untested: 0,
  upstreams: 5,
  routes: 6,
  users: 2,
  plugin_configs: 3,
  global_rules: 4,
  static_resources: 1,
  plugin_metadata: 9,
}

function routeItem(id: number, name: string) {
  return {
    id,
    name,
    uri: `/r${id}/*`,
    status: 1,
    cluster_name: '演示集群',
    // naive UTC isoformat（2026-10-10 curl 实测：2026-08-20T09:27:33.706804）
    created_at: '2026-10-10T06:30:00',
  }
}

function clusterItem(id: number, status: number, display_name: string | null = `集群${id}`) {
  return { id, name: `c${id}`, display_name, status }
}

function nodeItem(id: number, status: number, status_detail: Record<string, unknown> | null) {
  return {
    id,
    cluster_id: 1,
    cluster_name: '演示集群',
    ip: `10.0.0.${id}`,
    service_port: 16610,
    management_port: 16620,
    status,
    status_detail,
  }
}

function okApiMock(nodes: unknown[] = [], statsOverride: Record<string, number> = {}) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/dashboard/stats') return Promise.resolve({ data: { ...STATS, ...statsOverride } })
    if (url === '/dashboard/recent-routes') {
      return Promise.resolve({ data: { items: [routeItem(1, 'alpha'), routeItem(2, 'beta')] } })
    }
    if (url === '/clusters') {
      return Promise.resolve({ data: { items: [clusterItem(1, 1), clusterItem(2, 0, null)] } })
    }
    return Promise.reject(new Error('unexpected GET: ' + url))
  })
  mockListNodes.mockResolvedValue({
    data: { total: nodes.length, page: 1, page_size: 500, items: nodes },
  })
}

function makeRouter(): Router {
  const route = (path: string, name: string) => ({ path, name, component: { template: '<div />' } })
  return createRouter({
    history: createWebHistory(),
    routes: [
      route('/', 'Dashboard'),
      route('/clusters', 'ClusterList'),
      route('/nodes', 'NodeList'),
      route('/upstreams', 'UpstreamList'),
      route('/routes', 'RouteList'),
      route('/node-tasks', 'NodeTaskCenter'),
      route('/audit-log', 'AuditLog'),
      route('/database-management', 'DatabaseManagement'),
      route('/ansible-inventory', 'AnsibleInventory'),
      route('/edge-autostart', 'EdgeAutostart'),
      route('/edge-client', 'EdgeClient'),
      route('/users', 'Users'),
      route('/plugin-configs', 'PluginConfigList'),
      route('/plugin-metadata', 'PluginMetadataList'),
      route('/global-rules', 'GlobalRuleList'),
      route('/static-resources', 'StaticResourceList'),
      route('/metrics/dashboard', 'MetricsDashboard'),
    ],
  })
}

interface MountOpts {
  role?: string
  permissions?: string[]
  features?: Record<string, boolean>
}

async function mountDashboard(opts: MountOpts = {}) {
  setActivePinia(createPinia())
  const features = useFeaturesStore()
  features.features = {
    database_management: true,
    audit_log: true,
    task_center: true,
    ansible_inventory: true,
    edge_autostart: true,
    edge_client: true,
    metrics: true,
    ...opts.features,
  }
  features.loaded = true
  localStorage.setItem(
    'user',
    JSON.stringify({ id: 1, username: opts.role === 'admin' ? 'admin' : 'u1', role: opts.role ?? 'admin' }),
  )
  localStorage.setItem('permissions', JSON.stringify(opts.permissions ?? []))
  localStorage.setItem('token', 'mock-token')

  const Dashboard = (await import('@/views/Dashboard.vue')).default
  const router = makeRouter()
  const wrapper = mount(Dashboard, {
    global: { plugins: [router], stubs: { 'a-table': dashboardTableStub } },
  })
  await flushPromises()
  await flushPromises()
  return { wrapper, router }
}

const apiCalls = (url: string) => mockApiGet.mock.calls.filter((c) => c[0] === url).length

// ── 批次 2：三态与错误处理 ────────────────────────────────────────────────
describe('Dashboard - 三态与错误处理（批次 2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('2.1 全部已发起请求失败 → danger 横幅 + 重试，统计卡/表格无 0 值空表完成态假象', async () => {
    mockApiGet.mockRejectedValue(new Error('boom'))
    mockListNodes.mockRejectedValue(new Error('boom'))
    const { wrapper } = await mountDashboard()

    const banner = wrapper.find('.load-banner-danger')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('数据加载失败，请检查后端服务是否可用')
    expect(banner.findAll('button').some((b) => b.text() === '重试')).toBe(true)
    // 无完成态假象：统计卡不渲染、各数据区为错误条而非空表
    expect(wrapper.findAll('.stat-card')).toHaveLength(0)
    expect(wrapper.findAll('.area-error').length).toBeGreaterThanOrEqual(1)
    expect(wrapper.findAll('.ant-table-row')).toHaveLength(0)
  })

  it('2.2 部分接口失败 → 横幅列失败资源名 + 失败区「加载失败 [重试]」，成功区照常渲染', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.reject(new Error('boom'))
      if (url === '/dashboard/stats') return Promise.resolve({ data: { ...STATS } })
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [routeItem(1, 'alpha')] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockListNodes.mockResolvedValue({
      data: { total: 1, page: 1, page_size: 500, items: [nodeItem(9, 0, { last_status: 'failed' })] },
    })
    const { wrapper } = await mountDashboard()

    const banner = wrapper.find('.load-banner-partial')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('部分数据加载失败：集群，以下内容可能不完整')
    expect(banner.findAll('button').some((b) => b.text() === '重试')).toBe(true)
    // 失败区轻量错误条
    const areaErrors = wrapper.findAll('.area-error')
    expect(areaErrors.length).toBe(1)
    expect(areaErrors[0].text()).toContain('加载失败')
    expect(areaErrors[0].findAll('button').some((b) => b.text() === '重试')).toBe(true)
    // 成功区照常渲染（最近路由 1 行 + 节点失败明细 1 行；stub 不做默认单元格渲染，
    // 行内文本断言只覆盖 bodyCell 分支内容）
    expect(wrapper.findAll('.ant-table-row').length).toBe(2)
    expect(wrapper.text()).toContain('共 1 条')
    expect(wrapper.text()).toContain(String(STATS.clusters))
  })

  it('2.3 「重试」只重发失败的请求', async () => {
    let clustersCalls = 0
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') {
        clustersCalls++
        return clustersCalls === 1
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ data: { items: [clusterItem(1, 1)] } })
      }
      if (url === '/dashboard/stats') return Promise.resolve({ data: { ...STATS } })
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [routeItem(1, 'alpha')] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockListNodes.mockResolvedValue({ data: { total: 0, page: 1, page_size: 500, items: [] } })
    const { wrapper } = await mountDashboard()
    expect(wrapper.find('.load-banner-partial').exists()).toBe(true)

    const banner = wrapper.find('.load-banner-partial')
    await banner
      .findAll('button')
      .find((b) => b.text() === '重试')!
      .trigger('click')
    await flushPromises()
    await flushPromises()

    // 仅 /clusters 重发；成功区不重复拉取
    expect(apiCalls('/clusters')).toBe(2)
    expect(apiCalls('/dashboard/stats')).toBe(1)
    expect(apiCalls('/dashboard/recent-routes')).toBe(1)
    expect(mockListNodes).toHaveBeenCalledTimes(1)
    // 恢复后横幅消失，失败区被集群表替代（集群 1 行 + 最近路由 1 行）
    expect(wrapper.find('.load-banner').exists()).toBe(false)
    expect(wrapper.findAll('.area-error')).toHaveLength(0)
    expect(wrapper.findAll('.ant-table-row').length).toBe(2)
  })

  it('2.4a 首次加载：TableCard 显示 loading、统计卡降交互样式，完成后消失', async () => {
    let resolveStats!: (v: unknown) => void
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/dashboard/stats') return new Promise((res) => (resolveStats = res))
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [routeItem(1, 'alpha')] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [clusterItem(1, 1)] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockListNodes.mockResolvedValue({ data: { total: 0, page: 1, page_size: 500, items: [] } })

    const Dashboard = (await import('@/views/Dashboard.vue')).default
    const wrapper = mount(Dashboard, {
      global: { plugins: [makeRouter()], stubs: { 'a-table': dashboardTableStub } },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.stats-grid-loading').exists()).toBe(true)
    expect(wrapper.findAll('.stub-table-loading').length).toBeGreaterThanOrEqual(1)

    resolveStats({ data: { ...STATS } })
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.stats-grid-loading').exists()).toBe(false)
    expect(wrapper.findAll('.stub-table-loading')).toHaveLength(0)
  })

  it('2.5 空态显示引导 CTA（集群/节点/路由），不出现默认「暂无数据」', async () => {
    okApiMock()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/dashboard/stats') return Promise.resolve({ data: { ...STATS } })
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockListNodes.mockResolvedValue({ data: { total: 0, page: 1, page_size: 500, items: [] } })
    const { wrapper } = await mountDashboard()

    const ctas = wrapper.findAll('.empty-cta')
    const texts = ctas.map((c) => c.text())
    expect(texts.some((t) => t.includes('还没有集群，去创建'))).toBe(true)
    expect(texts.some((t) => t.includes('还没有节点，去添加'))).toBe(true)
    expect(texts.some((t) => t.includes('还没有路由，去创建'))).toBe(true)
    const hrefs = ctas.map((c) => c.attributes('href'))
    expect(hrefs).toContain('/clusters')
    expect(hrefs).toContain('/nodes')
    expect(hrefs).toContain('/routes')
    expect(wrapper.text()).not.toContain('暂无数据')
  })

  it('2.6 某区 403 → 该区静默隐藏，不计入 loadErrors、不出现错误横幅', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.reject(Object.assign(new Error('forbidden'), { response: { status: 403 } }))
      }
      if (url === '/dashboard/stats') return Promise.resolve({ data: { ...STATS } })
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [routeItem(1, 'alpha')] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const { wrapper } = await mountDashboard()

    expect(wrapper.find('.load-banner').exists()).toBe(false)
    expect(wrapper.find('.load-banner-danger').exists()).toBe(false)
    expect(wrapper.find('.load-banner-partial').exists()).toBe(false)
    expect(wrapper.findAll('.area-error')).toHaveLength(0)
    // 集群区整体隐藏（含「查看全部集群」脚链），对照组：其他区照常
    expect(wrapper.text()).not.toContain('查看全部集群')
    expect(wrapper.findAll('.ant-table-row').length).toBe(1)
  })
})

// ── 批次 4：刷新与时间锚点（先挂到此处随批次 2 回归，RED 属预期） ─────────
describe('Dashboard - 刷新与时间锚点（批次 4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('4.x 刷新期间旧数据保留（不清空、不回全 0）', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard()
    expect(wrapper.text()).toContain(String(STATS.clusters))

    let resolveClusters!: (v: unknown) => void
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') {
        return new Promise((res) => {
          resolveClusters = res as unknown as (v: unknown) => void
        })
      }
      if (url === '/dashboard/stats') return Promise.resolve({ data: { ...STATS } })
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })

    const refreshBtn = wrapper.findAll('button').find((b) => b.text() === '刷新')
    expect(refreshBtn).toBeTruthy()
    await refreshBtn!.trigger('click')
    await flushPromises()

    // 刷新在途：旧数据仍在
    expect(wrapper.text()).toContain(String(STATS.clusters))
    expect(wrapper.findAll('.ant-table-row')).toHaveLength(2)

    resolveClusters({ data: { items: [clusterItem(1, 1), clusterItem(2, 1), clusterItem(3, 1)] } })
    await flushPromises()
    await flushPromises()
    expect(wrapper.findAll('.ant-table-row')).toHaveLength(3)
  })

  it('4.1a 首次成功加载前「更新于」不渲染；成功后显示「更新于 HH:mm」', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/dashboard/stats' || url === '/dashboard/recent-routes' || url === '/clusters') {
        return new Promise((res) => resolvers.push(res))
      }
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockListNodes.mockReturnValue(
      new Promise((res) =>
        resolvers.push(() => res({ data: { total: 0, page: 1, page_size: 500, items: [] } })),
      ) as never,
    )

    const Dashboard = (await import('@/views/Dashboard.vue')).default
    const wrapper = mount(Dashboard, {
      global: { plugins: [makeRouter()], stubs: { 'a-table': dashboardTableStub } },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.updated-at').exists()).toBe(false)

    resolvers.forEach((r) => r({ data: { items: [] } }))
    await flushPromises()
    await flushPromises()

    const updated = wrapper.find('.updated-at')
    expect(updated.exists()).toBe(true)
    expect(updated.text()).toMatch(/^更新于 \d{2}\/\d{2} \d{2}:\d{2}$/)
  })

  it('4.1b 刷新期间按钮禁用显示「刷新中…」，完成后恢复并更新时间戳', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard()
    expect(wrapper.find('.updated-at').exists()).toBe(true)

    let resolveClusters!: (v: unknown) => void
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') {
        return new Promise((res) => {
          resolveClusters = res as unknown as (v: unknown) => void
        })
      }
      if (url === '/dashboard/stats') return Promise.resolve({ data: { ...STATS } })
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })

    const refreshBtn = wrapper.findAll('button').find((b) => b.text() === '刷新')!
    expect(refreshBtn).toBeTruthy()
    await refreshBtn.trigger('click')
    await wrapper.vm.$nextTick()

    expect(refreshBtn.text()).toBe('刷新中…')
    expect(refreshBtn.attributes('disabled')).toBeDefined()

    resolveClusters({ data: { items: [clusterItem(1, 1)] } })
    await flushPromises()
    await flushPromises()

    expect(wrapper.findAll('button').find((b) => b.text() === '刷新')).toBeTruthy()
    expect(wrapper.find('.updated-at').exists()).toBe(true)
  })

  it('4.2 加载进行中：重复点「刷新」不产生并发重复请求（in-flight 守卫统一覆盖）', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard()
    const statsBefore = apiCalls('/dashboard/stats')

    let resolveStats!: (v: unknown) => void
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/dashboard/stats') {
        return new Promise((res) => {
          resolveStats = res as unknown as (v: unknown) => void
        })
      }
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })

    const refreshBtn = wrapper.findAll('button').find((b) => b.text() === '刷新')!
    await refreshBtn.trigger('click')
    await flushPromises()

    // 在途期间重复点击 → 守卫拦截，不新增请求
    await refreshBtn.trigger('click')
    await flushPromises()
    expect(apiCalls('/dashboard/stats')).toBe(statsBefore + 1)

    resolveStats({ data: { ...STATS } })
    await flushPromises()
    await flushPromises()
    expect(apiCalls('/dashboard/stats')).toBe(statsBefore + 1)
  })

  it('4.2b 在途期间分区「重试」与横幅「重试」禁用，不产生并发重复请求', async () => {
    let clustersCalls = 0
    let resolveRetry!: (v: unknown) => void
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') {
        clustersCalls++
        if (clustersCalls === 1) return Promise.reject(new Error('boom'))
        return new Promise((res) => {
          resolveRetry = () => res({ data: { items: [clusterItem(1, 1)] } })
        })
      }
      if (url === '/dashboard/stats') return Promise.resolve({ data: { ...STATS } })
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [routeItem(1, 'alpha')] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockListNodes.mockResolvedValue({ data: { total: 0, page: 1, page_size: 500, items: [] } })
    const { wrapper } = await mountDashboard()

    // 仅 clusters 失败 → 局部横幅 + 分区错误条；点击分区「重试」进入在途（延迟 resolve）
    const areaRetry = wrapper.find('.area-error').findAll('button')[0]
    await areaRetry.trigger('click')
    await flushPromises()
    expect(apiCalls('/clusters')).toBe(2)

    // 在途期间所有入口禁用
    const bannerRetry = wrapper.find('.load-banner-partial').findAll('button')[0]
    const areaRetryNow = wrapper.find('.area-error').findAll('button')[0]
    const refreshingBtn = wrapper.findAll('button').find((b) => b.text() === '刷新中…')!
    expect(bannerRetry.attributes('disabled')).toBeDefined()
    expect(areaRetryNow.attributes('disabled')).toBeDefined()
    expect(refreshingBtn.attributes('disabled')).toBeDefined()

    // 在途期间重复触发不产生并发请求
    await bannerRetry.trigger('click')
    await areaRetryNow.trigger('click')
    await refreshingBtn.trigger('click')
    await flushPromises()
    expect(apiCalls('/clusters')).toBe(2)
    expect(apiCalls('/dashboard/stats')).toBe(1)

    // 完成后恢复
    resolveRetry({ data: { items: [clusterItem(1, 1)] } })
    await flushPromises()
    await flushPromises()
    expect(wrapper.find('.load-banner').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text() === '刷新')).toBe(true)
  })
})

// ── 批次 5：权限过滤（与 AppSidebar 同源三元模型） ───────────────────────
describe('Dashboard - 权限过滤（批次 5）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('5.1a 非管理员无权限：chip/统计卡/数据卡不渲染，过滤后为空的分组整卡隐藏', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({
      role: 'user',
      permissions: ['clusters', 'nodes', 'routes', 'upstreams'],
    })
    const text = wrapper.text()
    // 无权限 chip 不渲染（快捷入口全部需要对应权限或 adminOnly）
    expect(text).not.toContain('用户管理')
    expect(text).not.toContain('数据库管理')
    expect(text).not.toContain('审计日志')
    expect(text).not.toContain('节点任务中心')
    expect(text).not.toContain('Ansible 主机清单')
    expect(text).not.toContain('自启动管理')
    expect(text).not.toContain('Edge 直连')
    // 更多资源组全部无权限 → 整卡隐藏
    expect(text).not.toContain('插件组')
    expect(text).not.toContain('插件元数据')
    expect(text).not.toContain('全局规则')
    expect(text).not.toContain('静态资源')
    expect(text).not.toContain('指标总览')
    expect(text).not.toContain('更多资源')
    // 有权限数据卡照常渲染（nodes 空列表 → 节点卡为空态分支，标题可见即可）
    expect(text).toContain('查看全部集群')
    expect(text).toContain('节点连通状态')
    expect(text).toContain('查看全部路由')
  })

  it('5.1b 管理员全部入口可见', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({ role: 'admin' })
    const text = wrapper.text()
    for (const t of [
      '用户管理',
      '数据库管理',
      '审计日志',
      '节点任务中心',
      'Ansible 主机清单',
      '自启动管理',
      'Edge 直连',
      '插件组',
      '插件元数据',
      '全局规则',
      '静态资源',
      '指标总览',
    ]) {
      expect(text).toContain(t)
    }
  })

  it('5.1c 数据库管理双门控：持 permission 但 feature 关闭 → 不渲染', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({
      role: 'user',
      permissions: ['database_management'],
      features: { database_management: false },
    })
    expect(wrapper.text()).not.toContain('数据库管理')
  })

  it('5.2a fetch-visible-only：无权限数据区不渲染且不发起请求', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({ role: 'user', permissions: [] })
    // stats 仅需登录，照常请求
    expect(apiCalls('/dashboard/stats')).toBe(1)
    expect(apiCalls('/clusters')).toBe(0)
    expect(apiCalls('/dashboard/recent-routes')).toBe(0)
    expect(mockListNodes).not.toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).not.toContain('查看全部集群')
    expect(text).not.toContain('查看全部节点')
    expect(text).not.toContain('查看全部路由')
  })

  it('5.2b 仅持 clusters：只请求集群区，节点/路由区不请求不渲染', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({ role: 'user', permissions: ['clusters'] })
    expect(apiCalls('/clusters')).toBe(1)
    expect(apiCalls('/dashboard/recent-routes')).toBe(0)
    expect(mockListNodes).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('查看全部集群')
    expect(wrapper.text()).not.toContain('查看全部节点')
    expect(wrapper.text()).not.toContain('查看全部路由')
  })
})

// ── 批次 5.3：权限键映射防漂移（源码级钉住，与 AppSidebar 逐项对照） ──────
// vitest(jsdom) 下 import.meta.url 为 http 协议，文件定位用 process.cwd()（ClusterCard.source.test.ts 同款）
describe('Dashboard - 权限键映射与 AppSidebar 同源（批次 5.3）', () => {
  const dashSrc = readFileSync(resolve(process.cwd(), 'src/views/Dashboard.vue'), 'utf-8')
  const sidebarSrc = readFileSync(resolve(process.cwd(), 'src/components/AppSidebar.vue'), 'utf-8')

  // D4 映射表（2026-10-10 从 AppSidebar 逐项核实）：概览入口 → 三元门控
  const OVERVIEW_ENTRIES = [
    { path: '/node-tasks', permission: 'task_center', feature: 'task_center', adminOnly: false },
    { path: '/audit-log', permission: 'audit_logs', feature: 'audit_log', adminOnly: false },
    {
      path: '/database-management',
      permission: 'database_management',
      feature: 'database_management',
      adminOnly: false,
    },
    { path: '/ansible-inventory', permission: 'ansible_inventory', feature: 'ansible_inventory', adminOnly: false },
    { path: '/edge-autostart', permission: 'edge_autostart', feature: 'edge_autostart', adminOnly: false },
    { path: '/edge-client', permission: 'edge_nodes', feature: 'edge_client', adminOnly: false },
    { path: '/users', permission: null, feature: null, adminOnly: true },
    { path: '/metrics/dashboard', permission: 'metrics', feature: 'metrics', adminOnly: false },
    { path: '/plugin-configs', permission: 'plugin_groups', feature: null, adminOnly: false },
    { path: '/plugin-metadata', permission: 'plugin_metadata', feature: null, adminOnly: false },
    { path: '/global-rules', permission: 'global_rules', feature: null, adminOnly: false },
    { path: '/static-resources', permission: 'static_resources', feature: null, adminOnly: false },
  ]

  function sliceAfter(src: string, anchor: string, stop: RegExp): string {
    const i = src.indexOf(anchor)
    if (i < 0) return ''
    const rest = src.slice(i + anchor.length)
    const m = rest.search(stop)
    return m < 0 ? rest : rest.slice(0, m)
  }

  function gatesOf(src: string, anchor: string, stop: RegExp) {
    const s = sliceAfter(src, anchor, stop)
    return {
      permission: s.match(/permission:\s*'([^']+)'/)?.[1] ?? null,
      feature: s.match(/feature:\s*'([^']+)'/)?.[1] ?? null,
      adminOnly: /adminOnly:\s*true/.test(s),
    }
  }

  it('每个概览入口的键值与 AppSidebar 同路由菜单项一致', () => {
    for (const e of OVERVIEW_ENTRIES) {
      const dash = gatesOf(dashSrc, `path: '${e.path}'`, /path:\s*'|to:\s*'/)
      expect(dash, `概览 ${e.path} permission 漂移`).toEqual({
        permission: e.permission,
        feature: e.feature,
        adminOnly: e.adminOnly,
      })
      const sidebar = gatesOf(sidebarSrc, `route: '${e.path}'`, /label:\s*'|route:\s*'/)
      expect(sidebar.permission, `侧边栏 ${e.path} permission 漂移`).toBe(e.permission)
      expect(sidebar.adminOnly, `侧边栏 ${e.path} adminOnly 漂移`).toBe(e.adminOnly)
      if (e.path === '/metrics/dashboard') {
        // 侧边栏对 metrics 的 feature 门控是结构化的（featuresStore.has('metrics') 条件展开），无 feature 字段
        expect(sidebarSrc).toContain("featuresStore.has('metrics')")
      } else {
        expect(sidebar.feature, `侧边栏 ${e.path} feature 漂移`).toBe(e.feature)
      }
    }
  })

  it('统计卡与三张数据卡键值符合 D4 映射', () => {
    for (const [path, perm] of [
      ['/clusters', 'clusters'],
      ['/nodes', 'nodes'],
      ['/upstreams', 'upstreams'],
      ['/routes', 'routes'],
    ] as const) {
      const g = gatesOf(dashSrc, `to: '${path}'`, /path:\s*'|to:\s*'/)
      expect(g.permission, `统计卡 ${path} permission 漂移`).toBe(perm)
    }
    // 数据卡 fetch-visible-only 门控键
    expect(dashSrc).toContain("canEnter({ permission: 'clusters' })")
    expect(dashSrc).toContain("canEnter({ permission: 'nodes' })")
    expect(dashSrc).toContain("canEnter({ permission: 'routes' })")
  })
})

// ── 批次 8：打磨（node-card 收敛 TableCard / 分组语义 / 计数徽章 / 类型化） ──
describe('Dashboard - 打磨（批次 8）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('8.1a 节点失败明细收敛 TableCard：表格行含 节点地址(mono)/所属集群/检测结果', async () => {
    okApiMock([nodeItem(3, 0, { last_status: 'failed' })])
    const { wrapper } = await mountDashboard()

    const rows = wrapper.findAll('.node-detail-card .ant-table-row')
    expect(rows.length).toBe(1)
    const row = rows[0]
    expect(row.find('.node-addr').text()).toBe('10.0.0.3:16610')
    expect(row.text()).toContain('演示集群')
    expect(row.text()).toContain('检测失败')
    // 手写 node-row 结构已被表格行替代
    expect(wrapper.findAll('.node-row')).toHaveLength(0)
  })

  it('8.1b 源码守卫：无手写 card-footer 拷贝，明细区 max-height 滚动', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/Dashboard.vue'), 'utf-8')
    expect(src).not.toMatch(/\.card-footer/)
    expect(src).toMatch(/node-detail.*max-height|max-height[\s\S]{0,80}overflow-y/s)
  })

  it('8.2 源码守卫：recentRoutes/clusterStatus 类型化，无 ref<any[]>', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/Dashboard.vue'), 'utf-8')
    expect(src).toContain('ref<RecentRouteRow[]>')
    expect(src).toContain('ref<ClusterRow[]>')
    expect(src).not.toMatch(/ref<any\[\]>/)
  })

  it('8.3 分组重排：用户管理在快捷入口，两组标题为「快捷入口（运维操作）/更多资源（配置与查询）」', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({ role: 'admin' })
    const cards = wrapper.findAll('.quick-columns .card')
    expect(cards.length).toBe(2)
    expect(cards[0].find('.table-card-title').text()).toBe('快捷入口（运维操作）')
    expect(cards[0].text()).toContain('用户管理')
    expect(cards[1].find('.table-card-title').text()).toBe('更多资源（配置与查询）')
  })

  it('8.4a 「更多资源」chip 尾部 mono 计数徽章（消费 stats 闲置计数）', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({ role: 'admin' })
    const chipOf = (title: string) => wrapper.findAll('.quick-chip').find((c) => c.text().includes(title))!
    expect(chipOf('插件组').find('.chip-count').text()).toBe(String(STATS.plugin_configs))
    expect(chipOf('插件元数据').find('.chip-count').text()).toBe(String(STATS.plugin_metadata))
    expect(chipOf('全局规则').find('.chip-count').text()).toBe(String(STATS.global_rules))
    expect(chipOf('静态资源').find('.chip-count').text()).toBe(String(STATS.static_resources))
    // 用户管理（快捷入口组）同理消费 users 计数
    expect(chipOf('用户管理').find('.chip-count').text()).toBe(String(STATS.users))
  })

  it('8.4b 「数据库管理」chip 副标注「含恢复/迁移等高危操作」', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({ role: 'admin' })
    const chip = wrapper.findAll('.quick-chip').find((c) => c.text().includes('数据库管理'))!
    expect(chip.find('.chip-note').text()).toBe('含恢复/迁移等高危操作')
  })
})

// ── 批次 6：节点摘要数据源统一（消费批次 1 的 nodes_online/nodes_untested） ──
describe('Dashboard - 节点摘要数据源统一（批次 6）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('6.1 摘要三态由 stats 派生（X=online−untested, Z=untested, Y=nodes−online），统计卡副标题与节点卡徽章一致，且与 listNodes 明细解耦', async () => {
    // stats: nodes=5 online=3 untested=1 → 通过 2 · 未检测 1 · 失败 2；
    // listNodes 明细只回 2 条失败节点（降级为明细源，不影响摘要计数）
    okApiMock([nodeItem(8, 0, { last_status: 'failed' }), nodeItem(9, 0, { last_status: 'failed' })], {
      nodes: 5,
      nodes_online: 3,
      nodes_untested: 1,
    })
    const { wrapper } = await mountDashboard()

    const nodeStatCard = wrapper.findAll('.stat-card').find((c) => c.text().includes('节点'))!
    expect(nodeStatCard.text()).toContain('通过 2 · 未检测 1 · 失败 2')

    const summary = wrapper.find('.node-summary')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('检测通过 2')
    expect(summary.text()).toContain('未检测 1')
    expect(summary.text()).toContain('检测失败 2')
  })

  it('6.2 节点明细达分页上限（500）→ 截断提示「节点数超过明细上限，失败清单可能不完整」', async () => {
    okApiMock(
      Array.from({ length: 500 }, (_, i) => nodeItem(i + 1, 0, { last_status: 'failed' })),
      { nodes: 600, nodes_online: 500, nodes_untested: 0 },
    )
    const { wrapper } = await mountDashboard()
    const notice = wrapper.find('.truncate-notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toBe('节点数超过明细上限，失败清单可能不完整')
    // 归属节点明细区：紧邻其后的是节点连通状态卡（而非最近路由区）
    const siblings = Array.from(wrapper.find('.dashboard-columns').element.children)
    const idx = siblings.findIndex((el) => el.classList.contains('truncate-notice'))
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(siblings[idx + 1]?.textContent).toContain('节点连通状态')
  })

  it('6.2b 未达上限 → 不显示截断提示', async () => {
    okApiMock([nodeItem(3, 0, { last_status: 'failed' })])
    const { wrapper } = await mountDashboard()
    expect(wrapper.text()).not.toContain('节点数超过明细上限')
  })
})

// ── 批次 7：最近创建的路由时间列与行定位（消费批次 1 的 created_at） ──────
describe('Dashboard - 最近创建的路由时间列与行定位（批次 7）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('7.1 「创建时间」列以 formatMonthDayTime(record.created_at) 渲染（naive UTC → Asia/Shanghai 短格式）', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard()
    const expected = formatMonthDayTime('2026-10-10T06:30:00')
    const routeTable = wrapper.findAll('.table-card').find((t) => t.text().includes('最近创建的路由'))!
    // 共享 aTableStub 无 thead 渲染，列头定义走源码断言；单元格值走行为断言
    const src = readFileSync(resolve(process.cwd(), 'src/views/Dashboard.vue'), 'utf-8')
    expect(src).toContain("{ title: '创建时间', key: 'created_at' }")
    expect(routeTable.findAll('.ant-table-row')[0].text()).toContain(expected)
    // 约定 #26：禁止视图内 toLocaleString 直读后端时间
    expect(src).not.toMatch(/toLocaleString/)
  })

  it('7.2 具备 routes 权限的用户点击路由行 → 跳转 /routes', async () => {
    okApiMock()
    const { wrapper, router } = await mountDashboard({ role: 'admin' })
    const routeTable = wrapper.findAll('.table-card').find((t) => t.text().includes('最近创建的路由'))!
    const row = routeTable.findAll('.ant-table-row')[0]
    expect(row.classes()).toContain('clickable-row')
    await row.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/routes')
  })
})

// ── 批次 3：文案语义修正 ─────────────────────────────────────────────────
describe('Dashboard - 文案语义修正（批次 3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('3.1 集群徽章：status===1 →「已启用」、否则「已禁用」，不出现「正常运行/离线」', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard()
    expect(wrapper.text()).toContain('已启用')
    expect(wrapper.text()).toContain('已禁用')
    expect(wrapper.text()).not.toContain('正常运行')
    expect(wrapper.text()).not.toContain('离线')
  })

  it('3.2a 节点卡：标题「节点连通状态」，摘要三段 检测通过/未检测/检测失败（未检测中性灰），明细行徽章「检测失败」', async () => {
    // stats 与明细一致：nodes=3 online=2 untested=1 → X=1 Z=1 Y=1
    okApiMock(
      [nodeItem(1, 1, { last_status: 'passed' }), nodeItem(2, 1, null), nodeItem(3, 0, { last_status: 'failed' })],
      { nodes: 3, nodes_online: 2, nodes_untested: 1 },
    )
    const { wrapper } = await mountDashboard()

    expect(wrapper.text()).toContain('节点连通状态')
    const summary = wrapper.find('.node-summary')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('检测通过 1')
    expect(summary.text()).toContain('未检测 1')
    expect(summary.text()).toContain('检测失败 1')
    // 未检测用中性灰徽章（BadgeStatus 增量扩展 neutral）
    expect(summary.findAll('.badge-neutral').length).toBe(1)
    // 明细仅列检测失败节点，行徽章「检测失败」（批次 8 起明细为 TableCard 表格行）
    expect(wrapper.text()).not.toContain('10.0.0.1:')
    expect(wrapper.text()).not.toContain('10.0.0.2:')
    const failedRow = wrapper.findAll('.node-detail-card .ant-table-row').find((r) => r.text().includes('10.0.0.3:'))
    expect(failedRow).toBeTruthy()
    expect(failedRow!.text()).toContain('检测失败')
  })

  it('3.2b 未检测=0 且失败=0 且存在节点 → 绿横幅「全部 N 个节点上次检测通过」', async () => {
    okApiMock([nodeItem(1, 1, { last_status: 'passed' }), nodeItem(2, 1, { last_status: 'passed' })], {
      nodes: 2,
      nodes_online: 2,
      nodes_untested: 0,
    })
    const { wrapper } = await mountDashboard()
    expect(wrapper.text()).toContain('全部 2 个节点上次检测通过')
  })

  it('3.2c 存在未检测节点 → 不显示全通过横幅', async () => {
    okApiMock([nodeItem(1, 1, { last_status: 'passed' }), nodeItem(2, 1, null)], {
      nodes: 2,
      nodes_online: 2,
      nodes_untested: 1,
    })
    const { wrapper } = await mountDashboard()
    expect(wrapper.text()).not.toContain('上次检测通过')
  })

  it('3.3 副标题「平台资源统计与快捷入口」；集群卡标题「集群」；最近路由标题「最近创建的路由」', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard()
    expect(wrapper.text()).toContain('平台资源统计与快捷入口')
    expect(wrapper.text()).not.toContain('网关运行状态')
    expect(wrapper.text()).toContain('集群')
    expect(wrapper.text()).toContain('最近创建的路由')
    expect(wrapper.text()).not.toContain('集群状态')
    expect(wrapper.text()).not.toContain('最近路由')
  })

  it('3.4 集群「显示名称」空值占位「—」', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard()
    // clusterItem(2, 0, null) → 显示名称列渲染「—」（限定双栏区=集群表，排除最近路由表行）
    const rows = wrapper.findAll('.dashboard-columns .ant-table-row')
    expect(rows.length).toBe(2)
    expect(rows[1].text()).toContain('—')
  })
})

// ── restricted-data-scoping 批次 2：空态文案角色区分（D5）+ 受限口径一致 ──
describe('Dashboard - 受限视角空态文案与口径一致（restricted-data-scoping 批次 2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  /** 空数据 mock（零分配受限口径形状）：三数据源全空、stats 集群域计数归零，users 保持全局（批次 1 契约） */
  function emptyApiMock() {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/dashboard/stats') {
        return Promise.resolve({
          data: {
            ...STATS,
            clusters: 0,
            nodes: 0,
            nodes_online: 0,
            nodes_untested: 0,
            upstreams: 0,
            routes: 0,
            plugin_configs: 0,
            global_rules: 0,
            static_resources: 0,
            plugin_metadata: 0,
          },
        })
      }
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockListNodes.mockResolvedValue({ data: { total: 0, page: 1, page_size: 500, items: [] } })
  }

  it('R2.1a 非管理员空数据区 → 「暂无可见{资源}，前往{资源}管理 →」，不出现「去创建」，CTA 链接保留', async () => {
    emptyApiMock()
    const { wrapper } = await mountDashboard({ role: 'user', permissions: ['clusters', 'nodes', 'routes'] })

    const ctas = wrapper.findAll('.empty-cta')
    const texts = ctas.map((c) => c.text())
    expect(texts.some((t) => t.includes('暂无可见集群，前往集群管理'))).toBe(true)
    expect(texts.some((t) => t.includes('暂无可见节点，前往节点管理'))).toBe(true)
    expect(texts.some((t) => t.includes('暂无可见路由，前往路由管理'))).toBe(true)
    // SHALL NOT「去创建」：受限用户创建通常是管理员动作，集群存在只是未分配
    expect(wrapper.text()).not.toContain('去创建')
    // CTA 链接保留（被分配数据可在管理页查看，链接目标与现有一致）
    const hrefs = ctas.map((c) => c.attributes('href'))
    expect(hrefs).toContain('/clusters')
    expect(hrefs).toContain('/nodes')
    expect(hrefs).toContain('/routes')
  })

  it('R2.1b 管理员空数据区 → 保持既有「还没有{资源}，去创建/去添加 →」文案，不出现受限文案', async () => {
    emptyApiMock()
    const { wrapper } = await mountDashboard({ role: 'admin' })
    const text = wrapper.text()
    expect(text).toContain('还没有集群，去创建')
    expect(text).toContain('还没有节点，去添加')
    expect(text).toContain('还没有路由，去创建')
    expect(text).not.toContain('暂无可见')
  })

  it('R2.3 受限口径一致：stats 与明细同源同值 → 统计卡数字与明细卡数据一致（集群/节点/路由）', async () => {
    // 批次 1 契约形状：非管理员 stats 集群域计数与明细端点（/clusters、/nodes、/dashboard/recent-routes）
    // 同为分配口径；此处以同源同值 mock 钉住前端「两处各渲染自己数据源」的口径一致渲染
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/dashboard/stats') {
        return Promise.resolve({
          data: { ...STATS, clusters: 2, nodes: 2, nodes_online: 2, nodes_untested: 0, upstreams: 3, routes: 2 },
        })
      }
      if (url === '/dashboard/recent-routes') {
        return Promise.resolve({ data: { items: [routeItem(1, 'alpha'), routeItem(2, 'beta')] } })
      }
      if (url === '/clusters') return Promise.resolve({ data: { items: [clusterItem(1, 1), clusterItem(2, 1)] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockListNodes.mockResolvedValue({
      data: {
        total: 2,
        page: 1,
        page_size: 500,
        items: [nodeItem(1, 1, { last_status: 'passed' }), nodeItem(2, 1, { last_status: 'passed' })],
      },
    })
    const { wrapper } = await mountDashboard({
      role: 'user',
      permissions: ['clusters', 'nodes', 'routes', 'upstreams'],
    })

    const statValue = (label: string) =>
      wrapper
        .findAll('.stat-card')
        .find((c) => c.find('.stat-card-label').text() === label)!
        .find('.stat-card-value')
        .text()
    // 集群：stats.clusters=2 且 /clusters 2 条 → 统计卡 2 ⇔ 集群卡「共 2 个」
    expect(statValue('集群')).toBe('2')
    expect(wrapper.text()).toContain('共 2 个')
    // 路由：stats.routes=2 且 recent-routes 2 条 → 统计卡 2 ⇔ 「共 2 条」
    expect(statValue('路由')).toBe('2')
    expect(wrapper.text()).toContain('共 2 条')
    // 节点：stats.nodes=2（online=2 untested=0）且 /nodes 2 条 → 统计卡 2 + 三态摘要 ⇔ 全通过横幅
    expect(statValue('节点')).toBe('2')
    expect(wrapper.text()).toContain('通过 2 · 未检测 0 · 失败 0')
    expect(wrapper.text()).toContain('全部 2 个节点上次检测通过')
  })
})
