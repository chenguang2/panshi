<template>
  <div class="upstream-list">
    <PageHeader title="上游管理" description="管理后端上游服务，配置负载均衡和目标节点">
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 新建上游</button>
      </template>
    </PageHeader>

    <div ref="cardRef" class="table-container l5-card">
      <!-- 工具条（list-pages-console-restyle）：共享 TableToolbar，右端簇 = 计数 → 刷新 → 列配置 → 分组|平铺 -->
      <TableToolbar
        v-model:mode="viewMode"
        :count="totalCount"
        count-unit="个上游"
        :show-count="false"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <SearchInput
            v-if="searchVisible"
            v-model="searchText"
            placeholder="搜索名称或描述..."
            :width="150"
            @input="onSearch"
          />
          <select
            v-model="groupFilter"
            :title="groupFilter.startsWith('__') ? '' : groupFilter"
            class="l5-select"
            style="width: 104px"
            @change="onGroupChange"
          >
            <option value="__all__">全部分组</option>
            <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
            <option value="__ung__">未分组</option>
          </select>
          <ClusterSelect
            v-model="clusterFilter"
            :clusters="filteredClusters"
            allow-all
            style="width: 120px"
            @change="onFilterChange"
          />
          <select v-model="lbFilter" class="l5-select" style="width: 120px" @change="onFilterChange">
            <option value="">全部算法</option>
            <option value="weighted_roundrobin">加权轮询</option>
            <option value="chash">一致性哈希</option>
            <option value="ewma">延迟最小</option>
            <option value="least_conn">最少连接</option>
          </select>
        </template>
        <template #config>
          <a-popover v-model:open="columnPopoverVisible" trigger="click" placement="bottomLeft">
            <template #title>选择显示列</template>
            <template #content>
              <div style="min-width: 400px">
                <div style="font-weight: 500; margin-bottom: 8px">显示字段</div>
                <a-checkbox-group v-model:value="columnsSelected">
                  <div style="display: flex; flex-wrap: wrap; gap: 8px">
                    <div v-for="col in popoverColumns" :key="col.key" style="margin-bottom: 4px">
                      <a-checkbox :value="col.key">{{ col.title }}</a-checkbox>
                    </div>
                  </div>
                </a-checkbox-group>
                <a-divider style="margin: 12px 0" />
                <div style="font-weight: 500; margin-bottom: 8px">搜索</div>
                <a-checkbox v-model:checked="searchVisible">显示搜索框</a-checkbox>
                <a-divider style="margin: 12px 0" />
                <div class="pop-hint-line">
                  <StrokeIcon name="resizeH" :size="13" />
                  <span>拖动表头右缘可调整列宽，拖动表头整格可调整列序</span>
                </div>
                <button class="btn btn-primary btn-sm" @click="handleResetColumnWidths">重置列宽</button>
              </div>
            </template>
            <button class="btn btn-secondary btn-sm">
              <StrokeIcon name="sliders" :size="13" />
              列配置
              <CaretDownOutlined style="font-size: 10px" />
            </button>
          </a-popover>
        </template>
        <template #mode-extra>
          <button
            v-if="viewMode === 'group'"
            type="button"
            class="tool-btn fold-all-btn"
            data-test="toolbar-fold-all"
            :title="pageHasFolded ? '展开当页全部分组' : '收起当页全部分组'"
            @click="toggleFoldAll"
          >
            <StrokeIcon :name="pageHasFolded ? 'expandAll' : 'collapseAll'" :size="13" />
            <span class="fold-all-label">{{ pageHasFolded ? '全部展开' : '全部收起' }}</span>
          </button>
        </template>
      </TableToolbar>

      <!-- 状态 chips 附属行（filter-architecture 方案甲 / D1）：上游此前完全没有状态筛选，
           只能看页头徽标却不能按它筛。计数来自后端聚合端点，点击即设 publishFilter 并重取。 -->
      <div class="l5-chiprow" data-test="status-chip-row">
        <span class="chiprow-label">状态</span>
        <div class="f-chips status-chips">
          <button
            v-for="c in statusChips"
            :key="c.value"
            type="button"
            class="f-chip chip-status"
            :class="{ active: publishFilter === c.value, empty: c.count === 0 }"
            :aria-pressed="publishFilter === c.value ? 'true' : 'false'"
            @click="selectPublishStatus(c.value)"
          >
            {{ c.label }}<span class="f-count">{{ c.count }}</span>
          </button>
        </div>
        <span class="t-spacer"></span>
      </div>

      <a-table
        :data-source="displayRows"
        :columns="visibleColumns"
        :row-key="(record: any) => record.key ?? record.id"
        :custom-row="upstreamCustomRow"
        :pagination="false"
        :loading="loading"
        :scroll="{ x: minTableWidth }"
        :table-layout="'fixed'"
        size="middle"
        class="upstream-table grid-table"
        @change="handleTableChange"
      >
        <template #headerCell="{ column, title }">
          <span class="th-resize-wrap" :class="upstreamWrapClass(column)" @mousedown="startColumnMove($event, column)">
            <span>{{ title }}</span>
            <span
              v-if="String(column.key) !== 'index'"
              class="col-resize-handle"
              @mousedown="startColumnResize($event, column)"
            />
          </span>
        </template>
        <template #bodyCell="{ column, record }">
          <!-- 组标记行（list-page-cluster-grouping）：整行 colspan 由列 customCell 控制，此处只渲染内容 -->
          <template v-if="isGroupHeaderRow(record)">
            <ClusterGroupRow :row="record" @toggle="toggleFold(record.groupKey)" />
          </template>
          <template v-else-if="column.key === 'index'">
            <span class="text-muted">{{ (page - 1) * pageSize + sequenceOf(record) }}</span>
          </template>
          <template v-else-if="column.key === 'name'">
            <div class="cell-primary">{{ record.name }}</div>
            <div class="cell-secondary">{{ record.description || '-' }}</div>
          </template>

          <template v-else-if="column.key === 'cluster'">
            <span class="cl-cell" :class="clusterHueClass(record.cluster_id)">
              <i class="cl-dot"></i><span class="cl-name">{{ record.cluster_name || '-' }}</span>
            </span>
          </template>

          <template v-else-if="column.key === 'load_balance'">
            <span class="lb-chip">{{ lbLabels[record.load_balance] || record.load_balance }}</span>
          </template>

          <!-- 目标节点与健康（mockup-parity-standard r7 方案 A）：点 + 地址:端口 + 权重条 + 「权重 · 占比%」
               + 汇总行。平台无目标级健康数据 → 点颜色/汇总按上游发布态近似（utils/upstreamTargets）。 -->
          <template v-else-if="column.key === 'targets'">
            <div class="tg-list" v-if="record.targets?.length">
              <span v-for="(t, ti) in record.targets" :key="t.target" class="tg-chip">
                <span class="dot" :class="targetDotFor(record).cls" :title="targetDotFor(record).title"></span>
                {{ t.target }}
                <span class="tg-bar"><i :style="{ width: targetPercentsOf(record)[ti] + '%' }"></i></span>
                <span class="tg-w">{{ t.weight }} · {{ targetPercentsOf(record)[ti] }}%</span>
              </span>
              <span class="tg-sum" :title="targetDotFor(record).title">
                <b>{{ targetsSummaryOf(record).total }}</b> 目标 ·
                <template v-if="targetsSummaryOf(record).ok"><b>全部健康</b></template>
                <span v-else class="tg-sum-pending"
                  ><b>{{ targetsSummaryOf(record).pending }}</b> 项待验证</span
                >
              </span>
            </div>
            <span v-else class="text-muted text-sm">—</span>
          </template>

          <template v-else-if="column.key === 'scheme'">
            <span class="scheme-chip">{{ record.scheme || '—' }}</span>
          </template>

          <template v-else-if="column.key === 'publish_status'">
            <span class="status-cell-flex">
              <PublishStatusTag
                :version="record.current_version"
                :published-at="record.published_at"
                :pending="record.pending_publish === true"
                :last-publish-status="record.last_publish_status"
              />
              <PublishDiffButton
                :pending="record.pending_publish === true"
                :last-publish-status="record.last_publish_status"
                @click="openPublishPreview(record)"
              />
            </span>
          </template>

          <template v-else-if="column.key === 'actions'">
            <div class="action-cell">
              <button type="button" class="op-pub" @click="openPublishModal(record)">发布</button>
              <a-dropdown :trigger="['click']">
                <a-button type="text" size="small" class="action-trigger-btn"><StrokeIcon name="dots" /></a-button>
                <template #overlay>
                  <a-menu class="l5-action-menu">
                    <a-menu-item @click="handleAction('edit', record)">编辑</a-menu-item>
                    <a-menu-item @click="handleAction('version', record)">
                      <div class="menu-item-stack">
                        <span>版本管理</span>
                        <small>历史版本查看与回滚</small>
                      </div>
                    </a-menu-item>
                    <a-menu-item @click="handleAction('copy', record)">复制</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item danger @click="handleAction('delete', record)">
                      <div class="menu-item-stack">
                        <span>删除</span>
                        <small>删平台配置，可同步删 Edge 已发布配置（弹窗可选）</small>
                      </div>
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </template>
        </template>

        <template #emptyText>
          <div class="empty5">
            <div class="e-icon">◎</div>
            <div class="e-title">
              <template v-if="hasActiveFilters">没有符合筛选条件的上游</template>
              <template v-else>还没有上游</template>
            </div>
            <div class="e-actions">
              <button v-if="hasActiveFilters" class="btn btn-secondary" @click="clearFilters">清除筛选</button>
              <button v-else class="btn btn-primary" @click="openCreateModal">新建上游</button>
            </div>
          </div>
        </template>
      </a-table>
      <ListPager :page="page" :page-size="pageSize" :total="totalCount" unit="个上游" @change="handlePagerChange" />
    </div>

    <UpstreamFormModal
      :visible="formModalVisible"
      :editing-upstream="editingUpstream"
      :copying-upstream="copyingUpstream"
      :clusters="clusters"
      @close="closeFormModal"
      @saved="onSaved"
      @publish-requested="onFormPublishRequested"
    />

    <VersionManagementModal
      v-model:open="vmModalVisible"
      resource-type="upstream"
      :resource-id="vmResourceId"
      :cluster-id="vmClusterId"
      :resource-name="vmResourceName"
      :can-publish="true"
      @version-change="refreshList"
      @published="refreshList"
      @publish-requested="onVmPublishRequested"
    />

    <PublishConfirmModal
      v-model:visible="publishModalVisible"
      title="发布上游"
      :cluster-id="publishClusterId"
      @confirm="onPublishConfirm"
      @cancel="onPublishCancel"
    />

    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="previewRecord?.cluster_id ?? null"
      :resource-type="'upstream'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.name"
      @publish="onPreviewPublish"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { useColumnConfig, resolveOrderedColumns, applyColumnWidths } from '@/composables/useColumnConfig'
