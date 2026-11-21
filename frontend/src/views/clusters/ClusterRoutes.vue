<template>
  <div class="tab-content">
    <!-- Toolbar：设计工具栏只留「添加路由」+ 右端「列配置」；批量删除在行内动作收敛到 ⋯ 菜单后
         仍需要工具条入口（多选场景），单条复制/编辑/发布/版本管理只在行内 -->
    <div class="node-actions">
      <a-button size="small" type="primary" @click="openRouteForm(null)">
        <StrokeIcon name="plus" :size="13" /> 添加路由
      </a-button>
      <a-tooltip :title="dnsInSelection ? DNS_ROUTE_HINT : undefined" placement="top">
        <a-button size="small" danger :disabled="!deleteEnabled" @click="handleDeleteClick"
          >删除路由{{ deleteCount > 0 ? `(${deleteCount})` : '' }}</a-button
        >
      </a-tooltip>

      <div class="toolbar-right">
        <ColumnConfigPopover
          v-model:open="routeColumnPopoverVisible"
          :all-columns="allRouteColumns"
          v-model:columns="routeColumnsSelected"
          :all-actions="allActionButtons"
          v-model:actions="routeActionsSelected"
          v-model:search="routeSearchVisible"
          width-resettable
          @reset-widths="handleResetRouteColumnWidths"
        />
        <template v-if="routeSearchVisible">
          <SearchInput
            v-model="cluster.routesSearch"
            placeholder="搜索路由"
            :width="150"
            size="small"
            @search="
              () => {
                cluster.routesPagination!.page = 1
                cluster.selectedRouteKeys = []
                cluster.selectedRoute = null
                loadRoutes(cluster)
              }
            "
          />
          <a-select
            v-model:value="cluster.routesSearchField"
            placeholder="字段"
            style="width: 90px"
            allow-clear
            size="small"
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="name">名称</a-select-option>
            <a-select-option value="uri">URI</a-select-option>
          </a-select>
        </template>
      </div>
    </div>

    <!-- Route table -->
    <a-table
      :columns="routeTableColumns"
      :data-source="cluster.routes || []"
      :pagination="false"
      :loading="cluster.routesLoading"
      :row-selection="{
        selectedRowKeys: cluster.selectedRouteKeys || [],
        preserveSelectedRowKeys: true,
        columnWidth: 40,
        getCheckboxProps: (record: any) => ({ disabled: isDnsRoute(record) }),
        onChange: (keys: any, rows: any) => selectRoutes(cluster, keys, rows),
      }"
      :custom-row="
        (record: any) => ({
          onClick: () => {
            toggleRouteSelection(record)
          },
        })
      "
      :row-class-name="routeRowClassName"
      :showSorterTooltip="false"
      :scroll="{ x: 1036 }"
      :table-layout="'fixed'"
      size="small"
      row-key="id"
      class="node-table route-table grid-table"
      @change="(_pag: any, _filters: any, sorter: any) => handleRouteSortChange(cluster, sorter)"
    >
      <template #emptyText>
        <EmptyState title="暂无路由" description="添加第一条路由，将流量按规则转发到上游">
          <a-button size="small" type="primary" @click="openRouteForm(null)">添加路由</a-button>
        </EmptyState>
      </template>
      <template #headerCell="{ column, title }">
        <!-- 序号列：恒展示、不可拖拽（不进列配置） -->
        <span v-if="column.key === 'index'">{{ title }}</span>
        <span
          v-else
          class="th-resize-wrap"
          :class="routeColumnWrapClass(column)"
          @mousedown="startColumnMove($event, column)"
        >
          <span>{{ title }}</span>
          <span class="col-resize-handle" @mousedown="startColumnResize($event, column)" />
        </span>
      </template>
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'index'">
          <span class="c-idx">{{ rowIndexLabel(cluster, index) }}</span>
        </template>
        <template v-if="column.key === 'upstream_id'">
          {{ getUpstreamName(cluster, record.upstream_id) }}
        </template>
        <template v-if="column.key === 'methods'">
          <span class="method-cell" :title="methodTitle(record.methods)">
            <span v-for="m in methodPreview(record.methods)" :key="m" class="m-tag" :class="m">{{ m }}</span>
            <span v-if="methodList(record.methods).length === 0" class="dim">—</span>
          </span>
        </template>
        <template v-if="column.key === 'advanced_match_enabled'">
          <a-tag :color="record.advanced_match_enabled ? 'green' : 'default'">
            {{ record.advanced_match_enabled ? '是' : '否' }}
          </a-tag>
        </template>
        <template v-if="column.key === 'status'">
          <BadgeStatus
            :text="record.status === 1 ? '正常' : '禁用'"
            :status="record.status === 1 ? 'online' : 'offline'"
          />
        </template>
        <!-- 发布状态（组4 4.3）：覆盖 composable 的 customRender（三分支），透传 pending 升级为四态 -->
        <template v-else-if="column.key === 'publish_status'">
          <span class="status-cell-flex">
            <PublishStatusTag
              :version="record.current_version"
              :published-at="record.published_at"
              :pending="record.pending_publish === true"
              :last-publish-status="record.last_publish_status ?? null"
            />
            <PublishDiffButton
              :pending="record.pending_publish === true"
              :last-publish-status="record.last_publish_status ?? null"
              @click="openPublishPreview(record)"
            />
          </span>
        </template>
        <template v-if="column.key === 'actions'">
          <!-- 行内动作收敛（parity 批 B / 设计 .ops）：主行动「发布」+ ⋯ 三栏菜单；
               7.9 DNS 行：发布与菜单一并禁用 + tooltip 指路（菜单条目整组 disabled，见 routeMenuGroupsFor） -->
          <div class="action-cell">
            <a-tooltip :title="isDnsRoute(record) ? DNS_ROUTE_HINT : undefined" placement="top">
              <button
                v-if="isDnsRoute(record) || routeActionsSelected.includes('publish')"
                type="button"
                class="op-pub"
                :disabled="isDnsRoute(record)"
                @click="handleRouteRowAction(cluster, record, 'publish')"
              >
                发布
              </button>
            </a-tooltip>
            <a-tooltip :title="isDnsRoute(record) ? DNS_ROUTE_HINT : undefined" placement="top">
              <a-dropdown
                v-if="routeMenuGroupsFor(record).length > 0"
                :trigger="['click']"
                :disabled="isDnsRoute(record)"
              >
                <a-button
                  type="text"
                  size="small"
                  class="action-trigger-btn"
                  title="更多操作"
                  :disabled="isDnsRoute(record)"
                  aria-label="更多操作"
                >
                  <StrokeIcon name="dots" />
                </a-button>
                <!-- 三栏结构（#81）：CRUD → 危险 → 动作；分组/顺序/空栏剔除/整组禁用由
                     utils/resourceActionMenu 统一构建，栏间分隔线由遍历序号决定（首栏不画）。
                     注释必须在 overlay 槽外：antd Dropdown 取 overlay 槽第一个 vnode，
                     槽内前导注释会让整个菜单渲染为空 -->
                <template #overlay>
                  <a-menu class="l5-action-menu">
                    <template v-for="(group, gi) in routeMenuGroupsFor(record)" :key="group.key">
                      <a-menu-divider v-if="gi > 0" />
                      <a-menu-item
                        v-for="item in group.items"
                        :key="item.key"
                        :danger="item.danger"
                        :disabled="item.disabled"
                        @click="handleRouteRowAction(cluster, record, item.key)"
                      >
                        <div v-if="item.desc" class="menu-item-stack">
                          <span>{{ item.title }}</span>
                          <small>{{ item.desc }}</small>
                        </div>
                        <template v-else>{{ item.title }}</template>
                      </a-menu-item>
                    </template>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-tooltip>
          </div>
        </template>
      </template>
    </a-table>

    <!-- 表外分页条（components/ListPager.vue）：a-table 分页关闭，服务端分页由本组件承担 -->
    <ListPager
      :page="cluster.routesPagination?.page ?? 1"
      :page-size="cluster.routesPagination?.pageSize ?? 20"
      :total="cluster.routesPagination?.total ?? 0"
      unit="条路由"
      @change="onRoutePageChange"
    />

    <!-- B1 表单共用（cluster-shared-core-plan 3.1）：路由表单统一走共享 RouteFormModal，
         提交/校验/误关保护/保存后发布引导全在组件内；面板只负责关闭 + 列表刷新 + 发布链路对接。
         面板只有一个集群：传单元素清单 + defaultClusterId 预选，集群选择在编辑态由组件既有逻辑禁用；
         请求方法为组件现形态（胶囊 chips，不再是下拉多选）。 -->
    <RouteFormModal
      :visible="formVisible"
      :editing-route="editingRoute"
      :copying-route="copyingRoute"
      :clusters="formClusters"
      :default-cluster-id="props.cluster.id"
      lock-cluster
      @close="closeForm"
      @saved="onFormSaved"
      @publish-requested="onFormPublishRequested"
    />

    <!-- Version management modal -->
    <VersionManagementModal
      v-model:open="versionModalVisible"
      :resource-type="versionModalType"
      :resource-id="versionModalResourceId"
      :cluster-id="versionModalClusterId"
      :resource-name="versionModalResourceName"
      :edge-uuid="versionModalEdgeUuid"
      :can-publish="true"
      @published="onVersionPublished"
      @publish-requested="handleVmPublishRequested"
    />

    <!-- 发布差异预览（publish-diff-preview）：自持拉取；「去发布」接既有发布流程 -->
    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="props.cluster.id"
      :resource-type="'route'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.name"
      @publish="onPreviewPublish"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, toValue, type Ref } from 'vue'
