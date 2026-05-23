import { ref, reactive, computed, type Ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import type { Cluster } from '@/types'
import type { VersionModalState } from './useClusterPluginConfigs'
import { buildDeleteProgressContent, showDeleteConfirm, executePublish } from './useClusterUtils'

export interface StaticResourceDeps {
  clusters: Ref<Cluster[]>
  versionModal: VersionModalState
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
  loadRoutes: (cluster: Cluster) => Promise<void>
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function useClusterStaticResources(deps: StaticResourceDeps) {
  const { clusters, versionModal, openPublishModal, loadRoutes } = deps

  const staticResourceFormData = reactive({
    route_id: null as number | null,
    name: '',
    url_path: '',
    description: '',
  })
  const staticResourceRouteInfo = ref<{ valid: boolean; msg: string } | null>(null)
  const staticResourceModalVisible = ref(false)
  const staticResourceFormMode = ref<'add' | 'edit'>('add')
  const staticResourceEditingId = ref<number | null>(null)
  const staticResourceEditingCluster = ref<Cluster | null>(null)

  const selectedRoute = computed(() => {
    if (!staticResourceFormData.route_id || !staticResourceEditingCluster.value) return null
    return staticResourceEditingCluster.value.routes?.find((r: any) => r.id === staticResourceFormData.route_id) || null
  })
  const uriValid = computed(() => {
    const r = selectedRoute.value
    return r ? (r.uri || '').trim().endsWith('/*') : false
  })
  const publishedValid = computed(() => {
    const r = selectedRoute.value
    return r ? !!(r.current_version || r.published_at) : false
  })
  const pluginValid = computed(() => {
    const r = selectedRoute.value
    if (!r) return false
    return (r.plugins || []).some((p: any) => p.plugin_name === 'static_resource')
  })
  const staticResourceFormValid = computed(() => {
    return staticResourceFormData.route_id && uriValid.value && publishedValid.value && pluginValid.value
  })

  const loadStaticResources = async (cluster: Cluster) => {
    try {
      cluster.staticResourcesLoading = true
      const res = await api.get(`/clusters/${cluster.id}/static-resources`)
      cluster.static_resources = res.data.items || []
    } catch {
      cluster.static_resources = []
    } finally {
      cluster.staticResourcesLoading = false
    }
  }

  const onStaticResourceRouteChange = (routeId: number) => {
    const cluster = staticResourceEditingCluster.value
    if (!cluster) return
    const route = cluster.routes?.find((r: any) => r.id === routeId)
    if (!route) {
      staticResourceRouteInfo.value = null
      return
    }
    const uri = (route.uri || '').trim()
    if (!uri.endsWith('/*')) {
      staticResourceRouteInfo.value = { valid: false, msg: '路由路径必须以 /* 结尾' }
      return
    }
    if (!route.current_version && !route.published_at) {
      staticResourceRouteInfo.value = { valid: false, msg: '路由必须先发布到 Edge 节点' }
      return
    }
    staticResourceRouteInfo.value = { valid: true, msg: `路由 "${route.name}" (${uri}) 验证通过` }
  }

  const showAddStaticResource = async (cluster: Cluster) => {
    staticResourceFormMode.value = 'add'
    staticResourceEditingCluster.value = cluster
    staticResourceEditingId.value = null
    staticResourceFormData.route_id = null
    staticResourceFormData.name = ''
    staticResourceFormData.url_path = ''
    staticResourceFormData.description = ''
    staticResourceRouteInfo.value = null
    if (!cluster.routes || cluster.routes.length === 0) {
      await loadRoutes(cluster)
    }
    staticResourceModalVisible.value = true
  }

  const editStaticResource = (cluster: Cluster, sr: any) => {
    staticResourceFormMode.value = 'edit'
    staticResourceEditingCluster.value = cluster
    staticResourceEditingId.value = sr.id
    staticResourceFormData.name = sr.name
    staticResourceFormData.url_path = sr.url_path
    staticResourceFormData.description = sr.description || ''
    staticResourceRouteInfo.value = null
    staticResourceModalVisible.value = true
  }

  const handleStaticResourceSubmit = async () => {
    const cluster = staticResourceEditingCluster.value
    if (!cluster) return

    if (staticResourceFormMode.value === 'add') {
      if (!staticResourceFormData.route_id) {
        message.warning('请选择路由')
        return
      }
      if (!staticResourceRouteInfo.value?.valid) {
        message.warning('请选择符合条件（已发布到 Edge 节点且路径以 /* 结尾）的路由')
        return
      }
    }

    try {
      if (staticResourceFormMode.value === 'add') {
        const payload = {
          route_id: staticResourceFormData.route_id,
          description: staticResourceFormData.description || undefined,
        }
        await api.post(`/clusters/${cluster.id}/static-resources`, payload)
        message.success('静态资源已创建')
      } else {
        const payload: Record<string, any> = {}
        if (staticResourceFormData.description !== undefined) {
          payload.description = staticResourceFormData.description || undefined
        }
        await api.put(`/clusters/${cluster.id}/static-resources/${staticResourceEditingId.value}`, payload)
        message.success('静态资源已更新')
      }

      staticResourceModalVisible.value = false
      await loadStaticResources(cluster)
    } catch (error: any) {
      message.error('操作失败: ' + (error.response?.data?.detail || error.message))
    }
  }

  const deleteStaticResource = async (cluster: Cluster, sr: any) => {
    showDeleteConfirm({
      title: `确定要删除静态资源 "${sr.name}" 吗？`,
      apiEndpoint: `/clusters/${cluster.id}/static-resources/${sr.id}`,
      nodes: cluster.nodes,
      onOk: async (deleteDb, deleteEdge, nodeIds) => {
        const logs: string[] = []
        const addLog = (text: string) => {
          logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
        }
        const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }

        const modal = Modal.info({
          title: `删除静态资源: ${sr.name}`,
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

        addLog(`开始删除静态资源: ${sr.name}`)
        progress.percent = 20
        updateContent()

        await new Promise(r => setTimeout(r, 400))

        try {
          const res = await api.delete(`/clusters/${cluster.id}/static-resources/${sr.id}`, {
            data: {
              delete_db: deleteDb,
              delete_edge: deleteEdge,
              node_ids: nodeIds.length > 0 ? nodeIds : undefined,
            },
          })
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
          } else if (deleteEdge) {
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

          await loadStaticResources(cluster)
          cluster.selectedStaticResource = null
        } catch (error: any) {
          const detail = error.response?.data?.detail
          progress.percent = 100
          progress.status = 'exception'
          addLog('')
          addLog(`❌ 删除失败: ${typeof detail === 'string' ? detail : '未知错误'}`)
          updateContent()
        }
        modal.update({ okButtonProps: { disabled: false } })
      },
    })
  }

  const uploadStaticResource = (sr: any) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      const cluster = clusters.value.find((c: Cluster) =>
        c.static_resources?.some((s: any) => s.id === sr.id)
      )
      if (!cluster) return

      const logs: string[] = []
      const addLog = (text: string) => { logs.push(`[${new Date().toLocaleTimeString()}] ${text}`) }
      const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }
      const totalSize = file.size

      const modal = Modal.info({
        title: `上传静态资源: ${sr.name}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })
      const updateContent = () => modal.update({ content: buildDeleteProgressContent(progress, logs) })

      addLog(`文件: ${file.name} (${formatFileSize(totalSize)})`)
      progress.percent = 5
      updateContent()

      await new Promise(r => setTimeout(r, 200))

      try {
        const formData = new FormData()
        formData.append('file', file)

        addLog('正在上传...')
        progress.percent = 20
        updateContent()

        const res = await api.post(`/clusters/${cluster.id}/static-resources/${sr.id}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e: any) => {
            if (e.total) {
              const pct = Math.round(20 + (e.loaded / e.total) * 50)
              progress.percent = pct
              addLog(`上传进度: ${formatFileSize(e.loaded)} / ${formatFileSize(e.total)}`)
              updateContent()
            }
          },
        })

        progress.percent = 80
        addLog('上传完成')
        addLog('')
        const ver = res.data.current_version || '?'
        const serverHost = window.location.hostname
        addLog('── 上传结果 ──')
        addLog(`管理端服务器: ${serverHost}`)
        addLog(`管理端文件: ${res.data.storage_path || '未知'}`)
        addLog(`文件大小: ${res.data.file_size ? formatFileSize(res.data.file_size) : '—'}`)
        addLog(`当前版本: v${ver}`)
        addLog(`路由: ${sr.name} (${sr.url_path})`)
        progress.percent = 100
        progress.status = 'success'
        addLog('')
        addLog('✅ 上传成功')
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })

        await loadStaticResources(cluster)
      } catch (error: any) {
        const errMsg = error.response?.data?.detail || error.message || '未知错误'
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 上传失败: ${errMsg}`)
        updateContent()
        modal.update({ okButtonProps: { disabled: false } })
      }
    }
    input.click()
  }

  const publishStaticResource = async (cluster: Cluster, sr: any) => {
    const nodeIds = await openPublishModal(`发布静态资源: ${sr.name}`, cluster.id)
    if (!nodeIds.length) return

    await executePublish({
      title: `发布静态资源: ${sr.name}`,
      apiEndpoint: `/clusters/${cluster.id}/static-resources/${sr.id}/publish`,
      nodeIds,
      refreshFn: () => loadStaticResources(cluster),
      handleResult: (data, addLog, progress) => {
        if (data.current_version !== undefined) addLog(`当前版本: v${data.current_version}`)
        if (data.results && data.results.length > 0) {
          addLog(''); addLog('节点同步结果:')
          for (const r of data.results) {
            addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
          }
        }
        progress.percent = 100; addLog('')
        if (data.success) { progress.status = 'success'; addLog('✅ 发布成功!') }
        else { progress.status = 'exception'; addLog('⚠️ 发布完成，部分节点失败') }
      },
    })
  }

  const openStaticResourceVersionManagement = (cluster: Cluster, sr: any) => {
    versionModal.type.value = 'static_resource'
    versionModal.resourceId.value = sr.id
    versionModal.clusterId.value = cluster.id
    versionModal.resourceName.value = sr.name
    versionModal.edgeUuid.value = ''
    versionModal.visible.value = true
  }

  return {
    staticResourceFormData,
    staticResourceRouteInfo,
    staticResourceModalVisible,
    staticResourceFormMode,
    staticResourceEditingId,
    staticResourceEditingCluster,
    staticResourceFormValid,
    selectedRoute,
    uriValid,
    publishedValid,
    pluginValid,

    loadStaticResources,
    onStaticResourceRouteChange,
    showAddStaticResource,
    editStaticResource,
    handleStaticResourceSubmit,
    deleteStaticResource,
    uploadStaticResource,
    publishStaticResource,
    openStaticResourceVersionManagement,
  }
}
