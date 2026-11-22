import { createRouter, createWebHistory } from 'vue-router'
import type { Router, RouteRecordRaw } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'
import { useFeaturesStore } from '@/stores/features'

// ── Feature-gated route map ───────────────────────────────────────────
// Keyed by feature name from features.yaml.  Only registered when the
// corresponding feature is enabled.
// Value can be a single route or an array of routes (for features with
// multiple pages, like metrics).
export const featureRouteMap: Record<string, RouteRecordRaw | RouteRecordRaw[]> = {
  edge_client: {
    path: 'edge-client',
    name: 'EdgeClient',
    component: () => import('@/views/EdgeClient.vue'),
    meta: { permission: 'edge_nodes' },
  },
  edge_import: {
    path: 'edge-import',
    name: 'EdgeImport',
    component: () => import('@/views/EdgeImport.vue'),
    meta: { permission: 'edge_import' },
  },
  tools: {
    path: 'tools',
    name: 'Tools',
    component: () => import('@/views/Tools.vue'),
    meta: { permission: 'tools' },
  },
  edge_autostart: {
    path: 'edge-autostart',
    name: 'EdgeAutostart',
    component: () => import('@/views/EdgeAutostart.vue'),
    meta: { permission: 'edge_autostart' },
  },
  ansible_inventory: {
    path: 'ansible-inventory',
    name: 'AnsibleInventory',
    component: () => import('@/views/AnsibleInventory.vue'),
    meta: { permission: 'ansible_inventory', adminOnly: true },
  },
  plugin_switches: {
    path: 'plugin-switches',
    name: 'PluginSwitches',
    component: () => import('@/views/PluginSwitches.vue'),
    meta: { permission: 'plugin_management' },
  },
  stream_proxy: {
    path: 'stream-proxies',
    name: 'StreamProxyList',
    component: () => import('@/views/StreamProxyList.vue'),
    meta: { permission: 'stream_proxy' },
  },
  dns_proxy_udp: {
    path: 'dns-proxies',
    name: 'DnsUdpProxyList',
    component: () => import('@/views/DnsUdpProxyList.vue'),
    meta: { permission: 'dns_proxy_udp' },
  },
  ssl_cert: [
    {
      path: 'ssl/ca',
      name: 'CaCertList',
      component: () => import('@/views/CaCertList.vue'),
      meta: { permission: 'ssl_cert' },
    },
    {
      path: 'ssl/server',
      name: 'ServerCertList',
      component: () => import('@/views/ServerCertList.vue'),
      meta: { permission: 'ssl_cert' },
    },
    {
      // 旧路由兼容：/ssl → /ssl/server（禁用时整组不注册，直接 404）
      path: 'ssl',
      redirect: '/ssl/server',
    },
  ],
  dns_proxy_http: {
    path: 'dns-queries',
    name: 'DnsQueryList',
    component: () => import('@/views/DnsQueryList.vue'),
    meta: { permission: 'dns_proxy_http' },
  },
  relay_gateway: {
    path: 'relay-gateways',
    name: 'RelayGateways',
    component: () => import('@/views/RelayGateways.vue'),
    meta: { permission: 'relay_gateway' },
  },
  edge_env: {
    path: 'edge-env',
    name: 'EdgeEnv',
    component: () => import('@/views/EdgeEnv.vue'),
    meta: { permission: 'edge_env' },
  },
  metrics: [
    {
      path: 'metrics',
      name: 'Metrics',
      component: () => import('@/views/Metrics.vue'),
      meta: { permission: 'metrics' },
    },
    {
      path: 'metrics/dashboard',
      name: 'MetricsDashboard',
      component: () => import('@/views/MetricsDashboard.vue'),
      meta: { permission: 'metrics' },
    },
  ],
  // 列表 + 详情同属一个特性开关（AGENTS #61：详情页必须与列表同组，关闸后连直接链接也不可达）
  task_center: [
    {
      path: 'node-tasks',
      name: 'NodeTaskCenter',
      component: () => import('@/views/NodeTaskCenter.vue'),
      meta: { permission: 'task_center' },
    },
    {
      path: 'node-tasks/:id',
      name: 'NodeTaskDetail',
      component: () => import('@/views/NodeTaskDetail.vue'),
      // detailCrumb：面包屑追加「#id」层级（DefaultLayout 读取）
      meta: { permission: 'task_center', detailCrumb: true },
    },
  ],
  database_management: {
    path: 'database-management',
    name: 'DatabaseManagement',
    component: () => import('@/views/DatabaseManagement.vue'),
    meta: { permission: 'database_management' },
  },
  db_migration: {
    path: 'db-migration',
    name: 'DbMigration',
    component: () => import('@/views/DbMigrationPage.vue'),
    meta: { permission: 'db_migration' },
  },
  db_backup: {
    path: 'backup-management',
    name: 'BackupManagement',
    component: () => import('@/views/BackupManagement.vue'),
    meta: { permission: 'db_backup' },
  },
  audit_log: {
    path: 'audit-log',
    name: 'AuditLog',
    component: () => import('@/views/AuditLog.vue'),
    meta: { permission: 'audit_logs' },
  },
  clickhouse_config: {
    path: 'clickhouse-config',
    name: 'ClickHouseConfig',
    component: () => import('@/views/ClickHouseConfig.vue'),
    meta: { permission: 'clickhouse_config' },
  },
}

// ── Static routes (always registered) ─────────────────────────────────

