import type { Ref } from 'vue'
import type { Cluster, Plugin } from '@/types'
import { useClusterPluginEntity, type PluginEntityDeps, type VersionModalState } from './useClusterPluginEntity'

export interface GlobalRuleDeps extends PluginEntityDeps {}

const CONFIG = {
  apiEndpoint: 'global_rules',
  displayName: '全局规则',
  clusterProp: 'global_rules',
  versionType: 'global_rule',
}

export function useClusterGlobalRules(deps: GlobalRuleDeps) {
  const entity = useClusterPluginEntity(CONFIG, deps)

  return {
    globalRuleModalVisible: entity.modalVisible,
    globalRuleActiveTab: entity.activeTab,
    globalRuleFormMode: entity.formMode,
    globalRuleEditingClusterId: entity.editingClusterId,
    globalRuleEditingId: entity.editingId,
    globalRuleFormData: entity.formData,
    viewGrDrawerVisible: entity.viewDrawerVisible,
    viewingGr: entity.viewingItem,

    loadGlobalRules: entity.loadItems,
    showAddGlobalRule: entity.showAdd,
    viewGlobalRule: entity.viewItem,
    editGlobalRule: entity.editItem,
    handleGlobalRuleSubmit: entity.handleSubmit,
    deleteGlobalRule: entity.deleteItem,
    publishGlobalRule: entity.publishItem,
    openGlobalRuleVersionManagement: entity.openVersionManagement,
    viewGlobalRulePluginConfig: entity.viewPluginDetail,
  }
}
