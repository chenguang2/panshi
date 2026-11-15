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

/** 列定义的最小访问面（兼容 antd ColumnType 等任意列类型） */
interface OrderedColumnLike {
  key?: unknown
}

/**
 * 按用户存储顺序重排全量列定义（cluster-tab-column-personalization D3）：
 * 未知/重复 key 剔除，缺失 key 按默认序补位（新列自然落位），返回对象引用原样保留。
 * 存储顺序为空时按默认序原样返回。
 */
export function resolveOrderedColumns<T extends OrderedColumnLike>(columns: T[], order: string[]): T[] {
  const byKey = new Map(columns.map((c) => [String(c.key), c]))
  const out: T[] = []
  const seen = new Set<string>()
  for (const k of order) {
    const col = byKey.get(k)
    if (col && !seen.has(k)) {
      out.push(col)
      seen.add(k)
    }
  }
  for (const c of columns) {
    const k = String(c.key)
    if (!seen.has(k)) {
      out.push(c)
      seen.add(k)
    }
  }
  return out
}

/** 按用户宽度覆盖表逐列应用宽度；无覆盖列保持默认档，入参列对象不被修改 */
export function applyColumnWidths<T extends OrderedColumnLike & { width?: unknown }>(
  columns: T[],
  widths: Record<string, number | undefined>,
): T[] {
  return columns.map((c) => {
    const w = widths[String(c.key)]
    return w == null ? c : { ...c, width: w }
  })
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
        if (cfg.order) columnOrder.value = cfg.order
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
          order: columnOrder.value,
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
  const columnOrder = ref<string[]>([])

  function setColumnWidth(columnKey: string, width: number): void {
    columnWidths.value = { ...columnWidths.value, [columnKey]: width }
  }

  function resetWidths(): void {
    columnWidths.value = {}
  }

  /** 列顺序入库前清洗：未知/重复 key 剔除，缺失 key 按默认序补位（新列加入时自然落位） */
  function setColumnOrder(order: string[]): void {
    const known = new Set(defaultColumns)
    const seen = new Set<string>()
    const clean: string[] = []
    for (const k of order) {
      if (known.has(k) && !seen.has(k)) {
        clean.push(k)
        seen.add(k)
      }
    }
    for (const k of defaultColumns) if (!seen.has(k)) clean.push(k)
    columnOrder.value = clean
  }

  watch([columnsSelected, searchVisible, actionsSelected, columnWidths, columnOrder], saveConfig, { deep: true })
  loadConfig()

  return {
    popoverVisible,
    columnsSelected,
    searchVisible,
    actionsSelected,
    columnWidths,
    setColumnWidth,
    resetWidths,
    columnOrder,
    setColumnOrder,
  }
}
