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
