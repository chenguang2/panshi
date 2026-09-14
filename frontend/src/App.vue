<script setup lang="ts">
import { ConfigProvider } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'

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
    <router-view />
  </ConfigProvider>
</template>
