import { ref, reactive, computed, watch, h, type Ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Route, RoutePlugin, Plugin, PluginConfig } from '@/types'
import { useAuthStore } from '@/stores/auth'

// ── helpers ────────────────────────────────────────────────────────────

const ALL_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

function getFieldName(name: string): string {
  const nameMap: Record<string, string> = {
    name: '名称',
    uri: 'URI',
    methods: '请求方法',
    upstream_id: '上游',
    priority: '优先级',
    status: '状态',
  }
  return nameMap[name] || name
}

function publishStatusRender(version: number | null, publishedAt: string | null) {
  const published = version !== null && version !== undefined
  if (published && publishedAt) {
    return h('span', [
      h('span', {
        style:
          'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #52c41a;color:#52c41a;font-weight:500;background:#f6ffed;',
      }, `v${version}`),
      h('span', {
        style: 'font-size:11px;color:#666;margin-left:4px;cursor:help;',
        title: `发布时间: ${formatPublishDateTime(publishedAt)}`,
      }, ` ${formatPublishDateTime(publishedAt)}`),
    ])
  }
  if (published) {
    return h('span', {
      style:
        'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #52c41a;color:#52c41a;font-weight:500;background:#f6ffed;',
    }, `v${version} · 未同步`)
  }
  return h('span', {
    style:
      'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #d9d9d9;color:#999;background:#fafafa;',
  }, '未发布')
}

function formatPublishDateTime(isoStr: string | null): string {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return isoStr
  }
}

// ── column / action definitions ────────────────────────────────────────

const allRouteColumns = [
  { title: '名称', dataIndex: 'name', key: 'name', sorter: true },
  { title: 'URI', dataIndex: 'uri', key: 'uri', sorter: true },
  { title: '方法', dataIndex: 'methods', key: 'methods' },
  { title: '上游', dataIndex: 'upstream_id', key: 'upstream_id' },
  { title: '优先级', dataIndex: 'priority', key: 'priority', sorter: true },
  { title: '状态', key: 'status', sorter: true },
  {
    title: '发布状态',
    key: 'publish_status',
    width: 140,
    customRender: ({ record }: { record: Route }) =>
      publishStatusRender(record.current_version ?? null, record.published_at ?? null),
  },
  { title: '高级匹配', dataIndex: 'advanced_match_enabled', key: 'advanced_match_enabled' },
  { title: '描述', dataIndex: 'description', key: 'description' },
  { title: '操作', key: 'actions', width: 340 },
]

const allActionButtons = [
  { key: 'publish', title: '发布' },
  { key: 'version', title: '版本管理' },
  { key: 'copy', title: '复制' },
  { key: 'edit', title: '编辑' },
  { key: 'delete', title: '删除' },
]

// ── external dependency types ──────────────────────────────────────────

export interface RouteComposableDeps {
  clusters: Ref<Cluster[]>
  currentClusterId: Ref<number | null>

  buildDeleteProgressContent: (progress: { percent: number; status: string }, logs: string[]) => ReturnType<typeof h>
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
  showDeleteConfirm: (opts: {
    title: string
    apiEndpoint: string
    onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => void
    showResourceStats?: boolean
    stats?: Record<string, number>
    nodes?: { id: number; ip: string; management_port: number }[]
  }) => void

  loadPluginConfigs: (cluster: Cluster) => Promise<void>

  // ── version-management shared refs (owned by the embedding component) ─
  versionModalVisible: Ref<boolean>
  versionModalType: Ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>
  versionModalResourceId: Ref<number | null>
  versionModalClusterId: Ref<number | null>
  versionModalResourceName: Ref<string>
  versionModalEdgeUuid: Ref<string>

}

// ── composable ─────────────────────────────────────────────────────────

