<template>
  <a-layout class="default-layout">
    <a-layout-sider
      v-if="themeStore.layoutMode !== 'topnav'"
      v-model:collapsed="themeStore.sidebarCollapsed"
      :trigger="null"
      collapsible
      breakpoint="lg"
      collapsedWidth="64"
      class="app-sider"
      :class="{ 'sider-dark': true }"
    >
      <div class="sider-logo" :class="{ collapsed: themeStore.sidebarCollapsed }">
        <span class="logo-icon">●</span>
        <span v-show="!themeStore.sidebarCollapsed" class="logo-text">磐石 Admin</span>
      </div>
      <a-menu
        v-model:selectedKeys="selectedKeys"
        theme="dark"
        mode="inline"
        class="sider-menu"
      >
        <a-menu-item key="dashboard" @click="router.push('/')">
          <DashboardOutlined />
          <span>仪表盘</span>
        </a-menu-item>
        <a-menu-item key="clusters" @click="router.push('/clusters')">
          <CloudOutlined />
          <span>集群管理</span>
        </a-menu-item>
        <a-menu-item
          v-if="authStore.hasPermission('edge_nodes')"
          key="edge-client"
          @click="router.push('/edge-client')"
        >
          <NodeIndexOutlined />
          <span>边缘节点</span>
        </a-menu-item>
        <a-menu-item key="edge-import" @click="router.push('/edge-import')">
          <ImportOutlined />
          <span>Edge 数据导入</span>
        </a-menu-item>
        <a-menu-item key="tools" @click="router.push('/tools')">
          <ToolOutlined />
          <span>工具箱</span>
        </a-menu-item>
        <a-menu-divider class="sider-divider" />
        <a-sub-menu key="system" title="系统管理">
          <template #icon><SettingOutlined /></template>
          <a-menu-item v-if="isAdmin" key="users" @click="router.push('/users')">
            <UserOutlined />
            <span>用户管理</span>
          </a-menu-item>
          <a-menu-divider v-if="isAdmin" />
          <a-sub-menu key="layout-group" title="界面布局">
            <a-menu-item key="layout-sidebar" :class="{ active: themeStore.layoutMode === 'sidebar' }" @click="themeStore.setLayoutMode('sidebar')">
              <span class="layout-icon">◧</span> 侧边栏
            </a-menu-item>
            <a-menu-item key="layout-topnav" :class="{ active: String(themeStore.layoutMode) === 'topnav' }" @click="themeStore.setLayoutMode('topnav')">
              <span class="layout-icon">◨</span> 顶部导航
            </a-menu-item>
            <a-menu-item key="layout-fullwidth" :class="{ active: themeStore.layoutMode === 'fullwidth' }" @click="themeStore.setLayoutMode('fullwidth')">
              <span class="layout-icon">▣</span> 全宽
            </a-menu-item>
          </a-sub-menu>
          <a-menu-divider />
          <a-sub-menu key="theme-group" title="主题色">
            <a-menu-item key="darkmode" @click="themeStore.toggleDarkMode()">
              <span>{{ themeStore.darkMode ? '☀️' : '🌙' }}</span>
              <span>{{ themeStore.darkMode ? '亮色模式' : '暗色模式' }}</span>
            </a-menu-item>
            <a-menu-item key="style-modern" :class="{ active: themeStore.style === 'modern' }" @click="themeStore.setThemeStyle('modern')">
              <span>◧</span>
              <span>现代风格</span>
            </a-menu-item>
            <a-menu-item key="style-default" :class="{ active: themeStore.style === 'default' }" @click="themeStore.setThemeStyle('default')">
              <span>▣</span>
              <span>经典风格</span>
            </a-menu-item>
            <a-menu-item v-for="t in themeOptions" :key="'theme-' + t.key" :class="{ active: themeStore.themeColor === t.key }" @click="themeStore.setThemeColor(t.key)">
              <span class="theme-dot-menu" :style="{ background: t.color }"></span>
              {{ t.label }}
            </a-menu-item>
          </a-sub-menu>
        </a-sub-menu>
      </a-menu>
      <div class="sider-footer">
        <span v-show="!themeStore.sidebarCollapsed">v1.0.0</span>
      </div>
    </a-layout-sider>

    <a-layout class="app-main">
      <a-layout-header class="app-header">
        <template v-if="themeStore.layoutMode === 'topnav'">
          <div class="topnav-logo"><span class="logo-icon">●</span> 磐石 Admin</div>
          <a-menu v-model:selectedKeys="selectedKeys" theme="light" mode="horizontal" class="topnav-menu">
            <a-menu-item key="dashboard" @click="router.push('/')">
              <DashboardOutlined /><span>仪表盘</span>
            </a-menu-item>
            <a-menu-item key="clusters" @click="router.push('/clusters')">
              <CloudOutlined /><span>集群管理</span>
            </a-menu-item>
            <a-menu-item v-if="authStore.hasPermission('edge_nodes')" key="edge-client" @click="router.push('/edge-client')">
              <NodeIndexOutlined /><span>边缘节点</span>
            </a-menu-item>
            <a-menu-item key="edge-import" @click="router.push('/edge-import')">
              <ImportOutlined /><span>Edge 数据导入</span>
            </a-menu-item>
            <a-menu-item key="tools" @click="router.push('/tools')">
              <ToolOutlined /><span>工具箱</span>
            </a-menu-item>
            <a-sub-menu key="system" title="系统管理">
              <template #icon><SettingOutlined /></template>
              <a-menu-item v-if="isAdmin" key="users" @click="router.push('/users')"><UserOutlined /> 用户管理</a-menu-item>
              <a-menu-divider v-if="isAdmin" />
              <a-sub-menu key="layout-group" title="界面布局">
                <a-menu-item key="layout-sidebar" :class="{ active: String(themeStore.layoutMode) === 'sidebar' }" @click="themeStore.setLayoutMode('sidebar')">◧ 侧边栏</a-menu-item>
                <a-menu-item key="layout-topnav" :class="{ active: String(themeStore.layoutMode) === 'topnav' }" @click="themeStore.setLayoutMode('topnav')">◨ 顶部导航</a-menu-item>
                <a-menu-item key="layout-fullwidth" :class="{ active: String(themeStore.layoutMode) === 'fullwidth' }" @click="themeStore.setLayoutMode('fullwidth')">▣ 全宽</a-menu-item>
              </a-sub-menu>
              <a-menu-divider />
              <a-sub-menu key="theme-group" title="主题色">
                <a-menu-item key="darkmode" @click="themeStore.toggleDarkMode()">
                  <span>{{ themeStore.darkMode ? '☀️' : '🌙' }}</span>
                  <span>{{ themeStore.darkMode ? '亮色模式' : '暗色模式' }}</span>
                </a-menu-item>
                <a-menu-item key="style-modern" :class="{ active: themeStore.style === 'modern' }" @click="themeStore.setThemeStyle('modern')">
                  <span>◧</span>
                  <span>现代风格</span>
                </a-menu-item>
                <a-menu-item key="style-default" :class="{ active: themeStore.style === 'default' }" @click="themeStore.setThemeStyle('default')">
                  <span>▣</span>
                  <span>经典风格</span>
                </a-menu-item>
                <a-menu-item v-for="t in themeOptions" :key="'theme-' + t.key" :class="{ active: themeStore.themeColor === t.key }" @click="themeStore.setThemeColor(t.key)">
                  <span class="theme-dot-menu" :style="{ background: t.color }"></span>{{ t.label }}
                </a-menu-item>
              </a-sub-menu>
            </a-sub-menu>
          </a-menu>
          <div class="header-spacer"></div>
          <div class="header-right">
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
        </template>
        <template v-else>
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
            <span class="crumb-item">磐石</span>
            <span class="crumb-sep">/</span>
            <span class="crumb-item crumb-current">{{ currentRouteName }}</span>
          </div>
        </div>
        <div class="header-right">
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
        </template>
      </a-layout-header>
      <a-layout-content
        class="app-content"
        :class="{ 'content-fullwidth': themeStore.layoutMode === 'fullwidth' }"
      >
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  DashboardOutlined,
  CloudOutlined,
  SettingOutlined,
  ToolOutlined,
  ImportOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  UserOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore, type ThemeColor } from '@/stores/theme'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const themeStore = useThemeStore()

