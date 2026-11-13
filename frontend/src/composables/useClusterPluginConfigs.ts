import type { Ref } from 'vue'
import type { Cluster, Plugin } from '@/types'
import { useClusterPluginEntity, type PluginEntityDeps, type VersionModalState } from './useClusterPluginEntity'

// Re-export for backward compatibility
export type { VersionModalState }

type PluginConfigDeps = PluginEntityDeps

const CONFIG = {
  apiEndpoint: 'plugin_configs',
  displayName: '插件组',
  clusterProp: 'plugin_configs',
  versionType: 'plugin_config',
  // M5：插件组发布确认弹窗显示「本次发布将创建新版本 v(N+1)」（未发布不显示该行）
  publishVersionHint: true,
  // publish-guide 批 1（插件组）：保存后发布引导（全局规则 CONFIG 在批 2 跟进）
  publishGuide: true,
} as const

export function useClusterPluginConfigs(deps: PluginConfigDeps) {
  const entity = useClusterPluginEntity(CONFIG, deps)

  return {
    pluginConfigModalVisible: entity.modalVisible,
    pluginConfigActiveTab: entity.activeTab,
    pluginConfigFormMode: entity.formMode,
    pluginConfigEditingClusterId: entity.editingClusterId,
    pluginConfigEditingId: entity.editingId,
    pluginConfigFormData: entity.formData,
    viewPcDrawerVisible: entity.viewDrawerVisible,
    viewingPc: entity.viewingItem,

    loadPluginConfigs: entity.loadItems,
    showAddPluginConfig: entity.showAdd,
    viewPluginConfig: entity.viewItem,
    editPluginConfig: entity.editItem,
    handlePluginConfigSubmit: entity.handleSubmit,
    deletePluginConfig: entity.deleteItem,
    publishPluginConfig: entity.publishItem,
    openPluginConfigVersionManagement: entity.openVersionManagement,
    viewPluginConfigDetail: entity.viewPluginDetail,
  }
}
