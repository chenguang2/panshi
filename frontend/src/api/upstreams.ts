/**
 * 上游（全局 upstreams）API 模块 —— 对应后端 app/api/v1/upstreams.py。
 * v3 8C-1：UpstreamList.vue 的内联 axios 调用迁移至此。
 */
import api from '@/api/index'

export function listUpstreams(params: Record<string, unknown> = {}) {
  return api.get<{ total: number; items: Array<Record<string, unknown>> }>('/upstreams', { params })
}

/** 发布状态三分区权威计数（filter-architecture D4）：与列表业务筛选同口径、不含 publish_status */
export function getUpstreamStatusCounts(params: Record<string, unknown> = {}) {
  return api.get<{
    total: number
    published: number
    pending: number
    unpublished: number
    /** 目标节点总数（补充维度，备用） */
    target_count: number
    /** 涉及的不同集群数（页头「N 集群」补充维度） */
    cluster_count: number
  }>('/upstreams/status-counts', { params })
}

/** 引用查询响应：只含**存在引用**的上游（无引用的上游不出现在 items 里） */
export interface UpstreamReferenceItem {
  upstream_id: number
  upstream_name: string
  routes: Array<{ route_id: number; route_name: string }>
}

/**
 * 批量删除前置引用查询（批次 B2）。
 *
 * 后端判定与批量删除的拦截同语义（`Route.upstream_id`），前端据此在确认弹窗**之前**
 * 把「被路由引用」的上游挑出来（跳过或全量阻断），避免用户点了删除才发现一堆失败。
 * 不属于该集群的 id 被静默忽略（响应里不出现）；单次上限 500。
 */
export function fetchUpstreamReferences(clusterId: number, ids: number[]) {
  return api.get<{ items: UpstreamReferenceItem[] }>(`/clusters/${clusterId}/upstreams/references`, {
    params: { ids: ids.join(',') },
  })
}