import type { Cluster, Route } from '@/types'
import { useClusterRoutes } from '@/composables/useClusterRoutes'
import { useColumnDragColumns } from '@/composables/useColumnDragColumns'
import { message } from 'ant-design-vue'
import BadgeStatus from '@/components/BadgeStatus.vue'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import RouteFormModal from '@/components/RouteFormModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import ColumnConfigPopover from '@/components/ColumnConfigPopover.vue'
import ListPager from '@/components/ListPager.vue'
import SearchInput from '@/components/SearchInput.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import { buildResourceActionMenu, type ResourceMenuGroup } from '@/utils/resourceActionMenu'

const props = defineProps<{
  cluster: Cluster
  clusters: Cluster[]
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
}>()

// ── Internal refs for composable deps ───────────────────────────────
const currentClusterId = ref<number | null>(null) as Ref<number | null>

// 发布差异预览（publish-diff-preview）：预览弹窗自持拉取；「去发布」接既有发布流程
const previewVisible = ref(false)
const previewRecord = ref<Route | null>(null)

function openPublishPreview(record: Route) {
  previewRecord.value = record
  previewVisible.value = true
}

function onPreviewPublish() {
  const record = previewRecord.value
  previewVisible.value = false
  if (record) publishRouteByRecord(props.cluster, record)
}