import { useColumnDragColumns } from '@/composables/useColumnDragColumns'
import { message, Modal } from 'ant-design-vue'
import ClusterSelect from '@/components/ClusterSelect.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { CaretDownOutlined } from '@ant-design/icons-vue'
import { listUpstreams, getUpstreamStatusCounts } from '@/api/upstreams'
import { listClusters, getClusterNodes } from '@/api/clusters'
import { PAGE_SIZE_TABLE } from '@/constants'
import PageHeader from '@/components/PageHeader.vue'
import UpstreamFormModal from '@/components/UpstreamFormModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import { executePublish } from '@/composables/useClusterUtils'
import { showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import {
  useListClusterGrouping,
  isGroupHeaderRow,
  type ClusterGroupChip,
  type ListViewMode,
} from '@/composables/useListClusterGrouping'
import { compareUpstreamName } from '@/utils/listGroupSorters'
import { areTargetsVerified, summarizeTargetHealth, targetDot, targetWeightPercents } from '@/utils/upstreamTargets'
import { clusterHueClass, CLUSTER_COLUMN_MIN_WIDTH, CLUSTER_COLUMN_WIDTH } from '@/utils/clusterHue'
import TableToolbar from '@/components/TableToolbar.vue'
import { useFitColumnWidths, toDesignWidths } from '@/composables/useFitColumnWidths'
import ClusterGroupRow from '@/components/ClusterGroupRow.vue'
import ListPager from '@/components/ListPager.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import { useRoute } from 'vue-router'
import SearchInput from '@/components/SearchInput.vue'

const route = useRoute()

// 目标节点与健康（方案 A：发布态近似，见 utils/upstreamTargets）
const targetPercentsOf = (record: { targets?: { target: string; weight: number }[] }) =>
  targetWeightPercents(record.targets ?? [])
const targetsSummaryOf = (record: Record<string, unknown>) =>
  summarizeTargetHealth((record.targets as { target: string; weight: number }[]) ?? [], areTargetsVerified(record))
const targetDotFor = (record: Record<string, unknown>) => targetDot(areTargetsVerified(record))
const loading = ref(false)
const upstreams = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_TABLE)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref<string | number>('')
const groupFilter = ref('__all__')
const lbFilter = ref('')
const publishFilter = ref('')

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map((c) => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter((c) => !c.group_name)
  return clusters.value.filter((c) => c.group_name === groupFilter.value)
})