const isAdmin = computed(() => authStore.user?.role === 'admin')

const themeOptions: { key: ThemeColor; label: string; color: string }[] = [
  { key: 'blue', label: '极光蓝', color: '#1890ff' },
  { key: 'green', label: '翡翠绿', color: '#52c41a' },
  { key: 'purple', label: '优雅紫', color: '#7c3aed' },
  { key: 'orange', label: '暖阳橙', color: '#fa8c16' },
  { key: 'red', label: '中国红', color: '#f5222d' },
]

const routeNameMap: Record<string, string> = {
  Dashboard: '仪表盘',
  Clusters: '集群管理',
  Users: '用户管理',
  EdgeClient: '边缘节点',
  EdgeImport: 'Edge 数据导入',
  Tools: '工具箱',
}

const currentRouteName = computed(() => {
  return routeNameMap[route.name as string] || (route.name as string) || ''
})

const selectedKeys = computed(() => {
  const name = route.name as string
  if (name === 'Users') return ['users']
  if (name === 'EdgeClient') return ['edge-client']
  if (name === 'EdgeImport') return ['edge-import']
  if (name === 'Tools') return ['tools']
  if (name === 'Dashboard' || !name) return ['dashboard']
  return ['clusters']
})

const handleLogout = async () => {
  await authStore.logout()
  message.success('已退出登录')
  router.push('/login')
}
</script>

