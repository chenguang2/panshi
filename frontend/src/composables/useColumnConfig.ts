import { ref, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

interface ColumnConfigOptions {
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
 *
 * 列宽个性化（node-list-column-resize）：columnWidths 按列 key 记录用户拖拽宽度，
 * 与列显隐同 key 同 JSON 持久化；旧存储缺 widths 字段按空档兼容。
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
        if (cfg.widths) columnWidths.value = cfg.widths
      }
    } catch {
      /* ignore */
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem(
        CFG_KEY(),
        JSON.stringify({
          columns: columnsSelected.value,
          searchVisible: searchVisible.value,
          actions: actionsSelected.value,
          widths: columnWidths.value,
        }),
      )
    } catch {
      /* ignore */
    }
  }

  const popoverVisible = ref(false)
  const columnsSelected = ref([...defaultColumns])
  const searchVisible = ref(defaultSearchVisible)
  const actionsSelected = ref([...defaultActions])
  const columnWidths = ref<Record<string, number>>({})

  function setColumnWidth(columnKey: string, width: number): void {
    columnWidths.value = { ...columnWidths.value, [columnKey]: width }
  }

  function resetWidths(): void {
    columnWidths.value = {}
  }

  watch([columnsSelected, searchVisible, actionsSelected, columnWidths], saveConfig, { deep: true })
  loadConfig()

  return {
    popoverVisible,
    columnsSelected,
    searchVisible,
    actionsSelected,
    columnWidths,
    setColumnWidth,
    resetWidths,
  }
}
