import { computed, ref, type Ref } from 'vue'

/**
 * 列表页「按所属集群分组」的共享实现（list-pages-console-restyle 任务 2.1）。
 *
 * 三张独立列表页（节点/上游/路由）共用同一分组语义（规格 list-page-cluster-grouping）：
 * - 分组键 = `cluster_id`；无 `cluster_id` 的数据归入「未关联集群」组
 * - 分组为**当页聚合**：组序 = 数据中首次出现顺序（不重排）
 * - 组内顺序固定：路由=优先级升序、上游=名称、节点=IP 数值序（由调用方给比较器）；
 *   平铺模式不使用该比较器（平铺=用户排序或服务端默认序）
 * - 组标记行 `GroupHeaderRow` 注入数据源，**不可选中、不可排序**（页面据此配置
 *   `row-selection.getCheckboxProps` 与列的 `sorter`）
 * - 折叠状态按 groupKey 保存，切换「分组/平铺」不丢失
 * - 单组也渲染标记行（与多组同一解剖，避免两套渲染分支）
 * - 行序号按渲染序（含组内固定序）1 基连续；标记行不占号
 */

export type ListViewMode = 'group' | 'flat'

/** 组标记行上的统计徽章（数量徽章由 composable 自动置于最前） */
export interface ClusterGroupChip {
  label: string
  tone?: 'ok' | 'warn' | 'bad'
}

/** 注入数据源的组标记行 */
export interface GroupHeaderRow {
  __groupHeader: true
  /** 表格 row-key */
  key: string
  groupKey: string
  label: string
  chips: ClusterGroupChip[]
  folded: boolean
}

export const UNGROUPED_KEY = '__none__'
export const UNGROUPED_LABEL = '未关联集群'

/** 断言是否组标记行（页面模板与 row-selection 判定共用） */
export function isGroupHeaderRow(row: unknown): row is GroupHeaderRow {
  return !!row && typeof row === 'object' && (row as GroupHeaderRow).__groupHeader === true
}

export interface ClusterGroupRowLike {
  cluster_id?: number | string | null
  cluster_name?: string | null
}

export interface ClusterGroup<T> {
  groupKey: string
  label: string
  rows: T[]
}

export interface ListClusterGroupingOptions<T extends ClusterGroupRowLike> {
  /** 当前页已筛选数据（响应式来源） */
  rows: () => T[]
  /** 组内固定序比较器（仅分组模式生效）；缺省保持原序 */
  sortWithinGroup?: (a: T, b: T) => number
  /** 域内统计徽章；数量徽章 `${n} ${unit}` 由本 composable 自动置于最前 */
  chips?: (rows: T[]) => ClusterGroupChip[]
  /** 数量徽章单位：'节点' | '上游' | '路由' | '条' */
  unit?: string
  /** 外部受控模式（缺省内部自建，默认 'group'） */
  mode?: Ref<ListViewMode>
}