const versionModalVisible = ref(false)
const versionModalType = ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>('route')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

// ── B1 表单共用（cluster-shared-core-plan 3.1）：表单状态由面板自持（与集群子页 ClusterGlobalRules 同构），
//    提交/校验/误关保护全在共享 RouteFormModal 内；composable 的表单态不再驱动面板表单。 ──
const formVisible = ref(false)
const editingRoute = ref<Route | null>(null)
const copyingRoute = ref(false)
/** 面板只有当前集群：单元素清单（组件内 ClusterSelect 编辑态禁用，add 态仅一个可选项） */
const formClusters = computed(() => [
  { id: props.cluster.id, name: props.cluster.name, display_name: props.cluster.display_name },
])

/** 表单以「编辑源记录」为唯一入参：复制 = editingRoute 有值 + copyingRoute 置位（组件内改名「复制_xxx」） */
function openRouteForm(record: Route | null, copy = false) {
  editingRoute.value = record
  copyingRoute.value = copy && record != null
  formVisible.value = true
}

function closeForm() {
  formVisible.value = false
  editingRoute.value = null
  copyingRoute.value = false
}

/** 保存成功（组件已 emit saved + close）：刷新该集群路由列表，使「待发布」标签立即可见 */
async function onFormSaved() {
  closeForm()
  await loadRoutes(props.cluster)
}

/** 保存后发布引导「立即发布」→ 复用既有发布链路（publishByRecord：发布确认选节点，不自动发布） */
function onFormPublishRequested(payload: {
  clusterId: number
  routeId: number | null
  name: string
  currentVersion: number | null
}) {
  if (payload.routeId == null) return
  void publishRouteByRecord(props.cluster, {
    id: payload.routeId,
    name: payload.name,
    current_version: payload.currentVersion ?? undefined,
  } as Route)
}

/** 行内 ⋯ 菜单入口：编辑/复制由面板本地表单承接，其余（发布/版本/删除）仍走 composable 单一实现 */
function handleRouteRowAction(cluster: Cluster, record: Route, action: string) {
  if (action === 'edit' || action === 'copy') {
    openRouteForm(record, action === 'copy')
    return
  }
  handleRouteAction(cluster, record, action)
}

