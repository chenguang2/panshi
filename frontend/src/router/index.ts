import { createRouter, createWebHistory } from 'vue-router'
import type { Router, RouteRecordRaw } from 'vue-router'
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
    meta: { permission: 'tools' },
  },
  ansible_inventory: {
    path: 'ansible-inventory',
    name: 'AnsibleInventory',
    component: () => import('@/views/AnsibleInventory.vue'),
    meta: { permission: 'tools' },
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
  ssl_cert: {
    path: 'ssl',
    name: 'SslList',
    component: () => import('@/views/SslList.vue'),
    meta: { permission: 'ssl_cert' },
  },
  dns_proxy_http: {
    path: 'dns-queries',
    name: 'DnsQueryList',
    component: () => import('@/views/DnsQueryList.vue'),
    meta: { permission: 'dns_proxy_http' },
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
  task_center: {
    path: 'node-tasks',
    name: 'NodeTaskCenter',
    component: () => import('@/views/NodeTaskCenter.vue'),
    meta: { permission: 'task_center' },
  },
  database_management: {
    path: 'database-management',
    name: 'DatabaseManagement',
    component: () => import('@/views/DatabaseManagement.vue'),
    meta: { permission: 'database_management' },
  },
}

// ── Static routes (always registered) ─────────────────────────────────

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
      { path: 'users', name: 'Users', component: () => import('@/views/UserList.vue') },
      { path: 'central-management', name: 'CentralManagement', component: () => import('@/views/CentralList.vue'), meta: { permission: 'central_management' } },
      { path: 'clusters', name: 'ClusterList', component: () => import('@/views/ClusterList.vue'), meta: { permission: 'clusters' } },
      { path: 'upstreams', name: 'UpstreamList', component: () => import('@/views/UpstreamList.vue'), meta: { permission: 'upstreams' } },
      { path: 'routes', name: 'RouteList', component: () => import('@/views/RouteList.vue'), meta: { permission: 'routes' } },
      { path: 'plugin-configs', name: 'PluginConfigList', component: () => import('@/views/PluginConfigList.vue'), meta: { permission: 'plugin_groups' } },
      { path: 'global-rules', name: 'GlobalRuleList', component: () => import('@/views/GlobalRuleList.vue'), meta: { permission: 'global_rules' } },
      { path: 'static-resources', name: 'StaticResourceList', component: () => import('@/views/StaticResourceList.vue'), meta: { permission: 'static_resources' } },
      { path: 'plugin-metadata', name: 'PluginMetadataList', component: () => import('@/views/PluginMetadataList.vue'), meta: { permission: 'plugin_metadata' } },
      { path: 'nodes', name: 'NodeList', component: () => import('@/views/NodeList.vue'), meta: { permission: 'nodes' } },
    ],
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

  const requiredPermission = to.meta?.permission as string | undefined
  if (requiredPermission) {
    const authStore = useAuthStore()
    if (!authStore.hasPermission(requiredPermission)) {
      return '/'
    }
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

export default router
