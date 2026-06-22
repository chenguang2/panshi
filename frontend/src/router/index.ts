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
  },
  tools: {
    path: 'tools',
    name: 'Tools',
    component: () => import('@/views/Tools.vue'),
  },
  plugin_switches: {
    path: 'plugin-switches',
    name: 'PluginSwitches',
    component: () => import('@/views/PluginSwitches.vue'),
    meta: { permission: 'plugin_management' },
  },
  metrics: [
    {
      path: 'metrics',
      name: 'Metrics',
      component: () => import('@/views/Metrics.vue'),
    },
    {
      path: 'metrics/dashboard',
      name: 'MetricsDashboard',
      component: () => import('@/views/MetricsDashboard.vue'),
    },
  ],
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
      { path: 'central-management', name: 'CentralManagement', component: () => import('@/views/CentralList.vue') },
      { path: 'clusters', name: 'ClusterList', component: () => import('@/views/ClusterList.vue') },
      { path: 'upstreams', name: 'UpstreamList', component: () => import('@/views/UpstreamList.vue') },
      { path: 'routes', name: 'RouteList', component: () => import('@/views/RouteList.vue') },
      { path: 'plugin-configs', name: 'PluginConfigList', component: () => import('@/views/PluginConfigList.vue') },
      { path: 'global-rules', name: 'GlobalRuleList', component: () => import('@/views/GlobalRuleList.vue') },
      { path: 'static-resources', name: 'StaticResourceList', component: () => import('@/views/StaticResourceList.vue') },
      { path: 'plugin-metadata', name: 'PluginMetadataList', component: () => import('@/views/PluginMetadataList.vue') },
      { path: 'nodes', name: 'NodeList', component: () => import('@/views/NodeList.vue') },
    ],
  },
]

const SAVE_SCROLL_KEY = 'panshi_scroll'

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
  sessionStorage.setItem(SAVE_SCROLL_KEY + '_' + _from.path, JSON.stringify({ x: window.scrollX, y: window.scrollY }))

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
