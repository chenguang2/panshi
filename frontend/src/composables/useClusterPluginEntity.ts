import { ref, reactive, h, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Plugin, GlobalRule, PluginConfig } from '@/types'
import { showDeleteConfirm } from './useClusterUtils'
import { getApiErrorMessage } from '@/utils/error'
import { useClusterResourceCore, type VersionModalState } from './useClusterResourceCore'
import { showOverlayModal } from './useOverlayModal'

/** 插件实体资源（插件组/全局规则）的公共形状 */
type PluginEntityItem = (GlobalRule | PluginConfig) & { plugins: Record<string, unknown> }

export { type VersionModalState } from './useClusterResourceCore'

export interface PluginEntityConfig {
  /** API endpoint path segment, e.g. 'plugin_configs' or 'global_rules' */
  apiEndpoint: string
  /** Display name in Chinese, e.g. '插件组' or '全局规则' */
  displayName: string
  /** Cluster property name, e.g. 'plugin_configs' or 'global_rules' */
  clusterProp: 'plugin_configs' | 'global_rules'
  /** Version modal resource type */
  versionType: 'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'
}

export interface PluginEntityDeps {
  clusters: Ref<Cluster[]>
  versionModal: VersionModalState
  availablePlugins: Ref<Plugin[]>
  loadAvailablePlugins: () => Promise<void>
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
}

/**
 * Shared composable for plugin-config and global-rule CRUD.
 *
 * 删除/发布/版本管理由 useClusterResourceCore 共享实现（Phase 4 合并）；
 * 本工厂保留表单/抽屉/加载等插件实体专属逻辑。
 */
export function useClusterPluginEntity(config: PluginEntityConfig, deps: PluginEntityDeps) {
  const { clusters, versionModal, availablePlugins, loadAvailablePlugins, openPublishModal } = deps
  const { apiEndpoint, displayName, clusterProp, versionType } = config

  const core = useClusterResourceCore(
    {
      noun: displayName,
      endpoint: apiEndpoint,
      versionType,
      getSelected: (c) => (c.selectedPluginConfig as PluginEntityItem | null) ?? null,
      setSelected: (c, item) => {
        c.selectedPluginConfig = item as PluginEntityItem | null
      },
      getSelectedKeys: () => [],
      setSelectedKeys: () => {},
      refresh: (c) => loadItems(c),
    },
    { openPublishModal, showDeleteConfirm, versionModal },
  )

  const modalVisible = ref(false)
  const activeTab = ref('basic')
  const formMode = ref<'add' | 'edit'>('add')
  const editingClusterId = ref<number | null>(null)
  const editingId = ref<number | null>(null)

  const formData = reactive({
    name: '',
    description: '',
    selectedPlugins: [] as { plugin_name: string; config: string }[],
  })

  const viewDrawerVisible = ref(false)
  const viewingItem = ref<PluginEntityItem | null>(null)

  const loadItems = async (cluster: Cluster) => {
    try {
      const res = await api.get(`/clusters/${cluster.id}/${apiEndpoint}`)
      cluster[clusterProp] = res.data.items || res.data || []
    } catch {
      cluster[clusterProp] = []
    }
  }

  const showAdd = async (cluster: Cluster) => {
    if (availablePlugins.value.length === 0) await loadAvailablePlugins()
    formMode.value = 'add'
    editingClusterId.value = cluster.id
    editingId.value = null
    formData.name = ''
    formData.description = ''
    formData.selectedPlugins = []
    activeTab.value = 'basic'
    modalVisible.value = true
  }

  const viewItem = (item: PluginEntityItem) => {
    viewingItem.value = item
    viewDrawerVisible.value = true
  }

  const editItem = async (cluster: Cluster, item: PluginEntityItem) => {
    if (availablePlugins.value.length === 0) await loadAvailablePlugins()
    formMode.value = 'edit'
    editingClusterId.value = cluster.id
    editingId.value = item.id
    formData.name = item.name || ''
    formData.description = item.description || ''
    formData.selectedPlugins = Object.entries(item.plugins).map(([plugin_name, config]) => ({
      plugin_name,
      config: JSON.stringify(config),
    }))
    activeTab.value = 'basic'
    modalVisible.value = true
  }

  const handleSubmit = async () => {
    if (!editingClusterId.value) return
    if (!formData.name) {
      message.warning(`请输入${displayName}名称`)
      return
    }

    const plugins: Record<string, unknown> = {}
    for (const sp of formData.selectedPlugins) {
      if (sp.config) {
        try {
          plugins[sp.plugin_name] = JSON.parse(sp.config)
        } catch {
          plugins[sp.plugin_name] = sp.config
        }
      } else {
        plugins[sp.plugin_name] = {}
      }
    }

    try {
      const payload = { name: formData.name, description: formData.description, plugins }
      if (editingId.value) {
        await api.put(`/clusters/${editingClusterId.value}/${apiEndpoint}/${editingId.value}`, payload)
        message.success(`${displayName}已更新`)
      } else {
        await api.post(`/clusters/${editingClusterId.value}/${apiEndpoint}`, payload)
        message.success(`${displayName}已添加`)
      }

      modalVisible.value = false
      const cluster = clusters.value.find((c) => c.id === editingClusterId.value)
      if (cluster) await loadItems(cluster)
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error))
    }
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

  return {
    modalVisible,
    activeTab,
    formMode,
    editingClusterId,
    editingId,
    formData,
    viewDrawerVisible,
    viewingItem,

    loadItems,
    showAdd,
    viewItem,
    editItem,
    handleSubmit,
    deleteItem,
    publishItem,
    openVersionManagement,
    viewPluginDetail,
  }
}
