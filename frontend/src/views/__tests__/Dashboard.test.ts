import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import type { Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useFeaturesStore } from '@/stores/features'
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

// ── mock 形状依据（约定 #43，curl 实测开发后端）：
//    GET /dashboard/stats → 平铺计数；GET /dashboard/recent-routes → items（current_version 已透出）
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

function routeItem(id: number, name: string, current_version: number | null = 1) {
  return {
    id,
    name,
    uri: `/r${id}/*`,
    status: 1,
    cluster_name: '演示集群',
    // naive UTC isoformat（2026-10-10 curl 实测）
    created_at: '2026-10-10T06:30:00',
    current_version,
  }
}

function clusterItem(id: number, status: number, display_name: string | null = `集群${id}`) {
  return { id, name: `c${id}`, display_name, status, node_count: 1, healthy_node_count: status === 1 ? 1 : 0 }
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
  const wrapper = mount(Dashboard, { global: { plugins: [router] } })
  await flushPromises()
  await flushPromises()
  return { wrapper, router }
}

const apiCalls = (url: string) => mockApiGet.mock.calls.filter((c) => c[0] === url).length

/** 按 dc-title 找状态卡 */
function cardByTitle(wrapper: ReturnType<typeof mount>['wrapper'], title: string) {
  return wrapper.findAll('.dash-card').find((c) => c.find('.dc-title').text() === title)!
}

// ── 三态与错误处理（意图沿用旧契约，选择器随 21.10 解剖反转） ────────────────
describe('Dashboard - 三态与错误处理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('全部失败 → danger 横幅 + 重试；大数卡不渲染、数据区为错误条（无完成态假象）', async () => {
    mockApiGet.mockRejectedValue(new Error('boom'))
    mockListNodes.mockRejectedValue(new Error('boom'))
    const { wrapper } = await mountDashboard()

    const banner = wrapper.find('.load-banner-danger')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('数据加载失败，请检查后端服务是否可用')
    expect(banner.findAll('button').some((b) => b.text() === '重试')).toBe(true)
    expect(wrapper.findAll('.dstat')).toHaveLength(0)
    expect(wrapper.findAll('.area-error').length).toBeGreaterThanOrEqual(1)
    expect(wrapper.findAll('.dash-card tbody tr')).toHaveLength(0)
  })

  it('部分失败 → 横幅列失败资源名 + 失败区错误条，成功区照常渲染', async () => {
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
    const areaErrors = wrapper.findAll('.area-error')
    expect(areaErrors.length).toBe(1)
    expect(areaErrors[0].text()).toContain('加载失败')
    // 成功区照常渲染（最近路由 1 行 + 节点失败明细 1 行）
    expect(wrapper.findAll('.dash-card tbody tr').length).toBe(2)
    expect(wrapper.text()).toContain('1 条')
    expect(wrapper.text()).toContain(String(STATS.clusters))
  })

  it('「重试」只重发失败的请求', async () => {
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
    // 恢复后横幅消失、错误条清零
    expect(wrapper.find('.load-banner').exists()).toBe(false)
    expect(wrapper.findAll('.area-error')).toHaveLength(0)
  })

  it('首次加载：大数卡降交互样式 + 数据卡不闪空态 CTA，完成后消失', async () => {
    let resolveStats!: (v: unknown) => void
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/dashboard/stats') return new Promise((res) => (resolveStats = res))
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [routeItem(1, 'alpha')] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [clusterItem(1, 1)] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockListNodes.mockResolvedValue({ data: { total: 0, page: 1, page_size: 500, items: [] } })

    const Dashboard = (await import('@/views/Dashboard.vue')).default
    const wrapper = mount(Dashboard, { global: { plugins: [makeRouter()] } })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.dash-stats-loading').exists()).toBe(true)
    // 加载中不出现空态 CTA（避免「去创建」闪烁）
    expect(wrapper.findAll('.empty-cta')).toHaveLength(0)

    resolveStats({ data: { ...STATS } })
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.dash-stats-loading').exists()).toBe(false)
  })

  it('空态显示引导 CTA（集群/节点/路由），不出现默认「暂无数据」', async () => {
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

  it('某区 403 → 该区静默隐藏，不计入 loadErrors、不出现错误横幅', async () => {
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
    expect(wrapper.findAll('.area-error')).toHaveLength(0)
    // 集群区整体隐藏（含「查看全部集群」头链），对照组：其他区照常
    expect(wrapper.text()).not.toContain('查看全部集群')
    expect(wrapper.findAll('.dash-card tbody tr').length).toBe(1)
  })
})

