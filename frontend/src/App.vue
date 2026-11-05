<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ConfigProvider } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import MigrationLockBanner from '@/components/MigrationLockBanner.vue'
import ForceChangePasswordDialog from '@/components/ForceChangePasswordDialog.vue'
import { FORCE_CHANGE_PASSWORD_EVENT } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { ChangePasswordResponse } from '@/types'

const themeConfig = {
  token: {
    colorPrimary: '#1890ff',
    colorBgLayout: '#f5f5f7',
    colorBgContainer: '#fff',
    colorBorder: '#e0e0e0',
    colorText: '#1a1a2e',
    colorTextSecondary: '#666',
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
  },
}

// ── 默认口令守卫全局兜底（default-password-guard-switch D5）──
// api 拦截器识别 403+code 后派发事件（覆盖「刷新页面后仍持带标记 token」的
// 存量会话）；Login 场景由 Login.vue 自行挂同一组件，v-if 标记天然去重。
const authStore = useAuthStore()
const forcePwdOpen = ref(false)

const onForcePwdEvent = () => {
  forcePwdOpen.value = true
}

onMounted(() => window.addEventListener(FORCE_CHANGE_PASSWORD_EVENT, onForcePwdEvent))
onUnmounted(() => window.removeEventListener(FORCE_CHANGE_PASSWORD_EVENT, onForcePwdEvent))

function handleForcePwdSuccess(data: ChangePasswordResponse) {
  authStore.applySession(data)
  forcePwdOpen.value = false
}
</script>

<template>
  <ConfigProvider :theme="themeConfig" :locale="zhCN">
    <!-- 全局迁移锁横幅：fixed 顶条，不占布局流（D5 事件驱动零轮询） -->
    <MigrationLockBanner />
    <!-- 默认口令守卫全局兜底弹窗：不可关闭，改密成功换发 token 后消失 -->
    <ForceChangePasswordDialog
      v-model:open="forcePwdOpen"
      tip="检测到当前仍在使用默认口令，为保障系统安全，请修改密码后继续使用。"
      @success="handleForcePwdSuccess"
    />
    <router-view />
  </ConfigProvider>
</template>
