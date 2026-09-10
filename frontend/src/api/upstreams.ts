/**
 * 上游（全局 upstreams）API 模块 —— 对应后端 app/api/v1/upstreams.py。
 * v3 8C-1：UpstreamList.vue 的内联 axios 调用迁移至此。
 */
import api from '@/api/index'

export function listUpstreams(params: Record<string, unknown> = {}) {
  return api.get<{ total: number; items: Array<Record<string, unknown>> }>('/upstreams', { params })
}
