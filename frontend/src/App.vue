<script setup lang="ts">
import { ConfigProvider } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import MigrationLockBanner from '@/components/MigrationLockBanner.vue'

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
</script>

<template>
  <ConfigProvider :theme="themeConfig" :locale="zhCN">
    <!-- 全局迁移锁横幅：fixed 顶条，不占布局流（D5 事件驱动零轮询） -->
    <MigrationLockBanner />
    <router-view />
  </ConfigProvider>
</template>
