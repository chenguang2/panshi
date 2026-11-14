import type { PublishPreviewResult, PublishPreviewRow } from '@/api/clusters'

// 发布差异预览的分组聚合（publish-diff-preview-node-groups）：呈现层纯函数，
// 把逐节点矩阵聚合为「与待发布的差异形态」相同的节点组。同一份响应数据两种呈现：
// ≤ NODE_MATRIX_THRESHOLD 保持逐节点矩阵（组件内），超过则按本函数分组。
// 对比口径与逐节点数据完整性不变（响应契约不动，后端零改动）。

/** 矩阵呈现阈值：活跃节点数不超过该值保持逐节点矩阵，超过则切换差异形态分组 */
export const NODE_MATRIX_THRESHOLD = 5

export interface PublishPreviewGroupRow {
  path: string
  candidate: unknown
  /** 组内实况值（同组节点经指纹保证全同，取代表值） */
  value: unknown
}

export interface PublishPreviewGroup {
  kind: 'diff' | 'missing' | 'unreachable' | 'same'
  /** 组头描述（成员 behind_reason/状态文案去重并集，一行摘要） */
  title: string
  /** 组内节点标签（IP chips） */
  labels: string[]
  /** 差异组组内差异表（字段路径 × 待发布 × 组内同值） */
  diffRows: PublishPreviewGroupRow[]
  /** 差异组「显示一致字段」追加行：组内与候选一致的路径（值 = 候选值） */
  sameRows: PublishPreviewGroupRow[]
  /** 不可达原因去重并集（仅 unreachable 组） */
  reasons: string[]
  key: string
}

export function shouldGroupNodes(nodeCount: number): boolean {
  return nodeCount > NODE_MATRIX_THRESHOLD
}

/** 值归一化文本（与组件对比口径一致：数值与字符串归一、null/undefined 同为缺失） */
function norm(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

interface Contribution {
  path: string
  value: unknown
}

/** 单节点差异贡献对：该节点在 diff_rows 中与候选不一致的 {path, value} 集合 */
function nodeContributions(diffRows: PublishPreviewRow[], label: string): Contribution[] {
  const pairs: Contribution[] = []
  for (const row of diffRows) {
    const v = row.values[label] ?? null
    if (norm(v) !== norm(row.candidate)) pairs.push({ path: row.path, value: v })
  }
  return pairs
}

function fingerprintOf(pairs: Contribution[]): string {
  const sorted = [...pairs].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return JSON.stringify(sorted)
}

const KIND_ORDER: Record<PublishPreviewGroup['kind'], number> = {
  diff: 0,
  missing: 1,
  unreachable: 2,
  same: 3,
}

/**
 * 按差异形态分组：差异指纹（差异路径集 + 各路径值）相同的节点归一组；
 * missing / unreachable / 与待发布一致各归其组。组序：差异组（按节点数降序，
 * 同数按出现顺序）→ 缺失 → 不可达 → 与待发布一致（末位）。
 */
export function groupNodesByDiffShape(result: PublishPreviewResult): PublishPreviewGroup[] {
  const diffRows = result.matrix.diff_rows
  const inMatrix = new Set(result.matrix.node_labels)
  const byLabel = new Map(result.nodes.map((n) => [n.label, n]))

  const buckets = new Map<string, { labels: string[]; pairs: Contribution[] }>()
  const missing: string[] = []
  const unreachable: { label: string; reason: string }[] = []
  const same: string[] = []

  for (const n of result.nodes) {
    if (n.status === 'unreachable') {
      unreachable.push({ label: n.label, reason: n.reason || '' })
      continue
    }
    if (n.status === 'missing') {
      missing.push(n.label)
      continue
    }
    // 不在矩阵中的标签属于响应异常，按无可判差异归入一致组（不参与指纹）
    const pairs = inMatrix.has(n.label) ? nodeContributions(diffRows, n.label) : []
    if (!pairs.length) {
      same.push(n.label)
      continue
    }
    const fp = fingerprintOf(pairs)
    const bucket = buckets.get(fp)
    if (bucket) bucket.labels.push(n.label)
    else buckets.set(fp, { labels: [n.label], pairs })
  }

  const groups: PublishPreviewGroup[] = []
  const diffBuckets = [...buckets.values()].sort((a, b) => b.labels.length - a.labels.length)
  for (const bucket of diffBuckets) {
    const ownPaths = new Set(bucket.pairs.map((p) => p.path))
    const diffGroupRows: PublishPreviewGroupRow[] = bucket.pairs.map((p) => ({
      path: p.path,
      candidate: diffRows.find((r) => r.path === p.path)?.candidate,
      value: p.value,
    }))
    // 组内与候选一致的路径 = 全部矩阵路径去除本组差异路径，组值恒等于候选值
    const sameRows: PublishPreviewGroupRow[] = [
      ...diffRows
        .filter((r) => !ownPaths.has(r.path))
        .map((r) => ({ path: r.path, candidate: r.candidate, value: r.candidate })),
      ...result.matrix.same_rows.map((r) => ({ path: r.path, candidate: r.candidate, value: r.candidate })),
    ]
    const titleReasons = [...new Set(bucket.labels.map((l) => byLabel.get(l)?.behind_reason || '').filter(Boolean))]
    groups.push({
      kind: 'diff',
      title: titleReasons.length ? titleReasons.join('；') : '与待发布存在差异',
      labels: bucket.labels,
      diffRows: diffGroupRows,
      sameRows,
      reasons: [],
      key: `diff:${bucket.labels.join('|')}`,
    })
  }
  if (missing.length) {
    groups.push({
      kind: 'missing',
      title: '缺失该资源',
      labels: missing,
      diffRows: [],
      sameRows: [],
      reasons: [],
      key: `missing:${missing.join('|')}`,
    })
  }
  if (unreachable.length) {
    groups.push({
      kind: 'unreachable',
      title: '不可达',
      labels: unreachable.map((u) => u.label),
      diffRows: [],
      sameRows: [],
      reasons: [...new Set(unreachable.map((u) => u.reason).filter(Boolean))],
      key: `unreachable:${unreachable.map((u) => u.label).join('|')}`,
    })
  }
  if (same.length) {
    groups.push({
      kind: 'same',
      title: '与待发布配置一致',
      labels: same,
      diffRows: [],
      sameRows: [],
      reasons: [],
      key: `same:${same.join('|')}`,
    })
  }
  return groups.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
}
