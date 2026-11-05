<template>
  <div class="default-layout">
    <AppSidebar />
    <div class="app-main">
      <header class="app-header">
        <div class="header-left">
          <MenuUnfoldOutlined v-if="themeStore.sidebarCollapsed" class="trigger" @click="themeStore.toggleSidebar()" />
          <MenuFoldOutlined v-else class="trigger" @click="themeStore.toggleSidebar()" />
          <div class="header-breadcrumb">
            <span class="crumb-item">{{ currentSection }}</span>
            <span class="crumb-sep">/</span>
            <span class="crumb-item" :class="{ 'crumb-current': !currentDetailCrumb }">{{ currentRouteName }}</span>
            <template v-if="currentDetailCrumb">
              <span class="crumb-sep">/</span>
              <span class="crumb-item crumb-current">{{ currentDetailCrumb }}</span>
            </template>
          </div>
        </div>
        <div class="header-right">
          <button class="search-trigger" type="button" @click="globalSearchRef?.open()">
            <SearchOutlined />
            <span>搜索</span>
            <span class="search-kbd">Ctrl K</span>
          </button>
          <a-dropdown>
            <a-space class="user-info">
              <UserOutlined />
              <span>{{ authStore.user?.username }}</span>
            </a-space>
            <template #overlay>
              <a-menu>
                <a-menu-item @click="changePwdOpen = true">修改密码</a-menu-item>
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
    <GlobalSearch ref="globalSearchRef" />
    <!-- 顶栏「修改密码」一般入口（closable 模式；守卫强制场景由 Login/App 各自挂载不可关闭实例） -->
    <ForceChangePasswordDialog v-model:open="changePwdOpen" closable />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { MenuUnfoldOutlined, MenuFoldOutlined, UserOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import AppSidebar from '@/components/AppSidebar.vue'
import GlobalSearch from '@/components/GlobalSearch.vue'
import ForceChangePasswordDialog from '@/components/ForceChangePasswordDialog.vue'
import type { ChangePasswordResponse } from '@/types'
import { useSidebarResponsive } from '@/composables/useSidebarResponsive'
import { pageNameMap, sectionMap } from '@/router/navMeta'

const router = useRouter()

useSidebarResponsive()
const route = useRoute()
const authStore = useAuthStore()
const themeStore = useThemeStore()
const globalSearchRef = ref<InstanceType<typeof GlobalSearch> | null>(null)

const currentSection = computed(() => {
  return sectionMap[route.name as string] || ''
})

const currentRouteName = computed(() => {
  return pageNameMap[route.name as string] || (route.name as string) || ''
})

/**
 * 详情页的第三层面包屑（如 `运维管理 / 节点任务 / #12`）：
 * 路由 meta.detailCrumb = true 时用路由参数拼尾层，普通页面保持两层不变。
 */
const currentDetailCrumb = computed(() => {
  if (route.meta?.detailCrumb !== true) return ''
  const id = route.params.id
  const raw = Array.isArray(id) ? id[0] : id
  return raw ? `#${raw}` : ''
})

const handleLogout = async () => {
  await authStore.logout()
  message.success('已退出登录')
  router.push('/login')
}

// ── 顶栏「修改密码」一般入口（default-password-guard-switch D4：完整自助改密）──
const changePwdOpen = ref(false)

function handleChangePwdSuccess(data: ChangePasswordResponse) {
  authStore.applySession(data)
  changePwdOpen.value = false
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

.search-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s;
}
.search-trigger:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.search-kbd {
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 4px;
  line-height: 14px;
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
