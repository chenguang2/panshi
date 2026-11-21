<template>
  <div class="tab-content">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="openUpstreamForm(null)">
        <StrokeIcon name="plus" :size="13" /> 添加上游
      </a-button>
      <!-- 批量删除：行内动作收敛到 ⋯ 菜单后，多选删除的唯一入口（与节点 Tab 同款形态） -->
      <a-button size="small" danger :disabled="!deleteEnabled" @click="handleDeleteClick"
        >删除上游{{ deleteCount > 0 ? `(${deleteCount})` : '' }}</a-button
      >

      <div class="toolbar-right">
        <ColumnConfigPopover
          v-model:open="upstreamColumnPopoverVisible"
          :all-columns="allUpstreamColumns"
          v-model:columns="upstreamColumnsSelected"
          :all-actions="allUpstreamActionButtons"
          v-model:actions="upstreamActionsSelected"
          v-model:search="upstreamSearchVisible"
          width-resettable
          @reset-widths="handleResetUpstreamResetWidths"
        />
        <template v-if="upstreamSearchVisible">
          <SearchInput
            v-model="cluster.upstreamsSearch"
            placeholder="搜索上游"
            :width="150"
            size="small"
            @search="
              () => {
                cluster.upstreamsPagination!.page = 1
                cluster.selectedUpstreamKeys = []
                cluster.selectedUpstream = null
                loadUpstreams(cluster)
              }
            "
          />
          <a-select
            v-model:value="cluster.upstreamsSearchField"
            placeholder="字段"
            style="width: 90px"
            allow-clear
            size="small"
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="name">名称</a-select-option>
          </a-select>
        </template>
      </div>
    </div>
    <a-table
      :columns="upstreamTableColumns"
      :data-source="cluster.upstreams || []"
      :pagination="false"
      :loading="cluster.upstreamsLoading"
      :row-selection="{
        selectedRowKeys: cluster.selectedUpstreamKeys || [],
        preserveSelectedRowKeys: true,
        columnWidth: 40,
        onChange: (keys: any, rows: any) => selectUpstreams(cluster, keys, rows),
      }"
      :custom-row="
        (record: any) => ({
          onClick: () => {
            cluster.selectedUpstream = record
          },
        })
      "
      :row-class-name="upstreamRowClassName"
      :showSorterTooltip="false"
      :scroll="{ x: 1054 }"
      :table-layout="'fixed'"
      size="small"
      row-key="id"
      class="node-table upstream-table grid-table"
      @change="(_pag: any, _filters: any, sorter: any) => handleUpstreamSortChange(cluster, sorter)"
    >
      <template #emptyText>
        <EmptyState title="暂无上游" description="添加上游后，路由才能把流量转发到后端">
          <a-button size="small" type="primary" @click="openUpstreamForm(null)">添加上游</a-button>
        </EmptyState>
      </template>
      <template #headerCell="{ column, title }">
        <!-- 序号列：恒展示、不可拖拽（不进列配置） -->
        <span v-if="column.key === 'index'">{{ title }}</span>
        <span
          v-else
          class="th-resize-wrap"
          :class="upstreamColumnWrapClass(column)"
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
        <template v-if="column.key === 'targets'">
          <div v-if="record.targets && record.targets.length > 0" class="target-list">
            <span v-for="t in previewTargets(record)" :key="t.target" class="target-tag">
              {{ t.target }} <span class="weight">({{ t.weight }})</span>
            </span>
            <span v-if="record.targets.length > 2" class="target-more">+{{ record.targets.length - 2 }}</span>
          </div>
          <span v-else class="target-empty">—</span>
        </template>
        <!-- 发布状态（publish-diff-preview）：覆盖 composable 的 customRender，加差异预览入口 -->
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
        <template v-else-if="column.key === 'actions'">
          <!-- 行内动作收敛（parity 批 B / 设计 .ops）：主行动「发布」+ ⋯ 三栏菜单 -->
          <div class="action-cell">
            <button
              v-if="upstreamActionsSelected.includes('publish')"
              type="button"
              class="op-pub"
              @click="handleUpstreamRowAction(cluster, record, 'publish')"
            >
              发布
            </button>
            <a-dropdown v-if="upstreamMenuGroups.length > 0" :trigger="['click']">
              <a-button type="text" size="small" class="action-trigger-btn" title="更多操作" aria-label="更多操作">
                <StrokeIcon name="dots" />
              </a-button>
              <!-- 三栏结构（#81）：CRUD → 危险 → 动作；分组/顺序/空栏剔除由 utils/resourceActionMenu 统一构建，
                   栏间分隔线由遍历序号决定（首栏不画），危险项靠条目自带 danger 标记转红。
                   注释必须在 overlay 槽外：antd Dropdown 取 overlay 槽第一个 vnode，前导注释会让菜单渲染为空 -->
              <template #overlay>
                <a-menu class="l5-action-menu">
                  <template v-for="(group, gi) in upstreamMenuGroups" :key="group.key">
                    <a-menu-divider v-if="gi > 0" />
                    <a-menu-item
                      v-for="item in group.items"
                      :key="item.key"
                      :danger="item.danger"
                      @click="handleUpstreamRowAction(cluster, record, item.key)"
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
          </div>
        </template>
      </template>
    </a-table>

    <!-- 表外分页条（components/ListPager.vue）：a-table 分页关闭，服务端分页由本组件承担 -->
    <ListPager
      :page="cluster.upstreamsPagination?.page ?? 1"
      :page-size="cluster.upstreamsPagination?.pageSize ?? 20"
      :total="cluster.upstreamsPagination?.total ?? 0"
      unit="个上游"
      @change="onUpstreamPageChange"
    />

    <!-- B1 表单共用（cluster-shared-core-plan 3.1）：上游表单统一走共享 UpstreamFormModal，
         提交/校验/误关保护/保存后发布引导全在组件内；面板只负责关闭 + 列表刷新 + 发布链路对接。
         面板只有一个集群：传单元素清单，集群选择在编辑态由组件既有逻辑禁用（add 态仅一个可选项）。 -->
    <UpstreamFormModal
      :visible="formVisible"
      :editing-upstream="editingUpstream"
      :copying-upstream="copyingUpstream"
      :clusters="formClusters"
      :default-cluster-id="props.cluster.id"
      lock-cluster
      @close="closeForm"
      @saved="onFormSaved"
      @publish-requested="onFormPublishRequested"
    />

    <VersionManagementModal
      v-model:open="versionModalVisible"
      :resource-type="versionModalType"
      :resource-id="versionModalResourceId"
      :cluster-id="versionModalClusterId"
      :resource-name="versionModalResourceName"
      :edge-uuid="versionModalEdgeUuid"
      :can-publish="true"
      @published="versionModalOnPublished"
      @publish-requested="publishRestoredUpstream"
    />

    <!-- 发布差异预览（publish-diff-preview）：自持拉取；「去发布」接既有发布流程 -->
    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="props.cluster.id"
      :resource-type="'upstream'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.name"
      @publish="onPreviewPublish"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, toValue } from 'vue'
