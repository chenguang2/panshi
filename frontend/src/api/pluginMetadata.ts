/**
 * 插件元数据 API 模块 —— 全局列表（plugin_metadata）+ 集群级插件元数据管理。
 * 对应后端 app/api/v1/plugin_metadata.py 与 cluster_plugin_metadata.py。
 * v3 8C-1：PluginMetadataList.vue 的内联 axios 调用迁移至此。
 */
import api from '@/api/index'

export function listGlobalPluginMetadata(params: Record<string, unknown> = {}) {
  return api.get<{ total: number; items: Array<Record<string, unknown>> }>('/plugin_metadata', { params })
}

export function listBuiltinPlugins() {
  return api.get<{ plugins: Array<Record<string, unknown>> }>('/plugins/builtin')
}

export function listClusterPluginMetadata(clusterId: number) {
  return api.get<{ items: Array<Record<string, unknown>> }>(`/clusters/${clusterId}/plugin-metadata`)
}

export function addClusterPluginMetadata(clusterId: number, pluginName: string) {
  return api.post(`/clusters/${clusterId}/plugin-metadata?plugin_name=${pluginName}`)
}

export function updateClusterPluginMetadata(clusterId: number, pluginName: string, metadata: Record<string, unknown>) {
  return api.put(`/clusters/${clusterId}/plugin-metadata/${pluginName}`, metadata)
}
