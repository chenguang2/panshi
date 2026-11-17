import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * 默认列宽「按可用宽度等比缩放」（mockup-parity-standard r6-②，方案 A）。
 *
 * 背景：三独立列表页的列宽是按「1600 视口 / 卡片 1310px」定死的像素值，而表格传
 * `scroll.x = 'max-content'` 会让 `<table>` 宽度恒等于列宽总和（antd vc-table 写入
 * `width: max-content; min-width: 100%`）——窗口只要不是 1600 宽，「重置列宽」把宽度拉回
 * 设计值后立刻横向溢出（实测 1440 溢出 160px、1366 溢出 234px）。
 *
 * 设计页的做法是 `table { width: 100%; min-width: 1086px }`：列宽随容器等比伸缩，
 * 只有可用宽低于最小总宽时才出现横向滚动。本 composable 复刻该行为：
 *
 * - 可用宽 ≥ 设计总宽：**原样返回设计值**（保证 1600 验收视口与设计逐值一致，且不向上放大）；
 * - 可用宽 < 设计总宽但 ≥ 最小总宽：全部列按 `target / designTotal` 等比收缩；
 * - 可用宽 < 最小总宽：按最小总宽缩放（即允许横向滚动，与设计页阈值一致）；
 * - 用户拖拽过的列**保持其像素值**（拖拽优先级最高），差额由弹性列（`flexKey`，缺省取
 *   首个未被拖拽覆盖的列）吸收，保证列宽总和恰等于可用宽；余额不足以让弹性列保底时
 *   才放任溢出。
 *
 * 容器宽用 ResizeObserver 监听（观察表格卡而非表格本身——表格溢出不会反过来改变卡片宽，
 * 无观测循环）；首帧未测量时按设计值渲染，测量后再校正。
 */

/** 列宽下限（低于此值内容完全不可读；触底即放任溢出） */
const MIN_COLUMN_WIDTH = 32

/** antd 内建选择列宽度（实测 40px；本应用 `size="middle"` 下稳定，改动由守卫测试兜住） */
export const SELECTION_COLUMN_WIDTH = 40

export interface FitColumnWidthsOptions {
  /** 设计基准列宽（key → px）；其总和即设计总宽（不含选择列等保留列） */
  designWidths: () => Record<string, number>
  /** 容器元素（宽度来源，通常是表格卡 `.l5-card`） */
  containerRef: Ref<HTMLElement | null>
  /** 用户拖拽覆盖宽度（key → px），优先于缩放结果 */
  overrides?: () => Record<string, number | undefined>
  /** 不在 designWidths 内的固定占位列宽（节点页 = 选择列 40px） */
  reserved?: () => number
  /** 弹性列 key（吸收取整余量）；缺省取首个未被拖拽覆盖的列 */
  flexKey?: string
  /**
   * 允许的最小总宽（低于此值即出现横向滚动）。缺省 = 各列下限之和（见 minWidths），
   * 即「内容仍可读的最窄组合」——r7 起不再沿用设计页的最小总宽（1054/1036 等），
   * 那些值会让 1280 视口仍出现横向滚动条。
   */
  minTotal?: number
  /**
   * 逐列缩放下限（key → px）：内容不可再压的列（如操作列的按钮组）用它兜底，
   * 否则等比收缩会压到内容宽度以下 → 单元格内容溢出、仍出现 5px 级横向滚动条。
   * 未列出的列按 MIN_COLUMN_WIDTH 计（弹性列同理：被压到 32 才允许滚动）。
   */
  minWidths?: () => Record<string, number | undefined>
}

/** 列定义 → 设计列宽映射（仅取数值 width；`#`/选择列等固定列一并计入） */
export function toDesignWidths(columns: Array<{ key?: unknown; width?: unknown }>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const column of columns) {
    if (column.key == null || typeof column.width !== 'number') continue
    out[String(column.key)] = column.width
  }
  return out
}

