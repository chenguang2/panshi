/**
 * 插件组（全局 plugin_configs）API 模块 —— 对应后端 app/api/v1/plugin_configs.py。
 * v3 8C-1：PluginConfigList.vue 的内联 axios 调用迁移至此。
 */
import api from '@/api/index'

export function listPluginConfigs(params: Record<string, unknown> = {}) {
  return api.get<{ total: number; items: Array<Record<string, unknown>> }>('/plugin_configs', { params })
}

/** 删除前置引用查询响应（后端与 PLG-07 删除守卫共用同一 helper，语义永远一致） */
export interface PluginConfigReferences {
  name: string
  referenced_by: { route_id: number; route_name: string }[]
}

/** 删除前置引用查询：GET /clusters/{cluster_id}/plugin_configs/{config_id}/references */
export function getPluginConfigReferences(clusterId: number, configId: number) {
  return api.get<PluginConfigReferences>(`/clusters/${clusterId}/plugin_configs/${configId}/references`)
}
