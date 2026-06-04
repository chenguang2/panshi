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
    { label: 'Edge直连', route: '/edge-client', icon: '&#x2B21;', permission: 'edge_nodes' },
    { label: '数据导入', route: '/edge-import', icon: '&#x2B22;' },
    { label: '工具箱', route: '/tools', icon: '&#x25A3;' },
  ].filter(item => !item.permission || authStore.hasPermission(item.permission))

  return [
    {
      title: '核心功能',
      items: [
        { label: '概览', route: '/', icon: '&#x25C9;' },
        { label: '集群管理', route: '/clusters', icon: '&#x25C6;' },
      ]
    },
    {
      title: '系统管理',
      visible: authStore.user?.role === 'admin',
      items: [
        { label: '插件开关', route: '/plugin-switches', icon: '&#x25B2;' },
        { label: '用户管理', route: '/users', icon: '&#x25A0;' },
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
  font-size: 14px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
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
