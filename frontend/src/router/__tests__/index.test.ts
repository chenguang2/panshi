import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useFeaturesStore } from '@/stores/features'

// ── 路由守卫用例的桩 ──────────────────────────────────────────────────
// vi.hoisted：@/stores/auth → @/api 静态导入链在导入期就触发 antdv mock 工厂，
// 顶层 const 尚未初始化，必须用 vi.hoisted 保证先于工厂求值。
const mockMessage = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))
vi.mock('ant-design-vue', () => ({ message: mockMessage }))

// 守卫重定向后的重定向目标（'/'）与被拦截路由的懒加载视图全部打桩：
// beforeEach 在组件解析之前执行，重定向发生时目标组件本就不应被加载。
vi.mock('@/views/DefaultLayout.vue', () => ({ default: { template: '<router-view />' } }))
vi.mock('@/views/Dashboard.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/views/NodeTaskCenter.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/views/NodeTaskDetail.vue', () => ({ default: { template: '<div />' } }))

describe('Router', () => {
  it('has /nodes route registered', async () => {
    const routes = (await import('../index')).default.getRoutes()
    const nodeRoute = routes.find((r: any) => r.path === '/nodes')
    if (!nodeRoute) {
      const layoutRoute = routes.find((r: any) => r.path === '/')
      const childRoute = layoutRoute?.children?.find((c: any) => c.path === 'nodes')
      expect(childRoute).toBeDefined()
      expect(childRoute?.name).toBe('NodeList')
    } else {
      expect(nodeRoute).toBeDefined()
    }
  })

  it('has /dns-queries route registered in feature route map (dynamic registration)', async () => {
    const { featureRouteMap } = await import('../index')
    const found = Object.values(featureRouteMap)
      .flat()
      .some((r: unknown) => (r as { name?: string }).name === 'DnsQueryList')
    expect(found).toBe(true)
  })

  it('has /backup-management route in feature route map with db_backup permission (dynamic registration)', async () => {
    const { featureRouteMap } = await import('../index')
    const route = featureRouteMap.db_backup as { name?: string; path?: string; meta?: { permission?: string } }
    expect(route).toBeDefined()
    expect(route?.name).toBe('BackupManagement')
    expect(route?.path).toBe('backup-management')
    expect(route?.meta?.permission).toBe('db_backup')
  })

  it('has /db-migration route in dedicated db_migration feature map with db_migration permission (dynamic registration)', async () => {
    const { featureRouteMap } = await import('../index')
    const route = featureRouteMap.db_migration as { name?: string; path?: string; meta?: { permission?: string } }
    expect(route).toBeDefined()
    expect(route?.name).toBe('DbMigration')
    expect(route?.path).toBe('db-migration')
    expect(route?.meta?.permission).toBe('db_migration')
    // 不再挂在 database_management 下
    expect(featureRouteMap.database_management).toBeDefined()
    const dmRoutes = Array.isArray(featureRouteMap.database_management)
      ? featureRouteMap.database_management
      : [featureRouteMap.database_management]
    expect(dmRoutes.some((r) => r.name === 'DbMigration')).toBe(false)
  })

  it('has /relay-gateways route in relay_gateway feature map (dynamic registration, not static)', async () => {
    const mod = await import('../index')
    const route = mod.featureRouteMap.relay_gateway as { name?: string; path?: string; meta?: { permission?: string } }
    expect(route).toBeDefined()
    expect(route?.name).toBe('RelayGateways')
    expect(route?.path).toBe('relay-gateways')
    expect(route?.meta?.permission).toBe('relay_gateway')
    // 不再静态注册（静态注册不受 features.yaml 门控，关闸后仍可路由直达）
    const staticRoutes = mod.default.getRoutes()
    expect(staticRoutes.some((r) => r.name === 'RelayGateways')).toBe(false)
  })

  it('registers /db-migration in navMeta search index (section + page name)', async () => {
    const { sectionMap, pageNameMap } = await import('../navMeta')
    expect(sectionMap.DbMigration).toBe('系统管理')
    expect(pageNameMap.DbMigration).toBe('数据迁移')
  })

  it('ssl_cert feature map holds CA/server routes plus /ssl redirect (dynamic registration)', async () => {
    const { featureRouteMap } = await import('../index')
    const entries = featureRouteMap.ssl_cert
    expect(Array.isArray(entries)).toBe(true)
    const routes = entries as Array<{ name?: string; path?: string; meta?: { permission?: string } }>
    expect(
      routes.some((r) => r.name === 'CaCertList' && r.path === 'ssl/ca' && r.meta?.permission === 'ssl_cert'),
    ).toBe(true)
    expect(
      routes.some((r) => r.name === 'ServerCertList' && r.path === 'ssl/server' && r.meta?.permission === 'ssl_cert'),
    ).toBe(true)
    const redirect = routes.find((r) => r.path === 'ssl')
    expect(redirect).toBeDefined()
    expect((redirect as { redirect?: string }).redirect).toBe('/ssl/server')
    // 旧 SslList 视图不再注册
    expect(routes.some((r) => r.name === 'SslList')).toBe(false)
    // 全部动态注册：静态路由表不含任何 ssl 路由
    const staticRoutes = (await import('../index')).default.getRoutes()
    expect(
      staticRoutes.some((r) => r.name === 'CaCertList' || r.name === 'ServerCertList' || r.name === 'SslList'),
    ).toBe(false)
  })

  it('registers cert pages in navMeta search index under 证书管理 section', async () => {
    const { sectionMap, pageNameMap } = await import('../navMeta')
    expect(sectionMap.CaCertList).toBe('证书管理')
    expect(sectionMap.ServerCertList).toBe('证书管理')
    expect(pageNameMap.CaCertList).toBe('CA 根证书')
    expect(pageNameMap.ServerCertList).toBe('服务器证书')
    expect(pageNameMap.SslList).toBeUndefined()
  })
})

