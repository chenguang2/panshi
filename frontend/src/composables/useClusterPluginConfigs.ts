import type { Ref } from 'vue'
import type { Cluster, Plugin } from '@/types'
import type { VersionModalState } from './useClusterPluginEntity'
import { useClusterPluginEntity, type PluginEntityDeps, type VersionModalState } from './useClusterPluginEntity'

// Re-export for backward compatibility
export type { VersionModalState }

export interface PluginConfigDeps extends PluginEntityDeps {}

const CONFIG = {
  apiEndpoint: 'plugin_configs',
  displayName: '插件组',
  clusterProp: 'plugin_configs',
  versionType: 'plugin_config',
}

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