<style scoped>
.default-layout {
  min-height: 100vh;
}

.app-sider {
  overflow: auto;
  background: var(--p-bg-sidebar);
  box-shadow: 2px 0 8px var(--p-shadow-sm);
}

.sider-logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 18px;
  font-weight: bold;
  color: var(--p-text-sidebar-active);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.sider-logo.collapsed {
  font-size: 22px;
}
.logo-icon {
  color: var(--p-color-primary);
  flex-shrink: 0;
}
.logo-text {
  white-space: nowrap;
}

.sider-menu {
  border-inline-end: none !important;
}

.sider-divider {
  margin: 8px 16px;
  background: rgba(255, 255, 255, 0.08);
}

.sider-footer {
  position: absolute;
  bottom: 0;
  width: 100%;
  padding: 12px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--p-text-sidebar);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.layout-icon {
  margin-right: 6px;
  font-size: 13px;
}

.app-header {
  background: var(--p-header-bg);
  padding: 0 24px;
  display: flex;
  align-items: center;
  height: 56px;
  line-height: 56px;
  box-shadow: 0 1px 4px var(--p-shadow-sm);
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 2px solid var(--p-color-primary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.trigger {
  font-size: 18px;
  cursor: pointer;
  color: var(--p-text-secondary);
  transition: color 0.2s;
}
.trigger:hover {
  color: var(--p-color-primary);
}

.header-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.crumb-item {
  color: var(--p-text-secondary);
}
.crumb-item.crumb-current {
  color: var(--p-color-primary);
  font-weight: 600;
}
.crumb-sep {
  color: var(--p-border-default);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.user-info {
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--p-radius-sm);
  font-size: 13px;
  color: var(--p-text-secondary);
  transition: all 0.2s;
}
.user-info:hover {
  background: var(--p-bg-hover);
  color: var(--p-color-primary);
}

:deep(.ant-dropdown-menu-item.active) {
  color: var(--p-color-primary) !important;
  font-weight: 500;
}

:deep(.ant-menu-item.active) {
  color: var(--p-text-inverse) !important;
  background: var(--p-color-primary) !important;
}

.theme-dot-menu {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
  border: 1px solid rgba(255,255,255,0.2);
}

.app-main {
  transition: margin-left 0.2s;
}
.app-content {
  margin: 0;
  padding: 20px 24px;
  min-height: calc(100vh - 56px);
  background: var(--p-bg-page);
}
.app-content.content-fullwidth {
  padding: 20px 12px;
  max-width: 100%;
}

.topnav-logo {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: bold;
  color: var(--p-text-primary);
  margin-right: 24px;
  flex-shrink: 0;
}
.topnav-menu {
  flex: 1;
  border-bottom: none !important;
  line-height: 56px;
}
.header-spacer {
  flex-shrink: 0;
}

:deep(.ant-layout-sider-trigger) {
  display: none;
}


</style>
