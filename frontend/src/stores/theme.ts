import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export type ThemeColor = 'blue' | 'green' | 'purple' | 'orange' | 'red'
export type ThemeStyle = 'modern' | 'default'
export type LayoutMode = 'sidebar' | 'topnav' | 'fullwidth'

const THEME_STORAGE_KEY = 'panshi_theme_prefs'

interface ThemePrefs {
  themeColor: ThemeColor
  darkMode: boolean
  style: ThemeStyle
  layoutMode: LayoutMode
  sidebarCollapsed: boolean
}

function loadPrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { themeColor: 'blue', darkMode: false, style: 'modern', layoutMode: 'sidebar', sidebarCollapsed: false }
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

/** Light-tinted background colors matching each theme color (for --p-bg-page) */
export const themeBgLightMap: Record<ThemeColor, string> = {
  blue: '#e8f0fe',
  green: '#eef7e8',
  purple: '#f0e8ff',
  orange: '#fef0e6',
  red: '#fde8e9',
}

/** Glass card background tinted per theme */
export const themeGlassMap: Record<ThemeColor, string> = {
  blue: 'rgba(232,240,254,0.7)',
  green: 'rgba(238,247,232,0.7)',
  purple: 'rgba(240,232,255,0.7)',
  orange: 'rgba(254,240,230,0.7)',
  red: 'rgba(253,232,233,0.7)',
}

/** Table card glass background per theme */
export const themeTableGlassMap: Record<ThemeColor, string> = {
  blue: 'rgba(232,240,254,0.65)',
  green: 'rgba(238,247,232,0.65)',
  purple: 'rgba(240,232,255,0.65)',
  orange: 'rgba(254,240,230,0.65)',
  red: 'rgba(253,232,233,0.65)',
}

/** Glass border per theme */
export const themeGlassBorderMap: Record<ThemeColor, string> = {
  blue: 'rgba(24,144,255,0.15)',
  green: 'rgba(82,196,26,0.15)',
  purple: 'rgba(124,58,237,0.15)',
  orange: 'rgba(250,140,22,0.15)',
  red: 'rgba(245,34,45,0.15)',
}

export const useThemeStore = defineStore('theme', () => {
  const prefs = loadPrefs()

  const style = ref<ThemeStyle>(prefs.style)
  const themeColor = ref<ThemeColor>(prefs.themeColor)
  const darkMode = ref<boolean>(prefs.darkMode)
  const layoutMode = ref<LayoutMode>(prefs.layoutMode)
  const sidebarCollapsed = ref<boolean>(prefs.sidebarCollapsed)

  /** The class to set on <html>: 'theme-light', 'theme-dark', or 'theme-default' */
  const themeClass = computed(() => {
    if (style.value === 'default') return 'theme-default'
    return darkMode.value ? 'theme-dark' : 'theme-light'
  })

  const persist = () => savePrefs({
    themeColor: themeColor.value,
    darkMode: darkMode.value,
    style: style.value,
    layoutMode: layoutMode.value,
    sidebarCollapsed: sidebarCollapsed.value,
  })

  watch([themeColor, darkMode, style, layoutMode, sidebarCollapsed], persist, { deep: true })

  // Sync html class with themeClass
  watch(themeClass, (cls) => {
    const root = document.documentElement
    root.className = root.className.replace(/theme-\w+/g, '').trim()
    root.classList.add(cls)
  }, { immediate: true })

  const setThemeColor = (color: ThemeColor) => { themeColor.value = color }
  const toggleDarkMode = () => { darkMode.value = !darkMode.value }
  const setDarkMode = (val: boolean) => { darkMode.value = val }
  const setLayoutMode = (mode: LayoutMode) => { layoutMode.value = mode }
  const toggleSidebar = () => { sidebarCollapsed.value = !sidebarCollapsed.value }
  const setThemeStyle = (s: ThemeStyle) => { style.value = s }

  return {
    style,
    themeColor,
    darkMode,
    layoutMode,
    sidebarCollapsed,
    themeClass,
    setThemeColor,
    toggleDarkMode,
    setDarkMode,
    setLayoutMode,
    toggleSidebar,
    setThemeStyle,
  }
})
