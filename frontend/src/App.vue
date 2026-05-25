<script setup lang="ts">
import { watch } from 'vue'
import { ConfigProvider } from 'ant-design-vue'
import { useThemeStore, themeColorMap, themeBgLightMap, themeGlassMap, themeTableGlassMap, themeGlassBorderMap } from '@/stores/theme'
import type { ThemeColor } from '@/stores/theme'
import { useAntdThemeSync } from '@/composables/useAntdThemeSync'

const themeStore = useThemeStore()
const { themeConfig } = useAntdThemeSync()

function syncPrimary(color: ThemeColor) {
  const root = document.documentElement
  const primary = themeColorMap[color]
  root.style.setProperty('--p-color-primary', primary)
  root.style.setProperty('--p-color-primary-hover', primary + 'cc')
  root.style.setProperty('--p-color-primary-active', primary + '99')
  root.style.setProperty('--p-color-primary-bg', primary + '18')
}

function syncModernBg(color: ThemeColor, lightBg: boolean) {
  const root = document.documentElement
  const primary = themeColorMap[color]
  root.style.setProperty('--p-bg-hover', primary + '0f')
  root.style.setProperty('--p-border-hover', primary + '4d')
  root.style.setProperty('--p-border-active', primary)
  if (lightBg) {
    root.style.removeProperty('--p-bg-page')
    root.style.setProperty('--p-bg-glass', themeGlassMap[color])
    root.style.setProperty('--p-bg-glass-table', themeTableGlassMap[color])
    root.style.setProperty('--p-glass-border', themeGlassBorderMap[color])
  } else {
    root.style.removeProperty('--p-bg-page')
    root.style.removeProperty('--p-bg-glass')
    root.style.removeProperty('--p-bg-glass-table')
    root.style.removeProperty('--p-glass-border')
    root.style.removeProperty('--p-bg-hover')
    root.style.removeProperty('--p-border-hover')
    root.style.removeProperty('--p-border-active')
  }
}

function clearModernBg() {
  const root = document.documentElement
  root.style.removeProperty('--p-bg-page')
  root.style.removeProperty('--p-bg-glass')
  root.style.removeProperty('--p-bg-glass-table')
  root.style.removeProperty('--p-glass-border')
  root.style.removeProperty('--p-bg-hover')
  root.style.removeProperty('--p-border-hover')
  root.style.removeProperty('--p-border-active')
}

// Sync primary color on every themeColor change (always)
watch(() => themeStore.themeColor, (color) => {
  syncPrimary(color)
  if (themeStore.style === 'modern') {
    syncModernBg(color, !themeStore.darkMode)
  }
}, { immediate: true })

// Handle dark mode / style changes
watch([() => themeStore.darkMode, () => themeStore.style], ([dark, style]) => {
  syncPrimary(themeStore.themeColor)
  if (style === 'default') {
    clearModernBg()
  } else {
    syncModernBg(themeStore.themeColor, !dark)
  }
}, { immediate: true })
</script>

<template>
  <ConfigProvider :theme="themeConfig">
    <router-view />
  </ConfigProvider>
</template>