// ── 刷新与时间锚点 ────────────────────────────────────────────────────────
describe('Dashboard - 刷新与时间锚点', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('刷新期间旧数据保留（不清空、不回全 0）', async () => {
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

    // 刷新在途：旧数据仍在（集群表 2 行）
    const clusterCard = cardByTitle(wrapper, '集群')
    expect(clusterCard.findAll('tbody tr').length).toBe(2)

    resolveClusters({ data: { items: [clusterItem(1, 1), clusterItem(2, 1), clusterItem(3, 1)] } })
    await flushPromises()
    await flushPromises()
    expect(clusterCard.findAll('tbody tr').length).toBe(3)
  })

  it('首次成功加载前「更新于」不渲染；成功后显示「更新于 MM/DD HH:mm」', async () => {
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
    const wrapper = mount(Dashboard, { global: { plugins: [makeRouter()] } })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.updated-at').exists()).toBe(false)

    resolvers.forEach((r) => r({ data: { items: [] } }))
    await flushPromises()
    await flushPromises()

    const updated = wrapper.find('.updated-at')
    expect(updated.exists()).toBe(true)
    expect(updated.text()).toMatch(/^更新于 \d{2}\/\d{2} \d{2}:\d{2}$/)
  })

  it('刷新期间按钮禁用显示「刷新中…」，完成后恢复并更新时间戳', async () => {
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

  it('加载进行中：重复点「刷新」不产生并发重复请求（in-flight 守卫）', async () => {
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

    await refreshBtn.trigger('click')
    await flushPromises()
    expect(apiCalls('/dashboard/stats')).toBe(statsBefore + 1)

    resolveStats({ data: { ...STATS } })
    await flushPromises()
    await flushPromises()
    expect(apiCalls('/dashboard/stats')).toBe(statsBefore + 1)
  })

  it('在途期间分区「重试」与横幅「重试」禁用，不产生并发重复请求', async () => {
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

    const areaRetry = wrapper.find('.area-error').findAll('button')[0]
    await areaRetry.trigger('click')
    await flushPromises()
    expect(apiCalls('/clusters')).toBe(2)

    const bannerRetry = wrapper.find('.load-banner-partial').findAll('button')[0]
    const areaRetryNow = wrapper.find('.area-error').findAll('button')[0]
    const refreshingBtn = wrapper.findAll('button').find((b) => b.text() === '刷新中…')!
    expect(bannerRetry.attributes('disabled')).toBeDefined()
    expect(areaRetryNow.attributes('disabled')).toBeDefined()
    expect(refreshingBtn.attributes('disabled')).toBeDefined()

    await bannerRetry.trigger('click')
    await areaRetryNow.trigger('click')
    await refreshingBtn.trigger('click')
    await flushPromises()
    expect(apiCalls('/clusters')).toBe(2)
    expect(apiCalls('/dashboard/stats')).toBe(1)

    resolveRetry({ data: { items: [clusterItem(1, 1)] } })
    await flushPromises()
    await flushPromises()
    expect(wrapper.find('.load-banner').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text() === '刷新')).toBe(true)
  })
})

