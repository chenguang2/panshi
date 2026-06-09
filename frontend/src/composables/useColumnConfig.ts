import { ref, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

export interface ColumnConfigOptions {
  /** Unique key for this config (e.g. 'route', 'upstream', 'node') */
  key: string
  /** Default column keys */
  defaultColumns: string[]
  /** Default search visible state */
  defaultSearchVisible?: boolean
  /** Default action button keys */
  defaultActions?: string[]
}

/**
 * Persistent column/action/search configuration for data tables.
 *
 * Saves/loads user preferences (which columns to show, which action buttons,
 * whether search is visible) to localStorage, keyed by user ID.
 */
export function useColumnConfig(options: ColumnConfigOptions) {
  const { key, defaultColumns, defaultSearchVisible = true, defaultActions = [] } = options
  const authStore = useAuthStore()
  const CFG_KEY = () => `${key}_cfg_${authStore.user?.id ?? 'guest'}`

  function loadConfig() {
    try {
      const raw = localStorage.getItem(CFG_KEY())
      if (raw) {
        const cfg = JSON.parse(raw)
        if (cfg.columns) columnsSelected.value = cfg.columns
        if (cfg.searchVisible !== undefined) searchVisible.value = cfg.searchVisible
        if (cfg.actions) actionsSelected.value = cfg.actions
      }
    } catch { /* ignore */ }
  }

  function saveConfig() {
    try {
      localStorage.setItem(CFG_KEY(), JSON.stringify({
        columns: columnsSelected.value,
        searchVisible: searchVisible.value,
        actions: actionsSelected.value,
      }))
    } catch { /* ignore */ }
  }

  const popoverVisible = ref(false)
  const columnsSelected = ref([...defaultColumns])
  const searchVisible = ref(defaultSearchVisible)
  const actionsSelected = ref([...defaultActions])

  watch([columnsSelected, searchVisible, actionsSelected], saveConfig, { deep: true })
  loadConfig()

  return {
    popoverVisible,
    columnsSelected,
    searchVisible,
    actionsSelected,
  }
}
