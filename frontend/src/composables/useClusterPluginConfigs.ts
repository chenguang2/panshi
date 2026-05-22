import { ref, reactive, h, type Ref } from 'vue'
import { message, Modal, Progress } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Plugin } from '@/types'

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

function buildDeleteProgressContent(
  progress: { percent: number; status: 'active' | 'success' | 'exception' },
  logs: string[]
) {
  return h('div', {}, [
    h(Progress, { percent: progress.percent, status: progress.status, showInfo: false, style: 'margin-bottom: 12px;' }),
    h('div', { style: 'max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 12px;' },
      logs.map(log => h('div', { style: 'margin-bottom: 4px; white-space: pre-wrap;' }, log))
    )
  ])
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
    const logs: string[] = []
    const addLog = (text: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }
    const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }

    const modal = Modal.info({
      title: `删除插件组: ${pc.name}`,
      width: 600,
      content: buildDeleteProgressContent(progress, logs),
      okText: '确定',
      okButtonProps: { disabled: true },
      cancelText: '',
      closable: true,
    })

    const updateContent = () => {
      modal.update({ content: buildDeleteProgressContent(progress, logs) })
    }

    addLog(`开始删除插件组: ${pc.name}`)
    progress.percent = 20
    updateContent()

    await new Promise(r => setTimeout(r, 400))

    try {
      const res = await api.delete(`/clusters/${cluster.id}/plugin_configs/${pc.id}`)
      const data = res.data

      progress.percent = 60
      const dbResult = data.results?.find((r: any) => r.scope === 'database')
      if (dbResult) {
        addLog('正在从数据库删除...')
        addLog(`数据库: ${dbResult.message || '已删除'}`)
      }
      addLog('')

      const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
      if (edgeResults.length > 0) {
        addLog('正在从 Edge 节点同步删除...')
        progress.percent = 80
        updateContent()

        addLog('Edge 节点同步删除结果:')
        let successCount = 0
        let failCount = 0
        for (const r of edgeResults) {
          if (r.status === 'success') successCount++
          else failCount++
          addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`)
        }
        addLog('')
        addLog(`总计: ${edgeResults.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`)
      } else {
        addLog('集群中没有活跃的 Edge 节点')
      }

      progress.percent = 100
      addLog('')
      if (edgeResults.length > 0 && !edgeResults.some((r: any) => r.status === 'failed')) {
        progress.status = 'success'
        addLog('✅ 删除完成!')
      } else if (edgeResults.some((r: any) => r.status === 'failed')) {
        progress.status = 'exception'
        addLog('⚠️ 部分节点删除失败，请手动清理')
      } else {
        progress.status = 'success'
        addLog('✅ 已完成')
      }

      updateContent()

      await loadPluginConfigs(cluster)
      cluster.selectedPluginConfig = null
    } catch (error: any) {
      const detail = error.response?.data?.detail
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 删除失败: ${typeof detail === 'string' ? detail : '未知错误'}`)
      updateContent()
    }
    modal.update({ okButtonProps: { disabled: false } })
  }

  const publishPluginConfig = async (cluster: Cluster, pc?: any) => {
    const target = pc || cluster.selectedPluginConfig
    if (!target) {
      message.warning('请先选择一个插件组')
      return
    }
    const nodeIds = await openPublishModal(`发布插件组: ${target.name}`, cluster.id)
    if (!nodeIds.length) return

    const logs: string[] = []
    const addLog = (text: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }
    const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }

    const modal = Modal.info({
      title: `发布插件组: ${target.name}`,
      width: 600,
      content: buildDeleteProgressContent(progress, logs),
      okText: '确定',
      okButtonProps: { disabled: true },
      cancelText: '',
      closable: true,
    })

    const updateContent = () => {
      modal.update({ content: buildDeleteProgressContent(progress, logs) })
    }

    addLog(`开始发布插件组: ${target.name}`)
    progress.percent = 10
    updateContent()

    await new Promise(r => setTimeout(r, 400))

    try {
      addLog('正在构建发布配置...')
      progress.percent = 30
      updateContent()

      const res = await api.post(`/clusters/${cluster.id}/plugin_configs/${target.id}/publish`, { node_ids: nodeIds })
      const data = res.data
      progress.percent = 70

      addLog(`状态: ${data.status}`)
      addLog(`消息: ${data.message}`)
      addLog(`版本: v${data.version}`)

      if (data.results && data.results.length > 0) {
        addLog('')
        addLog('节点同步结果:')
        for (const r of data.results) {
          addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
        }
      }

      progress.percent = 100
      addLog('')
      if (data.status === 'ok') {
        progress.status = 'success'
        addLog('✅ 发布成功!')
      } else if (data.status === 'partial') {
        progress.status = 'exception'
        addLog('⚠️ 部分成功')
      } else {
        progress.status = 'exception'
        addLog('❌ 发布失败')
      }
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })
    } catch (error: any) {
      const errMsg = error.response?.data?.detail || error.message || '未知错误'
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 发布失败: ${errMsg}`)
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })
    }
    await loadPluginConfigs(cluster)
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
      content: h('pre', { style: 'font-size: 12px; white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 4px; max-height: 400px; overflow-y: auto;' }, configStr),
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
