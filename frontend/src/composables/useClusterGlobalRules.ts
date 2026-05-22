import { ref, reactive, h, type Ref } from 'vue'
import { message, Modal, Progress } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Plugin } from '@/types'
import type { VersionModalState } from './useClusterPluginConfigs'

export interface GlobalRuleDeps {
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

export function useClusterGlobalRules(deps: GlobalRuleDeps) {
  const { clusters, versionModal, availablePlugins, loadAvailablePlugins, openPublishModal } = deps

  const globalRuleModalVisible = ref(false)
  const globalRuleActiveTab = ref('basic')
  const globalRuleFormMode = ref<'add' | 'edit'>('add')
  const globalRuleEditingClusterId = ref<number | null>(null)
  const globalRuleEditingId = ref<number | null>(null)

  const globalRuleFormData = reactive({
    name: '',
    description: '',
    selectedPlugins: [] as any[],
  })

  const viewGrDrawerVisible = ref(false)
  const viewingGr = ref<any>(null)

  const loadGlobalRules = async (cluster: Cluster) => {
    try {
      const res = await api.get(`/clusters/${cluster.id}/global_rules`)
      cluster.global_rules = res.data.items || []
    } catch {
      cluster.global_rules = []
    }
  }

  const showAddGlobalRule = async (cluster: Cluster) => {
    if (availablePlugins.value.length === 0) await loadAvailablePlugins()
    globalRuleFormMode.value = 'add'
    globalRuleEditingClusterId.value = cluster.id
    globalRuleEditingId.value = null
    globalRuleFormData.name = ''
    globalRuleFormData.description = ''
    globalRuleFormData.selectedPlugins = []
    globalRuleActiveTab.value = 'basic'
    globalRuleModalVisible.value = true
  }

  const viewGlobalRule = (gr: any) => {
    viewingGr.value = gr
    viewGrDrawerVisible.value = true
  }

  const editGlobalRule = async (cluster: Cluster, gr: any) => {
    if (availablePlugins.value.length === 0) await loadAvailablePlugins()
    globalRuleFormMode.value = 'edit'
    globalRuleEditingClusterId.value = cluster.id
    globalRuleEditingId.value = gr.id
    globalRuleFormData.name = gr.name || ''
    globalRuleFormData.description = gr.description || ''
    globalRuleFormData.selectedPlugins = Object.entries(gr.plugins || {}).map(([plugin_name, config]: [string, any]) => ({
      plugin_name, config: JSON.stringify(config)
    }))
    globalRuleActiveTab.value = 'basic'
    globalRuleModalVisible.value = true
  }

  const handleGlobalRuleSubmit = async () => {
    if (!globalRuleEditingClusterId.value) return
    if (!globalRuleFormData.name) { message.warning('请输入名称'); return }
    const plugins: Record<string, any> = {}
    for (const sp of globalRuleFormData.selectedPlugins) {
      if (sp.config) { try { plugins[sp.plugin_name] = JSON.parse(sp.config) } catch { plugins[sp.plugin_name] = sp.config } }
      else { plugins[sp.plugin_name] = {} }
    }
    try {
      const payload = { name: globalRuleFormData.name, description: globalRuleFormData.description, plugins }
      if (globalRuleEditingId.value) {
        await api.put(`/clusters/${globalRuleEditingClusterId.value}/global_rules/${globalRuleEditingId.value}`, payload)
        message.success('全局规则已更新')
      } else {
        await api.post(`/clusters/${globalRuleEditingClusterId.value}/global_rules`, payload)
        message.success('全局规则已添加')
      }
      globalRuleModalVisible.value = false
      const c = clusters.value.find(c => c.id === globalRuleEditingClusterId.value)
      if (c) await loadGlobalRules(c)
    } catch (error: any) {
      message.error('操作失败: ' + (error.response?.data?.detail || error.message))
    }
  }

  const deleteGlobalRule = async (cluster: Cluster, gr: any) => {
    const logs: string[] = []; const addLog = (t: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${t}`)
    const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }
    const modal = Modal.info({ title: `删除全局规则: ${gr.name}`, width: 600, content: buildDeleteProgressContent(progress, logs), okText: '确定', okButtonProps: { disabled: true }, cancelText: '', closable: true })
    const update = () => modal.update({ content: buildDeleteProgressContent(progress, logs) })
    addLog(`开始删除: ${gr.name}`); progress.percent = 20; update()
    await new Promise(r => setTimeout(r, 400))
    try {
      const res = await api.delete(`/clusters/${cluster.id}/global_rules/${gr.id}`)
      const data = res.data
      progress.percent = 60
      const dbResult = data.results?.find((r: any) => r.scope === 'database')
      if (dbResult) { addLog('正在从数据库删除...'); addLog(`数据库: ${dbResult.message || '已删除'}`) }
      addLog('')
      const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
      if (edgeResults.length > 0) {
        addLog('Edge 节点同步删除结果:');
        let ok = 0, fail = 0
        for (const r of edgeResults) { r.status === 'success' ? ok++ : fail++; addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`) }
        addLog(`总计: ${edgeResults.length} 节点, 成功 ${ok}, 失败 ${fail}`)
      } else if (data.deleteEdge) { addLog('集群中没有活跃的 Edge 节点') }
      progress.percent = 100
      if (edgeResults.length > 0 && !edgeResults.some((r: any) => r.status === 'failed')) { progress.status = 'success'; addLog('✅ 删除完成!') }
      else if (edgeResults.some((r: any) => r.status === 'failed')) { progress.status = 'exception'; addLog('⚠️ 部分节点删除失败') }
      else { addLog(`✅ 已完成`) }
      update()
    } catch (e: any) { progress.percent = 100; progress.status = 'exception'; addLog(`❌ 删除失败: ${e.response?.data?.detail || e.message}`); update() }
    modal.update({ okButtonProps: { disabled: false } })
    await loadGlobalRules(cluster)
  }

  const publishGlobalRule = async (cluster: Cluster, gr: any) => {
    const nodeIds = await openPublishModal(`发布全局规则: ${gr.name}`, cluster.id)
    if (!nodeIds.length) return

    const logs: string[] = []; const addLog = (t: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${t}`)
    const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }
    const modal = Modal.info({ title: `发布全局规则: ${gr.name}`, width: 600, content: buildDeleteProgressContent(progress, logs), okText: '确定', okButtonProps: { disabled: true }, cancelText: '', closable: true })
    const update = () => modal.update({ content: buildDeleteProgressContent(progress, logs) })
    addLog(`开始发布: ${gr.name}`); progress.percent = 10; update()
    await new Promise(r => setTimeout(r, 400))
    try {
      addLog('正在构建发布配置...'); progress.percent = 30; update()
      const res = await api.post(`/clusters/${cluster.id}/global_rules/${gr.id}/publish`, { node_ids: nodeIds }); const data = res.data
      progress.percent = 70; addLog(`状态: ${data.status}`); addLog(`消息: ${data.message}`)
      if (data.results) { addLog(''); addLog('节点同步结果:'); for (const r of data.results) { addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`) } }
      progress.percent = 100
      if (data.status === 'ok') { progress.status = 'success'; addLog('✅ 发布成功!') }
      else if (data.status === 'partial') { progress.status = 'exception'; addLog('⚠️ 部分成功') }
      else { progress.status = 'exception'; addLog('❌ 发布失败') }
      update(); modal.update({ okButtonProps: { disabled: false } })
    } catch (e: any) { progress.percent = 100; progress.status = 'exception'; addLog(`❌ 发布失败: ${e.response?.data?.detail || e.message}`); update(); modal.update({ okButtonProps: { disabled: false } }) }
    await loadGlobalRules(cluster)
  }

  const openGlobalRuleVersionManagement = (cluster: Cluster, gr: any) => {
    versionModal.type.value = 'global_rule'
    versionModal.resourceId.value = gr.id
    versionModal.clusterId.value = cluster.id
    versionModal.resourceName.value = gr.name
    versionModal.edgeUuid.value = gr.edge_uuid || ''
    versionModal.visible.value = true
  }

  const viewGlobalRulePluginConfig = (gr: any, pname: string, pcfg: any) => {
    Modal.info({
      title: `${gr.name} - ${pname}`,
      content: h('pre', { style: 'font-size:12px;white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:4px;max-height:400px;overflow-y:auto;' }, typeof pcfg === 'object' ? JSON.stringify(pcfg, null, 2) : String(pcfg)),
      okText: '关闭', width: 560
    })
  }

  return {
    globalRuleModalVisible,
    globalRuleActiveTab,
    globalRuleFormMode,
    globalRuleEditingClusterId,
    globalRuleEditingId,
    globalRuleFormData,
    viewGrDrawerVisible,
    viewingGr,

    loadGlobalRules,
    showAddGlobalRule,
    viewGlobalRule,
    editGlobalRule,
    handleGlobalRuleSubmit,
    deleteGlobalRule,
    publishGlobalRule,
    openGlobalRuleVersionManagement,
    viewGlobalRulePluginConfig,
  }
}
