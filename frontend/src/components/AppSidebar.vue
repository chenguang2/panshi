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
      <div
        v-for="section in navSections"
        :key="section.title"
        class="sidebar-section"
        v-show="section.visible !== false"
      >
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
      <a-tooltip v-if="dbStatus?.active" placement="right">
        <template #title>
          <div>类型：{{ dbStatus?.active?.type === 'postgres' ? 'PostgreSQL' : 'SQLite' }}</div>
          <div>地址：{{ dbStatus?.active?.display_address || '-' }}</div>
          <div>连接数：{{ dbStatus?.connections_count }}</div>
          <div v-if="dbFeatureOn" style="margin-top: 2px; opacity: 0.7">点击进入数据库管理</div>
        </template>
        <div class="sidebar-db-row" :class="{ collapsed, linkable: dbFeatureOn }" @click="goDatabaseManagement">
          <span class="sidebar-db-dot"></span>
          <span v-show="!collapsed" class="sidebar-db-text">{{ dbStatusLabel }}</span>
        </div>
      </a-tooltip>
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
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useFeaturesStore } from '@/stores/features'
import { getDatabaseStatus } from '@/api/database'
import type { DbStatus } from '@/types/database'
import logoIcon from '@/assets/icon.png'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const featuresStore = useFeaturesStore()

const collapsed = computed(() => themeStore.sidebarCollapsed)

// ── 侧边栏底部当前数据库状态 ────────────────────────────────────────
// 仅管理员可见（接口 403 时静默忽略）；database_management 关闭时纯展示、不可点击。
const dbStatus = ref<DbStatus | null>(null)
const dbFeatureOn = computed(() => featuresStore.has('database_management'))

const dbStatusLabel = computed(() => {
  const active = dbStatus.value?.active
  if (!active) return ''
  const typeLabel = active.type === 'postgres' ? 'PostgreSQL' : 'SQLite'
  return `${typeLabel} · ${active.name || active.display_address || ''}`
})

function goDatabaseManagement() {
  if (dbFeatureOn.value) router.push('/database-management')
}