describe('navMeta 与批 9 菜单信息架构同源（plugin-switches-ux-review-fixes 批 3）', () => {
  it('迁移键归位：插件开关→核心功能；监控组；中继区域→运维管理', async () => {
    const { sectionMap } = await import('../navMeta')
    expect(sectionMap.PluginSwitches).toBe('核心功能')
    expect(sectionMap.CentralManagement).toBe('核心功能')
    expect(sectionMap.MetricsDashboard).toBe('监控')
    expect(sectionMap.Metrics).toBe('监控')
    expect(sectionMap.ClickHouseConfig).toBe('监控')
    expect(sectionMap.RelayGateways).toBe('运维管理')
  })

  it('分组词表与侧边栏六组一致，「综合」不再出现（面包屑/全局搜索同源守卫）', async () => {
    const { sectionMap } = await import('../navMeta')
    const values = [...new Set(Object.values(sectionMap))]
    expect(values.sort()).toEqual(['核心功能', '证书管理', '边缘网络', '监控', '运维管理', '系统管理'].sort())
  })
})

describe('task_center 详情页路由（node-task-ux-optimization 7.4）', () => {
  it('node-tasks/:id 登记在 task_center 特性路由表内（关闸即整组不注册）', async () => {
    const mod = await import('../index')
    const entries = mod.featureRouteMap.task_center
    expect(Array.isArray(entries)).toBe(true)
    const routes = entries as Array<{ name?: string; path?: string; meta?: { permission?: string } }>
    expect(routes.some((r) => r.name === 'NodeTaskCenter' && r.path === 'node-tasks')).toBe(true)
    expect(
      routes.some(
        (r) => r.name === 'NodeTaskDetail' && r.path === 'node-tasks/:id' && r.meta?.permission === 'task_center',
      ),
    ).toBe(true)
    // 详情页不得静态注册（静态注册不受 features.yaml 门控）
    expect(mod.default.getRoutes().some((r) => r.name === 'NodeTaskDetail')).toBe(false)
  })

  it('详情页登记 navMeta 面包屑（运维管理 / 节点任务），参数化路由不进全局搜索索引', async () => {
    const { sectionMap, pageNameMap } = await import('../navMeta')
    expect(sectionMap.NodeTaskDetail).toBe('运维管理')
    expect(pageNameMap.NodeTaskDetail).toBe('节点任务')
  })
})

describe('beforeEach 权限拦截的 task_center 二阶提示（node-task-ux-review §11.5）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.setItem('token', 'test-token')
    mockMessage.warning.mockClear()
  })

  /** 按特性表注册动态路由（node-tasks 属 features.yaml 门控，静态表不含） */
  async function setupRoutesWithFeatures(featureKeys: string[]) {
    const featuresStore = useFeaturesStore()
    featuresStore.loaded = true
    featuresStore.features = Object.fromEntries(featureKeys.map((k) => [k, true]))
    const mod = await import('../index')
    mod.setupDynamicRoutes(mod.default)
    return mod.default
  }

  function loginAsNonAdminWithout(permission: string): void {
    const authStore = useAuthStore()
    authStore.user = { id: 2, username: 'operator', role: 'viewer', status: 1 }
    authStore.permissions = ['clusters'].filter((p) => p !== permission)
  }

  it('无 task_center 权限直达 /node-tasks/1 → 回落首页且 message.warning 中文提示', async () => {
    loginAsNonAdminWithout('task_center')
    const router = await setupRoutesWithFeatures(['task_center'])

    await router.push('/node-tasks/1')

    expect(router.currentRoute.value.path).toBe('/')
    expect(mockMessage.warning).toHaveBeenCalledTimes(1)
    expect(mockMessage.warning).toHaveBeenCalledWith('暂无节点任务权限，无法访问该页面')
  })

  it('对照：其它权限路由（/clusters）被拦截仍静默回落首页，不弹提示', async () => {
    loginAsNonAdminWithout('clusters')
    const router = await setupRoutesWithFeatures([])

    await router.push('/clusters')

    expect(router.currentRoute.value.path).toBe('/')
    expect(mockMessage.warning).not.toHaveBeenCalled()
  })
})
