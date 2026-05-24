<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { ConfigProvider } from 'ant-design-vue'
import { useThemeStore, themeColorMap, themeBgLightMap, themeGlassMap, themeTableGlassMap, themeGlassBorderMap } from '@/stores/theme'
import { useAntdThemeSync } from '@/composables/useAntdThemeSync'

const themeStore = useThemeStore()
const { themeConfig } = useAntdThemeSync()

// Sync all theme-dependent CSS variables when themeColor changes
watch(() => themeStore.themeColor, (color) => {
  const root = document.documentElement
  const isDark = themeStore.darkMode || root.classList.contains('theme-dark')

  const primary = themeColorMap[color]
  root.style.setProperty('--p-color-primary', primary)
  root.style.setProperty('--p-color-primary-hover', primary + 'cc')
  root.style.setProperty('--p-color-primary-active', primary + '99')
  root.style.setProperty('--p-color-primary-bg', primary + '18')
  root.style.setProperty('--p-bg-hover', primary + '0f')    // ~6% opacity
  root.style.setProperty('--p-border-hover', primary + '4d')  // ~30% opacity
  root.style.setProperty('--p-border-active', primary)

  if (!isDark) {
    root.style.setProperty('--p-bg-page', themeBgLightMap[color])
    root.style.setProperty('--p-bg-glass', themeGlassMap[color])
    root.style.setProperty('--p-bg-glass-table', themeTableGlassMap[color])
    root.style.setProperty('--p-glass-border', themeGlassBorderMap[color])
  }
}, { immediate: true })

// Also update bg vars when dark mode toggles
watch(() => themeStore.darkMode, (val) => {
  const root = document.documentElement
  const color = themeStore.themeColor
  const primary = themeColorMap[color]
  if (!val) {
    root.style.setProperty('--p-bg-page', themeBgLightMap[color])
    root.style.setProperty('--p-bg-glass', themeGlassMap[color])
    root.style.setProperty('--p-bg-glass-table', themeTableGlassMap[color])
    root.style.setProperty('--p-glass-border', themeGlassBorderMap[color])
    root.style.setProperty('--p-bg-hover', primary + '0f')
    root.style.setProperty('--p-border-hover', primary + '4d')
    root.style.setProperty('--p-border-active', primary)
  } else {
    root.style.removeProperty('--p-bg-page')
    root.style.removeProperty('--p-bg-glass')
    root.style.removeProperty('--p-bg-glass-table')
    root.style.removeProperty('--p-glass-border')
    root.style.removeProperty('--p-bg-hover')
    root.style.removeProperty('--p-border-hover')
    root.style.removeProperty('--p-border-active')
  }
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