export function useFitColumnWidths(options: FitColumnWidthsOptions) {
  /** 容器内容宽（0 = 尚未测量，按设计值渲染） */
  const available = ref(0)
  let observer: ResizeObserver | null = null
  let frame = 0

  function measure(): void {
    const el = options.containerRef.value
    if (!el) return
    const width = el.clientWidth
    if (width !== available.value) available.value = width
  }

  function scheduleMeasure(): void {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      measure()
    })
  }

  onMounted(() => {
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const el = options.containerRef.value
    if (!el) return
    observer = new ResizeObserver(scheduleMeasure)
    observer.observe(el)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  })

  const widths = computed<Record<string, number>>(() => {
    const design = options.designWidths()
    const keys = Object.keys(design)
    const designTotal = keys.reduce((sum, key) => sum + design[key], 0)
    const reserved = options.reserved?.() ?? 0
    const floors = options.minWidths?.() ?? {}
    // 下限缺省 = 各列内容下限之和（弹性列按 MIN_COLUMN_WIDTH）；触底才出现横向滚动
    const floorTotal = keys.reduce((sum, key) => sum + Math.max(floors[key] ?? MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH), 0)
    const minTotal = options.minTotal ?? floorTotal
    const overrides = options.overrides?.() ?? {}

    // 可用宽未知（首帧）或足够宽 → 直接用设计值，保证 1600 视口与设计逐值一致
    const usable = available.value > 0 ? available.value - reserved : designTotal
    // 上限 = 设计总宽（容器更宽时也按设计值，不向上拉伸）；下限 = 最小总宽（触底即允许滚动）
    const target = Math.min(designTotal, Math.max(usable, minTotal))
    const scale = designTotal > 0 ? Math.min(1, target / designTotal) : 1

    const resolved: Record<string, number> = {}
    for (const key of keys) {
      const scaled = scale === 1 ? design[key] : Math.max(MIN_COLUMN_WIDTH, Math.round(design[key] * scale))
      resolved[key] = Math.max(scaled, floors[key] ?? 0)
    }
    for (const key of keys) {
      const override = overrides[key]
      if (override != null) resolved[key] = override
    }

    // 取整余量交给弹性列，使总和恰等于目标宽（多 1px 就会触发横向滚动条）
    const sum = keys.reduce((total, key) => total + resolved[key], 0)
    const delta = Math.round(target) - sum
    if (delta !== 0) {
      // 弹性列被拖拽覆盖时，退到「最宽的未覆盖列」吸收余数（最窄列如 `#` 会立刻触底）
      const freeKeys = keys.filter((key) => overrides[key] == null)
      const absorber =
        (options.flexKey && overrides[options.flexKey] == null ? options.flexKey : undefined) ??
        freeKeys.sort((a, b) => design[b] - design[a])[0] ??
        null
      if (absorber) resolved[absorber] = Math.max(MIN_COLUMN_WIDTH, resolved[absorber] + delta)
    }
    return resolved
  })

  /** 单列宽度（供列定义取用；key 不在设计清单时回落 fallback） */
  function widthOf(key: string, fallback?: number): number | undefined {
    return widths.value[key] ?? fallback
  }

  /**
   * 表格的最小渲染宽（含保留列）：直接绑 `:scroll="{ x: minTableWidth }"`。
   * 取各列内容下限之和 —— 可用宽高于它时表格随宽度等比伸缩（永不横向滚动），
   * 低于它才由 antd 出滚动条（数值型 scroll.x 同时是 fixed 列生效的前提）。
   */
  const minTableWidth = computed(() => {
    const design = options.designWidths()
    const floors = options.minWidths?.() ?? {}
    const reserved = options.reserved?.() ?? 0
    const floorTotal = Object.keys(design).reduce(
      (sum, key) => sum + Math.max(floors[key] ?? MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH),
      0,
    )
    return (options.minTotal ?? floorTotal) + reserved
  })

  return { available, widths, widthOf, minTableWidth, measure }
}
