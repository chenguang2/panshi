/**
 * 集群基础查询 API 模块 —— 列表与节点下拉等高频共享查询。
 * v3 8C-1：多个全局列表视图的内联 axios 调用迁移至此。
 */
import api from '@/api/index'
import type { Cluster, Node } from '@/types'

export function listClusters(params: { keyword?: string; page?: number; page_size?: number } = {}) {
  return api.get<{ total: number; items: Cluster[] }>('/clusters', { params })
}

export function getClusterNodes(clusterId: number, params: { page?: number; page_size?: number } = {}) {
  return api.get<{ total: number; items: Node[] }>(`/clusters/${clusterId}/nodes`, { params })
}

/** 集群挂接/解挂中继区域（relay-region-topology-view 3.5）：空串 = 解挂（直连）。
 * 后端 ClusterUpdate 走 exclude_unset 部分更新，仅动 region_code 一字段。 */
export function updateClusterRegion(clusterId: number, regionCode: string) {
  return api.put(`/clusters/${clusterId}`, { region_code: regionCode })
}

/* ── 配置漂移检测（config-drift-detection）── */

export interface DriftChangedEntry {
  path: string
  baseline: unknown
  edge: unknown
}

export interface DriftDiff {
  removed: Record<string, unknown>
  changed: DriftChangedEntry[]
}

export interface DriftItem {
  resource_id: number | null
  name: string
  status: 'ok' | 'drift' | 'unknown'
  reason?: string | null
  diff?: DriftDiff | null
}

export interface DriftTypeGroup {
  label: string
  items: DriftItem[]
}

export interface ClusterDriftResult {
  cluster_id: number
  checked_at: string
  cluster_error: string | null
  summary: { ok: number; drift: number; unknown: number; out_of_scope: number }
  types: Record<string, DriftTypeGroup>
  out_of_scope_types: string[]
}

/** 漂移检测（只读）：基线（最新发布快照实发载荷）vs Edge 运行态 */
export function getClusterDrift(clusterId: number) {
  return api.get<ClusterDriftResult>(`/clusters/${clusterId}/drift`)
}

// ── 发布差异预览（publish-diff-preview）：待发布候选 vs 各节点实况 ──

export interface PublishPreviewNode {
  label: string
  status: 'ok' | 'diff' | 'missing' | 'unreachable'
  reason?: string | null
  diff_count: number
  behind: boolean
  behind_reason?: string | null
}

export interface PublishPreviewRow {
  path: string
  candidate: unknown
  /** 节点标签 → 当前值；null = 该节点缺失此字段（发布将新增） */
  values: Record<string, unknown>
}

export interface PublishPreviewMatrix {
  node_labels: string[]
  diff_rows: PublishPreviewRow[]
  same_rows: PublishPreviewRow[]
}

export interface PublishPreviewChange {
  changed: { path: string; baseline: unknown; candidate: unknown }[]
  removed: Record<string, unknown>
  added: Record<string, unknown>
}

export interface PublishPreviewResult {
  cluster_id: number
  resource_type: string
  resource_id: number
  name: string
  checked_at: string
  cluster_error: string | null
  has_baseline: boolean
  baseline_missing_reason?: string | null
  platform_change: PublishPreviewChange | null
  nodes: PublishPreviewNode[]
  matrix: PublishPreviewMatrix
  summary: { diff_count: number; same_count: number; behind_nodes: string[] }
}

/** 发布差异预览（只读）：候选载荷 vs 各活跃节点实况，逐节点字段级对比 */
export function getPublishPreview(clusterId: number, resourceType: string, resourceId: number) {
  return api.get<PublishPreviewResult>(`/clusters/${clusterId}/publish-preview/${resourceType}/${resourceId}`)
}