onMounted(async () => {
  // database_management 关闭时不请求，避免无意义的接口调用
  if (!featuresStore.has('database_management')) return
  try {
    const res = await getDatabaseStatus()
    dbStatus.value = res.data
  } catch {
    // 非管理员或接口不可用时隐藏状态行
  }
})

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
  /** 仅管理员可见（如 Ansible 主机清单——后端 admin-only，管理全部节点 SSH 凭据） */
  adminOnly?: boolean
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
    {
      label: 'Edge直连',
      route: '/edge-client',
      icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2l7 7-7 7-7-7z"/></svg>',
      permission: 'edge_nodes',
      feature: 'edge_client',
    },
    {
      label: '数据导入',
      route: '/edge-import',
      icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v10M5 8l4 4 4-4M2 16h14"/></svg>',
      permission: 'edge_import',
      feature: 'edge_import',
    },
    {
      label: '工具箱',
      route: '/tools',
      icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h8v8H5V7zM7 7V5h4v2"/></svg>',
      permission: 'tools',
      feature: 'tools',
    },
    {
      label: '自启动管理',
      route: '/edge-autostart',
      icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l6-4 6 4v8l-6 4-6-4V6zM3 6l6 4m0 0l6-4m-6 4v8"/></svg>',
      permission: 'edge_autostart',
      feature: 'edge_autostart',
    },
    {
      label: 'Ansible 主机清单',
      route: '/ansible-inventory',
      icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="12" height="14" rx="1"/><path d="M6 6h6M6 9.5h6M6 13h4"/></svg>',
      permission: 'ansible_inventory',
      feature: 'ansible_inventory',
    },
    {
      label: '节点任务',
      route: '/node-tasks',
      icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l6-4 6 4v8l-6 4-6-4V6zM3 6l6 4m0 0l6-4m-6 4v8"/></svg>',
      permission: 'task_center',
      feature: 'task_center',
    },
  ].filter((item) => {
    const passFeature = !item.feature || featuresStore.has(item.feature)
    const passPermission = !item.permission || authStore.hasPermission(item.permission)
    return passFeature && passPermission
  })

  return [
    {
      title: '核心功能',
      items: [
        {
          label: '概览',
          route: '/',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2h6v6H2V2zm8 0h6v6h-6V2zM2 10h6v6H2v-6zm8 0h6v6h-6v-6z"/></svg>',
        },
        {
          label: '集群管理',
          route: '/clusters',
          permission: 'clusters',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="12" height="4" rx="1"/><rect x="5" y="8" width="8" height="3" rx="1"/><rect x="6" y="13" width="6" height="3" rx="1"/></svg>',
        },
        {
          label: '节点管理',
          route: '/nodes',
          permission: 'nodes',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="4" r="2"/><circle cx="4" cy="14" r="2"/><circle cx="14" cy="14" r="2"/><path d="M9 6v3M4 12l2-2M14 12l-2-2"/></svg>',
        },
        {
          label: '上游管理',
          route: '/upstreams',
          permission: 'upstreams',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v12M5 10l4 4 4-4M2 16h14"/></svg>',
        },
        {
          label: '路由管理',
          route: '/routes',
          permission: 'routes',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l4-6v4h10v4H6v4l-4-6z"/></svg>',
        },
        {
          label: '插件组',
          route: '/plugin-configs',
          permission: 'plugin_groups',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h10v10H6V3z"/><path d="M3 6h3v10H3V6z"/><path d="M6 6l3 3M6 9l3-3M9 6l3 3M9 9l3-3"/></svg>',
        },
        {
          label: '插件元数据',
          route: '/plugin-metadata',
          permission: 'plugin_metadata',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h8l3 3v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M9 7v4M9 13v-1"/></svg>',
        },
        {
          label: '全局规则',
          route: '/global-rules',
          permission: 'global_rules',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2l6 3v5c0 3-2.5 5.5-6 6-3.5-.5-6-3-6-6V5l6-3z"/><path d="M6 9l2 2 4-4"/></svg>',
        },
        {
          label: '静态资源',
          route: '/static-resources',
          permission: 'static_resources',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1v8M6 4l3-3 3 3"/><path d="M3 10v4a1 1 0 001 1h10a1 1 0 001-1v-4"/></svg>',
        },
        {
          label: 'SSL 证书',
          route: '/ssl',
          permission: 'ssl_cert',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="12" height="10" rx="1"/><path d="M6 7V5a3 3 0 016 0v2"/><circle cx="9" cy="11" r="1"/><path d="M9 11v2"/></svg>',
          feature: 'ssl_cert',
        },
      ]
        .filter((item) => !item.feature || featuresStore.has(item.feature))
        .filter((item) => !item.permission || authStore.hasPermission(item.permission)),
    },
    {
      title: '边缘网络',
      items: [
        {
          label: 'edge.env 配置',
          route: '/edge-env',
          permission: 'edge_env',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="2.5"/><path d="M9 3v2M9 13v2M3 9h2M13 9h2M4.5 4.5l1.5 1.5M12 12l1.5 1.5M4.5 13.5l1.5-1.5M12 6l1.5-1.5"/></svg>',
          feature: 'edge_env',
        },
        {
          label: '四层代理',
          route: '/stream-proxies',
          permission: 'stream_proxy',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="12" height="4" rx="1"/><rect x="4" y="7" width="10" height="4" rx="1"/><rect x="5" y="12" width="8" height="4" rx="1"/></svg>',
          feature: 'stream_proxy',
        },
        {
          label: 'DNS代理[UDP]',
          route: '/dns-proxies',
          permission: 'dns_proxy_udp',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="4" r="2"/><circle cx="4" cy="14" r="2"/><circle cx="14" cy="14" r="2"/><path d="M9 6v3M4 12l2-2M14 12l-2-2"/></svg>',
          feature: 'dns_proxy_udp',
        },
        {
          label: 'DNS代理[HTTP]',
          route: '/dns-queries',
          permission: 'dns_proxy_http',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="4" r="2"/><circle cx="4" cy="14" r="2"/><circle cx="14" cy="14" r="2"/><path d="M9 6v3M4 12l2-2M14 12l-2-2"/></svg>',
          feature: 'dns_proxy_http',
        },
      ].filter(
        (item) =>
          (!item.feature || featuresStore.has(item.feature)) &&
          (!item.permission || authStore.hasPermission(item.permission)),
      ),
    },
    {
      title: '综合',
      items: [
        {
          label: '统一管理',
          route: '/central-management',
          permission: 'central_management',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h14v3H2V4zm0 7h14v3H2v-3z"/><circle cx="9" cy="5.5" r="1.5" fill="currentColor"/><circle cx="9" cy="12.5" r="1.5" fill="currentColor"/></svg>',
        },
        ...(featuresStore.has('metrics')
          ? [
              {
                label: '指标查询',
                route: '/metrics',
                permission: 'metrics',
                icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16h14M4 12l3-6 3 4 4-8"/></svg>',
              } as NavItem,
              {
                label: '指标总览',
                route: '/metrics/dashboard',
                permission: 'metrics',
                icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16h14M4 13h2v3H4zM8 9h2v7H8zM12 5h2v11h-2z"/></svg>',
              } as NavItem,
            ]
          : []),
      ].filter(
        (item) =>
          (!item.feature || featuresStore.has(item.feature)) &&
          (!item.permission || authStore.hasPermission(item.permission)),
      ),
    },
    {
      title: '系统管理',
      // 管理员始终可见；普通用户持有 database_management 权限时可见数据库管理
      visible:
        authStore.user?.role === 'admin' ||
        authStore.hasPermission('database_management') ||
        authStore.hasPermission('clickhouse_config'),
      items: [
        {
          label: '插件开关',
          route: '/plugin-switches',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h8a4 4 0 010 8H5a4 4 0 010-8zM5 15a2 2 0 110-4 2 2 0 010 4z"/></svg>',
          adminOnly: true,
          feature: 'plugin_switches',
        },
        {
          label: '数据库管理',
          route: '/database-management',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="9" cy="4" rx="6" ry="2.5"/><path d="M3 4v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V4"/><path d="M3 9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5"/></svg>',
          permission: 'database_management',
          feature: 'database_management',
        },
        {
          label: 'ClickHouse 配置',
          route: '/clickhouse-config',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5l7-3 7 3-7 3-7-3z"/><path d="M2 5v8l7 3 7-3V5"/><path d="M9 8v8"/></svg>',
          permission: 'clickhouse_config',
        },
        {
          label: '用户管理',
          route: '/users',
          icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9a3 3 0 100-6 3 3 0 000 6zM3 16c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>',
          adminOnly: true,
        },
      ].filter(
        (item) =>
          (!item.feature || featuresStore.has(item.feature)) &&
          (!item.permission || authStore.hasPermission(item.permission)) &&
          (!item.adminOnly || authStore.user?.role === 'admin'),
      ),
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
  if (item.route === '/edge-autostart') return name === 'EdgeAutostart'
  if (item.route === '/ansible-inventory') return name === 'AnsibleInventory'
  if (item.route === '/plugin-switches') return name === 'PluginSwitches'
  if (item.route === '/database-management') return name === 'DatabaseManagement'
  if (item.route === '/stream-proxies') return name === 'StreamProxyList'
  if (item.route === '/dns-proxies') return name === 'DnsUdpProxyList'
  if (item.route === '/edge-env') return name === 'EdgeEnv'
  if (item.route === '/dns-queries') return name === 'DnsQueryList'
  if (item.route === '/upstreams') return name === 'UpstreamList'
  if (item.route === '/routes') return name === 'RouteList'
  if (item.route === '/plugin-configs') return name === 'PluginConfigList'
  if (item.route === '/global-rules') return name === 'GlobalRuleList'
  if (item.route === '/plugin-metadata') return name === 'PluginMetadataList'
  if (item.route === '/static-resources') return name === 'StaticResourceList'
  if (item.route === '/ssl') return name === 'SslList'
  if (item.route === '/metrics') return name === 'Metrics'
  if (item.route === '/metrics/dashboard') return name === 'MetricsDashboard'
  if (item.route === '/node-tasks') return name === 'NodeTaskCenter'
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

.sidebar-db-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  margin-bottom: 8px;
  border-radius: var(--radius-md);
  font-size: 11px;
  color: var(--sidebar-fg);
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
}

.sidebar-db-row.linkable {
  cursor: pointer;
}

.sidebar-db-row.linkable:hover {
  background: rgba(255, 255, 255, 0.06);
  opacity: 1;
}

.sidebar-db-row.collapsed {
  justify-content: center;
  padding: 5px 0;
}

.sidebar-db-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #52c41a;
  flex-shrink: 0;
}

.sidebar-db-text {
  overflow: hidden;
  text-overflow: ellipsis;
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
