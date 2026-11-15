import { ref, nextTick, onUnmounted, getCurrentInstance } from 'vue'

/**
 * useColumnDragColumns — 表格列拖拽手势共享 composable（node-list-column-resize /
 * column-personalization-rollout）。
 *
 * 两类手势（鼠标分区）：拖表头右缘手柄 = 调宽（实时写宽，最小值下限）；
 * 拖表头标题 = 移动列（实时预览换位，源列高亮，Esc 取消恢复拖前顺序）。
 * 拖拽全程 body 挂 `col-move-dragging` 类强制 grabbing 光标；换位用 FLIP 补间平滑滑动。
 *
 * 换位判定基于拖拽起始冻结的列位置（对指针抖动单调，无边界震荡）；
 * 表头 th 与列键按表头文字映射（标题唯一，测试桩/真机 antd 通吃）。
 */
/** 列定义的最小访问面（兼容 antd ColumnType 等任意列类型） */
interface ColumnLike {
  title?: unknown
  key?: unknown
  width?: unknown
}

const asColumnLike = (c: unknown): ColumnLike => c as ColumnLike

export interface ColumnDragColumnsOptions {
  /** 全量列定义（含 title 用于表头文字→键映射；顺序 = 默认序） */
  columns: () => unknown[]
  /** 有效列键序（排序后、显隐过滤前的键序列表） */
  orderedKeys: () => string[]
  /** 列宽读取（用户覆盖值或默认档，供调宽起始基线） */
  getWidth: (key: string) => number | undefined
  setColumnWidth: (key: string, width: number) => void
  setColumnOrder: (order: string[]) => void
  /** 页面表格根选择器（FLIP/冻结几何查询范围） */
  tableSelector: string
  /** 不可移动列键（固定列，如 index/ip/actions） */
  fixedKeys?: string[]
  /** 调宽最小值（默认 80） */
  minWidth?: number
}