function onGroupChange() {
  clusterFilter.value = ''
  refreshList()
}

const displayedUpstreams = computed(() => upstreams.value)

// ── 集群分组 + 双模式（list-page-cluster-grouping，共享组合式单点）──
const viewMode = ref<ListViewMode>('group')
/** 组头统计芯片（contract 10.3）：发布状态判定与行内 PublishStatusTag 同源（pending_publish 字段） */
function upstreamGroupChips(rows: Array<Record<string, unknown>>): ClusterGroupChip[] {
  let published = 0
  let pending = 0
  for (const r of rows) {
    if (r.pending_publish === true) pending++
    else if (r.current_version != null) published++
  }
  const chips: ClusterGroupChip[] = []
  if (published) chips.push({ label: `${published} 已发布`, tone: 'ok' })
  if (pending) chips.push({ label: `${pending} 待发布`, tone: 'warn' })
  return chips
}
const { displayRows, sequenceOf, isRowSelectable, toggleFold, pageHasFolded, toggleFoldAll } = useListClusterGrouping({
  rows: () => displayedUpstreams.value,
  unit: '上游',
  mode: viewMode,
  // 组内固定序 = 名称序（规格 list-page-cluster-grouping）；仅分组模式生效
  sortWithinGroup: compareUpstreamName as (a: Record<string, unknown>, b: Record<string, unknown>) => number,
  chips: upstreamGroupChips,
})

