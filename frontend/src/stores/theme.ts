import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'panshi_sidebar_collapsed'

export const useThemeStore = defineStore('theme', () => {
  const sidebarCollapsed = ref(false)

  try {
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      sidebarCollapsed.value = true
    }
  } catch { /* ignore */ }

  watch(sidebarCollapsed, (v) => {
    try { localStorage.setItem(STORAGE_KEY, String(v)) } catch { /* ignore */ }
  })

  const toggleSidebar = () => { sidebarCollapsed.value = !sidebarCollapsed.value }

  return { sidebarCollapsed, toggleSidebar }
})
