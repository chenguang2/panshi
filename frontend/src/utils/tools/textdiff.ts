/**
 * 纯文本逐行 Diff（tools-new-utilities 第二批）——LCS 对齐，不解析 JSON。
 * 与 JSON 对比共用 dl-line/dl-removed/dl-added 行样式（dl-wrap 容器）。
 */

export interface TextLineDiffResult {
  added: number
  removed: number
  html: string
  identical: boolean
}

const MAX_LINES = 5000

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 经典 DP LCS：逐行对齐（运维配置文件行数量级可承受；超限截断并提示） */
export function textLineDiff(a: string, b: string): TextLineDiffResult {
  const linesA = a.split('\n')
  const linesB = b.split('\n')
  const truncated = linesA.length > MAX_LINES || linesB.length > MAX_LINES
  const A = linesA.slice(0, MAX_LINES)
  const B = linesB.slice(0, MAX_LINES)

  const n = A.length
  const m = B.length
  // LCS 长度表（滚动数组不行——需回溯；内存 n*m 字节级 Uint32）
  const dp = new Uint32Array((n + 1) * (m + 1))
  const idx = (i: number, j: number): number => i * (m + 1) + j
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[idx(i, j)] = A[i] === B[j] ? dp[idx(i + 1, j + 1)] + 1 : Math.max(dp[idx(i + 1, j)], dp[idx(i, j + 1)])
    }
  }

  const lines: string[] = []
  let added = 0
  let removed = 0
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      lines.push(`<div class="dl-line dl-same">${escapeHtml(A[i])}</div>`)
      i++
      j++
    } else if (dp[idx(i + 1, j)] >= dp[idx(i, j + 1)]) {
      lines.push(`<div class="dl-line dl-removed">${escapeHtml(A[i])}</div>`)
      removed++
      i++
    } else {
      lines.push(`<div class="dl-line dl-added">${escapeHtml(B[j])}</div>`)
      added++
      j++
    }
  }
  while (i < n) {
    lines.push(`<div class="dl-line dl-removed">${escapeHtml(A[i])}</div>`)
    removed++
    i++
  }
  while (j < m) {
    lines.push(`<div class="dl-line dl-added">${escapeHtml(B[j])}</div>`)
    added++
    j++
  }

  const identical = added === 0 && removed === 0
  let html: string
  if (identical) {
    html = '<div class="dl-summary">✅ 两个文本完全一致，无差异</div>'
  } else {
    html = `<div class="dl-summary">📊 共 ${added + removed} 处差异（+${added} 新增, -${removed} 删除）</div>`
  }
  if (truncated) {
    html = `<div class="dl-summary">⚠ 文本超过 ${MAX_LINES} 行，仅对比前 ${MAX_LINES} 行</div>` + html
  }
  return { added, removed, html: html + lines.join(''), identical }
}
