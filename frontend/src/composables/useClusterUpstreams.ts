import { computed, h, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Upstream, Route } from '@/types'
import { useColumnConfig, resolveOrderedColumns, applyColumnWidths } from './useColumnConfig'
import { useClusterResource } from './useClusterResource'
import { showDeleteConfirm, buildDeleteProgressContent, publishStatusRender } from '@/composables/useClusterUtils'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import { formatPublishDateTime } from '@/utils/format'
import { PAGE_SIZE_DROPDOWN } from '@/constants'

const getLoadBalanceLabel = (value: string): string => {
  const labels: Record<string, string> = {
    weighted_roundrobin: '加权轮询',
    chash: '一致性哈希',
    ewma: '延迟最小',
    least_conn: '最少连接',
  }
  return labels[value] || value
}

export function useClusterUpstreams(options: {
  clusters?: Ref<Cluster[]>
  versionModalVisible: Ref<boolean>
  versionModalType: Ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>
  versionModalResourceId: Ref<number | null>
  versionModalClusterId: Ref<number | null>
  versionModalResourceName: Ref<string>
  versionModalEdgeUuid: Ref<string>
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
}) {
  // 表单已迁至共享组件 UpstreamFormModal（B1）：options.clusters 仅被原表单提交/回填使用，
  // 现已无消费点；保留在 options 类型里以兼容调用方传参，不再解构。
  const {
    versionModalVisible,
    versionModalType,
    versionModalResourceId,
    versionModalClusterId,
    versionModalResourceName,
    versionModalEdgeUuid,
    openPublishModal,
  } = options

  // ── 通用骨架：load/select/delete/publish/version 十件套 ─────────────

  const core = useClusterResource<Upstream>(
    {
      noun: '上游',
      endpoint: 'upstreams',
      versionType: 'upstream',
      keys: {
        items: 'upstreams',
        pagination: 'upstreamsPagination',
        loading: 'upstreamsLoading',
        search: 'upstreamsSearch',
        searchField: 'upstreamsSearchField',
        sortBy: 'upstreamsSortBy',
        sortOrder: 'upstreamsSortOrder',
        selected: 'selectedUpstream',
        selectedKeys: 'selectedUpstreamKeys',
      },
      sortFieldMap: {
        name: 'name',
        load_balance: 'load_balance',
        description: 'description',
        created_at: 'created_at',
      },
      deleteGuard: async (cluster, upstream) => {
        // Ensure routes are loaded to check for linked routes
        if (!cluster.routes || cluster.routes.length === 0) {
          try {
            const res = await api.get(`/clusters/${cluster.id}/routes`, {
              params: { page: 1, page_size: PAGE_SIZE_DROPDOWN },
            })
            cluster.routes = res.data.items
          } catch {
            // If we can't load routes, continue (the API delete will catch issues)
          }
        }
        const linkedRoutes = (cluster.routes || []).filter((r: Route) => r.upstream_id === upstream.id)
        if (linkedRoutes.length > 0) {
          const routeNames = linkedRoutes.map((r: Route) => r.name).join(', ')
          return `该上游已被路由 "${routeNames}" 引用，请先删除这些路由`
        }
        return null
      },
      deleteGuardLevel: 'error',
      batchFilter: async (cluster, upstreams) => {
        if (!cluster.routes || cluster.routes.length === 0) {
          try {
            const res = await api.get(`/clusters/${cluster.id}/routes`, {
              params: { page: 1, page_size: PAGE_SIZE_DROPDOWN },
            })
            cluster.routes = res.data.items
          } catch {
            // 加载失败时放弃前端守卫，交给后端拦截
          }
        }
        const referenced = upstreams.filter((u) => (cluster.routes || []).some((r) => r.upstream_id === u.id))
        if (referenced.length > 0) {
          const names = referenced.map((u) => u.name).join('、')
          message.warning(`上游 "${names}" 已被路由引用，已跳过删除，请先删除引用路由`)
        }
        const deletable = upstreams.filter((u) => !(cluster.routes || []).some((r) => r.upstream_id === u.id))
        return deletable.length > 0 ? deletable : null
      },
      batchResourceKey: { field: 'upstream_ids', label: '上游', nameField: 'upstream_name' },
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

  const loadUpstreams = core.load
  const handleUpstreamTableChange = core.handleTableChange
  const selectUpstream = core.selectOne
  // 勾选同步单选（4.1/D8）：恰好 1 行且 rows[0] 存在时写 selectedUpstream（工具栏单选操作即时可用）；
  // rows[0] 缺失（跨页勾选时 rows 可能只含当前页行）时**不写**单选——维持原值、单选按钮禁用；
  // 0 或 ≥2 行清空单选。不用 core.selectMany：其对 rows[0] 缺失场景会误写 null。
  const selectUpstreams = (cluster: Cluster, keys: Array<string | number>, rows: Upstream[]) => {
    cluster.selectedUpstreamKeys = keys as number[]
    if (keys.length === 1) {
      if (rows.length > 0 && rows[0]) {
        cluster.selectedUpstream = rows[0]
      }
    } else {
      cluster.selectedUpstream = null
    }
  }
  const deleteUpstream = core.deleteSelected
  const deleteUpstreamByRecord = core.deleteByRecord
  const deleteUpstreams = core.deleteMany
  const publishUpstream = core.publishSelected
  const publishUpstreamByRecord = core.publishByRecord
  const openUpstreamVersionManagement = core.openVersionManagement
  const openUpstreamVersionManagementByRecord = core.openVersionManagementByRecord

  const allUpstreamColumns = [
    // 默认宽档（cluster-tab-column-personalization D6）：fixed 布局下无宽列被均分，补档保证可读
    { title: '名称', dataIndex: 'name', key: 'name', width: 180, ellipsis: true, sorter: true },
    {
      title: '负载均衡',
      dataIndex: 'load_balance',
      key: 'load_balance',
      width: 110,
      sorter: true,
      customRender: ({ text }: { text: string }) => getLoadBalanceLabel(text),
    },
    { title: '目标节点', key: 'targets', width: 220 },
    { title: '描述', dataIndex: 'description', key: 'description', width: 220, ellipsis: true, sorter: true },
    {
      title: '发布状态',
      key: 'publish_status',
      // 200（发布状态列宽方案 A）：partial 态标签 ~170px + ▾ 预览按钮 23px，
      // 定宽 140 曾把按钮裁没；配合 status-cell-flex（nowrap）防标签与按钮分离
      width: 220,
      customRender: ({ record }: { record: Record<string, unknown> }) =>
        // 四态标签：pending_publish/last_publish_status 由后端列表响应推导（2.7，前端不做本地推导）
        h(PublishStatusTag, {
          version: (record.current_version as number | undefined) ?? null,
          publishedAt: (record.published_at as string | undefined) ?? null,
          pending: record.pending_publish === true,
          lastPublishStatus: (record.last_publish_status as string | null | undefined) ?? null,
        }),
    },
    { title: '操作', key: 'actions', width: 120 },
  ]

  const upstreamCfg = useColumnConfig({
    key: 'upstream',
    defaultColumns: ['name', 'load_balance', 'targets', 'publish_status', 'description', 'actions'],
    allColumns: allUpstreamColumns.map((c) => String(c.key)),
    defaultSearchVisible: true,
    defaultActions: ['copy', 'edit', 'delete', 'publish', 'version'],
  })
  const upstreamColumnPopoverVisible = upstreamCfg.popoverVisible
  const upstreamColumnsSelected = upstreamCfg.columnsSelected
  const upstreamSearchVisible = upstreamCfg.searchVisible
  const upstreamActionsSelected = upstreamCfg.actionsSelected
  const upstreamColumnWidths = upstreamCfg.columnWidths
  const setUpstreamColumnWidth = upstreamCfg.setColumnWidth
  const resetUpstreamColumnWidths = upstreamCfg.resetWidths
  const upstreamColumnOrder = upstreamCfg.columnOrder
  const setUpstreamColumnOrder = upstreamCfg.setColumnOrder

  const allUpstreamActionButtons = [
    { key: 'copy', title: '复制' },
    { key: 'edit', title: '编辑' },
    { key: 'delete', title: '删除' },
    { key: 'publish', title: '发布' },
    { key: 'version', title: '版本管理' },
  ]

  // 顺序/宽度个性化（cluster-tab-column-personalization）：存储顺序重排 → 显隐过滤 → 宽度覆盖
  const orderedUpstreamColumns = computed(() => resolveOrderedColumns(allUpstreamColumns, upstreamColumnOrder.value))
  const visibleUpstreamColumns = computed(() => {
    const selected = new Set(upstreamColumnsSelected.value)
    return applyColumnWidths(
      orderedUpstreamColumns.value.filter((col) => selected.has(col.key)),
      upstreamColumnWidths.value,
    )
  })

  // ── Helpers ──
  const getUpstreamName = (cluster: Cluster, upstreamId: number | null): string => {
    if (!upstreamId || !cluster.upstreams) return '-'
    const upstream = cluster.upstreams.find((u: Upstream) => u.id === upstreamId)
    return upstream?.name || '-'
  }

  const getUpstreamActionButtonTitle = (key: string): string => {
    return core.getActionButtonTitle(key, allUpstreamActionButtons)
  }

  // 行内动作分发（发布/版本管理/删除）。复制与编辑已由宿主经共享 UpstreamFormModal 承接（B1），
  // 故此处不再处理 'copy' / 'edit'（宿主在调用本函数前已拦截这两个动作）。
  const handleUpstreamAction = (cluster: Cluster, record: Upstream, action: string) => {
    switch (action) {
      case 'publish':
        publishUpstreamByRecord(cluster, record)
        break
      case 'version':
        openUpstreamVersionManagementByRecord(cluster, record)
        break
      case 'delete':
        deleteUpstreamByRecord(cluster, record)
        break
    }
  }

  // ── Return everything ──
  // 表单态/提交/校验/误关保护已随共享 UpstreamFormModal 迁出（B1，见 docs/refactoring/shared-core-plan-2026-11-21.md 3.1）
  return {
    // Column / display state
    allUpstreamColumns,
    upstreamColumnPopoverVisible,
    upstreamColumnsSelected,
    upstreamSearchVisible,
    allUpstreamActionButtons,
    upstreamActionsSelected,
    upstreamColumnWidths,
    setUpstreamColumnWidth,
    resetUpstreamColumnWidths,
    upstreamColumnOrder,
    setUpstreamColumnOrder,
    orderedUpstreamColumns,
    visibleUpstreamColumns,

    // Core functions
    loadUpstreams,
    handleUpstreamTableChange,
    selectUpstream,
    selectUpstreams,

    // Delete
    deleteUpstream,
    deleteUpstreamByRecord,
    deleteUpstreams,

    // Publish
    publishUpstream,
    publishUpstreamByRecord,

    // Version management
    openUpstreamVersionManagement,
    openUpstreamVersionManagementByRecord,

    // Helpers
    getUpstreamName,
    getUpstreamActionButtonTitle,
    handleUpstreamAction,
    getLoadBalanceLabel,

    // Shared utilities (used by delete/publish progress)
    buildDeleteProgressContent,
    publishStatusRender,
    formatPublishDateTime,
  }
}
