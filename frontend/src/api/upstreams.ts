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