import type { Cluster, Upstream } from '@/types'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import UpstreamFormModal from '@/components/UpstreamFormModal.vue'
import { useClusterUpstreams } from '@/composables/useClusterUpstreams'
import { useColumnDragColumns } from '@/composables/useColumnDragColumns'
import { message } from 'ant-design-vue'
import ColumnConfigPopover from '@/components/ColumnConfigPopover.vue'
import ListPager from '@/components/ListPager.vue'
import SearchInput from '@/components/SearchInput.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import { buildResourceActionMenu } from '@/utils/resourceActionMenu'

const props = defineProps<{
  cluster: Cluster
  clusters: Cluster[]
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
}>()

// Version modal state — defined internally so the composable has full mutable access.
const versionModalVisible = ref(false)
const versionModalType = ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>('upstream')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

// ── B1 表单共用（cluster-shared-core-plan 3.1）：表单状态由面板自持（与集群子页 ClusterGlobalRules 同构），
//    提交/校验/误关保护全在共享 UpstreamFormModal 内；composable 的表单态不再驱动面板表单。 ──
const formVisible = ref(false)
const editingUpstream = ref<Upstream | null>(null)
const copyingUpstream = ref(false)
/** 面板只有当前集群：单元素清单（组件内 ClusterSelect 编辑态禁用，add 态仅一个可选项） */
const formClusters = computed(() => [
  { id: props.cluster.id, name: props.cluster.name, display_name: props.cluster.display_name },
])

