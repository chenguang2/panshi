/**
 * 行级 LCS diff 工具（openspec edge-env-ux-review-fixes D6）。
 *
 * 替换 EdgeEnv.vue 旧「位置对比」实现：旧实现逐下标对比，中间插一行即把其后
 * 全部行误报为修改。本实现为手写动态规划 LCS（O(n·m)，edge.env 量级 <1k 行），
 * 不引第三方依赖。渲染侧另提供 unified 视图（变更块 ±context 上下文 + 折叠条）。
 */

export interface DiffRow {
  type: 'same' | 'add' | 'del' | 'fold'
  text: string
  /** del/same 行在旧文本中的 1-based 行号 */
  oldNo?: number
  /** add/same 行在新文本中的 1-based 行号 */
  newNo?: number
}

export interface DiffResult {
  /** 全量行序列（不含折叠条） */
  rows: DiffRow[]
  added: number
  removed: number
}

export interface UnifiedDiffView {
  /** 展示用行序列：变更块 ±context 上下文 + fold 折叠条 */
  rows: DiffRow[]
  added: number
  removed: number
}

/** 空字符串视为 0 行；尾随换行只产生行结束符，不产生额外空行（POSIX 文本语义） */
function toLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** LCS 行级 diff。返回全量行序列与增/删行数。 */
export function computeLineDiff(oldText: string, newText: string): DiffResult {
  const oldLines = toLines(oldText)
  const newLines = toLines(newText)
  const n = oldLines.length
  const m = newLines.length

  // dp[i][j] = oldLines[i..] 与 newLines[j..] 的 LCS 长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const rows: DiffRow[] = []
  let added = 0
  let removed = 0
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      rows.push({ type: 'same', text: oldLines[i], oldNo: i + 1, newNo: j + 1 })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', text: oldLines[i], oldNo: i + 1 })
      removed++
      i++
    } else {
      rows.push({ type: 'add', text: newLines[j], newNo: j + 1 })
      added++
      j++
    }
  }
  while (i < n) {
    rows.push({ type: 'del', text: oldLines[i], oldNo: i + 1 })
    removed++
    i++
  }
  while (j < m) {
    rows.push({ type: 'add', text: newLines[j], newNo: j + 1 })
    added++
    j++
  }
  return { rows, added, removed }
}

/**
 * unified 视图：仅渲染变更块前后各 context 行相同上下文，
 * 块间其余相同行折叠为一条「⋯ 未变更 N 行 ⋋」。
 */
export function renderUnifiedDiff(oldText: string, newText: string, context = 3): UnifiedDiffView {
  const { rows, added, removed } = computeLineDiff(oldText, newText)
  const view: DiffRow[] = []
  let lastKept = -1
  for (let k = 0; k < rows.length; k++) {
    if (rows[k].type === 'same') continue
    // 变更行：先补前置上下文（与上一保留行之间的空隙折叠）
    const start = Math.max(lastKept + 1, k - context)
    if (start > lastKept + 1) {
      view.push({ type: 'fold', text: `⋯ 未变更 ${start - lastKept - 1} 行 ⋯` })
    }
    for (let t = start; t < k; t++) view.push(rows[t])
    view.push(rows[k])
    lastKept = k
    // 后置上下文：紧随的相同行最多 context 行
    let t = k + 1
    while (t < rows.length && rows[t].type === 'same' && t <= k + context) {
      view.push(rows[t])
      lastKept = t
      t++
    }
    k = t - 1
  }
  return { rows: view, added, removed }
}