export function useColumnDragColumns(options: ColumnDragColumnsOptions) {
  const { columns, orderedKeys, getWidth, setColumnWidth, setColumnOrder, tableSelector } = options
  const FIXED_MOVE_KEYS = new Set(options.fixedKeys ?? [])
  const minWidth = options.minWidth ?? 80

  const dragSourceKey = ref('')
  let colResize: { key: string; startX: number; startWidth: number } | null = null
  let colMove: {
    key: string
    startOrder: string[]
    rects: Map<string, DOMRect>
    lastHint: string
    startX: number
    startY: number
    moved: boolean
    root: ParentNode
  } | null = null

  function isMovableKey(key: string): boolean {
    return !FIXED_MOVE_KEYS.has(key)
  }

  /** headerCell 模板的 wrap 类绑定 */
  function wrapClass(col: { key?: unknown }): Record<string, boolean> {
    const key = String(col.key ?? '')
    return {
      movable: isMovableKey(key),
      'dragging-source': dragSourceKey.value === key,
    }
  }

  function defaultColumnWidth(key: string): number {
    const def = Number(asColumnLike(columns().find((c) => asColumnLike(c).key === key)).width ?? 100)
    return Number.isFinite(def) ? def : 100
  }

  // ── 手势一：右缘手柄调宽 ──

  function startColumnResize(e: MouseEvent, col: { key?: unknown }): void {
    const key = String(col.key ?? '')
    if (!key) return
    e.preventDefault()
    e.stopPropagation()
    colResize = { key, startX: e.clientX, startWidth: getWidth(key) ?? defaultColumnWidth(key) }
    document.addEventListener('mousemove', onColumnResizeMove)
    document.addEventListener('mouseup', endColumnResize)
  }

  function onColumnResizeMove(e: MouseEvent): void {
    if (!colResize) return
    const width = Math.max(minWidth, colResize.startWidth + e.clientX - colResize.startX)
    setColumnWidth(colResize.key, width)
  }

  function endColumnResize(): void {
    colResize = null
    document.removeEventListener('mousemove', onColumnResizeMove)
    document.removeEventListener('mouseup', endColumnResize)
  }

  // ── 手势二：标题拖拽移动（实时预览） ──

  /**
   * 本次拖拽的几何作用域（cluster-tab-column-personalization D2）：
   * 以拖拽起点所在的 antd 表格容器为根——统一管理页同屏可并存多张同类表格，
   * 全文档选择器会让同名列的矩形被别的表覆盖，落点/FLIP 跨表串扰。
   * 解析不到容器时（非表格内触发）退回 `tableSelector` 全文档兜底。
   */
  function resolveGestureRoot(e: MouseEvent): ParentNode {
    const target = e.currentTarget as HTMLElement | null
    const wrapper = typeof target?.closest === 'function' ? target.closest<HTMLElement>('.ant-table-wrapper') : null
    return wrapper ?? document.querySelector<HTMLElement>(tableSelector) ?? document
  }

  function captureColumnRects(root: ParentNode): Map<HTMLElement, number> {
    return new Map(
      [...root.querySelectorAll<HTMLElement>('thead th, tbody td')].map((el) => [el, el.getBoundingClientRect().left]),
    )
  }

  function playColumnMoveFlip(before: Map<HTMLElement, number>, root: ParentNode): void {
    const cells = [...root.querySelectorAll<HTMLElement>('thead th, tbody td')]
    cells.forEach((el) => {
      const oldLeft = before.get(el)
      if (oldLeft === undefined) return
      const dx = Math.round(oldLeft - el.getBoundingClientRect().left)
      if (!dx) return
      el.style.transition = 'none'
      el.style.transform = `translateX(${dx}px)`
    })
    requestAnimationFrame(() => {
      cells.forEach((el) => {
        if (!el.style.transform) return
        el.style.transition = 'transform 150ms ease'
        el.style.transform = ''
      })
      window.setTimeout(() => {
        cells.forEach((el) => {
          el.style.transition = ''
        })
      }, 220)
    })
  }

  function startColumnMove(e: MouseEvent, col: { key?: unknown }): void {
    const key = String(col.key ?? '')
    if (!key || !isMovableKey(key)) return
    e.preventDefault()
    const root = resolveGestureRoot(e)
    const rects = new Map<string, DOMRect>()
    const titleToKey = new Map(columns().map((c) => [String(asColumnLike(c).title), String(asColumnLike(c).key)]))
    root.querySelectorAll('.ant-table-thead th').forEach((th) => {
      const k = titleToKey.get((th.textContent ?? '').trim())
      if (k) rects.set(k, th.getBoundingClientRect())
    })
    colMove = {
      key,
      startOrder: orderedKeys(),
      rects,
      lastHint: key,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      root,
    }
    dragSourceKey.value = key
    document.body.classList.add('col-move-dragging')
    document.addEventListener('mousemove', onColumnMoveMove)
    document.addEventListener('mouseup', endColumnMove)
    document.addEventListener('keydown', onColumnMoveCancel)
    // 拖拽移动跨越表头后浏览器会补发 click（路由列表 sorter 会误触发排序）——capture 拦截一次
    document.addEventListener('click', suppressClickAfterMove, true)
  }

  function suppressClickAfterMove(e: MouseEvent): void {
    e.stopPropagation()
    e.preventDefault()
    removeClickSuppressor()
  }

  /** 拆除补发 click 拦截器及其 mousedown 兜底守卫 */
  function removeClickSuppressor(): void {
    document.removeEventListener('click', suppressClickAfterMove, true)
    document.removeEventListener('mousedown', removeClickSuppressor, true)
  }

  function onColumnMoveMove(e: MouseEvent): void {
    const mv = colMove
    if (!mv) return
    // D4 位移判定：超过 2px 视为真实拖拽（区别于纯点击），mouseup 后的补发 click 才需要拦截
    if (!mv.moved && (Math.abs(e.clientX - mv.startX) > 2 || Math.abs(e.clientY - mv.startY) > 2)) mv.moved = true
    const middleKeys = mv.startOrder.filter((k) => !FIXED_MOVE_KEYS.has(k))
    let hint = mv.key // 指针在源列自身范围内 → 维持原位
    for (let i = 0; i < middleKeys.length; i++) {
      const rect = mv.rects.get(middleKeys[i])
      if (!rect) continue
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        // 指针落在目标列左半 → 插到它前面；右半 → 插到下一中间列前（末列则贴固定右列前）
        hint = e.clientX < rect.left + rect.width / 2 ? middleKeys[i] : nextOrderedKeyAfter(middleKeys[i])
        break
      }
    }
    if (hint === mv.lastHint) return
    mv.lastHint = hint
    // 实时预览：以拖拽起始序为基线换位（冻结几何单调，无震荡）；持久化由 watch 随行
    const next = mv.startOrder.filter((k) => k !== mv.key)
    const idx = next.indexOf(hint)
    if (idx === -1) return
    next.splice(idx, 0, mv.key)
    // FLIP：记录换位前位置，DOM 更新后让列平滑滑动到位（无瞬跳）
    const before = captureColumnRects(mv.root)
    setColumnOrder(next)
    void nextTick(() => playColumnMoveFlip(before, mv.root))
  }

  /** 有序全序列中 key 的下一列键（可能为固定右列）；已是末列则返回 ''（no-op 标记） */
  function nextOrderedKeyAfter(key: string): string {
    const full = orderedKeys()
    const i = full.indexOf(key)
    return i >= 0 && i + 1 < full.length ? full[i + 1] : ''
  }

  function onColumnMoveCancel(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !colMove) return
    setColumnOrder(colMove.startOrder)
    endColumnMove({ viaEsc: true })
  }

  function endColumnMove(opts?: { viaEsc?: boolean } | Event): void {
    // mouseup 派发会以 Event 为实参调用本函数——此时 viaEsc 必为 falsy，等价常规结束路径
    const viaEsc = !!(opts as { viaEsc?: boolean } | undefined)?.viaEsc
    document.removeEventListener('mousemove', onColumnMoveMove)
    document.removeEventListener('mouseup', endColumnMove)
    document.removeEventListener('keydown', onColumnMoveCancel)
    document.body.classList.remove('col-move-dragging')
    const mv = colMove
    if (mv) {
      mv.root.querySelectorAll<HTMLElement>('thead th, tbody td').forEach((el) => {
        el.style.transition = ''
        el.style.transform = ''
      })
    }
    dragSourceKey.value = ''
    colMove = null
    // D4（sorter 手势冲突抑制）：真实浏览器在 mouseup 之后才派发 click——发生过位移的拖拽
    // 必须把 click 捕获拦截器留到那次 click 到来（其自身处理即自移除），否则排序列短拖后
    // 误派发的 click 会直接命中 sorter 触发排序；纯点击（无位移）与 Esc 取消路径没有待拦截
    // 的补发 click，立即拆除以免吞掉下一次正常点击。
    if (!mv || !mv.moved || viaEsc) {
      removeClickSuppressor()
    } else {
      // 补发 click 不保证派发：拖拽中实时换位会让 Vue 重排表头 DOM，mousedown 目标可能被
      // 替换，浏览器对「目标已脱离文档」的序列不派发 click（真机实测）——滞留拦截器会吞掉
      // 用户的下一次正常点击。以「下一次 mousedown」兜底拆除：新交互的按下必然先于其 click。
      document.addEventListener('mousedown', removeClickSuppressor, true)
    }
  }

  // 组件内调用时自动清理 document 级监听与残留样式（页面 onUnmounted 无需关心）
  if (getCurrentInstance()) {
    onUnmounted(() => {
      endColumnResize()
      endColumnMove()
      // 卸载路径强制拆除拦截器与兜底守卫：此后不会再有待拦截的补发 click
      removeClickSuppressor()
    })
  }

  return {
    dragSourceKey,
    isMovableKey,
    wrapClass,
    startColumnResize,
    startColumnMove,
  }
}
