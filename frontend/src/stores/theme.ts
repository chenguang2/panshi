import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeColor = 'blue' | 'green' | 'purple' | 'orange' | 'red'
export type LayoutMode = 'sidebar' | 'topnav' | 'fullwidth'

const THEME_STORAGE_KEY = 'panshi_theme_prefs'

interface ThemePrefs {
  themeColor: ThemeColor
  darkMode: boolean
  layoutMode: LayoutMode
  sidebarCollapsed: boolean
}

function loadPrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { themeColor: 'blue', darkMode: false, layoutMode: 'sidebar', sidebarCollapsed: false }
}

function savePrefs(prefs: ThemePrefs) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs))
}

export const themeColorMap: Record<ThemeColor, string> = {
  blue: '#1890ff',
  green: '#52c41a',
  purple: '#7c3aed',
  orange: '#fa8c16',
  red: '#f5222d',
}

export const useThemeStore = defineStore('theme', () => {
  const prefs = loadPrefs()

  const themeColor = ref<ThemeColor>(prefs.themeColor)
  const darkMode = ref<boolean>(prefs.darkMode)
  const layoutMode = ref<LayoutMode>(prefs.layoutMode)
  const sidebarCollapsed = ref<boolean>(prefs.sidebarCollapsed)

  const persist = () => savePrefs({
    themeColor: themeColor.value,
    darkMode: darkMode.value,
    layoutMode: layoutMode.value,
    sidebarCollapsed: sidebarCollapsed.value,
  })

  watch([themeColor, darkMode, layoutMode, sidebarCollapsed], persist, { deep: true })

  const setThemeColor = (color: ThemeColor) => { themeColor.value = color }
  const toggleDarkMode = () => { darkMode.value = !darkMode.value }
  const setDarkMode = (val: boolean) => { darkMode.value = val }
  const setLayoutMode = (mode: LayoutMode) => { layoutMode.value = mode }
  const toggleSidebar = () => { sidebarCollapsed.value = !sidebarCollapsed.value }
  const setSidebarCollapsed = (val: boolean) => { sidebarCollapsed.value = val }

  return {
    themeColor,
    darkMode,
    layoutMode,
    sidebarCollapsed,
    setThemeColor,
    toggleDarkMode,
    setDarkMode,
    setLayoutMode,
    toggleSidebar,
    setSidebarCollapsed,
  }
})