export function useClusterRoutes(deps: RouteComposableDeps) {
  const {
    clusters,
    currentClusterId,
    buildDeleteProgressContent,
    openPublishModal,
    showDeleteConfirm,
    loadPluginConfigs,
    versionModalVisible,
    versionModalType,
    versionModalResourceId,
    versionModalClusterId,
    versionModalResourceName,
    versionModalEdgeUuid,
  } = deps

  const authStore = useAuthStore()

  // ── modal / form state ──────────────────────────────────────────────

  const routeModalVisible = ref(false)
  const routeModalActiveTab = ref('basic')
  const editingRoute = ref<Route | null>(null)
  const copyingRoute = ref(false)
  const routeFormRef = ref()

  const routeForm = reactive({
    name: '',
    uri: '',
    methods: [] as string[],
    priority: 0,
    status: 1,
    upstream_id: undefined as number | undefined,
    description: '',
    advancedMatchEnabled: false,
    advancedMatch: {
      vars: [] as [string, string, string][],
    },
    plugins: [] as RoutePlugin[],
    plugin_config_ids: [] as string[],
  })

  // ── column / search config ──────────────────────────────────────────

  const routeColumnPopoverVisible = ref(false)
  const routeColumnsSelected = ref(['name', 'uri', 'publish_status', 'priority', 'actions'])
  const routeSearchVisible = ref(true)
  const routeActionsSelected = ref(['copy', 'edit', 'delete', 'publish', 'version'])

  const visibleRouteColumns = computed(() => {
    const selected = new Set(routeColumnsSelected.value)
    return allRouteColumns.filter((col) => selected.has(col.key))
  })

  // ── plugins ─────────────────────────────────────────────────────────

  const availablePlugins = ref<Plugin[]>([])

  const currentCluster = computed(() =>
    clusters.value.find((c) => c.id === currentClusterId.value),
  )

  const clusterPluginGroups = computed(() => {
    const c = currentCluster.value
    return (c?.plugin_configs || []) as PluginConfig[]
  })

  // ── methods helpers ─────────────────────────────────────────────────

  const allMethodsSelected = computed(() =>
    ALL_METHODS.every((m) => routeForm.methods.includes(m)),
  )

  function toggleAllMethods() {
    routeForm.methods = allMethodsSelected.value ? [] : [...ALL_METHODS]
  }

  function isPluginGroupSelected(edgeUuid: string) {
    return routeForm.plugin_config_ids.indexOf(edgeUuid) !== -1
  }

  function togglePluginGroup(pg: PluginConfig) {
    const idx = routeForm.plugin_config_ids.indexOf(pg.edge_uuid ?? '')
    if (idx !== -1) {
      routeForm.plugin_config_ids.splice(idx, 1)
    } else {
      routeForm.plugin_config_ids.push(pg.edge_uuid ?? '')
    }
  }

  function viewPluginConfigDetail(pg: PluginConfig, pname: string, pcfg: unknown) {
    const configStr =
      typeof pcfg === 'object' ? JSON.stringify(pcfg, null, 2) : String(pcfg)
    Modal.info({
      title: `${pg.name} - ${pname}`,
      content: h(
        'pre',
        {
          style:
            'font-size: 12px; white-space: pre-wrap; background: #f5f5f5; padding: 12px; border-radius: 4px; max-height: 400px; overflow-y: auto;',
        },
        configStr,
      ),
      okText: '关闭',
      width: 560,
    })
  }

  // ── watch ──────────────────────────────────────────────────────────

  // Reset advanced match when toggled off
  watch(
    () => routeForm.advancedMatchEnabled,
    (newVal) => {
      if (!newVal) {
        routeForm.advancedMatch = { vars: [] }
      }
    },
  )

  // ── upstream resolution ────────────────────────────────────────────

  function getClusterUpstreams() {
    const cluster = clusters.value.find((c) => c.id === currentClusterId.value)
    return cluster?.upstreams || []
  }

  function getUpstreamName(cluster: Cluster, upstreamId: number | null) {
    if (!upstreamId || !cluster.upstreams) return '-'
    const upstream = cluster.upstreams.find((u) => u.id === upstreamId)
    return upstream?.name || '-'
  }

  // ── actions ────────────────────────────────────────────────────────

  function getActionButtonTitle(key: string) {
    const btn = allActionButtons.find((b) => b.key === key)
    return btn?.title || key
  }

  function handleRouteAction(cluster: Cluster, record: Route, action: string) {
    switch (action) {
      case 'publish':
        publishRouteByRecord(cluster, record)
        break
      case 'version':
        openRouteVersionManagementByRecord(cluster, record)
        break
      case 'copy':
        copyRouteByRecord(cluster, record)
        break
      case 'edit':
        editRouteByRecord(cluster, record)
        break
      case 'delete':
        deleteRouteByRecord(cluster, record)
        break
    }
  }

  function selectRoute(cluster: Cluster, route: Route | undefined) {
    cluster.selectedRoute = route || null
  }

  // ── load routes ────────────────────────────────────────────────────

  async function loadRoutes(cluster: Cluster) {
    cluster.routesLoading = true
    try {
      const params: Record<string, unknown> = {
        page: cluster.routesPagination?.page || 1,
        page_size: cluster.routesPagination?.pageSize || 20,
      }
      if (cluster.routesSearch) {
        params.search = cluster.routesSearch
        if (cluster.routesSearchField) {
          params.search_field = cluster.routesSearchField
        }
      }
      if (cluster.routesSortBy) {
        params.sort_by = cluster.routesSortBy
        params.sort_order = cluster.routesSortOrder
      }
      const res = await api.get(`/clusters/${cluster.id}/routes`, { params })
      cluster.routes = res.data.items
      cluster.routesPagination = {
        total: res.data.total,
        page: res.data.page,
        pageSize: res.data.page_size,
      }
    } catch {
      message.error('加载路由列表失败')
    } finally {
      cluster.routesLoading = false
    }
  }

  function handleRouteTableChange(cluster: Cluster, pag: { current: number; pageSize: number }, sorter: { field?: string; order?: string }) {
    if (cluster.routesPagination) {
      cluster.routesPagination.page = pag.current
      cluster.routesPagination.pageSize = pag.pageSize
    }
    if (sorter && sorter.field) {
      const fieldMap: Record<string, string> = {
        name: 'name',
        uri: 'uri',
        priority: 'priority',
        status: 'status',
        created_at: 'created_at',
      }
      cluster.routesSortBy = fieldMap[sorter.field] || sorter.field
      cluster.routesSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc'
    } else {
      cluster.routesSortBy = ''
      cluster.routesSortOrder = 'asc'
    }
    loadRoutes(cluster)
  }

  // ── load plugins ───────────────────────────────────────────────────

  async function loadAvailablePlugins() {
    try {
      const res = await api.get('/plugins/builtin')
      availablePlugins.value = res.data.plugins || []
    } catch {
      console.error('加载插件列表失败')
    }
  }

  // ── add / edit / copy modal ────────────────────────────────────────

  async function showAddRouteModal(cluster: Cluster) {
    await loadRoutes(cluster)
    await loadAvailablePlugins()
    editingRoute.value = null
    copyingRoute.value = false
    currentClusterId.value = cluster.id
    Object.assign(routeForm, {
      name: '',
      uri: '',
      methods: [],
      priority: 0,
      status: 1,
      upstream_id: undefined,
      description: '',
      advancedMatchEnabled: false,
      advancedMatch: { vars: [] },
      plugins: [],
      plugin_config_ids: [],
    })
    routeModalActiveTab.value = 'basic'
    if ((cluster.plugin_configs?.length ?? 0) > 0 || !cluster.plugin_configs) {
      await loadPluginConfigs(cluster)
    }
    routeModalVisible.value = true
  }

  function editRoute(cluster: Cluster) {
    if (!cluster.selectedRoute) {
      message.warning('请先选择一个路由')
      return
    }
    editRouteByRecord(cluster, cluster.selectedRoute)
  }

  async function editRouteByRecord(cluster: Cluster, route: Route) {
    await loadRoutes(cluster)
    await loadAvailablePlugins()
    await loadPluginConfigs(cluster)

    const routeData = cluster.routes?.find((r) => r.id === route.id)
    if (!routeData) {
      message.warning('路由不存在')
      return
    }

    editingRoute.value = routeData
    currentClusterId.value = cluster.id
    routeForm.name = routeData.name
    routeForm.uri = routeData.uri
    routeForm.methods = routeData.methods ? routeData.methods.split(',') : []
    routeForm.priority = routeData.priority
    routeForm.status = routeData.status
    routeForm.upstream_id = routeData.upstream_id
    routeForm.description = routeData.description || ''
    routeForm.advancedMatchEnabled = routeData.advanced_match_enabled || false
    routeForm.advancedMatch = { vars: [...(routeData.vars || [])] }
    routeForm.plugins = []
    routeForm.plugin_config_ids = (routeData as unknown as Record<string, unknown>).plugin_config_ids
      ? [...((routeData as unknown as Record<string, unknown>).plugin_config_ids as string[])]
      : []
    routeModalActiveTab.value = 'basic'

    try {
      const res = await api.get(`/clusters/${cluster.id}/routes/${routeData.id}/plugins`)
      routeForm.plugins = res.data.plugins || []
    } catch {
      console.error('加载路由插件失败:')
      message.error('加载路由插件失败，请重试')
      routeForm.plugins = []
    }
    routeModalVisible.value = true
  }

  function copyRoute(cluster: Cluster) {
    if (!cluster.selectedRoute) {
      message.warning('请先选择一个路由')
      return
    }
    copyRouteByRecord(cluster, cluster.selectedRoute)
  }

  async function copyRouteByRecord(cluster: Cluster, route: Route) {
    await loadRoutes(cluster)
    await loadAvailablePlugins()

    const routeData = cluster.routes?.find((r) => r.id === route.id)
    const sourceRoute = routeData || route

    editingRoute.value = null
    copyingRoute.value = true
    currentClusterId.value = cluster.id
    routeForm.name = `复制_${sourceRoute.name}`
    routeForm.uri = sourceRoute.uri
    routeForm.methods = sourceRoute.methods ? sourceRoute.methods.split(',') : []
    routeForm.priority = sourceRoute.priority
    routeForm.status = sourceRoute.status
    routeForm.upstream_id = sourceRoute.upstream_id
    routeForm.description = sourceRoute.description || ''
    routeForm.advancedMatchEnabled = sourceRoute.advanced_match_enabled || false
    routeForm.advancedMatch = { vars: sourceRoute.vars || [] }
    routeForm.plugins = []
    routeModalActiveTab.value = 'basic'

    try {
      const res = await api.get(`/clusters/${cluster.id}/routes/${sourceRoute.id}/plugins`)
      routeForm.plugins = res.data.plugins || []
    } catch {
      console.error('加载路由插件失败:')
      message.error('加载路由插件失败，请重试')
      routeForm.plugins = []
    }
    routeModalVisible.value = true
  }

  // ── submit ─────────────────────────────────────────────────────────

  async function handleRouteSubmit() {
    if (!currentClusterId.value) return
    try {
      await routeFormRef.value.validate()
      const payload: Record<string, unknown> = {
        name: routeForm.name,
        uri: routeForm.uri,
        methods: Array.isArray(routeForm.methods) ? routeForm.methods.join(',') : routeForm.methods,
        priority: routeForm.priority || 0,
        status: routeForm.status,
        upstream_id: routeForm.upstream_id,
        description: routeForm.description,
        advanced_match_enabled: routeForm.advancedMatchEnabled,
      }

      if (routeForm.plugin_config_ids.length > 0) {
        payload.plugin_config_ids = routeForm.plugin_config_ids
      }

      if (routeForm.advancedMatchEnabled) {
        payload.vars = routeForm.advancedMatch?.vars || []
      } else {
        payload.vars = []
      }

      let routeId: number
      if (editingRoute.value) {
        await api.put(`/clusters/${currentClusterId.value}/routes/${editingRoute.value.id}`, payload)
        routeId = editingRoute.value.id
        message.success('路由已更新')
      } else {
        const res = await api.post(`/clusters/${currentClusterId.value}/routes`, payload)
        routeId = res.data.id
        message.success('路由已添加')
      }

      await api.put(`/clusters/${currentClusterId.value}/routes/${routeId}/plugins`, {
        plugins: routeForm.plugins,
      })

      routeModalVisible.value = false
      const c = clusters.value.find((c) => c.id === currentClusterId.value)
      if (c) {
        const res = await api.get(`/clusters/${c.id}/routes`)
        c.routes = res.data.items
        c.route_count = c.routes!.length
      }
    } catch (error: unknown) {
      const err = error as Record<string, unknown>
      if (err.errorFields) {
        const firstError = (err.errorFields as Array<{ name?: unknown[] }>)?.[0]
        if (firstError?.name) {
          const fieldName = getFieldName((firstError.name as string[])[0])
          message.error(`请填写必填字段: ${fieldName}`)
        } else {
          message.error('请检查表单填写是否完整')
        }
        return
      }
      const detail = (err as { response?: { data?: { detail?: unknown; message?: string } } }).response?.data?.detail
      if (typeof detail === 'string') {
        message.error(detail)
      } else if (Array.isArray(detail)) {
        message.error(detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join('; '))
      } else if ((err as { response?: { data?: { message?: string } } }).response?.data?.message) {
        message.error((err as { response: { data: { message: string } } }).response.data.message)
      } else {
        message.error('操作失败')
      }
    }
  }

  // ── delete ─────────────────────────────────────────────────────────

  function deleteRoute(cluster: Cluster) {
    if (!cluster.selectedRoute) {
      message.warning('请先选择一个路由')
      return
    }
    deleteRouteByRecord(cluster, cluster.selectedRoute)
  }

  function deleteRouteByRecord(cluster: Cluster, route: Route) {
    showDeleteConfirm({
      title: `确定要删除路由 "${route.name}" 吗？`,
      apiEndpoint: `/clusters/${cluster.id}/routes/${route.id}`,
      nodes: cluster.nodes,
      onOk: async (deleteDb, deleteEdge, nodeIds) => {
        const logs: string[] = []
        const addLog = (text: string) => {
          logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
        }
        const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }

        const modal = Modal.info({
          title: `删除路由: ${route.name}`,
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

        addLog(`开始删除路由: ${route.name}`)
        progress.percent = 20
        updateContent()

        await new Promise((r) => setTimeout(r, 400))

        try {
          const res = await api.delete(`/clusters/${cluster.id}/routes/${route.id}`, {
            data: {
              delete_db: deleteDb,
              delete_edge: deleteEdge,
              node_ids: nodeIds.length > 0 ? nodeIds : undefined,
            },
          })
          const data = res.data as {
            results?: Array<{ scope: string; message?: string; status?: string; node?: string; error?: string }>
          }

          progress.percent = 60
          const dbResult = data.results?.find((r) => r.scope === 'database')
          if (dbResult) {
            addLog('正在从数据库删除...')
            addLog(`数据库: ${dbResult.message || '已删除'}`)
          }
          addLog('')

          const edgeResults = data.results?.filter((r) => r.scope === 'edge') || []
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
          if (edgeResults.length > 0 && !edgeResults.some((r) => r.status === 'failed')) {
            progress.status = 'success'
            addLog('✅ 删除完成!')
          } else if (edgeResults.some((r) => r.status === 'failed')) {
            progress.status = 'exception'
            addLog(`⚠️ 部分节点删除失败${deleteDb ? '（数据库已删除）' : ''}，请手动清理`)
          } else {
            progress.status = 'success'
            addLog(`✅ ${deleteDb ? '数据库已删除' : '操作完成'}`)
          }

          updateContent()

          const res2 = await api.get(`/clusters/${cluster.id}/routes`)
          cluster.routes = res2.data.items
          cluster.route_count = cluster.routes!.length
          cluster.selectedRoute = null
        } catch (error: unknown) {
          const err = error as { response?: { data?: { detail?: unknown } } }
          const detail = err.response?.data?.detail
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

  // ── publish ────────────────────────────────────────────────────────

  async function publishRoute(cluster: Cluster) {
    if (!cluster.selectedRoute) {
      message.warning('请先选择一个路由')
      return
    }
    const nodeIds = await openPublishModal(`发布路由: ${cluster.selectedRoute.name}`, cluster.id)
    if (!nodeIds.length) return

    const logs: string[] = []
    const addLog = (text: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }
    const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }

    const modal = Modal.info({
      title: `发布路由: ${cluster.selectedRoute!.name}`,
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

    addLog(`开始发布路由: ${cluster.selectedRoute!.name}`)
    progress.percent = 10
    updateContent()

    await new Promise((r) => setTimeout(r, 400))

    try {
      addLog('正在构建发布配置...')
      progress.percent = 30
      updateContent()

      const res = await api.post(
        `/clusters/${cluster.id}/routes/${cluster.selectedRoute!.id}/publish`,
        { node_ids: nodeIds },
      )
      const data = res.data as {
        status: string
        message: string
        version: number
        results?: Array<{ node: string; status: string; error?: string }>
      }
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

      await loadRoutes(cluster)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: unknown } }; message?: string }
      const errMsg = err.response?.data?.detail || err.message || '未知错误'
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 发布失败: ${errMsg}`)
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })
    }
  }

  async function publishRouteByRecord(cluster: Cluster, record: Route) {
    const nodeIds = await openPublishModal(`发布路由: ${record.name}`, cluster.id)
    if (!nodeIds.length) return

    const logs: string[] = []
    const addLog = (text: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }
    const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }

    const modal = Modal.info({
      title: `发布路由: ${record.name}`,
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

    addLog(`开始发布路由: ${record.name}`)
    progress.percent = 10
    updateContent()

    await new Promise((r) => setTimeout(r, 400))

    try {
      addLog('正在构建发布配置...')
      progress.percent = 30
      updateContent()

      const res = await api.post(`/clusters/${cluster.id}/routes/${record.id}/publish`, {
        node_ids: nodeIds,
      })
      const data = res.data as {
        status: string
        message: string
        version: number
        results?: Array<{ node: string; status: string; error?: string }>
      }
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

      await loadRoutes(cluster)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: unknown } }; message?: string }
      const errMsg = err.response?.data?.detail || err.message || '未知错误'
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 发布失败: ${errMsg}`)
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })
    }
  }

  // ── version management ─────────────────────────────────────────────

  function openRouteVersionManagement(cluster: Cluster) {
    if (!cluster.selectedRoute) {
      message.warning('请先选择一个路由')
      return
    }
    versionModalType.value = 'route'
    versionModalResourceId.value = cluster.selectedRoute.id
    versionModalClusterId.value = cluster.id
    versionModalResourceName.value = cluster.selectedRoute.name
    versionModalEdgeUuid.value = cluster.selectedRoute.edge_uuid || ''
    versionModalVisible.value = true
  }

  function openRouteVersionManagementByRecord(cluster: Cluster, record: Route) {
    versionModalType.value = 'route'
    versionModalResourceId.value = record.id
    versionModalClusterId.value = cluster.id
    versionModalResourceName.value = record.name
    versionModalEdgeUuid.value = record.edge_uuid || ''
    versionModalVisible.value = true
  }

  // ── hasPermission shortcut ─────────────────────────────────────────

  function hasPluginGroupsPermission() {
    return authStore.hasPermission?.('plugin_groups') ?? false
  }

  // ── return ─────────────────────────────────────────────────────────

  return {
    // modal / form
    routeModalVisible,
    routeModalActiveTab,
    editingRoute,
    copyingRoute,
    routeForm,
    routeFormRef,

    // column config
    allRouteColumns,
    routeColumnPopoverVisible,
    routeColumnsSelected,
    routeSearchVisible,
    routeActionsSelected,
    visibleRouteColumns,
    allActionButtons,

    // plugins
    availablePlugins,
    clusterPluginGroups,

    // methods helpers
    ALL_METHODS,
    allMethodsSelected,
    toggleAllMethods,
    isPluginGroupSelected,
    togglePluginGroup,
    viewPluginConfigDetail,

    // upstream resolution
    getClusterUpstreams,
    getUpstreamName,

    // actions
    getActionButtonTitle,
    handleRouteAction,
    selectRoute,

    // crud
    loadRoutes,
    handleRouteTableChange,
    loadAvailablePlugins,
    showAddRouteModal,
    editRoute,
    editRouteByRecord,
    copyRoute,
    copyRouteByRecord,
    handleRouteSubmit,
    deleteRoute,
    deleteRouteByRecord,

    // publish
    publishRoute,
    publishRouteByRecord,

    // version management
    openRouteVersionManagement,
    openRouteVersionManagementByRecord,

    // permissions
    hasPluginGroupsPermission,
  }
}