/** 表单以「编辑源记录」为唯一入参：复制 = editingUpstream 有值 + copyingUpstream 置位（组件内改名「复制_xxx」） */
function openUpstreamForm(record: Upstream | null, copy = false) {
  editingUpstream.value = record
  copyingUpstream.value = copy && record != null
  formVisible.value = true
}

function closeForm() {
  formVisible.value = false
  editingUpstream.value = null
  copyingUpstream.value = false
}

/** 保存成功（组件已 emit saved + close）：刷新该集群上游列表，使「待发布」标签立即可见 */
async function onFormSaved() {
  closeForm()
  await loadUpstreams(props.cluster)
}

/** 保存后发布引导「立即发布」→ 复用既有发布链路（publishByRecord：发布确认选节点，不自动发布） */
function onFormPublishRequested(payload: { clusterId: number | string; upstreamId: number | null; name: string }) {
  if (payload.upstreamId == null) return
  void publishUpstreamByRecord(props.cluster, {
    id: payload.upstreamId,
    name: payload.name,
  } as Upstream)
}

/** 行内 ⋯ 菜单入口：编辑/复制由面板本地表单承接，其余（发布/版本/删除）仍走 composable 单一实现 */
function handleUpstreamRowAction(cluster: Cluster, record: Upstream, action: string) {
  if (action === 'edit' || action === 'copy') {
    openUpstreamForm(record, action === 'copy')
    return
  }
  handleUpstreamAction(cluster, record, action)
}

const {
  allUpstreamColumns,
  upstreamColumnPopoverVisible,
  upstreamColumnsSelected,
  upstreamSearchVisible,
  allUpstreamActionButtons,
  upstreamActionsSelected,
  visibleUpstreamColumns,
  upstreamColumnWidths,
  setUpstreamColumnWidth,
  resetUpstreamColumnWidths,
  setUpstreamColumnOrder,
  orderedUpstreamColumns,
  loadUpstreams,
  handleUpstreamTableChange,
  selectUpstreams,
  deleteUpstream,
  deleteUpstreams,
  publishUpstreamByRecord,
  handleUpstreamAction,
} = useClusterUpstreams({
  clusters: computed(() => props.clusters),
  versionModalVisible,
  versionModalType,
  versionModalResourceId,
  versionModalClusterId,
  versionModalResourceName,
  versionModalEdgeUuid,
  openPublishModal: props.openPublishModal,
})

// ── 列拖拽手势共享 composable（cluster-tab-column-personalization 3.2）──
// 几何按拖拽起点所在表解析（D2）：统一管理页同屏可并存多张卡片；name/actions 为锚点不参与移动。
const {
  wrapClass: upstreamColumnWrapClass,
  startColumnResize,
  startColumnMove,
} = useColumnDragColumns({
  columns: () => allUpstreamColumns,
  orderedKeys: () => orderedUpstreamColumns.value.map((c) => String(c.key)),
  getWidth: (key) => upstreamColumnWidths.value[key],
  setColumnWidth: setUpstreamColumnWidth,
  setColumnOrder: setUpstreamColumnOrder,
  tableSelector: '.upstream-table',
  fixedKeys: ['name', 'actions'],
})

function handleResetUpstreamResetWidths(): void {
  resetUpstreamColumnWidths()
  upstreamColumnPopoverVisible.value = false
  message.success('已恢复默认列宽')
}

// ── batch delete selection state（行内动作收敛到 ⋯ 菜单后，批量删除回到工具条） ─────
const batchCount = computed(() => (props.cluster.selectedUpstreamKeys || []).length)
const deleteCount = computed(() => (batchCount.value > 0 ? batchCount.value : props.cluster.selectedUpstream ? 1 : 0))
const deleteEnabled = computed(() => deleteCount.value > 0)

function handleDeleteClick() {
  if (batchCount.value > 0) {
    deleteUpstreams(props.cluster)
  } else {
    deleteUpstream(props.cluster)
  }
}

