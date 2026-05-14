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
        component: () => import('@/views/ClusterList.vue'),
        children: [
          {
            path: ':clusterId/diff/:nodeId',
            name: 'ConfigDiff',
            component: () => import('@/views/ConfigDiff.vue'),
          },
        ],
      },
      {
        path: 'edge-client',
        name: 'EdgeClient',
        component: () => import('@/views/EdgeClient.vue'),
        meta: { permission: 'edge_nodes' }
      },
      {
        path: 'tools',
        name: 'Tools',
        component: () => import('@/views/Tools.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.path !== '/login' && !token) {
    next('/login')
    return
  }

  // 权限检查：路由配置了 requiredPermission 时需要对应的权限
  const requiredPermission = to.meta?.permission as string | undefined
  if (requiredPermission) {
    const authStore = useAuthStore()
    if (!authStore.hasPermission(requiredPermission)) {
      next('/')
      return
    }
  }

  next()
})

export default router