// ── 权限过滤（与 AppSidebar 同源三元模型） ───────────────────────────────
describe('Dashboard - 权限过滤', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('非管理员无权限：chip/大数卡/数据卡不渲染', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({
      role: 'user',
      permissions: ['clusters', 'nodes', 'routes', 'upstreams'],
    })
    const text = wrapper.text()
    expect(text).not.toContain('用户管理')
    expect(text).not.toContain('数据库管理')
    expect(text).not.toContain('审计日志')
    expect(text).not.toContain('节点任务中心')
    expect(text).not.toContain('Ansible 主机清单')
    expect(text).not.toContain('自启动管理')
    expect(text).not.toContain('Edge 直连')
    expect(text).not.toContain('插件组')
    expect(text).not.toContain('插件元数据')
    expect(text).not.toContain('全局规则')
    expect(text).not.toContain('静态资源')
    expect(text).not.toContain('指标总览')
    // 有权限数据卡照常渲染
    expect(text).toContain('查看全部集群')
    expect(text).toContain('节点连通状态')
    expect(text).toContain('查看全部路由')
  })

  it('管理员全部入口可见', async () => {
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

  it('数据库管理双门控：持 permission 但 feature 关闭 → 不渲染', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({
      role: 'user',
      permissions: ['database_management'],
      features: { database_management: false },
    })
    expect(wrapper.text()).not.toContain('数据库管理')
  })

  it('fetch-visible-only：无权限数据区不渲染且不发起请求', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({ role: 'user', permissions: [] })
    expect(apiCalls('/dashboard/stats')).toBe(1)
    expect(apiCalls('/clusters')).toBe(0)
    expect(apiCalls('/dashboard/recent-routes')).toBe(0)
    expect(mockListNodes).not.toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).not.toContain('查看全部集群')
    expect(text).not.toContain('查看全部节点')
    expect(text).not.toContain('查看全部路由')
  })

  it('仅持 clusters：只请求集群区，节点/路由区不请求不渲染', async () => {
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

// ── 权限键映射与 AppSidebar 同源（源码级钉住） ──────────────────────────
describe('Dashboard - 权限键映射与 AppSidebar 同源', () => {
  const dashSrc = readFileSync(resolve(process.cwd(), 'src/views/Dashboard.vue'), 'utf-8')
  const sidebarSrc = readFileSync(resolve(process.cwd(), 'src/components/AppSidebar.vue'), 'utf-8')

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
      expect(sidebar.feature, `侧边栏 ${e.path} feature 漂移`).toBe(e.feature)
    }
  })

  it('大数统计卡键值符合门控映射', () => {
    for (const [path, perm] of [
      ['/clusters', 'clusters'],
      ['/nodes', 'nodes'],
      ['/upstreams', 'upstreams'],
      ['/routes', 'routes'],
    ] as const) {
      const g = gatesOf(dashSrc, `to: '${path}'`, /path:\s*'|to:\s*'/)
      expect(g.permission, `大数卡 ${path} permission 漂移`).toBe(perm)
    }
    expect(dashSrc).toContain("canEnter({ permission: 'clusters' })")
    expect(dashSrc).toContain("canEnter({ permission: 'nodes' })")
    expect(dashSrc).toContain("canEnter({ permission: 'routes' })")
  })
})

