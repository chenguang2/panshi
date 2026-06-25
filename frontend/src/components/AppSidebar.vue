<template>
  <aside class="sidebar" :class="{ collapsed }">
    <!-- Brand Logo -->
    <div class="sidebar-logo">
      <img :src="logoIcon" class="sidebar-logo-icon" />
      <span v-show="!collapsed" class="sidebar-logo-text">磐石 Admin</span>
      <span v-show="!collapsed" class="sidebar-logo-version">v1.0</span>
    </div>

        <!-- Navigation -->
    <nav class="sidebar-nav">
      <div v-for="section in navSections" :key="section.title" class="sidebar-section" v-show="section.visible !== false">
        <div v-show="!collapsed" class="sidebar-section-title">{{ section.title }}</div>
        <router-link
          v-for="item in section.items"
          :key="item.route"
          :to="item.route!"
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
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useFeaturesStore } from '@/stores/features'
import logoIcon from '@/assets/icon.png'

const route = useRoute()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const featuresStore = useFeaturesStore()

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
  feature?: string
}

interface NavSection {
  title: string
  items: NavItem[]
  visible?: boolean
}

const navSections = computed<NavSection[]>(() => {
  // Pinia reactivity anchor: accessing .features ensures the computed
  // re-evaluates when features are loaded or change.
  const _fs = featuresStore.features

  const edgeItems: NavItem[] = [
    { label: 'Edge直连', route: '/edge-client', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2l7 7-7 7-7-7z"/></svg>', permission: 'edge_nodes', feature: 'edge_client' },
    { label: '数据导入', route: '/edge-import', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v10M5 8l4 4 4-4M2 16h14"/></svg>', feature: 'edge_import' },
    { label: '工具箱', route: '/tools', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h8v8H5V7zM7 7V5h4v2"/></svg>', feature: 'tools' },
  ].filter(item => {
    const passFeature = !item.feature || featuresStore.has(item.feature)
    const passPermission = !item.permission || authStore.hasPermission(item.permission)
    return passFeature && passPermission
  })

  return [
    {
      title: '核心功能',
      items: [
        { label: '概览', route: '/', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2h6v6H2V2zm8 0h6v6h-6V2zM2 10h6v6H2v-6zm8 0h6v6h-6v-6z"/></svg>' },
        { label: '集群管理', route: '/clusters', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="12" height="4" rx="1"/><rect x="5" y="8" width="8" height="3" rx="1"/><rect x="6" y="13" width="6" height="3" rx="1"/></svg>' },
        { label: '节点管理', route: '/nodes', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="4" r="2"/><circle cx="4" cy="14" r="2"/><circle cx="14" cy="14" r="2"/><path d="M9 6v3M4 12l2-2M14 12l-2-2"/></svg>' },
        { label: '上游管理', route: '/upstreams', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v12M5 10l4 4 4-4M2 16h14"/></svg>' },
        { label: '路由管理', route: '/routes', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l4-6v4h10v4H6v4l-4-6z"/></svg>' },
        { label: '插件组', route: '/plugin-configs', permission: 'plugin_groups', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h10v10H6V3z"/><path d="M3 6h3v10H3V6z"/><path d="M6 6l3 3M6 9l3-3M9 6l3 3M9 9l3-3"/></svg>' },
        { label: '插件元数据', route: '/plugin-metadata', permission: 'plugin_metadata', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h8l3 3v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M9 7v4M9 13v-1"/></svg>' },
        { label: '全局规则', route: '/global-rules', permission: 'global_rules', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2l6 3v5c0 3-2.5 5.5-6 6-3.5-.5-6-3-6-6V5l6-3z"/><path d="M6 9l2 2 4-4"/></svg>' },
        { label: '静态资源', route: '/static-resources', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3a1 1 0 011-1h4l4 4v9a1 1 0 01-1 1H6a1 1 0 01-1-1V3z"/><path d="M10 2v4h4"/></svg>' },
        { label: 'edge.env 配置', route: '/edge-env', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h10a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M6 6h6M6 9h6M6 12h4"/></svg>', feature: 'edge_env' },
      ].filter(item => !item.permission || authStore.hasPermission(item.permission))
    },
    {
      title: '综合',
      items: [
        { label: '统一管理', route: '/central-management', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h14v3H2V4zm0 7h14v3H2v-3z"/><circle cx="9" cy="5.5" r="1.5" fill="currentColor"/><circle cx="9" cy="12.5" r="1.5" fill="currentColor"/></svg>' },
        ...(featuresStore.has('metrics')
          ? [
              { label: '指标查询', route: '/metrics', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16h14M4 12l3-6 3 4 4-8"/></svg>' } as NavItem,
              { label: '指标总览', route: '/metrics/dashboard', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h12M5 11l2-5 2 3 2-6 2 3 2-2"/></svg>' } as NavItem,
            ]
          : []),
      ].filter(item => !item.feature || featuresStore.has(item.feature))
    },
    {
      title: '系统管理',
      visible: authStore.user?.role === 'admin',
      items: [
        { label: '插件开关', route: '/plugin-switches', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h8a4 4 0 010 8H5a4 4 0 010-8zM5 15a2 2 0 110-4 2 2 0 010 4z"/></svg>', feature: 'plugin_switches' },
        { label: '用户管理', route: '/users', icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9a3 3 0 100-6 3 3 0 000 6zM3 16c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>' },
      ].filter(item => !item.feature || featuresStore.has(item.feature))
    },
    {
      title: '运维管理',
      visible: edgeItems.length > 0,
      items: edgeItems,
    },
  ]
})

function isActive(item: NavItem): boolean {
  const name = route.name as string
  if (item.route === '/') return name === 'Dashboard' || !name
  if (item.route === '/central-management') return name === 'CentralManagement'
  if (item.route === '/clusters') return name === 'ClusterList'
  if (item.route === '/users') return name === 'Users'
  if (item.route === '/edge-client') return name === 'EdgeClient'
  if (item.route === '/edge-import') return name === 'EdgeImport'
  if (item.route === '/tools') return name === 'Tools'
  if (item.route === '/plugin-switches') return name === 'PluginSwitches'
  if (item.route === '/edge-env') return name === 'EdgeEnv'
  if (item.route === '/upstreams') return name === 'UpstreamList'
  if (item.route === '/routes') return name === 'RouteList'
  if (item.route === '/plugin-configs') return name === 'PluginConfigList'
  if (item.route === '/global-rules') return name === 'GlobalRuleList'
  if (item.route === '/plugin-metadata') return name === 'PluginMetadataList'
  if (item.route === '/static-resources') return name === 'StaticResourceList'
  if (item.route === '/metrics') return name === 'Metrics'
  if (item.route === '/metrics/dashboard') return name === 'MetricsDashboard'
  return false
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
  border-radius: var(--radius-md);
  object-fit: contain;
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

</style>
