import { useClusterPluginEntity, type PluginEntityDeps } from './useClusterPluginEntity'

// Re-export for backward compatibility（消费方/守卫测试从本模块取该类型）
export type { VersionModalState } from './useClusterPluginEntity'

type PluginConfigDeps = PluginEntityDeps

/**
 * 插件组集群子域：创建/编辑表单已统一走共享 PluginEntityFormModal（B1），
 * 本工厂只保留查看抽屉/删除/发布/版本管理与列表加载。
 */
const CONFIG = {
  apiEndpoint: 'plugin_configs',
  displayName: '插件组',
  clusterProp: 'plugin_configs',
  versionType: 'plugin_config',
  // M5：插件组发布确认弹窗显示「本次发布将创建新版本 v(N+1)」（未发布不显示该行）
  publishVersionHint: true,
} as const

export function useClusterPluginConfigs(deps: PluginConfigDeps) {
  const entity = useClusterPluginEntity(CONFIG, deps)

  return {
    viewPcDrawerVisible: entity.viewDrawerVisible,
    viewingPc: entity.viewingItem,

    loadPluginConfigs: entity.loadItems,
    viewPluginConfig: entity.viewItem,
    deletePluginConfig: entity.deleteItem,
    publishPluginConfig: entity.publishItem,
    openPluginConfigVersionManagement: entity.openVersionManagement,
    viewPluginConfigDetail: entity.viewPluginDetail,
  }
}
