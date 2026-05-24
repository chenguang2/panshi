<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { ConfigProvider } from 'ant-design-vue'
import { useThemeStore, themeColorMap } from '@/stores/theme'
import { useAntdThemeSync } from '@/composables/useAntdThemeSync'

const themeStore = useThemeStore()
const { themeConfig } = useAntdThemeSync()

// Keep CSS variable --p-color-primary in sync with themeColor changes
// (theme-light.css / theme-dark.css define static colors; primary changes at runtime)
watch(() => themeStore.themeColor, (color) => {
  const primary = themeColorMap[color]
  document.documentElement.style.setProperty('--p-color-primary', primary)
  document.documentElement.style.setProperty('--p-color-primary-hover', primary + 'cc')
  document.documentElement.style.setProperty('--p-color-primary-active', primary + '99')
  document.documentElement.style.setProperty('--p-color-primary-bg', primary + '18')
}, { immediate: true })

// System preference listener for dark mode
let mediaQuery: MediaQueryList | null = null
function setupSystemThemeListener() {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent) => {
    themeStore.setDarkMode(e.matches)
  }
  mediaQuery.addEventListener('change', handler)
}

onMounted(() => {
  if (themeStore.darkMode === null) {
    themeStore.setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
  }
  setupSystemThemeListener()
})
</script>

<template>
  <ConfigProvider :theme="themeConfig">
    <router-view />
  </ConfigProvider>
</template>
