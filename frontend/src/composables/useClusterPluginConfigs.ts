import { useClusterPluginEntity, type PluginEntityDeps } from './useClusterPluginEntity'

// Re-export for backward compatibility（消费方/守卫测试从本模块取该类型）
export type { VersionModalState } from './useClusterPluginEntity'

type PluginConfigDeps = PluginEntityDeps

/**
 * 插件组集群子域：创建/编辑表单已统一走共享 PluginEntityFormModal（B1），
 * 本工厂只保留查看抽屉/删除/发布/版本管理与列表加载。
 *
 * 2026-11-22（shared-core-plan A 推广 · 已迁移）：面板「插件组」Tab 已改为直接渲染
 * `views/PluginConfigList.vue` 的 scoped 形态（clusters/ClusterPluginConfigs.vue 已删除），
 * 本工厂的原面板专用表单态（弹窗可见性 / 表单模式 / 提交处理等符号，见
 * `panelFormDeadCode.source.test.ts` 的清单）已无生产消费方。生产仅剩 `CentralList.vue` 的
 * `loadPluginConfigs`（作为 useClusterRoutes 的依赖占位，填充 `cluster.plugin_configs`）。
 * 清理（含该守卫用例、`Cluster.plugin_configs` / `pluginConfigsLoadError` 类型字段）另批进行，本批不删。
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