/** 组标记行单元格协议（contract 10.6） */
function groupHeaderCellProps(record: unknown, isFirst: boolean): Record<string, unknown> {
  if (!isGroupHeaderRow(record)) return {}
  return isFirst ? { colSpan: visibleColumns.value.length } : { class: 'l5-group-cell-hidden' }
}
function upstreamCustomRow(record: unknown): Record<string, unknown> {
  return isGroupHeaderRow(record) ? { class: 'l5-group-row' } : {}
}

// ── 页头徽标（filter-architecture D3）：状态分布改由第二行状态 chips 承担（后端权威计数），
//    页头只留总数；旧实现取 500 抽样当全量，总数 > 500 时会失真（routes 实测 1596 条时偏差 1090）。
// 页头徽标 = 补充维度「N 目标」（目标节点总数，filter-architecture 决策 G3-甲）：
// 总数已在 chips「全部 N」与分页条各出现一次；目标数是 chips 无法表达的上游规模指标。
// 页头徽标 = 补充维度「涉及 N 集群」（filter-architecture 决策 G3-甲）：
// 总数已在 chips「全部 N」与分页条各出现一次；「N 目标」在本库与总数相等（每上游 1 目标），
// 故取集群维度以免再次看起来像重复（端点两个都返回，前端按需取）。
const headerStatItems = computed(() => [{ value: statusCounts.value.cluster_count, label: '集群' }])