export function useListClusterGrouping<T extends ClusterGroupRowLike>(options: ListClusterGroupingOptions<T>) {
  const mode = options.mode ?? ref<ListViewMode>('group')
  const unit = options.unit ?? '条'
  /** 折叠的 groupKey 集合（切换模式不清空） */
  const foldedKeys = ref<string[]>([])

  const groups = computed<ClusterGroup<T>[]>(() => {
    const out: ClusterGroup<T>[] = []
    const index = new Map<string, ClusterGroup<T>>()
    for (const row of options.rows()) {
      const groupKey = row.cluster_id == null || row.cluster_id === '' ? UNGROUPED_KEY : String(row.cluster_id)
      let group = index.get(groupKey)
      if (!group) {
        group = { groupKey, label: groupLabel(row, groupKey), rows: [] }
        index.set(groupKey, group)
        out.push(group)
      }
      group.rows.push(row)
    }
    const compare = options.sortWithinGroup
    if (compare) for (const g of out) g.rows.sort(compare)
    return out
  })

  function groupLabel(row: T, groupKey: string): string {
    if (groupKey === UNGROUPED_KEY) return UNGROUPED_LABEL
    return row.cluster_name || `集群 #${groupKey}`
  }

  const foldedSet = computed(() => new Set(foldedKeys.value))
  function isFolded(groupKey: string): boolean {
    return foldedSet.value.has(groupKey)
  }

  function toggleFold(groupKey: string): void {
    foldedKeys.value = isFolded(groupKey)
      ? foldedKeys.value.filter((k) => k !== groupKey)
      : [...foldedKeys.value, groupKey]
  }

  /** 组内行 → 组标记行对象（保证同一组同一份引用，避免无谓重渲染） */
  const headerRows = computed(() => {
    const map = new Map<string, GroupHeaderRow>()
    for (const g of groups.value) {
      const folded = isFolded(g.groupKey)
      const chips: ClusterGroupChip[] = [{ label: `${g.rows.length} ${unit}` }, ...(options.chips?.(g.rows) ?? [])]
      map.set(g.groupKey, {
        __groupHeader: true,
        key: `__group__:${g.groupKey}`,
        groupKey: g.groupKey,
        label: g.label,
        chips,
        folded,
      })
    }
    return map
  })

  /** 表格数据源：平铺 = 原数组；分组 = 标记行 + 组内行（折叠组只留标记行） */
  const displayRows = computed<Array<T | GroupHeaderRow>>(() => {
    const rows = options.rows()
    if (mode.value === 'flat') return rows
    const out: Array<T | GroupHeaderRow> = []
    for (const g of groups.value) {
      const header = headerRows.value.get(g.groupKey) as GroupHeaderRow
      out.push(header)
      if (!header.folded) out.push(...g.rows)
    }
    return out
  })

  /** 可选中行（平铺/分组两模式都排除标记行） */
  const selectableRows = computed<T[]>(() => options.rows())

  /** 当页是否已有折叠组（工具条「全部展开/全部收起」按钮文案依据；r5-④ 方案 A） */
  const pageHasFolded = computed(() => groups.value.some((g) => isFolded(g.groupKey)))

  /**
   * 全部展开：清空折叠记忆（含其他页遗留的 groupKey）——字面语义即「全都展开」。
   */
  function expandAll(): void {
    foldedKeys.value = []
  }

  /**
   * 全部收起：把**当页**全部组记入折叠集合（与既有跨页折叠取并集）。
   * 翻页后新出现的组默认展开，避免「翻页即空白」；折叠状态不持久化，刷新回默认全展开。
   */
  function collapseAll(): void {
    const merged = new Set(foldedKeys.value)
    for (const g of groups.value) merged.add(g.groupKey)
    foldedKeys.value = [...merged]
  }

  /** 工具条单按钮的上下文切换（有折叠 → 全展开；无折叠 → 全收起） */
  function toggleFoldAll(): void {
    if (pageHasFolded.value) expandAll()
    else collapseAll()
  }

  function isRowSelectable(row: unknown): boolean {
    return !isGroupHeaderRow(row)
  }

  /** 行序号（1 基，按渲染序；组标记行不占号） */
  const sequence = computed(() => {
    const map = new WeakMap<object, number>()
    let seq = 0
    for (const row of displayRows.value) {
      if (isGroupHeaderRow(row)) continue
      map.set(row as unknown as object, ++seq)
    }
    return map
  })
  function sequenceOf(row: unknown): number {
    if (!row || typeof row !== 'object' || isGroupHeaderRow(row)) return 0
    return sequence.value.get(row as object) ?? 0
  }

  function setMode(next: ListViewMode): void {
    mode.value = next
  }

  return {
    mode,
    setMode,
    groups,
    displayRows,
    selectableRows,
    isRowSelectable,
    sequenceOf,
    foldedKeys,
    isFolded,
    toggleFold,
    pageHasFolded,
    expandAll,
    collapseAll,
    toggleFoldAll,
  }
}