/**
 * catch-all 占位路由的名字（B3）。
 *
 * 存在两个用途：① 未知路径给 404 空态（此前无 catch-all，访问错地址会得到
 * 空白页）；② bootstrap 阶段 feature-gated 深链的**暂定**落点——`app.mount()`
 * 即触发首次导航，而动态路由要等 features 拉取完成后才 `addRoute`，没有
 * catch-all 时 vue-router 会打 `No match found for location with path "..."`。
 *
 * `main.ts` 在 `setupDynamicRoutes` 之后用 `reenterIfPlaceholder` 判断「当前是否
 * 停在占位路由」并补做一次导航，故这里的名字是 bootstrap 收口的判据之一。
 */
export const BOOTSTRAP_PLACEHOLDER_NAME = 'BootstrapPlaceholder'

const coreRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('@/views/DefaultLayout.vue'),
    children: [
      { path: '', name: 'Dashboard', component: () => import('@/views/Dashboard.vue') },
      { path: 'users', name: 'Users', component: () => import('@/views/UserList.vue'), meta: { adminOnly: true } },
      {
        path: 'central-management',
        name: 'CentralManagement',
        component: () => import('@/views/CentralList.vue'),
        meta: { permission: 'central_management' },
      },
      {
        path: 'clusters',
        name: 'ClusterList',
        component: () => import('@/views/ClusterList.vue'),
        meta: { permission: 'clusters' },
      },
      {
        path: 'upstreams',
        name: 'UpstreamList',
        component: () => import('@/views/UpstreamList.vue'),
        meta: { permission: 'upstreams' },
      },
      {
        path: 'routes',
        name: 'RouteList',
        component: () => import('@/views/RouteList.vue'),
        meta: { permission: 'routes' },
      },
      {
        path: 'plugin-configs',
        name: 'PluginConfigList',
        component: () => import('@/views/PluginConfigList.vue'),
        meta: { permission: 'plugin_groups' },
      },
      {
        path: 'global-rules',
        name: 'GlobalRuleList',
        component: () => import('@/views/GlobalRuleList.vue'),
        meta: { permission: 'global_rules' },
      },
      {
        path: 'static-resources',
        name: 'StaticResourceList',
        component: () => import('@/views/StaticResourceList.vue'),
        meta: { permission: 'static_resources' },
      },
      {
        path: 'plugin-metadata',
        name: 'PluginMetadataList',
        component: () => import('@/views/PluginMetadataList.vue'),
        meta: { permission: 'plugin_metadata' },
      },
      {
        path: 'nodes',
        name: 'NodeList',
        component: () => import('@/views/NodeList.vue'),
        meta: { permission: 'nodes' },
      },
    ],
  },
  // 兜底路由必须留在静态表末尾：vue-router 按路径 score 排序（catch-all 恒最低），
  // 故任何静态/动态注册的具名路由都优先于它。此处的存在同时消除了首访
  // feature-gated 深链时 `No match found for location with path` 的告警。
  {
    path: '/:pathMatch(.*)*',
    name: BOOTSTRAP_PLACEHOLDER_NAME,
    component: () => import('@/views/NotFoundView.vue'),
  },
]

const router: Router = createRouter({
  history: createWebHistory(),
  routes: coreRoutes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  },
})

router.beforeEach((to, _from) => {
  const token = localStorage.getItem('token')
  if (to.path !== '/login' && !token) {
    return '/login'
  }

  const authStore = useAuthStore()
  const requiredPermission = to.meta?.permission as string | undefined
  if (requiredPermission) {
    if (!authStore.hasPermission(requiredPermission)) {
      // task_center 直达被拦时给二阶提示（node-task-ux-review §11.5）；其它权限路由维持静默回落，与全站现状一致
      if (requiredPermission === 'task_center') {
        message.warning('暂无节点任务权限，无法访问该页面')
      }
      return '/'
    }
  }
  // admin-only 路由（如 Ansible 主机清单——后端要求管理员，前端对齐）
  if (to.meta?.adminOnly && authStore.user?.role !== 'admin') {
    return '/'
  }
})

// ── Dynamic route setup (called after features are loaded) ────────────

export function setupDynamicRoutes(router: Router): void {
  const featuresStore = useFeaturesStore()
  for (const [feature, routeOrRoutes] of Object.entries(featureRouteMap)) {
    if (featuresStore.has(feature)) {
      const routes = Array.isArray(routeOrRoutes) ? routeOrRoutes : [routeOrRoutes]
      for (const route of routes) {
        router.addRoute('Layout', route)
      }
    }
  }
}

// ── Bootstrap 收口：首次导航补做（B3）─────────────────────────────────

/**
 * 当前是否停在 catch-all 占位路由上。
 *
 * 两种情形都算「首次导航没有真正落地」：
 * ① 首次导航被占位路由接住（feature-gated 深链，动态路由尚未注册）；
 * ② 首次导航确实解析失败（`currentRoute.name` 为空，如守卫生效前的 START 状态）。
 */
export function isOnBootstrapPlaceholder(router: Router): boolean {
  const current = router.currentRoute.value
  return !current.name || current.name === BOOTSTRAP_PLACEHOLDER_NAME
}

/**
 * 动态路由注册完成后，若仍停在占位路由则按原地址重导航一次。
 * 返回是否真的发起了重导航（已在真实路由上则不动，避免多余导航）。
 */
export async function reenterIfPlaceholder(router: Router, fullPath: string): Promise<boolean> {
  if (!isOnBootstrapPlaceholder(router)) return false
  await router.replace(fullPath).catch(() => {})
  return true
}

export default router