/** 状态 chips 计数（决策 D4）：后端聚合端点，与列表业务筛选同口径、不含 publish_status */
const statusCounts = ref<{
  total: number
  published: number
  pending: number
  unpublished: number
  target_count: number
  cluster_count: number
}>({
  total: 0,
  published: 0,
  pending: 0,
  unpublished: 0,
  target_count: 0,
  cluster_count: 0,
})
async function loadStatusCounts(): Promise<void> {
  try {
    const params: Record<string, string | number> = { group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (lbFilter.value) params.load_balance = lbFilter.value
    if (searchText.value) params.search = searchText.value
    const { data } = await getUpstreamStatusCounts(params)
    statusCounts.value = data
  } catch {
    // 计数失败静默（保留上次值）；列表加载失败由 loadUpstreams 提示
  }
}
const statusChips = computed(() => [
  { value: '', label: '全部', count: statusCounts.value.total },
  { value: 'unpublished', label: '未发布', count: statusCounts.value.unpublished },
  { value: 'pending', label: '待发布', count: statusCounts.value.pending },
  { value: 'published', label: '已发布', count: statusCounts.value.published },
])
/** 点状态 chip：设 publishFilter → 顺序刷新列表与计数（计数不含 publish_status，故数字不变） */
function selectPublishStatus(value: string): void {
  publishFilter.value = value
  page.value = 1
  refreshList()
}
/** 刷新语义（design D6）：重拉列表 + 徽标统计；不重置筛选/视图模式。
 *  顺序化执行（先列表后统计）：并发的两个同名端点请求会让「最后一次调用」类断言产生竞态。 */
async function refreshList(): Promise<void> {
  await loadUpstreams()
  await loadStatusCounts()
}
const formModalVisible = ref(false)
const editingUpstream = ref<any | null>(null)
const copyingUpstream = ref(false)
const vmModalVisible = ref(false)
const vmResourceId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmResourceName = ref('')
const publishModalVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)

// 默认宽度档（column-personalization-rollout + list-pages-console-restyle L2）：
// 「集群」列移除（集群归属由组头行表达）；「目标节点」升级「目标节点与健康」按 mockup 314px 档
const columns: TableColumnsType = [
  { title: '#', key: 'index', width: 45, fixed: 'left' },
  { title: '名称', dataIndex: 'name', key: 'name', width: 176, fixed: 'left' },
  { title: '集群', key: 'cluster', width: 116, sorter: true }, // 仅平铺可见；服务端 sort_by=cluster
  { title: '负载均衡', key: 'load_balance', width: 120 },
  { title: '目标节点与健康', key: 'targets', width: 314 },
  { title: '协议', key: 'scheme', width: 90 },
  // 220（批 7 胶囊）：partial 态标签 ~170 + gap 6 + 「差异」胶囊 ~42
  { title: '发布状态', key: 'publish_status', width: 220 },
  { title: '操作', key: 'actions', width: 150, fixed: 'right' },
]

// ── 列个性化（column-personalization-rollout）：宽度/顺序持久化 + 拖拽手势共享 composable ──
const {
  popoverVisible: columnPopoverVisible,
  columnsSelected,
  searchVisible,
  columnWidths: upstreamColumnWidths,
  setColumnWidth: setUpstreamColumnWidth,
  resetWidths: resetUpstreamColumnWidths,
  columnOrder: upstreamColumnOrder,
  setColumnOrder: setUpstreamColumnOrder,
} = useColumnConfig({ key: 'upstream_standalone', defaultColumns: columns.map((c) => String(c.key)) })

