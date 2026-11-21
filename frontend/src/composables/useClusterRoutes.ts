import { computed, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import type { Cluster, Route } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { useColumnConfig, resolveOrderedColumns, applyColumnWidths } from './useColumnConfig'
import { useClusterResource } from './useClusterResource'
import { publishStatusRender } from './useClusterUtils'

// ── column / action definitions ────────────────────────────────────────

// 默认列宽档（cluster-tab-column-personalization D6）：fixed 布局下无宽列被剩余空间均分，
// 长内容列（URI/描述）会压到不可读，故逐列给档；用户拖拽宽度经 applyColumnWidths 覆盖。
const allRouteColumns = [
  { title: '名称', dataIndex: 'name', key: 'name', width: 160, sorter: true, ellipsis: true },
  { title: 'URI', dataIndex: 'uri', key: 'uri', width: 200, sorter: true, ellipsis: true },
  { title: '方法', dataIndex: 'methods', key: 'methods', width: 110 },
  { title: '上游', dataIndex: 'upstream_id', key: 'upstream_id', width: 140 },
  { title: '优先级', dataIndex: 'priority', key: 'priority', width: 90, sorter: true },
  { title: '状态', key: 'status', width: 100, sorter: true },
  {
    title: '发布状态',
    key: 'publish_status',
    // 200（发布状态列宽方案 A）：partial 态标签 ~170px + ▾ 预览按钮 23px，140 曾裁掉按钮
    width: 220,
    customRender: ({ record }: { record: Route }) =>
      publishStatusRender(record.current_version ?? null, record.published_at ?? null),
  },
  { title: '高级匹配', dataIndex: 'advanced_match_enabled', key: 'advanced_match_enabled', width: 110 },
  { title: '描述', dataIndex: 'description', key: 'description', width: 200, ellipsis: true },
  // 操作列只承载「发布 + ⋯」两颗控件（parity 批 B 行内动作收敛），宽度回设计值 110
  { title: '操作', key: 'actions', width: 110 },
]

const allActionButtons = [
  { key: 'publish', title: '发布' },
  { key: 'version', title: '版本管理' },
  { key: 'copy', title: '复制' },
  { key: 'edit', title: '编辑' },
  { key: 'delete', title: '删除' },
]

// ── external dependency types ──────────────────────────────────────────

interface RouteComposableDeps {
  /** B1 后表单在共享 RouteFormModal，二者不再被本 composable 消费（保留以兼容调用方传参） */
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

  /** B1 后表单在共享 RouteFormModal（自行加载插件组），不再被本 composable 消费 */
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
  // 表单已迁至共享组件 RouteFormModal（B1）：clusters / currentClusterId / loadPluginConfigs
  // 曾只被原表单回填与提交使用，现已无消费点；保留在 deps 类型里以兼容调用方传参，不再解构。
  const {
    openPublishModal,
    showDeleteConfirm,
    versionModalVisible,
    versionModalType,
    versionModalResourceId,
    versionModalClusterId,
    versionModalResourceName,
    versionModalEdgeUuid,
  } = deps

  const authStore = useAuthStore()

  // ── 通用骨架：load/select/delete/publish/version 十件套 ─────────────

  const core = useClusterResource<Route>(
    {
      noun: '路由',
      endpoint: 'routes',
      versionType: 'route',
      keys: {
        items: 'routes',
        pagination: 'routesPagination',
        loading: 'routesLoading',
        search: 'routesSearch',
        searchField: 'routesSearchField',
        sortBy: 'routesSortBy',
        sortOrder: 'routesSortOrder',
        selected: 'selectedRoute',
        selectedKeys: 'selectedRouteKeys',
      },
      sortFieldMap: {
        name: 'name',
        uri: 'uri',
        priority: 'priority',
        status: 'status',
        created_at: 'created_at',
      },
      deleteGuard: (_cluster, route) => (isDnsRoute(route) ? '这是一条 DNS 查询路由，请在 DNS 查询页面管理' : null),
      batchFilter: (_cluster, routes) => {
        const dnsRoute = hasDnsRouteIn(routes)
        if (dnsRoute) {
          message.warning(`路由 "${dnsRoute.name}" 是 DNS 查询路由，请在 DNS 查询页面管理`)
          return null
        }
        return routes
      },
      batchResourceKey: { field: 'route_ids', label: '路由', nameField: 'route_name' },
    },
    {
      openPublishModal,
      showDeleteConfirm,
      versionModal: {
        type: versionModalType,
        visible: versionModalVisible,
        resourceId: versionModalResourceId,
        clusterId: versionModalClusterId,
        resourceName: versionModalResourceName,
        edgeUuid: versionModalEdgeUuid,
      },
    },
  )

  const loadRoutes = core.load
  const handleRouteTableChange = core.handleTableChange
  const selectRoute = core.selectOne
  const selectRoutes = core.selectMany
  const deleteRouteByRecord = core.deleteByRecord
  const deleteRoutes = core.deleteMany
  const publishRoute = core.publishSelected
  const publishRouteByRecord = core.publishByRecord
  const openRouteVersionManagement = core.openVersionManagement
  const openRouteVersionManagementByRecord = core.openVersionManagementByRecord

  function getActionButtonTitle(key: string) {
    return core.getActionButtonTitle(key, allActionButtons)
  }

  // ── column / search config ──────────────────────────────────────────

  const routeCfg = useColumnConfig({
    key: 'route',
    // 设计页（central.html 路由列）默认含 方法 / 描述：与节点页同口径，列配置可取消勾选
    defaultColumns: ['name', 'uri', 'methods', 'priority', 'publish_status', 'description', 'actions'],
    allColumns: allRouteColumns.map((c) => String(c.key)),
    defaultSearchVisible: true,
    defaultActions: ['copy', 'edit', 'delete', 'publish', 'version'],
  })
  const routeColumnPopoverVisible = routeCfg.popoverVisible
  const routeColumnsSelected = routeCfg.columnsSelected
  const routeSearchVisible = routeCfg.searchVisible
  const routeActionsSelected = routeCfg.actionsSelected
  const routeColumnWidths = routeCfg.columnWidths
  const setRouteColumnWidth = routeCfg.setColumnWidth
  const resetRouteColumnWidths = routeCfg.resetWidths
  const routeColumnOrder = routeCfg.columnOrder
  const setRouteColumnOrder = routeCfg.setColumnOrder

  // 顺序/宽度个性化（cluster-tab-column-personalization）：存储顺序重排 → 显隐过滤 → 宽度覆盖
  const orderedRouteColumns = computed(() => resolveOrderedColumns(allRouteColumns, routeColumnOrder.value))
  const visibleRouteColumns = computed(() => {
    const selected = new Set(routeColumnsSelected.value)
    return applyColumnWidths(
      orderedRouteColumns.value.filter((col) => selected.has(col.key)),
      routeColumnWidths.value,
    )
  })

  // ── upstream resolution ────────────────────────────────────────────

  function getUpstreamName(cluster: Cluster, upstreamId: number | null) {
    if (!upstreamId || !cluster.upstreams) return '-'
    const upstream = cluster.upstreams.find((u) => u.id === upstreamId)
    return upstream?.name || '-'
  }

  // ── actions ────────────────────────────────────────────────────────

  function handleRouteAction(cluster: Cluster, record: Route, action: string) {
    switch (action) {
      case 'publish':
        publishRouteByRecord(cluster, record)
        break
      case 'version':
        openRouteVersionManagementByRecord(cluster, record)
        break
      case 'delete':
        deleteRouteByRecord(cluster, record)
        break
    }
  }

  function isDnsRoute(record: Route): boolean {
    return Array.isArray(record.plugins) && record.plugins.some((p) => p.plugin_name === 'dns_upstream')
  }

  function hasDnsRouteIn(records: Route[]): Route | undefined {
    return records.find(isDnsRoute)
  }

  // ── delete ─────────────────────────────────────────────────────────

  function deleteRoute(cluster: Cluster) {
    const selected = core.requireSelected(cluster)
    if (!selected) return
    deleteRouteByRecord(cluster, selected)
  }

  // ── hasPermission shortcut ─────────────────────────────────────────

  function hasPluginGroupsPermission() {
    return authStore.hasPermission?.('plugin_groups') ?? false
  }

  // ── return ──
  // 表单态/提交/校验/发布引导与插件选择器已随共享 RouteFormModal 迁出
  // （B1，见 docs/refactoring/shared-core-plan-2026-11-21.md 3.1）
  return {
    // column config
    allRouteColumns,
    routeColumnPopoverVisible,
    routeColumnsSelected,
    routeSearchVisible,
    routeActionsSelected,
    routeColumnWidths,
    setRouteColumnWidth,
    resetRouteColumnWidths,
    routeColumnOrder,
    setRouteColumnOrder,
    orderedRouteColumns,
    visibleRouteColumns,
    allActionButtons,

    // upstream resolution
    getUpstreamName,

    // actions
    getActionButtonTitle,
    handleRouteAction,
    selectRoute,
    selectRoutes,
    isDnsRoute,

    // crud
    loadRoutes,
    handleRouteTableChange,
    deleteRoute,
    deleteRouteByRecord,
    deleteRoutes,

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