// ── Composable ──────────────────────────────────────────────────────
const {
  allRouteColumns,
  routeColumnPopoverVisible,
  routeColumnsSelected,
  routeColumnWidths,
  setRouteColumnWidth,
  resetRouteColumnWidths,
  setRouteColumnOrder,
  orderedRouteColumns,
  routeSearchVisible,
  routeActionsSelected,
  visibleRouteColumns,
  allActionButtons,
  getUpstreamName,
  handleRouteAction,
  selectRoutes,
  isDnsRoute,
  loadRoutes,
  handleRouteTableChange,
  deleteRoute,
  deleteRoutes,
  publishRouteByRecord,
} = useClusterRoutes({
  clusters: computed(() => props.clusters),
  currentClusterId,
  openPublishModal: props.openPublishModal,
  showDeleteConfirm: props.showDeleteConfirm,
  loadPluginConfigs: props.loadPluginConfigs,
  versionModalVisible,
  versionModalType,
  versionModalResourceId,
  versionModalClusterId,
  versionModalResourceName,
  versionModalEdgeUuid,
})

// ── 列拖拽手势共享 composable（cluster-tab-column-personalization 4.2）──
// 几何按拖拽起点所在表解析（D2）；name/actions 为锚点不参与移动（路由 name 兼作 sorter 抑制基准）。
const {
  wrapClass: routeColumnWrapClass,
  startColumnResize,
  startColumnMove,
} = useColumnDragColumns({
  columns: () => allRouteColumns,
  orderedKeys: () => orderedRouteColumns.value.map((c) => String(c.key)),
  getWidth: (key) => routeColumnWidths.value[key],
  setColumnWidth: setRouteColumnWidth,
  setColumnOrder: setRouteColumnOrder,
  tableSelector: '.route-table',
  fixedKeys: ['name', 'actions'],
})

function handleResetRouteColumnWidths(): void {
  resetRouteColumnWidths()
  routeColumnPopoverVisible.value = false
  message.success('已恢复默认列宽')
}

// ── 表格序号列 + 表外分页（central-management-parity 批次 A）─────────────
// 序号列恒展示、不进列配置勾选项（antd CheckboxGroup 会剔除选项外的已选值），
// 位于 row-selection 勾选列之后（勾选列由 a-table 自行渲染）。
const ROUTE_INDEX_COLUMN = { title: '#', key: 'index', width: 45, align: 'center' as const }

const routeTableColumns = computed(() => [ROUTE_INDEX_COLUMN, ...toValue(visibleRouteColumns)])

/** 后端分页序号 = (page-1)*pageSize + 本页行号 + 1（#59 表格解剖） */
function rowIndexLabel(cluster: Cluster, index: number): number {
  const pag = cluster.routesPagination
  return ((pag?.page || 1) - 1) * (pag?.pageSize || 20) + index + 1
}

/** ListPager 翻页：写回分页状态 → 清选择 → 复用既有加载函数 */
function onRoutePageChange(page: number, pageSize: number): void {
  if (!props.cluster.routesPagination) return
  props.cluster.routesPagination.page = page
  props.cluster.routesPagination.pageSize = pageSize
  props.cluster.selectedRouteKeys = []
  props.cluster.selectedRoute = null
  loadRoutes(props.cluster)
}

/**
 * 排序回调：`:pagination="false"` 下 antd 的 change 事件 pagination 恒为 `{}`，
 * 直接透传会把 page/pageSize 写成 undefined —— 这里钉住当前分页值，只让排序分支生效。
 */
function handleRouteSortChange(cluster: Cluster, sorter: Record<string, unknown> | null): void {
  const pag = cluster.routesPagination
  handleRouteTableChange(cluster, { current: pag?.page || 1, pageSize: pag?.pageSize || 20 }, sorter)
}

// ── 7.9（Tab 对齐独立页）：DNS 行操作禁用 + tooltip 指路 ──
// 行内按钮对「DNS 行」禁用（删除 toast 守卫保留兜底）；文案与独立页 RouteList 同源，
// 指路目标是左侧菜单「DNS 代理」页。工具栏只保留批量删除（多选场景的唯一入口）。
const DNS_ROUTE_HINT = 'DNS 路由请在「DNS 代理」页管理'

// ── batch delete selection state（行内动作收敛到 ⋯ 菜单后，批量删除回到工具条） ─────
const batchCount = computed(() => (props.cluster.selectedRouteKeys || []).length)
const deleteCount = computed(() => (batchCount.value > 0 ? batchCount.value : props.cluster.selectedRoute ? 1 : 0))
/** 选中项含 DNS 路由时禁用删除（与旧工具栏语义一致；composable 的 toast 守卫仍兜底） */
const dnsInSelection = computed(() => {
  const keys = props.cluster.selectedRouteKeys || []
  const rows = (props.cluster.routes || []).filter((r) => keys.includes(r.id))
  if (rows.some((r) => isDnsRoute(r))) return true
  return props.cluster.selectedRoute ? isDnsRoute(props.cluster.selectedRoute) : false
})
const deleteEnabled = computed(() => deleteCount.value > 0 && !dnsInSelection.value)

