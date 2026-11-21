import { ref, h, type Ref } from 'vue'
import api from '@/api'
import type { Cluster, Plugin, GlobalRule, PluginConfig } from '@/types'
import { showDeleteConfirm, deletePluginConfigWithReferenceCheck } from './useClusterUtils'
import { getApiErrorMessage } from '@/utils/error'
import { useClusterResourceCore, type VersionModalState } from './useClusterResourceCore'
import { showOverlayModal } from './useOverlayModal'

/** 插件实体资源（插件组/全局规则）的公共形状 */
type PluginEntityItem = (GlobalRule | PluginConfig) & { plugins: Record<string, unknown> }

export { type VersionModalState } from './useClusterResourceCore'

interface PluginEntityConfig {
  /** API endpoint path segment, e.g. 'plugin_configs' or 'global_rules' */
  apiEndpoint: string
  /** Display name in Chinese, e.g. '插件组' or '全局规则' */
  displayName: string
  /** Cluster property name, e.g. 'plugin_configs' or 'global_rules' */
  clusterProp: 'plugin_configs' | 'global_rules'
  /** Version modal resource type */
  versionType: 'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'
  /** 发布确认弹窗显示「将创建新版本 v(N+1)」提示（M5，插件组开启；全局规则等默认关闭） */
  publishVersionHint?: boolean
}

export interface PluginEntityDeps {
  clusters: Ref<Cluster[]>
  versionModal: VersionModalState
  /** B1 后由共享 PluginEntityFormModal 自取插件清单；保留字段以兼容既有调用方传参 */
  availablePlugins: Ref<Plugin[]>
  loadAvailablePlugins: () => Promise<void>
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
}

/**
 * H4 删除集群级警示行文案（global-rule-ux-close-loop 3.2）。
 * 单点导出：共享确认 wrap（本文件）与主页面 GlobalRuleList 调用点同源，保证两入口一致。
 */
export function globalRuleDeleteWarning(clusterName: string): string {
  return `全局规则作用于集群「${clusterName}」的全部路由；勾选 Edge 删除并执行后，所有路由将立即失去这组插件配置`
}

/**
 * Shared composable for plugin-config and global-rule CRUD.
 *
 * 删除/发布/版本管理由 useClusterResourceCore 共享实现（Phase 4 合并）；
 * 创建/编辑表单在共享 PluginEntityFormModal（B1），本工厂只保留查看抽屉 + 列表加载。
 */
export function useClusterPluginEntity(config: PluginEntityConfig, deps: PluginEntityDeps) {
  // availablePlugins / loadAvailablePlugins 只为原表单的插件选择器服务，B1 后无消费点；
  // 保留在 deps 类型里以兼容调用方传参，不再解构。
  const { clusters, versionModal, openPublishModal } = deps
  const { apiEndpoint, displayName, clusterProp, versionType } = config

  const core = useClusterResourceCore(
    {
      noun: displayName,
      endpoint: apiEndpoint,
      versionType,
      publishVersionHint: config.publishVersionHint,
      getSelected: (c) => (c.selectedPluginConfig as PluginEntityItem | null) ?? null,
      setSelected: (c, item) => {
        c.selectedPluginConfig = item as PluginEntityItem | null
      },
      getSelectedKeys: () => [],
      setSelectedKeys: () => {},
      refresh: (c) => loadItems(c),
    },
    // 插件组删除前置引用检查（决策 B）：在 core 的 deps 注入点包装共享确认——
    // 引用非空时不弹共享确认，改 useOverlayModal 阻断提示（无任何删除入口，
    // 网关侧与平台侧均不允许删除）；无引用/查询失败走原流程不变。
    // 全局规则链路（H4）：注入集群级 extraWarning 警示行（集群名经 apiEndpoint 反查 clusters，
    // 与主页面 GlobalRuleList 调用点共用 globalRuleDeleteWarning 单点文案）。
    {
      openPublishModal,
      showDeleteConfirm:
        apiEndpoint === 'plugin_configs'
          ? (opts) => {
              void deletePluginConfigWithReferenceCheck({
                apiEndpoint: opts.apiEndpoint,
                onUnreferenced: () => showDeleteConfirm(opts),
              })
            }
          : apiEndpoint === 'global_rules'
            ? (opts) => {
                const cid = Number(/\/clusters\/(\d+)\//.exec(opts.apiEndpoint)?.[1])
                const target = clusters.value.find((c) => c.id === cid)
                const clusterName = target ? target.display_name || target.name : ''
                showDeleteConfirm({
                  ...opts,
                  extraWarning: clusterName ? globalRuleDeleteWarning(clusterName) : undefined,
                })
              }
            : showDeleteConfirm,
      versionModal,
    },
  )

  const viewDrawerVisible = ref(false)
  const viewingItem = ref<PluginEntityItem | null>(null)

  /**
   * A3 失败态契约（global-rule-ux-close-loop 6.2）：加载失败不再吞成空数组——
   * 失败原因写入 cluster 对象（globalRulesLoadError / pluginConfigsLoadError），
   * 父页面 loadXxx（CentralList Tab 切换触发）与子页 Tab 组件共享同一状态载体，
   * 子页据此渲染「加载失败：{原因}」+ 重试。
   */
  const writeLoadError = (cluster: Cluster, reason: string | null) => {
    if (clusterProp === 'global_rules') cluster.globalRulesLoadError = reason
    else cluster.pluginConfigsLoadError = reason
  }

  const loadItems = async (cluster: Cluster) => {
    writeLoadError(cluster, null)
    try {
      const res = await api.get(`/clusters/${cluster.id}/${apiEndpoint}`)
      cluster[clusterProp] = res.data.items || res.data || []
    } catch (error: unknown) {
      cluster[clusterProp] = []
      writeLoadError(cluster, getApiErrorMessage(error))
    }
  }

  const viewItem = (item: PluginEntityItem) => {
    viewingItem.value = item
    viewDrawerVisible.value = true
  }

  const deleteItem = async (cluster: Cluster, item: PluginEntityItem) => {
    await core.deleteByRecord(cluster, item)
  }

  const publishItem = async (cluster: Cluster, item?: PluginEntityItem) => {
    if (item) {
      await core.publishByRecord(cluster, item)
    } else {
      await core.publishSelected(cluster)
    }
  }

  const openVersionManagement = (cluster: Cluster, item?: PluginEntityItem) => {
    if (item) {
      core.openVersionManagementByRecord(cluster, item)
    } else {
      core.openVersionManagement(cluster)
    }
  }

  const viewPluginDetail = (parent: PluginEntityItem, pname: string, pcfg: unknown) => {
    const configStr = typeof pcfg === 'object' ? JSON.stringify(pcfg, null, 2) : String(pcfg)
    showOverlayModal({
      title: `${parent.name} - ${pname}`,
      content: h(
        'pre',
        {
          style:
            'font-size:12px;white-space:pre-wrap;background:var(--bg);padding:12px;border-radius:4px;max-height:400px;overflow-y:auto;color:var(--fg);',
        },
        configStr,
      ),
      okText: '关闭',
      showCancel: false,
      width: 560,
    })
  }

  // 创建/编辑表单已统一走共享 PluginEntityFormModal（B1）：原表单状态、回填与提交逻辑一并迁出
  // （提交校验 + 保存后发布引导都在组件内），本工厂只保留查看抽屉、列表加载、删除、发布与版本管理。
  return {
    viewDrawerVisible,
    viewingItem,

    loadItems,
    viewItem,
    deleteItem,
    publishItem,
    openVersionManagement,
    viewPluginDetail,
  }
}