// ── 新解剖细节（设计稿语言；旧 TableCard/StatCard 契约随解剖反转） ────────
describe('Dashboard - 卡片解剖细节（dashboard-cluster-parity）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('大数统计 4 卡：色相左条类 + label 右上 + mono 大数；节点卡副文案 = 健康 N · 离线 M', async () => {
    okApiMock([nodeItem(8, 0, { last_status: 'failed' }), nodeItem(9, 0, { last_status: 'failed' })], {
      nodes: 5,
      nodes_online: 3,
      nodes_untested: 1,
    })
    const { wrapper } = await mountDashboard()
    const dstats = wrapper.findAll('.dstat')
    expect(dstats.length).toBe(4)
    expect(dstats[0].classes()).toContain('cluster-c1')
    expect(dstats[1].classes()).toContain('cluster-c3')
    expect(dstats[3].classes()).toContain('cluster-c7')
    expect(dstats[0].find('.d-num').text()).toBe('2')
    expect(dstats[0].find('.d-label').text()).toBe('集群')
    expect(dstats[1].find('.d-sub').text()).toBe('健康 3 · 离线 2')
    // 大数卡深链
    const hrefs = dstats.map((d) => d.attributes('href'))
    expect(hrefs).toEqual(['/clusters', '/nodes', '/upstreams', '/routes'])
  })

  it('集群卡行：中文名 + 标识 mono + 启用徽标 + 健康比（不足着警示色）', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard()
    const card = cardByTitle(wrapper, '集群')
    const rows = card.findAll('tbody tr')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('集群1')
    expect(rows[0].text()).toContain('c1')
    expect(rows[0].text()).toContain('已启用')
    expect(rows[1].text()).toContain('已禁用')
    // clusterItem(2) healthy 0/1 → 着警示
    expect(rows[1].find('.c-warn').exists()).toBe(true)
  })

  it('节点卡：失败行在前 + 通过行补齐（上限 8 行）+ 检测通过/失败徽章', async () => {
    okApiMock([
      nodeItem(3, 0, { last_status: 'failed' }),
      nodeItem(1, 1, { last_status: 'passed' }),
      nodeItem(2, 1, null),
    ])
    const { wrapper } = await mountDashboard()
    const card = cardByTitle(wrapper, '节点连通状态')
    const rows = card.findAll('tbody tr')
    expect(rows.length).toBe(3)
    // 失败行在前
    expect(rows[0].text()).toContain('10.0.0.3')
    expect(rows[0].text()).toContain('检测失败')
    expect(rows[1].text()).toContain('检测通过')
  })

  it('节点明细上限 8 行：失败优先保留（500 全失败 → 仅前 8 行 + 截断提示）', async () => {
    okApiMock(
      Array.from({ length: 500 }, (_, i) => nodeItem(i + 1, 0, { last_status: 'failed' })),
      { nodes: 600, nodes_online: 500, nodes_untested: 0 },
    )
    const { wrapper } = await mountDashboard()
    const card = cardByTitle(wrapper, '节点连通状态')
    expect(card.findAll('tbody tr').length).toBe(8)
    const notice = wrapper.find('.truncate-notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toBe('节点数超过明细上限，失败清单可能不完整')
  })

  it('最近路由卡：名称 + URI mono 胶囊 + 发布徽标（vN / 未发布）', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard()
    const card = cardByTitle(wrapper, '最近创建的路由')
    const rows = card.findAll('tbody tr')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('alpha')
    expect(rows[0].find('.pipe-uri').text()).toBe('/r1/*')
    expect(rows[0].find('.ps-tag.ps-pub').text()).toBe('v1')
  })

  it('最近路由卡未发布态：current_version=null → 未发布徽标', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/dashboard/stats') return Promise.resolve({ data: { ...STATS } })
      if (url === '/dashboard/recent-routes') return Promise.resolve({ data: { items: [routeItem(1, 'alpha', null)] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockListNodes.mockResolvedValue({ data: { total: 0, page: 1, page_size: 500, items: [] } })
    const { wrapper } = await mountDashboard()
    const card = cardByTitle(wrapper, '最近创建的路由')
    expect(card.find('.ps-tag.ps-unpub').text()).toBe('未发布')
  })

  it('快捷入口单卡合并：运维组在前、资源组在后；q-cnt 计数；feature 圆点', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({ role: 'admin' })
    const quickCard = wrapper.find('.quick-card')
    expect(quickCard.find('.dc-title').text()).toBe('快捷入口')
    const chips = quickCard.findAll('.quick-chip')
    const titles = chips.map((c) => c.text())
    // 运维组在前（节点任务中心 first）、资源组在后（插件组在插件元数据前）
    expect(titles.findIndex((t) => t.includes('节点任务中心'))).toBeLessThan(
      titles.findIndex((t) => t.includes('插件组')),
    )
    // 运维类（feature 门控）带 q-dot；关闭 feature → off 灰点
    const taskChip = chips.find((c) => c.text().includes('节点任务中心'))!
    expect(taskChip.find('.q-dot').exists()).toBe(true)
    // 资源类计数
    const plgChip = chips.find((c) => c.text().includes('插件组'))!
    expect(plgChip.find('.q-cnt').text()).toBe(String(STATS.plugin_configs))
  })

  it('页头动作 = 更新于 + 刷新；无「新建集群」（用户裁决）', async () => {
    okApiMock()
    const { wrapper } = await mountDashboard({ role: 'admin' })
    const actions = wrapper.findAll('.page-header-actions button').map((b) => b.text())
    expect(actions).toEqual(['刷新'])
    expect(wrapper.text()).not.toContain('新建集群')
  })
})

