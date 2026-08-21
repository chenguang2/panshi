<template>
  <div class="default-layout">
    <AppSidebar />
    <div class="app-main">
      <header class="app-header">
        <div class="header-left">
          <MenuUnfoldOutlined
            v-if="themeStore.sidebarCollapsed"
            class="trigger"
            @click="themeStore.toggleSidebar()"
          />
          <MenuFoldOutlined
            v-else
            class="trigger"
            @click="themeStore.toggleSidebar()"
          />
          <div class="header-breadcrumb">
            <span class="crumb-item">{{ currentSection }}</span>
            <span class="crumb-sep">/</span>
            <span class="crumb-item crumb-current">{{ currentRouteName }}</span>
          </div>
        </div>
        <div class="header-right">
          <a-tooltip v-if="dbStatus?.active" placement="bottom">
            <template #title>
              <div>类型：{{ dbStatus?.active?.type === 'postgres' ? 'PostgreSQL' : 'SQLite' }}</div>
              <div>地址：{{ dbStatus?.active?.display_address || '-' }}</div>
              <div>连接数：{{ dbStatus?.connections_count }}</div>
              <div>配置版本：v{{ dbStatus?.version }}</div>
            </template>
            <div class="db-status-badge" @click="router.push('/database-management')">
              <span class="db-status-dot"></span>
              <span class="db-status-text">{{ dbStatusLabel }}</span>
            </div>
          </a-tooltip>
          <a-dropdown>
            <a-space class="user-info">
              <UserOutlined />
              <span>{{ authStore.user?.username }}</span>
            </a-space>
            <template #overlay>
              <a-menu>
                <a-menu-item @click="handleLogout">退出登录</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </header>
      <div class="app-content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { MenuUnfoldOutlined, MenuFoldOutlined, UserOutlined } from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import AppSidebar from '@/components/AppSidebar.vue'
import { useSidebarResponsive } from '@/composables/useSidebarResponsive'
import { getDatabaseStatus } from '@/api/database'
import type { DbStatus } from '@/types/database'

const router = useRouter()

useSidebarResponsive()
const route = useRoute()
const authStore = useAuthStore()
const themeStore = useThemeStore()

// ── 顶栏数据库状态徽标 ──────────────────────────────────────────────
const dbStatus = ref<DbStatus | null>(null)

const dbStatusLabel = computed(() => {
  const active = dbStatus.value?.active
  if (!active) return ''
  return `${active.type === 'postgres' ? 'PostgreSQL' : 'SQLite'} · ${active.display_address ?? ''}`
})

onMounted(async () => {
  try {
    const res = await getDatabaseStatus()
    dbStatus.value = res.data
  } catch {
    // 非管理员或接口不可用时隐藏徽标
  }
})

const sectionMap: Record<string, string> = {
  Dashboard: '核心功能',
  ClusterList: '核心功能',
  NodeList: '核心功能',
  UpstreamList: '核心功能',
  RouteList: '核心功能',
  DnsQueryList: '边缘网络',
  PluginConfigList: '核心功能',
  GlobalRuleList: '核心功能',
  PluginMetadataList: '核心功能',
  StaticResourceList: '核心功能',
  StreamProxyList: '边缘网络',
  DnsUdpProxyList: '边缘网络',
  EdgeEnv: '边缘网络',
  CentralManagement: '综合',
  Metrics: '综合',
  MetricsDashboard: '综合',
  PluginSwitches: '系统管理',
  Users: '系统管理',
  DatabaseManagement: '系统管理',
  EdgeClient: '运维管理',
  EdgeImport: '运维管理',
  Tools: '运维管理',
  NodeTaskCenter: '运维管理',
}

const pageNameMap: Record<string, string> = {
  Dashboard: '概览',
  CentralManagement: '统一管理',
  ClusterList: '集群管理',
  NodeList: '节点管理',
  UpstreamList: '上游管理',
  RouteList: '路由管理',
  PluginConfigList: '插件组',
  GlobalRuleList: '全局规则',
  PluginMetadataList: '插件元数据',
  StaticResourceList: '静态资源',
  DnsQueryList: 'DNS代理[HTTP]',
  StreamProxyList: '四层代理',
  DnsUdpProxyList: 'DNS代理[UDP]',
  EdgeEnv: 'edge.env 配置',
  Users: '用户管理',
  EdgeClient: 'Edge直连',
  EdgeImport: '数据导入',
  Tools: '工具箱',
  Metrics: '指标查询',
  MetricsDashboard: '指标总览',
  PluginSwitches: '插件开关',
  DatabaseManagement: '数据库管理',
  SslList: 'SSL 证书',
  NodeTaskCenter: '节点任务',
}

const currentSection = computed(() => {
  return sectionMap[route.name as string] || ''
})

const currentRouteName = computed(() => {
  return pageNameMap[route.name as string] || (route.name as string) || ''
})

const handleLogout = async () => {
  await authStore.logout()
  message.success('已退出登录')
  router.push('/login')
}
</script>

<style scoped>
.default-layout {
  display: flex;
  min-height: 100vh;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-header {
  background: var(--surface);
  padding: 0 24px;
  display: flex;
  align-items: center;
  height: 56px;
  line-height: 56px;
  box-shadow: 0 1px 4px var(--shadow-sm);
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 2px solid var(--accent);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.trigger {
  font-size: 18px;
  cursor: pointer;
  color: var(--muted);
  transition: color 0.2s;
}
.trigger:hover {
  color: var(--accent);
}

.header-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.crumb-item {
  color: var(--muted);
}
.crumb-item.crumb-current {
  color: var(--accent);
  font-weight: 600;
}
.crumb-sep {
  color: var(--border);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.db-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  cursor: pointer;
  font-size: 12px;
  color: #389e0d;
  white-space: nowrap;
}

.db-status-badge:hover {
  background: #d9f7be;
}

.db-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #52c41a;
  flex-shrink: 0;
}

.db-status-text {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-info {
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--muted);
  transition: all 0.2s;
}
.user-info:hover {
  background: var(--bg);
  color: var(--accent);
}

.app-content {
  padding: 20px 24px;
  min-height: calc(100vh - 56px);
  background: var(--bg);
}

:deep(.ant-dropdown-menu-item.active) {
  color: var(--accent) !important;
  font-weight: 500;
}
</style>
