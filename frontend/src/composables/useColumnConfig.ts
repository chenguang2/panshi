import { ref, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

interface ColumnConfigOptions {
  /** Unique key for this config (e.g. 'route', 'upstream', 'node') */
  key: string
  /** Default column keys */
  defaultColumns: string[]
  /**
   * 全量列键清单（默认序，含非默认可见列）。缺省时退化为 defaultColumns。
   * 顺序清洗必须按此清洗——按 defaultColumns 清洗会把「非默认可见列」从顺序里剔掉，
   * 导致启用这些列后它们被重排逻辑追加到末尾、且再也拖不回来（route-column-reorder-fix）。
   */
  allColumns?: string[]
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
 * 未知/重复 key 剔除；用户定位过的列**占据它们原本占用的槽位**、按用户顺序填入槽位，
 * 从未定位过的列（默认隐藏后启用、或代码新加的列）留在自己的设计位（route-column-reorder-fix）。
 * 旧实现把未定位列一律追加到末尾，于是路由「方法/上游」、节点「安装路径」永远排在操作列右侧，
 * 且拖拽换位时被顺序清洗丢弃、无法左移。
 * 存储序完整覆盖全列时等价于直接按存储序排列；存储序为空时按默认序原样返回。
 * 返回对象引用原样保留。
 */
export function resolveOrderedColumns<T extends OrderedColumnLike>(columns: T[], order: string[]): T[] {
  const byKey = new Map(columns.map((c) => [String(c.key), c]))
  const defaultKeys = columns.map((c) => String(c.key))
  const defaultIndex = new Map(defaultKeys.map((k, i) => [k, i]))
  const positioned: string[] = []
  const seen = new Set<string>()
  for (const k of order) {
    if (!byKey.has(k) || seen.has(k)) continue
    positioned.push(k)
    seen.add(k)
  }
  if (!positioned.length) return [...columns]
  // 已定位列原本占据的槽位（默认序升序），按用户顺序逐一填回
  const slots = positioned.map((k) => defaultIndex.get(k) as number).sort((a, b) => a - b)
  const out: string[] = [...defaultKeys]
  slots.forEach((slot, i) => {
    out[slot] = positioned[i]
  })
  return out.map((k) => byKey.get(k) as T)
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

  /** 列顺序入库前清洗：未知/重复 key 剔除，缺失 key 按全量列默认序补位（新列加入时自然落位） */
  function setColumnOrder(order: string[]): void {
    // 必须按全量列清单清洗：defaultColumns 只是默认可见列，按它清洗会丢弃非默认列的顺序
    const universe = options.allColumns ?? defaultColumns
    const known = new Set(universe)
    const seen = new Set<string>()
    const clean: string[] = []
    for (const k of order) {
      if (known.has(k) && !seen.has(k)) {
        clean.push(k)
        seen.add(k)
      }
    }
    for (const k of universe) if (!seen.has(k)) clean.push(k)
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
