import { ref, reactive, h, type Ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Plugin } from '@/types'
import { showDeleteConfirm, executePublish, executeDeleteWithProgress } from './useClusterUtils'

export interface VersionModalState {
  type: Ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>
  visible: Ref<boolean>
  resourceId: Ref<number | null>
  clusterId: Ref<number | null>
  resourceName: Ref<string>
  edgeUuid: Ref<string>
}

export interface PluginEntityConfig {
  /** API endpoint path segment, e.g. 'plugin_configs' or 'global_rules' */
  apiEndpoint: string
  /** Display name in Chinese, e.g. '插件组' or '全局规则' */
  displayName: string
  /** Cluster property name, e.g. 'plugin_configs' or 'global_rules' */
  clusterProp: string
  /** Version modal resource type string */
  versionType: string
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
 * Both resources have identical structure: name + description + plugins,
 * differing only in the API endpoint and display label.
 */
export function useClusterPluginEntity(config: PluginEntityConfig, deps: PluginEntityDeps) {
  const { clusters, versionModal, availablePlugins, loadAvailablePlugins, openPublishModal } = deps
  const { apiEndpoint, displayName, clusterProp, versionType } = config

  const modalVisible = ref(false)
  const activeTab = ref('basic')
  const formMode = ref<'add' | 'edit'>('add')
  const editingClusterId = ref<number | null>(null)
  const editingId = ref<number | null>(null)

  const formData = reactive({
    name: '',
    description: '',
    selectedPlugins: [] as any[],
  })

  const viewDrawerVisible = ref(false)
  const viewingItem = ref<any>(null)

  const loadItems = async (cluster: Cluster) => {
    try {
      const res = await api.get(`/clusters/${cluster.id}/${apiEndpoint}`)
      ;(cluster as any)[clusterProp] = res.data.items || res.data || []
    } catch {
      ;(cluster as any)[clusterProp] = []
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

  const viewItem = (item: any) => {
    viewingItem.value = item
    viewDrawerVisible.value = true
  }

  const editItem = async (cluster: Cluster, item: any) => {
    if (availablePlugins.value.length === 0) await loadAvailablePlugins()
    formMode.value = 'edit'
    editingClusterId.value = cluster.id
    editingId.value = item.id
    formData.name = item.name || ''
    formData.description = item.description || ''
    formData.selectedPlugins = Object.entries(item.plugins || {}).map(([plugin_name, config]: [string, any]) => ({
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

    const plugins: Record<string, any> = {}
    for (const sp of formData.selectedPlugins) {
      if (sp.config) {
        try { plugins[sp.plugin_name] = JSON.parse(sp.config) } catch { plugins[sp.plugin_name] = sp.config }
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
      const cluster = clusters.value.find(c => c.id === editingClusterId.value)
      if (cluster) await loadItems(cluster)
    } catch (error: any) {
      const detail = error.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '操作失败')
    }
  }

  const deleteItem = async (cluster: Cluster, item: any) => {
    showDeleteConfirm({
      title: `确定要删除${displayName} "${item.name}" 吗？`,
      apiEndpoint: `/clusters/${cluster.id}/${apiEndpoint}/${item.id}`,
      nodes: cluster.nodes,
      onOk: async (deleteDb, deleteEdge, nodeIds) => {
        await executeDeleteWithProgress({
          title: `删除${displayName}: ${item.name}`,
          apiEndpoint: `/clusters/${cluster.id}/${apiEndpoint}/${item.id}`,
          cluster,
          deleteDb,
          deleteEdge,
          nodeIds,
          refreshFn: () => loadItems(cluster),
          clearSelectedFn: () => { (cluster as any).selectedPluginConfig = null },
        })
      },
    })
  }

  const publishItem = async (cluster: Cluster, item?: any) => {
    const target = item || (cluster as any).selectedPluginConfig
    if (!target) {
      message.warning(`请先选择一个${displayName}`)
      return
    }
    const nodeIds = await openPublishModal(`发布${displayName}: ${target.name}`, cluster.id)
    if (!nodeIds.length) return

    await executePublish({
      title: `发布${displayName}: ${target.name}`,
      apiEndpoint: `/clusters/${cluster.id}/${apiEndpoint}/${target.id}/publish`,
      nodeIds,
      refreshFn: () => loadItems(cluster),
    })
  }

  const openVersionManagement = (cluster: Cluster, item?: any) => {
    const target = item || (cluster as any).selectedPluginConfig
    if (!target) {
      message.warning(`请先选择一个${displayName}`)
      return
    }
    versionModal.type.value = versionType as any
    versionModal.resourceId.value = target.id
    versionModal.clusterId.value = cluster.id
    versionModal.resourceName.value = target.name
    versionModal.edgeUuid.value = target.edge_uuid || ''
    versionModal.visible.value = true
  }

  const viewPluginDetail = (parent: any, pname: string, pcfg: any) => {
    const configStr = typeof pcfg === 'object' ? JSON.stringify(pcfg, null, 2) : String(pcfg)
    Modal.info({
      title: `${parent.name} - ${pname}`,
      content: h('pre', { style: 'font-size:12px;white-space:pre-wrap;background:var(--bg);padding:12px;border-radius:4px;max-height:400px;overflow-y:auto;color:var(--fg);' }, configStr),
      okText: '关闭',
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