// 列顺序：共享 resolveOrderedColumns 单点（未知/重复键剔除，未定位列按设计位落座）
const orderedColumns = computed(() => resolveOrderedColumns(columns, upstreamColumnOrder.value))

// 列显隐过滤 + 用户拖拽宽度覆盖默认档（与节点管理同款）
// 序号列恒展示、不进入列配置弹窗（upstream-list-page 规格钉定；与 table-anatomy 序号列语义一致）
const popoverColumns = computed(() => columns.filter((c) => String(c.key) !== 'index' && String(c.key) !== 'cluster'))

// 列宽自适应（r6-② 方案 A）：窄于设计总宽（1079）等比收缩，下限 = 设计最小总宽 1054
const cardRef = ref<HTMLElement | null>(null)
// 集群列已在 columns 定义里（仅平铺可见）；分组态不参与列宽缩放
const designWidths = () => {
  const base = toDesignWidths(columns)
  if (viewMode.value === 'flat') return base
  const { cluster: _cluster, ...rest } = base
  return rest
}
const { widths: fittedColumnWidths, minTableWidth } = useFitColumnWidths({
  designWidths,
  containerRef: cardRef,
  overrides: () => upstreamColumnWidths.value,
  flexKey: 'targets',
  // 列内容下限（r7-B4；批 7 publish_status 110→220）：目标列为弹性列不设下限；
  // scroll.x 下限之和 = 682 → 窗口 ≥ ~1070 零横向滚动
  minWidths: () => ({
    ...(viewMode.value === 'flat' ? { cluster: CLUSTER_COLUMN_MIN_WIDTH } : {}),
    index: 40,
    name: 120,
    load_balance: 80,
    scheme: 70,
    publish_status: 220,
    actions: 120,
  }),
})

const visibleColumns = computed(() => {
  const selected = new Set(columnsSelected.value)
  // 序号列恒展示：它不进弹窗，而 antd CheckboxGroup 交互会把它从已选集合里剔除，故此处兜底
  const isVisible = (c: { key?: unknown }) => {
    const k = String(c.key)
    if (k === 'index') return true
    // 集群列仅平铺视图存在（分组视图由组头承担），不进列配置弹窗
    if (k === 'cluster') return viewMode.value === 'flat'
    return selected.has(k)
  }
  const groupMode = viewMode.value === 'group'
  // 分组模式剥离 fixed（colSpan 通栏与 sticky 冲突，contract 10.6），平铺保留原状
  const cols = orderedColumns.value.filter(isVisible).map((c, i) => ({
    ...c,
    fixed: groupMode ? undefined : c.fixed,
    customCell: (record: unknown) => groupHeaderCellProps(record, i === 0),
  }))
  return applyColumnWidths(cols, fittedColumnWidths.value)
})

const {
  wrapClass: upstreamWrapClass,
  startColumnResize,
  startColumnMove,
} = useColumnDragColumns({
  columns: () => columns,
  orderedKeys: () => orderedColumns.value.map((c) => String(c.key)),
  getWidth: (key) => upstreamColumnWidths.value[key],
  setColumnWidth: setUpstreamColumnWidth,
  setColumnOrder: setUpstreamColumnOrder,
  tableSelector: '.upstream-table',
  fixedKeys: ['index', 'name', 'actions'],
})

function handleResetColumnWidths(): void {
  resetUpstreamColumnWidths()
  columnPopoverVisible.value = false
  message.success('已恢复默认列宽')
}

const lbLabels: Record<string, string> = {
  weighted_roundrobin: '加权轮询',
  chash: '一致性哈希',
  ewma: '延迟最小',
  least_conn: '最少连接',
}

