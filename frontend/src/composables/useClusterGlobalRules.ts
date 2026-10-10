import type { Ref } from 'vue'
import type { Cluster, Plugin } from '@/types'
import { useClusterPluginEntity, type PluginEntityDeps, type VersionModalState } from './useClusterPluginEntity'

type GlobalRuleDeps = PluginEntityDeps

const CONFIG = {
  apiEndpoint: 'global_rules',
  displayName: '全局规则',
  clusterProp: 'global_rules',
  versionType: 'global_rule',
} as const

/**
 * 全局规则集群子域（D6 收敛后）：创建/编辑表单已统一走共享 PluginEntityFormModal
 * （两入口单点），本工厂仅保留查看抽屉/删除/发布/版本管理与列表加载。
 */
export function useClusterGlobalRules(deps: GlobalRuleDeps) {
  const entity = useClusterPluginEntity(CONFIG, deps)

  return {
    viewGrDrawerVisible: entity.viewDrawerVisible,
    viewingGr: entity.viewingItem,

    loadGlobalRules: entity.loadItems,
    viewGlobalRule: entity.viewItem,
    deleteGlobalRule: entity.deleteItem,
    publishGlobalRule: entity.publishItem,
    openGlobalRuleVersionManagement: entity.openVersionManagement,
    viewGlobalRulePluginConfig: entity.viewPluginDetail,
  }
}