// ── 权限键映射防漂移补充 + 类型化（沿用旧源码守卫） ─────────────────────
describe('Dashboard - 源码守卫', () => {
  it('recentRoutes/clusterStatus 类型化，无 ref<any[]>', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/Dashboard.vue'), 'utf-8')
    expect(src).toContain('ref<RecentRouteRow[]>')
    expect(src).toContain('ref<ClusterRow[]>')
    expect(src).not.toMatch(/ref<any\[\]>/)
  })

  it('时间渲染禁 toLocaleString；「更新于」走 formatMonthDayTime 单点', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/Dashboard.vue'), 'utf-8')
    expect(src).not.toMatch(/toLocaleString/)
    expect(src).toContain('formatMonthDayTime')
  })
})

// ── 受限视角空态文案与口径一致（restricted-data-scoping 批次 2 意图延续） ──
describe('Dashboard - 受限视角空态文案与口径一致', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

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

  it('非管理员空数据区 → 「暂无可见{资源}，前往{资源}管理 →」，不出现「去创建」', async () => {
    emptyApiMock()
    const { wrapper } = await mountDashboard({ role: 'user', permissions: ['clusters', 'nodes', 'routes'] })

    const ctas = wrapper.findAll('.empty-cta')
    const texts = ctas.map((c) => c.text())
    expect(texts.some((t) => t.includes('暂无可见集群，前往集群管理'))).toBe(true)
    expect(texts.some((t) => t.includes('暂无可见节点，前往节点管理'))).toBe(true)
    expect(texts.some((t) => t.includes('暂无可见路由，前往路由管理'))).toBe(true)
    expect(wrapper.text()).not.toContain('去创建')
    const hrefs = ctas.map((c) => c.attributes('href'))
    expect(hrefs).toContain('/clusters')
    expect(hrefs).toContain('/nodes')
    expect(hrefs).toContain('/routes')
  })

  it('管理员空数据区 → 「还没有{资源}，去创建/去添加 →」，不出现受限文案', async () => {
    emptyApiMock()
    const { wrapper } = await mountDashboard({ role: 'admin' })
    const text = wrapper.text()
    expect(text).toContain('还没有集群，去创建')
    expect(text).toContain('还没有节点，去添加')
    expect(text).toContain('还没有路由，去创建')
    expect(text).not.toContain('暂无可见')
  })

  it('受限口径一致：stats 与明细同源同值 → 大数卡数字与状态卡行数一致', async () => {
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
        .findAll('.dstat')
        .find((d) => d.find('.d-label').text() === label)!
        .find('.d-num')
        .text()
    // 集群：stats.clusters=2 ⇔ 集群卡 2 行
    expect(statValue('集群')).toBe('2')
    expect(cardByTitle(wrapper, '集群').findAll('tbody tr').length).toBe(2)
    // 路由：stats.routes=2 ⇔ 最近路由卡 2 行
    expect(statValue('路由')).toBe('2')
    expect(cardByTitle(wrapper, '最近创建的路由').findAll('tbody tr').length).toBe(2)
    // 节点：stats.nodes=2（online=2）⇔ 副文案 健康 2 · 离线 0
    expect(statValue('节点')).toBe('2')
    expect(
      wrapper
        .findAll('.dstat')
        .find((d) => d.find('.d-label').text() === '节点')!
        .find('.d-sub')
        .text(),
    ).toBe('健康 2 · 离线 0')
  })
})

// formatMonthDayTime 仍被「更新于」消费（导入保留断言，防 dead import）
describe('Dashboard - 时间语言', () => {
  it('「更新于」文案 = formatMonthDayTime 输出形状（MM/DD HH:mm）', async () => {
    expect(formatMonthDayTime('2026-10-10T06:30:00')).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/)
  })
})