// ── 4.6 空状态两分支：「从未创建」 vs 「筛选后为空」 ──
const hasActiveFilters = computed(
  () => !!searchText.value || !!clusterFilter.value || !!lbFilter.value || groupFilter.value !== '__all__',
)

function clearFilters() {
  searchText.value = ''
  clusterFilter.value = ''
  lbFilter.value = ''
  groupFilter.value = '__all__'
  page.value = 1
  refreshList()
}

function handleAction(action: string, record: any) {
  if (action === 'copy') {
    editingUpstream.value = record
    copyingUpstream.value = true
    formModalVisible.value = true
  } else if (action === 'edit') {
    editingUpstream.value = record
    copyingUpstream.value = false
    formModalVisible.value = true
  } else if (action === 'version') {
    vmResourceId.value = record.id
    vmClusterId.value = record.cluster_id
    vmResourceName.value = record.name
    vmModalVisible.value = true
  } else if (action === 'delete') deleteUpstream(record)
}

function openPublishModal(record: any) {
  publishingRecord.value = record
  publishClusterId.value = record.cluster_id
  // 行内发布默认只刷新列表；版本弹窗出口条发布用「刷新 + 重开版本弹窗」覆盖此默认（组3 A2）
  publishRefreshFn.value = refreshList
  publishModalVisible.value = true
}

// 发布差异预览（publish-diff-preview）：预览弹窗自持拉取；「去发布」接既有发布确认流程
const previewVisible = ref(false)
const previewRecord = ref<any>(null)

function openPublishPreview(record: any) {
  previewRecord.value = record
  previewVisible.value = true
}

function onPreviewPublish() {
  const record = previewRecord.value
  previewVisible.value = false
  if (record) openPublishModal(record)
}

// 本次发布完成后的刷新动作（组3 A2）：发布确认弹窗是行内发布与版本弹窗出口条共用的单入口，
// 出口条链路通过覆盖本刷新函数在发布成功后重开版本弹窗（重开触发既有 open watch 重载版本列表）
const publishRefreshFn = ref<() => Promise<void>>(refreshList)

// 1.3/组3 A2：版本管理弹窗恢复成功后的「立即发布恢复的配置」出口 → 同一行内发布的链路；
// 发布成功后刷新列表并重开版本弹窗（重开触发既有 open watch 重载版本列表并复位出口条）
function onVmPublishRequested() {
  if (vmResourceId.value == null || vmClusterId.value == null || !vmResourceName.value) return
  publishingRecord.value = { id: vmResourceId.value, cluster_id: vmClusterId.value, name: vmResourceName.value }
  publishClusterId.value = vmClusterId.value
  publishRefreshFn.value = async () => {
    await refreshList()
    vmModalVisible.value = true
  }
  vmModalVisible.value = false
  publishModalVisible.value = true
}

// 3.1/3.2：表单保存引导「立即发布」→ 打开该上游的发布弹窗（与行内发布同链路）
function onFormPublishRequested(payload: { clusterId: number | string; upstreamId: number | null; name: string }) {
  publishingRecord.value = { id: payload.upstreamId, cluster_id: payload.clusterId, name: payload.name }
  publishClusterId.value = payload.clusterId as number
  publishModalVisible.value = true
}

function onFilterChange() {
  page.value = 1
  refreshList()
}

function onSearch() {
  onDebouncedSearch(() => {
    page.value = 1
    refreshList()
  })
}

/** 分页条事件（ListPager）：表外独立分页，表格本身 `:pagination="false"`（组标记行不占页容量） */
function handlePagerChange(nextPage: number, nextPageSize: number) {
  page.value = nextPage
  if (nextPageSize) pageSize.value = nextPageSize
  loadUpstreams()
}

// ── 服务端排序（参考 RouteList 优先级实现）：仅「集群」列可排，且仅平铺视图有效 ──
const SORTABLE_COLUMNS = ['cluster']
const sortBy = ref('')
const sortOrder = ref('')

