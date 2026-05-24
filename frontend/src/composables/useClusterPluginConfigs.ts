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

export interface PluginConfigDeps {
  clusters: Ref<Cluster[]>
  versionModal: VersionModalState
  availablePlugins: Ref<Plugin[]>
  loadAvailablePlugins: () => Promise<void>
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
}

export function useClusterPluginConfigs(deps: PluginConfigDeps) {
  const { clusters, versionModal, availablePlugins, loadAvailablePlugins, openPublishModal } = deps

  const pluginConfigModalVisible = ref(false)
  const pluginConfigActiveTab = ref('basic')
  const pluginConfigFormMode = ref<'add' | 'edit'>('add')
  const pluginConfigEditingClusterId = ref<number | null>(null)
  const pluginConfigEditingId = ref<number | null>(null)

  const pluginConfigFormData = reactive({
    name: '',
    description: '',
    selectedPlugins: [] as any[],
  })

  const viewPcDrawerVisible = ref(false)
  const viewingPc = ref<any>(null)

  const loadPluginConfigs = async (cluster: Cluster) => {
    try {
      const res = await api.get(`/clusters/${cluster.id}/plugin_configs`)
      cluster.plugin_configs = res.data.items || res.data || []
    } catch (error: any) {
      message.error('加载插件组列表失败')
      cluster.plugin_configs = []
    }
  }

  const showAddPluginConfig = async (cluster: Cluster) => {
    await loadPluginConfigs(cluster)
    if (availablePlugins.value.length === 0) {
      await loadAvailablePlugins()
    }
    pluginConfigFormMode.value = 'add'
    pluginConfigEditingClusterId.value = cluster.id
    pluginConfigEditingId.value = null
    pluginConfigFormData.name = ''
    pluginConfigFormData.description = ''
    pluginConfigFormData.selectedPlugins = []
    pluginConfigActiveTab.value = 'basic'
    pluginConfigModalVisible.value = true
  }

  const viewPluginConfig = (pc: any) => {
    viewingPc.value = pc
    viewPcDrawerVisible.value = true
  }

  const editPluginConfig = async (cluster: Cluster, pc: any) => {
    if (availablePlugins.value.length === 0) {
      await loadAvailablePlugins()
    }
    pluginConfigFormMode.value = 'edit'
    pluginConfigEditingClusterId.value = cluster.id
    pluginConfigEditingId.value = pc.id
    pluginConfigFormData.name = pc.name || ''
    pluginConfigFormData.description = pc.description || ''
    pluginConfigFormData.selectedPlugins = Object.entries(pc.plugins || {}).map(([plugin_name, config]: [string, any]) => ({
      plugin_name,
      config: JSON.stringify(config)
    }))
    pluginConfigActiveTab.value = 'basic'
    pluginConfigModalVisible.value = true
  }

  const handlePluginConfigSubmit = async () => {
    if (!pluginConfigEditingClusterId.value) return
    if (!pluginConfigFormData.name) {
      message.warning('请输入插件组名称')
      return
    }

    const plugins: Record<string, any> = {}
    for (const sp of pluginConfigFormData.selectedPlugins) {
      if (sp.config) {
        try { plugins[sp.plugin_name] = JSON.parse(sp.config) } catch { plugins[sp.plugin_name] = sp.config }
      } else {
        plugins[sp.plugin_name] = {}
      }
    }

    try {
      const payload = {
        name: pluginConfigFormData.name,
        description: pluginConfigFormData.description,
        plugins
      }

      if (pluginConfigEditingId.value) {
        await api.put(`/clusters/${pluginConfigEditingClusterId.value}/plugin_configs/${pluginConfigEditingId.value}`, payload)
        message.success('插件组已更新')
      } else {
        await api.post(`/clusters/${pluginConfigEditingClusterId.value}/plugin_configs`, payload)
        message.success('插件组已添加')
      }

      pluginConfigModalVisible.value = false
      const cluster = clusters.value.find(c => c.id === pluginConfigEditingClusterId.value)
      if (cluster) {
        await loadPluginConfigs(cluster)
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '操作失败')
    }
  }

  const deletePluginConfig = async (cluster: Cluster, pc: any) => {
    showDeleteConfirm({
      title: `确定要删除插件组 "${pc.name}" 吗？`,
      apiEndpoint: `/clusters/${cluster.id}/plugin_configs/${pc.id}`,
      nodes: cluster.nodes,
      onOk: async (deleteDb, deleteEdge, nodeIds) => {
        await executeDeleteWithProgress({
          title: `删除插件组: ${pc.name}`,
          apiEndpoint: `/clusters/${cluster.id}/plugin_configs/${pc.id}`,
          cluster,
          deleteDb,
          deleteEdge,
          nodeIds,
          refreshFn: () => loadPluginConfigs(cluster),
          clearSelectedFn: () => { cluster.selectedPluginConfig = null },
        })
      },
    })
  }

  const publishPluginConfig = async (cluster: Cluster, pc?: any) => {
    const target = pc || cluster.selectedPluginConfig
    if (!target) {
      message.warning('请先选择一个插件组')
      return
    }
    const nodeIds = await openPublishModal(`发布插件组: ${target.name}`, cluster.id)
    if (!nodeIds.length) return

    await executePublish({
      title: `发布插件组: ${target.name}`,
      apiEndpoint: `/clusters/${cluster.id}/plugin_configs/${target.id}/publish`,
      nodeIds,
      refreshFn: () => loadPluginConfigs(cluster),
    })
  }

  const openPluginConfigVersionManagement = (cluster: Cluster, pc?: any) => {
    const target = pc || cluster.selectedPluginConfig
    if (!target) {
      message.warning('请先选择一个插件组')
      return
    }
    versionModal.type.value = 'plugin_config'
    versionModal.resourceId.value = target.id
    versionModal.clusterId.value = cluster.id
    versionModal.resourceName.value = target.name
    versionModal.edgeUuid.value = target.edge_uuid || ''
    versionModal.visible.value = true
  }

  const viewPluginConfigDetail = (pg: any, pname: string, pcfg: any) => {
    const configStr = typeof pcfg === 'object' ? JSON.stringify(pcfg, null, 2) : String(pcfg)
    Modal.info({
      title: `${pg.name} - ${pname}`,
      content: h('pre', { style: 'font-size: 12px; white-space: pre-wrap; background: var(--p-bg-hover); padding: 12px; border-radius: 4px; max-height: 400px; overflow-y: auto; color: var(--p-text-primary);' }, configStr),
      okText: '关闭',
      width: 560
    })
  }

  return {
    pluginConfigModalVisible,
    pluginConfigActiveTab,
    pluginConfigFormMode,
    pluginConfigEditingClusterId,
    pluginConfigEditingId,
    pluginConfigFormData,
    viewPcDrawerVisible,
    viewingPc,

    loadPluginConfigs,
    showAddPluginConfig,
    viewPluginConfig,
    editPluginConfig,
    handlePluginConfigSubmit,
    deletePluginConfig,
    publishPluginConfig,
    openPluginConfigVersionManagement,
    viewPluginConfigDetail,
  }
}
