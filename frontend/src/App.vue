<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { ConfigProvider, theme } from 'ant-design-vue'
import { useThemeStore, themeColorMap } from '@/stores/theme'

const themeStore = useThemeStore()

const currentTheme = computed(() => {
  const algorithm = themeStore.darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm
  return {
    algorithm,
    token: {
      colorPrimary: themeColorMap[themeStore.themeColor],
    },
  }
})

function applyCSSVars() {
  const primary = themeColorMap[themeStore.themeColor]
  const isDark = themeStore.darkMode
  const root = document.documentElement
  root.style.setProperty('--p-primary', primary)
  root.style.setProperty('--p-primary-light', primary + '20')
  root.style.setProperty('--p-bg', isDark ? '#141414' : '#f0f2f5')
  root.style.setProperty('--p-bg-container', isDark ? '#1d1d1d' : '#fff')
  root.style.setProperty('--p-text', isDark ? '#e8e8e8' : '#333')
  root.style.setProperty('--p-text-secondary', isDark ? '#999' : '#666')
  root.style.setProperty('--p-border', isDark ? '#303030' : '#e8e8e8')
  root.style.setProperty('--p-header-bg', isDark ? '#1d1d1d' : '#fff')
  root.style.setProperty('--p-sidebar-bg', isDark ? '#1a1a2e' : '#001529')
  root.style.setProperty('--p-sidebar-text', isDark ? '#c0c0c0' : 'rgba(255,255,255,0.65)')
}

watch([() => themeStore.themeColor, () => themeStore.darkMode], applyCSSVars, { immediate: true })

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
  <ConfigProvider :theme="currentTheme">
    <router-view />
  </ConfigProvider>
</template>