function handleDeleteClick() {
  if (batchCount.value > 0) {
    deleteRoutes(props.cluster)
  } else {
    deleteRoute(props.cluster)
  }
}

// ── ⋯ 动作菜单（设计 .l5-menu 三栏：CRUD → 危险 → 动作；#81） ──────────────
// 三栏构建统一走 utils/resourceActionMenu（B3 单一实现）；每项仍受列配置「行动作按钮集」勾选态控制，
// DNS 行整组置 disabled（菜单不可点，但不隐藏——行内触发器本身已禁用并带指路 tooltip）。
function routeMenuGroupsFor(record: Route | null): ResourceMenuGroup[] {
  return buildResourceActionMenu({
    crud: [
      { key: 'copy', title: '复制路由' },
      { key: 'edit', title: '编辑' },
    ],
    danger: [{ key: 'delete', title: '删除', desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）', danger: true }],
    actions: [{ key: 'version', title: '版本管理', desc: '历史版本查看与回滚' }],
    visible: (key) => routeActionsSelected.value.includes(key),
    disableAll: record ? isDnsRoute(record) : false,
  })
}

// ── 行点击选中（batch1 组5 5.3，A7 对齐 ClusterUpstreams 4.1/D8）──
// 行点选与复选框共用同一选中载体：selectedRoute（单选操作/高亮依据）+
// selectedRouteKeys（工具栏批量计数）。再点已选中行 = 取消选中；DNS 路由仅禁复选框，行点选仍可选中查看。
function toggleRouteSelection(record: Route) {
  if (props.cluster.selectedRoute?.id === record.id) {
    props.cluster.selectedRoute = null
    props.cluster.selectedRouteKeys = (props.cluster.selectedRouteKeys || []).filter((k) => k !== record.id)
  } else {
    props.cluster.selectedRoute = record
    if (!(props.cluster.selectedRouteKeys || []).some((k) => k === record.id)) {
      props.cluster.selectedRouteKeys = [...(props.cluster.selectedRouteKeys || []), record.id]
    }
  }
}

// 选中行高亮：跟随 selectedRoute，行点选与勾选（selectMany 单选时同步该载体）均生效
const routeRowClassName = (record: Route) => (props.cluster.selectedRoute?.id === record.id ? 'row-selected' : '')

// ── Version published callback ──────────────────────────────────────
function onVersionPublished() {
  loadRoutes(props.cluster)
}

// ── 组3 3.2：版本恢复出口条 → 以版本弹窗上下文资源（composable 写入的镜像 ref）复用既有发布
// 链路（publishRouteByRecord：内置发布确认/executePublish/列表刷新）；发布/取消返回后重开版本
// 弹窗——重开触发组件既有 open watch 重载版本列表并复位出口条（链路为 promise 单出口，取消时
// 同样回到版本弹窗，恢复本身已落库不丢失）
async function handleVmPublishRequested() {
  const resourceId = versionModalResourceId.value
  const resourceName = versionModalResourceName.value
  if (resourceId == null || !resourceName) return
  versionModalVisible.value = false
  const item = (props.cluster.routes || []).find((r) => r.id === resourceId)
  if (!item) return
  await publishRouteByRecord(props.cluster, item)
  versionModalVisible.value = true
}

/**
 * 请求方法（Edge 侧为逗号分隔字符串）→ 胶囊渲染，复用列表页全局 `.m-tag` 色阶。
 * 列宽固定（设计 110）：单行只展示前 2 枚 + `+N`（title 给全量），避免折行撑高行
 * 与溢出压到「优先级」列（批次 B 实测）。
 */
function methodList(methods?: string | null): string[] {
  return (methods || '')
    .split(',')
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean)
}
function methodPreview(methods?: string | null): string[] {
  return methodList(methods).slice(0, 2)
}
function methodTitle(methods?: string | null): string {
  return methodList(methods).join('、')
}
</script>

<style scoped>
.tab-content {
  min-height: 100px;
}

.node-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
}

.node-table {
  margin-top: 8px;
}

/* ── 选中行高亮（batch1 组5 5.3）：selectedRoute 来源为行点选或勾选均生效，与 ClusterUpstreams 行选中风格一致 ── */
.node-table :deep(tr.row-selected > td) {
  background: oklch(56% 0.16 210 / 10%) !important;
}
</style>
