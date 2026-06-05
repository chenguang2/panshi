<template>
  <aside class="sidebar" :class="{ collapsed }">
    <!-- Brand Logo -->
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">磐</div>
      <span v-show="!collapsed" class="sidebar-logo-text">磐石</span>
      <span v-show="!collapsed" class="sidebar-logo-version">v1.0</span>
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav">
      <div v-for="section in navSections" :key="section.title" class="sidebar-section" v-show="section.visible !== false">
        <div v-show="!collapsed" class="sidebar-section-title">{{ section.title }}</div>
        <router-link
          v-for="item in section.items"
          :key="item.route"
          :to="item.route"
          class="nav-item"
          :class="{ active: isActive(item) }"
        >
          <span class="nav-icon" v-html="item.icon"></span>
          <span v-show="!collapsed" class="nav-label">{{ item.label }}</span>
        </router-link>
      </div>
    </nav>

    <!-- Bottom User Info -->
    <div class="sidebar-bottom" v-show="authStore.user">
      <div class="sidebar-user-row" :class="{ collapsed }">
        <div class="sidebar-user-avatar">{{ userInitial }}</div>
        <div v-show="!collapsed" class="sidebar-user-info">
          <div class="sidebar-user-name">{{ authStore.user?.username }}</div>
          <div class="sidebar-user-role">{{ roleLabel }}</div>
        </div>
        <a v-show="!collapsed" class="sidebar-logout" @click="handleLogout">退出</a>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const themeStore = useThemeStore()

const collapsed = computed(() => themeStore.sidebarCollapsed)

const userInitial = computed(() => {
  return authStore.user?.username?.charAt(0) || '?'
})

const roleLabel = computed(() => {
  return authStore.user?.role === 'admin' ? '超级管理员' : '普通用户'
})

interface NavItem {
  label: string
  route: string
  icon: string
  permission?: string
}

interface NavSection {
  title: string
  items: NavItem[]
  visible?: boolean
}

const navSections = computed<NavSection[]>(() => {
  const edgeItems = [
    { label: 'Edge直连', route: '/edge-client', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2l7 7-7 7-7-7z"/></svg>', permission: 'edge_nodes' },
    { label: '数据导入', route: '/edge-import', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v10M5 8l4 4 4-4M2 16h14"/></svg>' },
    { label: '工具箱', route: '/tools', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h8v8H5V7zM7 7V5h4v2"/></svg>' },
  ].filter(item => !item.permission || authStore.hasPermission(item.permission))

  return [
    {
      title: '核心功能',
      items: [
        { label: '概览', route: '/', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h5v5H3V3zm7 0h5v5h-5V3zM3 10h5v5H3v-5zm7 0h5v5h-5v-5z"/></svg>' },
        { label: '集群管理', route: '/clusters', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h14v5H2V3zm0 7h14v5H2v-5z"/></svg>' },
        { label: '上游管理', route: '/upstreams', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v10M5 8l4 4 4-4M2 16h14"/></svg>' },
        { label: '路由管理', route: '/routes', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l5-7v5h9v4H7v5l-5-7z"/></svg>' },
        { label: '插件组', route: '/plugin-configs', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h5v5H3V3zm7 0h5v5h-5V3zM3 10h12v5H3v-5z"/></svg>' },
        { label: '全局规则', route: '/global-rules', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2l6 3v4c0 3-2.5 5.5-6 7-3.5-1.5-6-4-6-7V5l6-3z"/></svg>' },
        { label: '静态资源', route: '/static-resources', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3a1 1 0 011-1h6l4 4v10a1 1 0 01-1 1H6a1 1 0 01-1-1V3zM11 2v4h4"/></svg>' },
      ]
    },
    {
      title: '系统管理',
      visible: authStore.user?.role === 'admin',
      items: [
        { label: '插件开关', route: '/plugin-switches', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h8a4 4 0 010 8H5a4 4 0 010-8zM5 15a2 2 0 110-4 2 2 0 010 4z"/></svg>' },
        { label: '用户管理', route: '/users', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9a3 3 0 100-6 3 3 0 000 6zM3 16c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>' },
      ]
    },
    {
      title: 'Edge功能',
      visible: edgeItems.length > 0,
      items: edgeItems,
    },
  ]
})

function isActive(item: NavItem): boolean {
  const name = route.name as string
  if (item.route === '/') return name === 'Dashboard' || !name
  if (item.route === '/clusters') return name === 'Clusters'
  if (item.route === '/users') return name === 'Users'
  if (item.route === '/edge-client') return name === 'EdgeClient'
  if (item.route === '/edge-import') return name === 'EdgeImport'
  if (item.route === '/tools') return name === 'Tools'
  if (item.route === '/plugin-switches') return name === 'PluginSwitches'
  if (item.route === '/upstreams') return name === 'UpstreamList'
  if (item.route === '/routes') return name === 'RouteList'
  if (item.route === '/plugin-configs') return name === 'PluginConfigList'
  if (item.route === '/global-rules') return name === 'GlobalRuleList'
  if (item.route === '/static-resources') return name === 'StaticResourceList'
  return false
}

const handleLogout = async () => {
  await authStore.logout()
  message.success('已退出登录')
  router.push('/login')
}
</script>

<style scoped>
.sidebar {
  width: 240px;
  min-height: 100vh;
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  transition: width 0.2s;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar.collapsed {
  width: 64px;
}

.sidebar-logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.sidebar-logo-icon {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--accent), var(--info));
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.sidebar-logo-text {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
}

.sidebar-logo-version {
  font-size: 10px;
  color: var(--sidebar-fg);
  opacity: 0.5;
  font-family: var(--font-mono);
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.sidebar-section {
  margin-bottom: 4px;
}

.sidebar-section-title {
  padding: 12px 16px 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sidebar-fg);
  opacity: 0.5;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  margin: 1px 8px;
  border-radius: var(--radius-md);
  color: var(--sidebar-fg);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
  cursor: pointer;
  white-space: nowrap;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.nav-item.active {
  background: var(--accent);
  color: #fff;
}

.nav-icon {
  width: 20px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.nav-icon svg {
  width: 18px;
  height: 18px;
}

.nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-bottom {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 12px;
  flex-shrink: 0;
}

.sidebar-user-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-user-row.collapsed {
  justify-content: center;
}

.sidebar-user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.sidebar-user-info {
  flex: 1;
  min-width: 0;
}

.sidebar-user-name {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
}

.sidebar-user-role {
  font-size: 10px;
  color: var(--sidebar-fg);
  opacity: 0.6;
  line-height: 1.3;
}

.sidebar-logout {
  font-size: 11px;
  color: var(--sidebar-fg);
  opacity: 0.5;
  cursor: pointer;
  text-decoration: none;
  flex-shrink: 0;
}

.sidebar-logout:hover {
  opacity: 1;
  color: var(--danger);
}
</style>
