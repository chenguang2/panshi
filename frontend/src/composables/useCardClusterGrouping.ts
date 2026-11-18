import { computed, ref, type Ref } from 'vue'
import { clusterHueClass } from '@/utils/clusterHue'

/**
 * 卡片型列表页的「集群分组 / 平铺」双视图（filter-architecture，2026-11-18）。
 *
 * 与表格页的 `useListClusterGrouping` 是**两套**实现：表格按行分组（组头伪行 + 行切片），
 * 卡片按卡片分堆（band 跨列 + 卡片容器），DOM 结构与分页语义都不同（卡片页 ≤60 条单页）。
 * 故不强行合并，但两者共享同一视觉契约：集群色相 `.cluster-cN`、band 只报规模、整条可点。
 *
 * 契约（AGENTS #87）：
 * - 分组视图：每集群一条 band（集群名 + 分组徽标 + N 个X + 一个次要指标 + 折叠）；
 *   **band 不放状态计数**（状态归顶部 chips 行）；卡片内不重复集群标识；
 * - 平铺视图：无 band，卡片显示集群角标 + 左缘色条（由 `.l5-card.mode-flat` 的 CSS 承担）；
 * - 折叠：整条 band 可点 + 「全部展开/收起」单按钮，`aria-expanded` 双向同步；
 * - 分页：≤60 条单页（卡片页当前量级），故本组合式不涉及分页。
 */

export type CardViewMode = 'group' | 'flat'

export interface CardClusterGroup<T> {
  /** 集群 id（用于色相与稳定排序） */
  clusterId: number
  clusterName: string
  groupName: string
  hueClass: string
  rows: T[]
  count: number
}

export interface UseCardClusterGroupingOptions<T> {
  /** 当前页全部（已筛选）卡片数据 */
  rows: () => T[]
  /** 单位名词：「个四层代理」「个插件组」… */
  unit: string
  /** 集群 id 取值 */
  clusterIdOf: (row: T) => number | null | undefined
  /** 集群名取值 */
  clusterNameOf: (row: T) => string | null | undefined
  /** 集群分组名取值（可空） */
  groupNameOf?: (row: T) => string | null | undefined
  /** 每集群的「次要指标」文案（band 右端），如「目标 12 个」 */
  secondary?: (rows: T[]) => string
  /** 组内排序（缺省保持入参顺序） */
  sortRows?: (a: T, b: T) => number
}

export function useCardClusterGrouping<T>(options: UseCardClusterGroupingOptions<T>) {
  const mode = ref<CardViewMode>('group')
  /** 折叠的集群 id 集合（分组视图有效；切平铺不清空，切回分组恢复） */
  const foldedIds = ref<number[]>([])

  const groups = computed<CardClusterGroup<T>[]>(() => {
    const buckets = new Map<number, { name: string; group: string; rows: T[] }>()
    for (const row of options.rows()) {
      const rawId = options.clusterIdOf(row)
      const id = Number(rawId) || 0
      const name = String(options.clusterNameOf(row) ?? '') || `集群 ${id}`
      const group = String(options.groupNameOf?.(row) ?? '')
      const bucket = buckets.get(id)
      if (bucket) bucket.rows.push(row)
      else buckets.set(id, { name, group, rows: [row] })
    }
    // 组序：按集群名（中文按 localeCompare），空集群放末尾
    return [...buckets.entries()]
      .map(([clusterId, b]) => ({
        clusterId,
        clusterName: b.name,
        groupName: b.group,
        hueClass: clusterHueClass(clusterId),
        rows: options.sortRows ? [...b.rows].sort(options.sortRows) : b.rows,
        count: b.rows.length,
      }))
      .sort((a, b) =>
        a.clusterId === 0 ? 1 : b.clusterId === 0 ? -1 : a.clusterName.localeCompare(b.clusterName, 'zh'),
      )
  })

  /** 组内规模文案：「10 个四层代理」 */
  const countLabel = (count: number) => `${count} ${options.unit}`

  /** 该组的次要指标文案（缺省空串） */
  const secondaryOf = (rows: T[]) => options.secondary?.(rows) ?? ''

  function isFolded(clusterId: number): boolean {
    return foldedIds.value.includes(clusterId)
  }

  function toggleFold(clusterId: number): void {
    foldedIds.value = isFolded(clusterId)
      ? foldedIds.value.filter((id) => id !== clusterId)
      : [...foldedIds.value, clusterId]
  }

  /** 当页是否存在折叠组（决定「全部展开 / 全部收起」文案） */
  const pageHasFolded = computed(() => groups.value.some((g) => isFolded(g.clusterId)))

  function collapseAll(): void {
    const ids = groups.value.map((g) => g.clusterId)
    foldedIds.value = [...new Set([...foldedIds.value, ...ids])]
  }

  function expandAll(): void {
    foldedIds.value = []
  }

  function toggleFoldAll(): void {
    if (pageHasFolded.value) expandAll()
    else collapseAll()
  }

  /** 分组视图下某组是否渲染（折叠即隐藏） */
  function groupVisible(clusterId: number): boolean {
    return !isFolded(clusterId)
  }

  return {
    mode,
    groups,
    countLabel,
    secondaryOf,
    isFolded,
    toggleFold,
    pageHasFolded,
    collapseAll,
    expandAll,
    toggleFoldAll,
    groupVisible,
    foldedIds,
  }
}

/** 卡片页是否需要分页（≤60 条单页；>60 走「按组分页」，>1000 虚拟滚动 —— 见 BRIEF §7.3） */
export const CARD_SINGLE_PAGE_MAX = 60

export function needsCardPaging(total: number): boolean {
  return total > CARD_SINGLE_PAGE_MAX
}

/** 供 `computed` 内复用的类型导出（组件侧 props 用） */
export type CardRowsRef<T> = Ref<T[]>
