import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    component: () => import('@/views/DefaultLayout.vue'),
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue')
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/UserList.vue')
      },
      {
        path: 'clusters',
        name: 'Clusters',
        component: () => import('@/views/ClusterList.vue'),
      },
      {
        path: 'edge-client',
        name: 'EdgeClient',
        component: () => import('@/views/EdgeClient.vue'),
        meta: { permission: 'edge_nodes' }
      },
      {
        path: 'edge-import',
        name: 'EdgeImport',
        component: () => import('@/views/EdgeImport.vue'),
      },
      {
        path: 'upstreams',
        name: 'UpstreamList',
        component: () => import('@/views/UpstreamList.vue'),
      },
      {
        path: 'routes',
        name: 'RouteList',
        component: () => import('@/views/RouteList.vue'),
      },
      {
        path: 'plugin-configs',
        name: 'PluginConfigList',
        component: () => import('@/views/PluginConfigList.vue'),
      },
      {
        path: 'global-rules',
        name: 'GlobalRuleList',
        component: () => import('@/views/GlobalRuleList.vue'),
      },
      {
        path: 'static-resources',
        name: 'StaticResourceList',
        component: () => import('@/views/StaticResourceList.vue'),
      },
      {
        path: 'tools',
        name: 'Tools',
        component: () => import('@/views/Tools.vue')
      },
      {
        path: 'plugin-switches',
        name: 'PluginSwitches',
        component: () => import('@/views/PluginSwitches.vue'),
        meta: { permission: 'plugin_management' }
      },
      {
        path: 'plugin-metadata',
        name: 'PluginMetadataList',
        component: () => import('@/views/PluginMetadataList.vue'),
      },
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from) => {
  const token = localStorage.getItem('token')
  if (to.path !== '/login' && !token) {
    return '/login'
  }

  // 权限检查：路由配置了 requiredPermission 时需要对应的权限
  const requiredPermission = to.meta?.permission as string | undefined
  if (requiredPermission) {
    const authStore = useAuthStore()
    if (!authStore.hasPermission(requiredPermission)) {
      return '/'
    }
  }
})

export default router