interface SorterEvent {
  order?: string | null
  field?: unknown
  column?: { key?: unknown }
}

function handleTableChange(
  pagination: { current?: number; pageSize?: number },
  _filters: Record<string, unknown>,
  sorter: SorterEvent | SorterEvent[],
) {
  page.value = pagination.current || 1
  if (pagination.pageSize) pageSize.value = pagination.pageSize
  const s = Array.isArray(sorter) ? sorter[0] : sorter
  const field = s && !Array.isArray(s.field) ? String(s.field || s.column?.key || '') : ''
  if (s?.order && SORTABLE_COLUMNS.includes(field)) {
    sortBy.value = field
    sortOrder.value = s.order === 'descend' ? 'desc' : 'asc'
  } else {
    sortBy.value = ''
    sortOrder.value = ''
  }
  loadUpstreams()
}

async function loadUpstreams() {
  loading.value = true
  try {
    const params: any = { page: page.value, page_size: pageSize.value, group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (lbFilter.value) params.load_balance = lbFilter.value
    if (publishFilter.value) params.publish_status = publishFilter.value
    if (searchText.value) params.search = searchText.value
    // 分组视图固定按组内顺序（名称），不参与服务端排序
    if (sortBy.value && viewMode.value === 'flat') {
      params.sort_by = sortBy.value
      params.sort_order = sortOrder.value || 'asc'
    }
    const res = await listUpstreams(params)
    upstreams.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch (error: any) {
    const detail = error?.response?.data?.detail
    const msg = typeof detail === 'string' ? detail : detail?.msg || error?.message || '未知错误'
    message.error('加载上游列表失败: ' + msg)
  } finally {
    loading.value = false
  }
}

async function loadClusters() {
  try {
    const res = await listClusters()
    clusters.value = res.data?.items || res.data || []
  } catch {
    /* ignore */
  }
}

function openCreateModal() {
  editingUpstream.value = null
  copyingUpstream.value = false
  formModalVisible.value = true
}

function closeFormModal() {
  formModalVisible.value = false
  editingUpstream.value = null
}

function onSaved() {
  refreshList()
  closeFormModal()
}

async function deleteUpstream(record: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await getClusterNodes(record.cluster_id)
    nodes = res.data?.items || []
  } catch {
    /* ignore */
  }

  showDeleteConfirm({
    title: `确定要删除上游 "${record.name}" 吗？`,
    apiEndpoint: `/clusters/${record.cluster_id}/upstreams/${record.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除上游: ${record.name}`,
        apiEndpoint: `/clusters/${record.cluster_id}/upstreams/${record.id}`,
        cluster: { id: record.cluster_id, nodes },
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: refreshList,
        clearSelectedFn: () => {},
      })
    },
  })
}

async function onPublishConfirm(nodeIds: number[]) {
  publishModalVisible.value = false
  const record = publishingRecord.value
  if (!record) return
  await executePublish({
    title: `发布上游: ${record.name}`,
    apiEndpoint: `/clusters/${record.cluster_id}/upstreams/${record.id}/publish`,
    nodeIds,
    refreshFn: publishRefreshFn.value,
  })
  publishRefreshFn.value = refreshList
}

function onPublishCancel() {
  publishModalVisible.value = false
}

onMounted(() => {
  const clusterId = route.query.cluster_id as string | undefined
  const numeric = Number(clusterId)
  if (Number.isFinite(numeric)) clusterFilter.value = numeric
  loadClusters()
  refreshList()
})

onUnmounted(() => {
  cancelSearch()
})

// 视图模式供测试/调试显式钉位（contract 10.2）
defineExpose({ viewMode })
import type { TableColumnsType } from 'ant-design-vue'
</script>

<style scoped>
.text-muted {
  color: var(--muted);
}
.text-sm {
  font-size: 12px;
}
.cell-primary {
  font-weight: 600;
  color: var(--fg);
}
.cell-secondary {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}

.action-cell {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
</style>