// ── ⋯ 动作菜单（设计 .l5-menu 三栏：CRUD → 危险 → 动作；#81） ──────────────
// 三栏构建统一走 utils/resourceActionMenu（B3 单一实现）；每项仍受列配置「行动作按钮集」
// 勾选态控制：未勾选的动作不渲染（不改变原有配置语义）
const upstreamMenuGroups = computed(() =>
  buildResourceActionMenu({
    crud: [
      { key: 'copy', title: '复制' },
      { key: 'edit', title: '编辑' },
    ],
    danger: [{ key: 'delete', title: '删除', desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）', danger: true }],
    actions: [{ key: 'version', title: '版本管理', desc: '历史版本查看与回滚' }],
    visible: (key) => upstreamActionsSelected.value.includes(key),
  }),
)

// ── 表格序号列 + 表外分页（central-management-parity 批次 A）─────────────
// 序号列恒展示、不进列配置勾选项（antd CheckboxGroup 会剔除选项外的已选值），
// 位于 row-selection 勾选列之后（勾选列由 a-table 自行渲染）。
const UPSTREAM_INDEX_COLUMN = { title: '#', key: 'index', width: 45, align: 'center' as const }

const upstreamTableColumns = computed(() => [UPSTREAM_INDEX_COLUMN, ...toValue(visibleUpstreamColumns)])

/** 后端分页序号 = (page-1)*pageSize + 本页行号 + 1（#59 表格解剖） */
function rowIndexLabel(cluster: Cluster, index: number): number {
  const pag = cluster.upstreamsPagination
  return ((pag?.page || 1) - 1) * (pag?.pageSize || 20) + index + 1
}

/** ListPager 翻页：写回分页状态 → 清选择 → 复用既有加载函数 */
function onUpstreamPageChange(page: number, pageSize: number): void {
  if (!props.cluster.upstreamsPagination) return
  props.cluster.upstreamsPagination.page = page
  props.cluster.upstreamsPagination.pageSize = pageSize
  props.cluster.selectedUpstreamKeys = []
  props.cluster.selectedUpstream = null
  loadUpstreams(props.cluster)
}

/**
 * 排序回调：`:pagination="false"` 下 antd 的 change 事件 pagination 恒为 `{}`，
 * 直接透传会把 page/pageSize 写成 undefined —— 这里钉住当前分页值，只让排序分支生效。
 */
function handleUpstreamSortChange(cluster: Cluster, sorter: Record<string, unknown> | null): void {
  const pag = cluster.upstreamsPagination
  handleUpstreamTableChange(cluster, { current: pag?.page || 1, pageSize: pag?.pageSize || 20 }, sorter)
}

// 发布差异预览（publish-diff-preview）：预览弹窗自持拉取；「去发布」接既有发布流程
const previewVisible = ref(false)
const previewRecord = ref<Upstream | null>(null)

function openPublishPreview(record: Upstream) {
  previewRecord.value = record
  previewVisible.value = true
}

function onPreviewPublish() {
  const record = previewRecord.value
  previewVisible.value = false
  if (record) publishUpstreamByRecord(props.cluster, record)
}

// 选中行高亮：跟随 selectedUpstream，无论来源是行点选还是勾选（4.1/D8）
const upstreamRowClassName = (record: Upstream): string =>
  props.cluster.selectedUpstream?.id === record.id ? 'upstream-row-selected' : ''

// 目标节点列：默认展示前 2 个 + +N 折叠（4.2，对齐全局页 target-tag 形态）
const previewTargets = (record: Upstream) => (record.targets || []).slice(0, 2)

// 版本管理「立即发布恢复的配置」（1.3/组3 A2）：恢复动作针对当前选中的上游；
// publishUpstreamByRecord 返回后重开版本弹窗——重开触发组件既有 open watch 重载版本列表并
// 复位出口条（链路为 promise 单出口，取消时同样回到版本弹窗，恢复本身已落库不丢失）
const publishRestoredUpstream = async () => {
  const selected = props.cluster.selectedUpstream
  if (!selected) return
  versionModalVisible.value = false
  await publishUpstreamByRecord(props.cluster, selected)
  versionModalVisible.value = true
}

const versionModalOnPublished = async () => {
  if (versionModalType.value === 'upstream') {
    await loadUpstreams(props.cluster)
  }
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

/* ── 选中行高亮（4.1）：selectedUpstream 来源为行点选或勾选均生效 ── */
.node-table :deep(tr.upstream-row-selected > td) {
  background: oklch(56% 0.16 210 / 10%) !important;
}

/* ── 目标节点列（4.2）：对齐全局上游列表 target-tag 形态 ── */
.target-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.target-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
.target-tag .weight {
  color: var(--muted);
  font-size: 11px;
}
.target-more {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--border);
}
.target-empty {
  color: var(--muted);
  font-size: 12px;
}
</style>
