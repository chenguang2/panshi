import { ref, reactive, computed, watch, h, type Ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Route, RoutePlugin, Plugin, PluginConfig } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { useColumnConfig } from './useColumnConfig'
import { executePublish, executeDeleteWithProgress, publishStatusRender, formatPublishDateTime } from './useClusterUtils'

// ── helpers ────────────────────────────────────────────────────────────

const ALL_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']

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

  /** Shared plugin list — if not provided, composable loads its own */
  availablePlugins?: Ref<Plugin[]>
  loadAvailablePlugins?: () => Promise<void>

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

  const routeCfg = useColumnConfig({
    key: 'route',
    defaultColumns: ['name', 'uri', 'publish_status', 'priority', 'actions'],
    defaultSearchVisible: true,
    defaultActions: ['copy', 'edit', 'delete', 'publish', 'version'],
  })
  const routeColumnPopoverVisible = routeCfg.popoverVisible
  const routeColumnsSelected = routeCfg.columnsSelected
  const routeSearchVisible = routeCfg.searchVisible
  const routeActionsSelected = routeCfg.actionsSelected

  const visibleRouteColumns = computed(() => {
    const selected = new Set(routeColumnsSelected.value)
    return allRouteColumns.filter((col) => selected.has(col.key))
  })

  // ── plugins ─────────────────────────────────────────────────────────

  const _localPlugins = ref<Plugin[]>([])
  const availablePlugins = deps.availablePlugins ?? _localPlugins
  const loadAvailablePlugins = deps.loadAvailablePlugins ?? (async () => {
    const res = await api.get('/plugins/builtin')
    _localPlugins.value = res.data.plugins || []
  })

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
            'font-size: 12px; white-space: pre-wrap; background: var(--bg); padding: 12px; border-radius: 4px; max-height: 400px; overflow-y: auto; color: var(--fg);',
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
    routeForm.advancedMatch = { vars: [...(routeData.vars || [])] }
    routeForm.advancedMatchEnabled = !!(
      routeData.advanced_match_enabled ||
      (routeForm.advancedMatch.vars.length > 0)
    )
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
    routeForm.advancedMatch = { vars: sourceRoute.vars || [] }
    routeForm.advancedMatchEnabled = !!(
      sourceRoute.advanced_match_enabled ||
      (routeForm.advancedMatch.vars.length > 0)
    )
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

      payload.plugin_config_ids = routeForm.plugin_config_ids

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
        await executeDeleteWithProgress({
          title: `删除路由: ${route.name}`,
          apiEndpoint: `/clusters/${cluster.id}/routes/${route.id}`,
          cluster,
          deleteDb,
          deleteEdge,
          nodeIds,
          refreshFn: () => loadRoutes(cluster),
          clearSelectedFn: () => { cluster.selectedRoute = null },
        })
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

    await executePublish({
      title: `发布路由: ${cluster.selectedRoute.name}`,
      apiEndpoint: `/clusters/${cluster.id}/routes/${cluster.selectedRoute.id}/publish`,
      nodeIds,
      refreshFn: () => loadRoutes(cluster),
    })
  }

  async function publishRouteByRecord(cluster: Cluster, record: Route) {
    const nodeIds = await openPublishModal(`发布路由: ${record.name}`, cluster.id)
    if (!nodeIds.length) return

    await executePublish({
      title: `发布路由: ${record.name}`,
      apiEndpoint: `/clusters/${cluster.id}/routes/${record.id}/publish`,
      nodeIds,
      refreshFn: () => loadRoutes(cluster),
    })
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
