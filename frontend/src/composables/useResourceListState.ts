// 列表状态适配层（shared-core-plan 3.2 前置层 / B0）
//
// 目的：让抽出的单元格/动作/卡片组件只依赖「接口」而不读 `cluster` 对象或页面局部 ref。
// 两种载体各有工厂：
//   · clusterResourceState —— 最大化面板把列表/分页/选择挂在 `cluster` 对象上
//     （`cluster.nodes` / `cluster.nodesPagination` / `cluster.selectedNodeKeys`…）；
//   · localResourceState   —— 独立列表页用本地 ref + 服务端查询参数。
//
// 本层只做「同一接口两种来源」的换算，不含任何加载/筛选逻辑（那属于两侧壳）。
// 不 import `@/types` 的任何业务类型（一律泛型），避免把某一资源的形状钉进共享层。
import { computed, isRef } from 'vue'
import type { Ref } from 'vue'

/** 列表分页（字段与 `usePagination`、`cluster.*Pagination` 对齐） */
export interface ResourcePagination {
  page: number
  pageSize: number
  total: number
}

/**
 * 列表状态契约（只读字段 + 三个动作）。
 *
 * 只读字段由来源推导（computed / getter），**不要**给它们赋值——写入口只有
 * `setPage` / `clearSelection` / `reload`，由各来源自行落位。
 */
export interface ResourceListState<Row = unknown> {
  rows: Row[]
  loading: boolean
  pagination: ResourcePagination
  selectedKeys: (number | string)[]
  setPage(page: number, pageSize?: number): void
  clearSelection(): void
  reload(): void | Promise<void>
}

/**
 * 空来源（集群为 null / 数据未加载）时的回退分页：与 `rowIndexLabel`、`ListPager` 的
 * 缺省值一致（page 1 / pageSize 20 / total 0），保证序号列与分页条在空态下不跳变。
 * 冻结以免消费方误写（该对象是共享常量）。
 */
export const EMPTY_RESOURCE_PAGINATION: ResourcePagination = Object.freeze({
  page: 1,
  pageSize: 20,
  total: 0,
})

/** 面板侧（状态挂在集群对象上）的入参映射 */
export interface ClusterResourceStateOptions<ClusterLike, Row> {
  /** 取当前集群；返回 null/undefined 时全部字段走空态、方法为安全 no-op */
  getCluster: () => ClusterLike | null | undefined
  rows: (cluster: ClusterLike) => Row[]
  /** 加载态（可选：无对应字段时可省略，恒为 false） */
  loading?: (cluster: ClusterLike) => boolean
  /** 必须返回**来源本体**（同一对象），`setPage` 直接就地写回 */
  pagination: (cluster: ClusterLike) => ResourcePagination | null | undefined
  selectedKeys: (cluster: ClusterLike) => (number | string)[] | null | undefined
  clearSelection: (cluster: ClusterLike) => void
  reload: (cluster: ClusterLike) => void | Promise<void>
}

/**
 * 把「状态挂在集群对象上」的模式包装成 `ResourceListState`。
 *
 * 类型参数由入参推断（`ClusterLike` 来自 `getCluster` 的返回类型，`Row` 来自 `rows`），
 * 一般**不要**显式传泛型参数；需要显式标注时两个一起给。
 */
export function clusterResourceState<Row = unknown, ClusterLike = unknown>(
  opts: ClusterResourceStateOptions<ClusterLike, Row>,
): ResourceListState<Row> {
  const rows = computed<Row[]>(() => {
    const cluster = opts.getCluster()
    if (!cluster) return []
    return opts.rows(cluster)
  })

  const loading = computed<boolean>(() => {
    const cluster = opts.getCluster()
    if (!cluster || !opts.loading) return false
    return opts.loading(cluster)
  })

  const pagination = computed<ResourcePagination>(() => {
    const cluster = opts.getCluster()
    if (!cluster) return EMPTY_RESOURCE_PAGINATION
    return opts.pagination(cluster) || EMPTY_RESOURCE_PAGINATION
  })

  const selectedKeys = computed<(number | string)[]>(() => {
    const cluster = opts.getCluster()
    if (!cluster) return []
    return opts.selectedKeys(cluster) || []
  })

  function setPage(page: number, pageSize?: number): void {
    const cluster = opts.getCluster()
    if (!cluster) return
    const pag = opts.pagination(cluster)
    if (!pag) return
    pag.page = page
    if (pageSize !== undefined) pag.pageSize = pageSize
  }

  function clearSelection(): void {
    const cluster = opts.getCluster()
    if (!cluster) return
    opts.clearSelection(cluster)
  }

  function reload(): void | Promise<void> {
    const cluster = opts.getCluster()
    if (!cluster) return
    return opts.reload(cluster)
  }

  return {
    get rows(): Row[] {
      return rows.value
    },
    get loading(): boolean {
      return loading.value
    },
    get pagination(): ResourcePagination {
      return pagination.value
    },
    get selectedKeys(): (number | string)[] {
      return selectedKeys.value
    },
    setPage,
    clearSelection,
    reload,
  }
}

/** 页面侧（本地 ref + 服务端查询）的入参映射 */
export interface LocalResourceStateOptions<Row> {
  rows: Ref<Row[]>
  loading: Ref<boolean>
  /** Ref 或 reactive 本体均可；必须是**可写**来源（`setPage` 就地写回） */
  pagination: Ref<ResourcePagination> | ResourcePagination
  selectedKeys: Ref<(number | string)[]>
  reload: () => void | Promise<void>
}

/**
 * 把「页面本地 ref」模式包装成同一 `ResourceListState`。
 *
 * 与面板侧的唯一语义差别：`selectedKeys` 由页面自行清空（本层不替页面调接口），
 * `clearSelection` 只清传进来的 ref。
 */
export function localResourceState<Row>(opts: LocalResourceStateOptions<Row>): ResourceListState<Row> {
  const pagination = computed<ResourcePagination>(() =>
    isRef(opts.pagination) ? opts.pagination.value : opts.pagination,
  )

  function resolvePaginationSource(): ResourcePagination | null {
    if (isRef(opts.pagination)) return opts.pagination.value
    return opts.pagination
  }

  function setPage(page: number, pageSize?: number): void {
    const pag = resolvePaginationSource()
    if (!pag) return
    pag.page = page
    if (pageSize !== undefined) pag.pageSize = pageSize
  }

  function clearSelection(): void {
    opts.selectedKeys.value = []
  }

  function reload(): void | Promise<void> {
    return opts.reload()
  }

  return {
    get rows(): Row[] {
      return opts.rows.value
    },
    get loading(): boolean {
      return opts.loading.value
    },
    get pagination(): ResourcePagination {
      return pagination.value
    },
    get selectedKeys(): (number | string)[] {
      return opts.selectedKeys.value
    },
    setPage,
    clearSelection,
    reload,
  }
}
