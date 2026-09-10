/**
 * 插件组（全局 plugin_configs）API 模块 —— 对应后端 app/api/v1/plugin_configs.py。
 * v3 8C-1：PluginConfigList.vue 的内联 axios 调用迁移至此。
 */
import api from '@/api/index'

export function listPluginConfigs(params: Record<string, unknown> = {}) {
  return api.get<{ total: number; items: Array<Record<string, unknown>> }>('/plugin_configs', { params })
}
