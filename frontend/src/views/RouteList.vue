<template>
  <!-- 单实现双形态（shared-core-plan 2026-11-21，节点/上游试点之后的路由批）：
       缺省 = 独立列表页（PageHeader + 分组/集群筛选 + 分组|平铺）；
       传 scopedClusterId = 统一管理最大化面板的「路由」Tab（隐藏页头/分组与集群筛选/分组切换与集群列，
       页面级动作改由工具条左侧紧凑钮承载，其余（chips/批量条/表格/分页/列配置）与页面同一份实现）。 -->
  <div class="route-list" :class="{ 'route-list-scoped': isScoped }">
    <PageHeader v-if="!isScoped" title="路由管理" description="管理 API 路由规则，配置请求匹配、转发目标和插件">
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal"><StrokeIcon name="plus" :size="13" /> 新建路由</button>
      </template>
    </PageHeader>

    <div ref="cardRef" class="table-container l5-card" :class="{ 'scope-card': isScoped }">
      <!-- 双行工具条（filter-architecture 方案甲）：第一行 = 下拉筛选（分组/集群/上游/插件/方法）；
           第二行 = 发布状态 chips（带权威计数，可点即筛）。方法回归下拉单入口，状态不适合藏在下拉里。
           scoped（面板 Tab）隐藏「分组|平铺」（单集群下无意义，恒平铺）。 -->
      <TableToolbar
        v-model:mode="viewMode"
        :count="totalCount"
        count-unit="条路由"
        :show-count="false"
        :show-mode="!isScoped"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <!-- scoped：页面级动作（原本在 PageHeader）收敛为工具条左侧紧凑钮（#90 页头动作区规范的 scoped 替代） -->
          <button v-if="isScoped" class="btn btn-primary btn-sm" data-test="scope-add-route" @click="openCreateModal">
            <StrokeIcon name="plus" :size="13" /> 添加路由
          </button>
          <SearchInput
            v-if="searchVisible"
            v-model="searchText"
            placeholder="搜索名称、URI、描述、域名..."
            :width="150"
            @input="onSearch"
            @search="onSearchSubmit"
          />
          <!-- 分组/集群筛选仅页面形态（面板恒单集群、恒平铺） -->
          <select
            v-if="!isScoped"
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
            v-if="!isScoped"
            v-model="clusterFilter"
            :clusters="filteredClusters"
            allow-all
            style="width: 120px"
            @change="onClusterChange"
          />
          <select
            v-model="upstreamFilter"
            :title="upstreams.find((u: any) => u.id === Number(upstreamFilter))?.name || ''"
            class="l5-select"
            style="width: 104px"
            @change="onFilterChange"
            :disabled="!upstreams.length && !effectiveClusterId()"
          >
            <option value="">全部上游</option>
            <option v-for="u in upstreams" :key="u.id" :value="u.id">{{ u.name }}</option>
          </select>
          <select
            v-model="pluginFilter"
            :title="pluginOptions.find((pl) => pl.name === pluginFilter)?.display_name || pluginFilter"
            class="l5-select plugin-filter"
            style="width: 104px"
            @change="onFilterChange"
          >
            <option value="">全部插件</option>
            <option v-for="p in pluginOptions" :key="p.name" :value="p.name">{{ p.display_name || p.name }}</option>
          </select>
          <!-- 7.3：全量「方法」下拉，与下方 chips 同值联动（chips 只放常驻高频项） -->
          <select v-model="activeMethod" class="l5-select method-filter" style="width: 104px" @change="onFilterChange">
            <option value="">全部方法</option>
            <option v-for="m in methodOptions" :key="m" :value="m">{{ m }}</option>
          </select>
        </template>
        <template #extra>
          <!-- 「清除排序」（contract 10.5）：仅平铺且存在排序键时可见；点击只清排序并重载，不切模式 -->
          <button v-if="viewMode === 'flat' && sortBy" class="tool-btn" data-test="clear-sort" @click="clearSort">
            清除排序
          </button>
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
            v-if="!isScoped && viewMode === 'group'"
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

      <!-- 状态 chips 附属行（filter-architecture D1/D3）：计数来自后端聚合端点（权威值），
           点击即设 publishFilter 并重取列表；替代页头状态徽标与工具条「全部状态」下拉。 -->
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

      <!-- 批量条（mockup .l5-batchbar，与节点/上游同款解剖）：面板旧「删除路由(N)」入口随
           ClusterRoutes 退场后能力不许丢 → 行选择 + 批量删除补进本共享批量条
           （页面与面板 Tab 同一实现）。动作集只有「批量删除」：路由没有集合级发布端点。 -->
      <div class="l5-batchbar" :class="{ 'has-sel': selectedRouteKeys.length > 0 }">
        <span class="b-count">已选 {{ selectedRouteKeys.length }} 项</span>
        <span class="b-sep"></span>
        <button
          class="btn btn-danger btn-sm need-sel"
          data-test="batch-delete"
          :disabled="!selectedRouteKeys.length"
          @click="handleBatchDelete"
        >
          <StrokeIcon name="trash" /> 批量删除<span v-if="selectedRouteKeys.length"
            >({{ selectedRouteKeys.length }})</span
          >
        </button>
        <span class="b-spacer"></span>
        <button class="btn btn-secondary btn-sm" :disabled="!selectedRouteKeys.length" @click="clearBatchSelection">
          清除选择
        </button>
      </div>

      <a-table
        :data-source="displayRows"
        :columns="visibleColumns"
        :row-key="rowKeyOf"
        :row-selection="rowSelection"
        :custom-row="routeCustomRow"
        :pagination="false"
        :loading="loading"
        :scroll="{ x: minTableWidth }"
        :table-layout="'fixed'"
        size="middle"
        class="route-table grid-table"
        @change="handleTableChange"
      >
        <template #headerCell="{ column, title }">
          <span
            class="th-resize-wrap"
            :class="routeWrapClass(column)"
            @mousedown="startColumnMove($event, column)"
            @click="onSortableHeaderClick(column)"
          >
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
            <div class="cell-primary" :title="record.name">
              {{ record.name }}
              <span v-if="hasDnsPlugin(record)" class="dns-route-badge">DNS</span>
            </div>
            <div class="cell-secondary" :title="record.description || ''">{{ record.description || '-' }}</div>
          </template>

          <!-- 请求匹配合并列（contract 10.1：列键=uri；「方法」勾选控制方法 chips 段、URI 段恒随 uri 键） -->
          <template v-else-if="column.key === 'uri'">
            <div class="match-cell">
              <span v-if="isMethodsSelected()" class="m-row">
                <a-tooltip
                  v-if="(record.methods || '').split(',').length > 3"
                  :title="(record.methods || '').split(',').join(' ')"
                >
                  <span class="m-row">
                    <span
                      v-for="m in (record.methods || '').split(',').slice(0, 3)"
                      :key="m"
                      class="m-tag"
                      :class="m"
                      >{{ m }}</span
                    >
                    <span class="m-tag method-more">+{{ (record.methods || '').split(',').length - 3 }}</span>
                  </span>
                </a-tooltip>
                <template v-else>
                  <span v-for="m in (record.methods || '').split(',')" :key="m" class="m-tag" :class="m">{{ m }}</span>
                </template>
              </span>
              <span v-if="isUriSelected()" class="pipe-uri" :title="record.uri">{{ record.uri }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'upstream'">
            <span class="pipe-up" :title="record.upstream_name || ''">{{ record.upstream_name || '-' }}</span>
          </template>

          <template v-else-if="column.key === 'priority'">
            <span class="prio-txt" :title="`优先级 ${record.priority}：按数值升序依次匹配`"
              >P{{ record.priority }}</span
            >
          </template>

          <template v-else-if="column.key === 'cluster'">
            <span class="cl-cell" :class="clusterHueClass(record.cluster_id)">
              <i class="cl-dot"></i><span class="cl-name">{{ record.cluster_name || '-' }}</span>
            </span>
          </template>

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

          <template v-else-if="column.key === 'created_at'">
            <span class="cell-secondary">{{ formatDate(record.created_at) }}</span>
          </template>

          <template v-else-if="column.key === 'actions'">
            <template v-if="hasDnsPlugin(record)">
              <!-- 7.9：DNS 路由禁用行内操作 + tooltip 指路（替代 toast 拦截）；拍平后发布与菜单一并禁用 -->
              <div class="action-cell">
                <a-tooltip :title="DNS_ROUTE_HINT" placement="top">
                  <button type="button" class="op-pub" disabled>发布</button>
                </a-tooltip>
                <a-tooltip :title="DNS_ROUTE_HINT" placement="top">
                  <a-button type="text" size="small" class="action-trigger-btn" disabled
                    ><StrokeIcon name="dots"
                  /></a-button>
                </a-tooltip>
              </div>
            </template>
            <template v-else>
              <div class="action-cell">
                <!-- 列表操作统一（方案 A）：发布为高频动作行内拍平，与上游/四层/DNS 页对齐 -->
                <button type="button" class="op-pub" @click="publishRoute(record)">发布</button>
                <a-dropdown :trigger="['click']">
                  <a-button type="text" size="small" class="action-trigger-btn"><StrokeIcon name="dots" /></a-button>
                  <!-- 三栏结构（#81）：CRUD → 危险 → 动作；条目/顺序/空栏剔除由 utils/resourceActionMenu
                       统一构建。注释必须在 overlay 槽外：antd Dropdown 取 overlay 槽的第一个 vnode，
                       槽内前导注释会让整个菜单渲染为空 -->
                  <template #overlay>
                    <a-menu class="l5-action-menu">
                      <template v-for="(group, gi) in ROUTE_MENU_GROUPS" :key="group.key">
                        <a-menu-divider v-if="gi > 0" />
                        <a-menu-item
                          v-for="item in group.items"
                          :key="item.key"
                          :danger="item.danger"
                          @click="routeMenuAction(item.key, record)"
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
        </template>

        <template #emptyText>
          <div class="empty5">
            <div class="e-icon">◇</div>
            <div class="e-title">
              <!-- 7.2：空态双形态——无筛选引导新建，有筛选引导清空（含分组重置，C8） -->
              <template v-if="hasActiveFilters">没有符合条件路由</template>
              <template v-else>尚未创建路由</template>
            </div>
            <div class="e-actions">
              <button v-if="hasActiveFilters" class="btn btn-secondary" @click="clearFilters">清空筛选</button>
              <button v-else class="btn btn-primary" @click="openCreateModal">新建路由</button>
            </div>
          </div>
        </template>
      </a-table>
      <ListPager :page="page" :page-size="pageSize" :total="totalCount" unit="条路由" @change="handlePagerChange" />
    </div>

    <RouteFormModal
      :visible="formModalVisible"
      :editing-route="editingRoute"
      :copying-route="isCopy"
      :clusters="formClusterOptions"
      :default-cluster-id="isScoped ? scopedClusterId : defaultClusterId"
      :lock-cluster="isScoped"
      @close="closeFormModal"
      @saved="onSaved"
      @publish-requested="onFormPublishRequested"
    />
    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="route"
      :resource-id="vmId"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      :can-publish="true"
      @version-change="refreshList"
      @published="refreshList"
      @publish-requested="onVmPublishRequested"
    />
    <PublishConfirmModal
      v-model:visible="publishVisible"
      :title="`发布路由「${publishingRecord?.name ?? ''}」`"
      :cluster-id="publishClusterId"
      :current-version="publishingRecord?.current_version ?? null"
      @confirm="onPublish"
      @cancel="publishVisible = false"
    />
    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="previewRecord?.cluster_id ?? null"
      :resource-type="'route'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.name"
      @publish="onPreviewPublish"
    />

    <!-- 批量删除进度：与节点/上游批量条同一组件（BatchActionProgressModal），逐项行 = 路由名 -->
    <BatchActionProgressModal
      v-model:visible="batchProgressVisible"
      :title="batchProgressTitle"
      :items="batchProgressItems"
      :expanded-ip="batchProgressExpandedIp"
      @toggle-expand="toggleBatchProgressExpand"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { useColumnConfig, resolveOrderedColumns, applyColumnWidths } from '@/composables/useColumnConfig'
import { useColumnDragColumns } from '@/composables/useColumnDragColumns'
import { formatDateOnly as formatDate } from '@/utils/format'
import ClusterSelect from '@/components/ClusterSelect.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { CaretDownOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import type { TablePaginationConfig } from 'ant-design-vue'
import api from '@/api'
import { PAGE_SIZE_TABLE, PAGE_SIZE_DROPDOWN } from '@/constants'
import PageHeader from '@/components/PageHeader.vue'
import RouteFormModal from '@/components/RouteFormModal.vue'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import {
  executePublish,
  showDeleteConfirm,
  executeDeleteWithProgress,
  fetchAllClusterNodes,
} from '@/composables/useClusterUtils'
import {
  useListClusterGrouping,
  isGroupHeaderRow,
  type ClusterGroupChip,
  type ListViewMode,
} from '@/composables/useListClusterGrouping'
import { compareRoutePriority } from '@/utils/listGroupSorters'
import { clusterHueClass, CLUSTER_COLUMN_MIN_WIDTH, CLUSTER_COLUMN_WIDTH } from '@/utils/clusterHue'
import TableToolbar from '@/components/TableToolbar.vue'
import { useFitColumnWidths, toDesignWidths } from '@/composables/useFitColumnWidths'
import ClusterGroupRow from '@/components/ClusterGroupRow.vue'
import ListPager from '@/components/ListPager.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import { useRoute } from 'vue-router'
import SearchInput from '@/components/SearchInput.vue'
import { buildResourceActionMenu } from '@/utils/resourceActionMenu'
import BatchActionProgressModal from '@/components/BatchActionProgressModal.vue'
import { createBatchProgressState, type BatchProgressState } from '@/composables/useBatchNodeAction'
import {
  runClusterGroupedBatchRouteDelete,
  routeBatchSummaryMessage,
  type ClusterRouteBatchGroup,
} from '@/composables/useBatchRouteDelete'

const route = useRoute()

/**
 * 单实现双形态（docs/refactoring/shared-core-plan-2026-11-21.md，节点/上游试点之后的路由批）：
 * - 不传 `scopedClusterId`：独立列表页（跨集群、分组/平铺、集群列）。
 * - 传 `scopedClusterId`：统一管理最大化面板的「路由」Tab——只承载该集群：
 *   隐藏 PageHeader / 集群与分组筛选 / 分组带 / 集群列，视图恒平铺；
 *   页面级动作（新建路由）改由工具条左侧紧凑钮承载；
 *   列配置走独立存储键 `route_panel`，与页面 `route_standalone` 互不污染。
 */
const props = withDefaults(defineProps<{ scopedClusterId?: number | null }>(), { scopedClusterId: null })
const isScoped = computed(() => props.scopedClusterId != null)
/** 列表/计数请求的集群过滤：scoped 恒取作用域集群，页面形态取筛选下拉 */
function effectiveClusterId(): number | undefined {
  if (props.scopedClusterId != null) return props.scopedClusterId
  return clusterFilter.value ? Number(clusterFilter.value) : undefined
}
/** 分组过滤仅页面形态生效（面板单集群下恒「全部分组」） */
function effectiveGroupName(): string {
  return isScoped.value ? '__all__' : groupFilter.value
}

const loading = ref(false)
const routes = ref<any[]>([])
const clusters = ref<any[]>([])
const upstreams = ref<any[]>([])
/** 表单弹窗的集群清单：scoped 下只给当前集群（并锁定选择） */
const formClusterOptions = computed(() => {
  const id = props.scopedClusterId
  if (id == null) return clusters.value
  const c = clusters.value.find((x) => x.id === id)
  return [{ id, name: c?.name ?? '', display_name: c?.display_name }]
})
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_TABLE)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
/** 最近一次已生效的搜索词（重复触发不重复清选择，见 runSearch） */
const appliedSearch = ref('')
const clusterFilter = ref<string | number>('')
const groupFilter = ref('__all__')
const upstreamFilter = ref('')

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
  clearBatchSelection()
  onClusterChange()
}

const displayedRoutes = computed(() => routes.value)

// ── 集群分组 + 双模式（list-page-cluster-grouping，共享组合式单点）──
// scoped（面板 Tab）= 单集群，分组带无意义 → 恒平铺（切换器同时隐藏）
const viewMode = ref<ListViewMode>(isScoped.value ? 'flat' : 'group')
/** 发布状态判定（contract 10.3：与行内 PublishStatusTag 同源同序——未发布 → 待发布 → partial → 已发布，
 *  字段 current_version/pending_publish/last_publish_status 即该组件入参，禁止另造口径） */
function routePublishState(r: Record<string, unknown>): 'unpublished' | 'pending' | 'partial' | 'published' {
  if (r.current_version == null) return 'unpublished'
  if (r.pending_publish === true) return 'pending'
  if (r.last_publish_status === 'partial') return 'partial'
  return 'published'
}
/** 组头统计芯片（contract 10.3 路由：数量 + 已发布 + 待发布 + 部分失败；0 项不渲染） */
function routeGroupChips(rows: Array<Record<string, unknown>>): ClusterGroupChip[] {
  let published = 0
  let pending = 0
  let partial = 0
  for (const r of rows) {
    const state = routePublishState(r)
    if (state === 'published') published++
    else if (state === 'pending') pending++
    else if (state === 'partial') partial++
  }
  const chips: ClusterGroupChip[] = []
  if (published) chips.push({ label: `${published} 已发布`, tone: 'ok' })
  if (pending) chips.push({ label: `${pending} 待发布`, tone: 'warn' })
  if (partial) chips.push({ label: `${partial} 部分失败`, tone: 'bad' })
  return chips
}
const { displayRows, sequenceOf, isRowSelectable, toggleFold, pageHasFolded, toggleFoldAll } = useListClusterGrouping({
  rows: () => displayedRoutes.value,
  unit: '路由',
  mode: viewMode,
  // 组内固定序 = 优先级升序（规格 list-page-cluster-grouping）；仅分组模式生效
  sortWithinGroup: compareRoutePriority as (a: Record<string, unknown>, b: Record<string, unknown>) => number,
  chips: routeGroupChips,
})

// 模式切换重查（D2）：平铺 = 服务端排序序（带 sort 参数）、分组 = 组内固定序（不带 sort 参数），
// 两种数据序语义不同，切换必须重拉；排序键跨模式保留（sortBy/sortOrder 不动）
watch(viewMode, () => {
  loadRoutes()
})

/** 组标记行单元格协议（contract 10.6） */
function groupHeaderCellProps(record: unknown, isFirst: boolean): Record<string, unknown> {
  if (!isGroupHeaderRow(record)) return {}
  // colSpan 额外 +1：组头行的选择列 checkbox（纯视觉噪音，与节点/上游页同款）经 CSS
  // `.l5-group-row .ant-table-selection-column { display:none }` 隐藏，colSpan 补上该列宽度，
  // 通栏仍铺满整行（style.css 单点，见 mockup-parity r2）。
  return isFirst ? { colSpan: visibleColumns.value.length + 1 } : { class: 'l5-group-cell-hidden' }
}
function routeCustomRow(record: unknown): Record<string, unknown> {
  return isGroupHeaderRow(record) ? { class: 'l5-group-row' } : {}
}

/** 合并列内部段显隐（contract 10.1）：「方法」「URI」为两个独立勾选键 */
function isMethodsSelected(): boolean {
  return columnsSelected.value.includes('methods')
}
function isUriSelected(): boolean {
  return columnsSelected.value.includes('uri')
}

// ── 页头徽标（filter-architecture D3）：状态分布移到第二行状态 chips（后端权威计数），
//    页头只保留总数——同一组数字不再出现两次，也避免 500 抽样当全量（旧实现在 1596 条时
//    「未发布」显示 331 而真实 1421）。
// 页头徽标 = 补充维度「涉及 N 上游」（filter-architecture 决策 G3-甲）：
// 总数已在第二行 chips 的「全部 N」与分页条各出现一次，页头不再重复，改放 chips 表达不了的依赖规模。
const headerStatItems = computed(() => [{ value: statusCounts.value.upstream_count, label: '上游' }])

/** 状态 chips 计数（决策 D4）：后端聚合端点，与列表业务筛选同口径、不含 publish_status */
const statusCounts = ref<{
  total: number
  published: number
  pending: number
  unpublished: number
  upstream_count: number
}>({
  total: 0,
  published: 0,
  pending: 0,
  unpublished: 0,
  upstream_count: 0,
})
async function loadStatusCounts(): Promise<void> {
  try {
    const params: Record<string, string | number> = { group_name: effectiveGroupName() }
    // scoped（面板 Tab）恒带当前集群：chips 计数与列表同口径（面板内看不出别的集群的路由）
    const clusterId = effectiveClusterId()
    if (clusterId != null) params.cluster_id = clusterId
    if (upstreamFilter.value) params.upstream_id = upstreamFilter.value
    if (activeMethod.value) params.method = activeMethod.value
    if (pluginFilter.value) params.plugin = pluginFilter.value
    if (searchText.value) params.search = searchText.value
    const { data } = await api.get('/routes/status-counts', { params })
    statusCounts.value = data
  } catch {
    // 计数失败静默（保留上次值）；列表加载失败由 loadRoutes 提示
  }
}
const statusChips = computed(() => [
  { value: '', label: '全部', count: statusCounts.value.total },
  { value: 'unpublished', label: '未发布', count: statusCounts.value.unpublished },
  { value: 'pending', label: '待发布', count: statusCounts.value.pending },
  { value: 'published', label: '已发布', count: statusCounts.value.published },
])
/** 点状态 chip：设 publishFilter 后按「切换状态 → 重算计数 → 重取列表」顺序刷新
 *  （计数不带 publish_status，故切换状态不会改变各 chip 数字，但筛选其它维度会）。 */
function selectPublishStatus(value: string): void {
  publishFilter.value = value
  page.value = 1
  clearBatchSelection()
  refreshList()
}
/** 刷新语义（design D6）：重拉列表 + 徽标统计；不重置筛选/排序键/视图模式。
 *  顺序化执行（先列表后统计）：并发的两个同名端点请求会让「最后一次调用」类断言产生竞态。 */
async function refreshList(): Promise<void> {
  await loadRoutes()
  await loadStatusCounts()
}
const activeMethod = ref('')

const publishFilter = ref('')
const pluginFilter = ref('')
const pluginOptions = ref<{ name: string; display_name?: string }[]>([])

const formModalVisible = ref(false)
const editingRoute = ref<any | null>(null)
const isCopy = ref(false)
// 7.6（规格 route-management「Deep link preselects cluster」）：深链 ?cluster_id= 进入后
// 手动点「新建路由」时预选该集群；不自动开弹窗（2026-10-26 修复与 cluster-stat-links
// 卡片统计格「查看」语义的撞车，原自动开窗分支无真实消费方）
const defaultClusterId = ref<number | null>(null)
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)

// 默认宽度档（column-personalization-rollout + list-pages-console-restyle L2）：
// 「集群」列移除（集群归属由组头行表达）；方法+URI 合并为「请求匹配」（列键 uri，mockup 256px 档）
const columns: TableColumnsType = [
  { title: '#', key: 'index', width: 45, fixed: 'left' },
  { title: '名称', dataIndex: 'name', key: 'name', sorter: true, width: 170, fixed: 'left' },
  { title: '集群', key: 'cluster', width: 116, sorter: true }, // 仅平铺可见；排序同优先级（服务端 sort_by=cluster）
  { title: '请求匹配', key: 'uri', sorter: true, width: 256 },
  { title: '上游', key: 'upstream', width: 170 },
  { title: '优先级', key: 'priority', sorter: true, width: 90 },
  {
    title: '发布状态',
    key: 'publish_status',
    // 定宽收敛（用户反馈：auto 宽度挤压行内发布后的操作列）；已发布态的完整时间在 ps-date
    // 省略号截断，悬浮 title 已带全量时间（PublishStatusTag 内建）。
    // 220（批 7 胶囊）：partial 态标签 ~170px + gap 6 + 「差异」胶囊 ~42px；日期超宽走省略+tooltip。
    width: 220,
  },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    sorter: true,
    width: 160,
  },
  { title: '操作', key: 'actions', width: 110, fixed: 'right' },
]
// 全量列键（含被「请求匹配」合并列吞并的 methods——仅作列配置勾选/存储键，不单独成列，contract 10.1）
const ALL_COLUMN_KEYS: string[] = (() => {
  const keys = columns.map((c) => String(c.key))
  const at = keys.indexOf('uri') + 1
  return [...keys.slice(0, at), 'methods', ...keys.slice(at)]
})()

// ── 列个性化（column-personalization-rollout）：宽度/顺序持久化 + 拖拽手势共享 composable ──
const {
  popoverVisible: columnPopoverVisible,
  columnsSelected,
  searchVisible,
  columnWidths: routeColumnWidths,
  setColumnWidth: setRouteColumnWidth,
  resetWidths: resetRouteColumnWidths,
  columnOrder: routeColumnOrder,
  setColumnOrder: setRouteColumnOrder,
} = useColumnConfig({
  // 存储键：页面形态 = `route_standalone`，scoped（面板 Tab）= `route_panel`（两形态互不污染）
  key: isScoped.value ? 'route_panel' : 'route_standalone',
  // 全量列键含被合并列吞并的 methods（独立勾选/存储键，contract 10.1；#79 清洗按全量清单）
  defaultColumns: [...ALL_COLUMN_KEYS],
  allColumns: [...ALL_COLUMN_KEYS],
})

// 列顺序：共享 resolveOrderedColumns 单点（未知/重复键剔除，未定位列按设计位落座）
const orderedColumns = computed(() => resolveOrderedColumns(columns, routeColumnOrder.value))

// 列配置勾选清单：合并列的「方法」为独立勾选键（contract 10.1），序号列恒不进勾选
const popoverColumns = computed(() => {
  const out: Array<{ key: string; title: string }> = []
  for (const c of columns) {
    const key = String(c.key)
    if (key === 'index' || key === 'cluster') continue
    out.push({ key, title: String(c.title) })
    if (key === 'uri') out.push({ key: 'methods', title: '方法' })
  }
  return out
})

// 列宽自适应（r6-② 方案 A）：窄于设计总宽（1247）等比收缩，下限 = 设计最小总宽 1130
const cardRef = ref<HTMLElement | null>(null)
// 集群列已在 columns 定义里（仅平铺可见）；分组态不参与列宽缩放
const designWidths = () => {
  const base = toDesignWidths(columns)
  // 集群列只在「页面形态 + 平铺」参与缩放（分组视图由组头承担；scoped 单集群无此列）
  if (!isScoped.value && viewMode.value === 'flat') return base
  const { cluster: _cluster, ...rest } = base
  return rest
}
const { widths: fittedColumnWidths, minTableWidth } = useFitColumnWidths({
  designWidths,
  containerRef: cardRef,
  overrides: () => routeColumnWidths.value,
  flexKey: 'uri',
  // 列内容下限（r7-B4；批 7 publish_status 110→220）：请求匹配（uri）为弹性列不设下限；
  // scroll.x 下限之和 = 762 → 窗口 ≥ ~1150 零横向滚动
  minWidths: () => ({
    ...(!isScoped.value && viewMode.value === 'flat' ? { cluster: CLUSTER_COLUMN_MIN_WIDTH } : {}),
    index: 40,
    name: 110,
    upstream: 100,
    priority: 70,
    publish_status: 220,
    created_at: 90,
    actions: 100,
  }),
})

const visibleColumns = computed(() => {
  const selected = new Set(columnsSelected.value)
  // 序号列恒展示：它不进弹窗，而 antd CheckboxGroup 交互会把它从已选集合里剔除，故此处兜底；
  // 「请求匹配」合并列两键（uri/methods）任一勾选即整列出现（contract 10.1）
  const isVisible = (c: { key?: unknown }) => {
    const k = String(c.key)
    if (k === 'index') return true
    // 集群列仅「页面形态 + 平铺」存在（分组视图由组头承担；scoped 面板单集群下无意义），不进列配置弹窗
    if (k === 'cluster') return !isScoped.value && viewMode.value === 'flat'
    if (k === 'uri') return selected.has('uri') || selected.has('methods')
    return selected.has(k)
  }
  const groupMode = viewMode.value === 'group'
  // 平铺限定排序（table-sorting / contract §3）：分组模式 sorter 置 false（不参与组内序，
  // 排序键跨模式保留于 sortBy/sortOrder，回平铺原样恢复）；分组模式剥离 fixed（contract 10.6）
  const sortable = (c: { key?: unknown; sorter?: unknown }) =>
    groupMode && SORTABLE_COLUMNS.includes(String(c.key)) ? false : c.sorter
  const cols = orderedColumns.value.filter(isVisible).map((c, i) => ({
    ...c,
    sorter: sortable(c),
    fixed: groupMode ? undefined : c.fixed,
    customCell: (record: unknown) => groupHeaderCellProps(record, i === 0),
  }))
  return applyColumnWidths(cols, fittedColumnWidths.value)
})

const {
  wrapClass: routeWrapClass,
  startColumnResize,
  startColumnMove,
} = useColumnDragColumns({
  columns: () => columns,
  orderedKeys: () => orderedColumns.value.map((c) => String(c.key)),
  getWidth: (key) => routeColumnWidths.value[key],
  setColumnWidth: setRouteColumnWidth,
  setColumnOrder: setRouteColumnOrder,
  tableSelector: '.route-table',
  fixedKeys: ['index', 'name', 'actions'],
})

function handleResetColumnWidths(): void {
  resetRouteColumnWidths()
  columnPopoverVisible.value = false
  message.success('已恢复默认列宽')
}

// 7.3：chips 收敛为常驻高频项（全部/GET/POST/PUT/DELETE/PATCH）；全量方法入口
// 收敛到「方法」下拉（methodOptions，与表单方法集一致）
const methodOptions = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']

// 7.9：DNS 路由行内操作统一指路文案（独立页 tooltip 与 Tab 页 tooltip 共用语义）
const DNS_ROUTE_HINT = 'DNS 路由请在「DNS 代理」页管理'

// 分组模式排序拦截提示（规格 list-page-cluster-grouping）：一次性提示，数秒自动消失（message 自动关闭）
const SORT_LOCKED_HINT = '分组模式下不可排序，切换「平铺」后可按表头排序'
/** 表头点击拦截：仅分组模式 + 可排序列触发提示；不改变分组结构与行序，不改排序状态 */
function onSortableHeaderClick(column: { key?: unknown }) {
  if (viewMode.value === 'group' && SORTABLE_COLUMNS.includes(String(column.key))) {
    message.info(SORT_LOCKED_HINT)
  }
}
/** 「清除排序」（contract 10.5）：只清排序键并重载，不切模式；恢复平铺默认序（服务端默认序） */
function clearSort() {
  sortBy.value = ''
  sortOrder.value = ''
  loadRoutes()
}

// 7.2：空态双形态判定——任一筛选生效即视为「有筛选」
const hasActiveFilters = computed(
  () =>
    !!searchText.value ||
    !!clusterFilter.value ||
    groupFilter.value !== '__all__' ||
    !!upstreamFilter.value ||
    !!pluginFilter.value ||
    !!publishFilter.value ||
    !!activeMethod.value,
)

/** 7.2（C8）：清空全部筛选——必须包含分组下拉复位（__all__），并重置回第 1 页重查 */
function clearFilters() {
  searchText.value = ''
  clusterFilter.value = ''
  groupFilter.value = '__all__'
  upstreamFilter.value = ''
  pluginFilter.value = ''
  publishFilter.value = ''
  activeMethod.value = ''
  upstreams.value = []
  sortBy.value = ''
  sortOrder.value = ''
  page.value = 1
  clearBatchSelection()
  loadRoutes()
}

function onFilterChange() {
  page.value = 1
  // 筛选结果变化 → 清空勾选（D9 语义）：否则隐藏行仍留在批量删除集合里
  clearBatchSelection()
  refreshList()
}

/**
 * 执行搜索（防抖与回车共用）：同一关键词重复触发不重复清选择。
 * 2026-11-21 上游批实测：回车曾**又排一个 300ms 防抖任务**，用户在这 300ms 内勾选的行
 * 会被迟到回调的 clearBatchSelection 清掉（选择态「自己消失」）。
 */
function runSearch(): void {
  const keyword = searchText.value
  const changed = keyword !== appliedSearch.value
  appliedSearch.value = keyword
  page.value = 1
  if (changed) clearBatchSelection()
  refreshList()
}

function onSearch() {
  onDebouncedSearch(runSearch)
}

/** 回车/放大镜：立即检索并取消待触发的防抖任务（SearchInput 的 search 事件） */
function onSearchSubmit() {
  cancelSearch()
  runSearch()
}

// ── 服务端排序（batch1 组5 5.1）──
// A4：可排序收敛 name/uri/priority/created_at（列 sorter: true），值域与后端
// routes.py ALLOWED_SORT_FIELDS 对齐（后端保留 status 但前端状态列不渲染、不入口）。
// A5：集群/上游两列移除本地 sorter——本地排序只重排当前页，是排序假象。
const SORTABLE_COLUMNS = ['name', 'uri', 'priority', 'created_at', 'cluster']
const sortBy = ref('')
const sortOrder = ref('')

interface TableSorterEvent {
  field?: string | string[]
  column?: { key?: string }
  order?: 'ascend' | 'descend' | null
}

/** 分页条事件（ListPager）：表外独立分页，表格本身 `:pagination="false"`（组标记行不占页容量） */
function handlePagerChange(nextPage: number, nextPageSize: number) {
  page.value = nextPage
  if (nextPageSize) pageSize.value = nextPageSize
  clearBatchSelection()
  loadRoutes()
}

/** 仅接列排序（`:pagination="false"` 时 antdv 传 `pagination = {}` → 排序回落第 1 页） */
function handleTableChange(
  pagination: TablePaginationConfig,
  _filters: Record<string, unknown>,
  sorter: TableSorterEvent | TableSorterEvent[],
) {
  page.value = pagination.current || 1
  if (pagination.pageSize) pageSize.value = pagination.pageSize
  // 多列排序时 antdv 传数组，本页单列排序取第一项
  const s = Array.isArray(sorter) ? sorter[0] : sorter
  const field = s && !Array.isArray(s.field) ? String(s.field || s.column?.key || '') : ''
  if (s && s.order && SORTABLE_COLUMNS.includes(field)) {
    sortBy.value = field
    sortOrder.value = s.order === 'descend' ? 'desc' : 'asc'
  } else {
    sortBy.value = ''
    sortOrder.value = ''
  }
  loadRoutes()
}

async function loadRoutes() {
  loading.value = true
  try {
    const params: any = { page: page.value, page_size: pageSize.value, group_name: effectiveGroupName() }
    // scoped（面板 Tab）恒带当前集群；页面形态取筛选下拉
    const clusterId = effectiveClusterId()
    if (clusterId != null) params.cluster_id = clusterId
    if (upstreamFilter.value) params.upstream_id = upstreamFilter.value
    if (activeMethod.value) params.method = activeMethod.value
    if (publishFilter.value) params.publish_status = publishFilter.value
    if (pluginFilter.value) params.plugin = pluginFilter.value
    if (searchText.value) params.search = searchText.value
    // 平铺限定排序（D2/contract §3）：分组模式请求不带排序参数（组内固定序）；
    // 排序键跨模式保留，回平铺后按 sortBy/sortOrder 原样恢复服务端排序
    if (sortBy.value && viewMode.value === 'flat') {
      params.sort_by = sortBy.value
      params.sort_order = sortOrder.value
    }
    const res = await api.get('/routes', { params })
    routes.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch (error: any) {
    const detail = error?.response?.data?.detail
    const msg = typeof detail === 'string' ? detail : detail?.msg || error?.message || '未知错误'
    message.error('加载路由列表失败: ' + msg)
  } finally {
    loading.value = false
  }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch {
    /* ignore */
  }
}

async function loadUpstreams(cid?: number) {
  if (!cid) {
    upstreams.value = []
    return
  }
  try {
    const res = await api.get(`/clusters/${cid}/upstreams`, { params: { page_size: PAGE_SIZE_DROPDOWN } })
    upstreams.value = res.data.items || []
  } catch {
    upstreams.value = []
  }
}

function onClusterChange() {
  upstreamFilter.value = ''
  page.value = 1
  clearBatchSelection()
  loadUpstreams(Number(clusterFilter.value) || undefined)
  refreshList()
}

function openCreateModal() {
  editingRoute.value = null
  isCopy.value = false
  defaultClusterId.value = deepLinkedClusterId.value
  formModalVisible.value = true
}
function editRoute(r: any) {
  editingRoute.value = r
  isCopy.value = false
  formModalVisible.value = true
}
function hasDnsPlugin(r: any): boolean {
  return Array.isArray(r.plugins) && r.plugins.some((p: any) => p.plugin_name === 'dns_upstream')
}
function closeFormModal() {
  formModalVisible.value = false
  editingRoute.value = null
  isCopy.value = false
}
function onSaved() {
  refreshList()
  closeFormModal()
}

function copyRoute(r: any) {
  editingRoute.value = r
  isCopy.value = true
  formModalVisible.value = true
}

function publishRoute(r: any) {
  publishingRecord.value = r
  publishClusterId.value = r.cluster_id
  // 行内发布默认只刷新列表；版本弹窗出口条发布会用「刷新 + 重开版本弹窗」覆盖此默认（组3 3.1）
  publishRefreshFn.value = refreshList
  publishVisible.value = true
}

// 发布差异预览（publish-diff-preview）：预览弹窗自持拉取；「去发布」接既有发布确认流程
const previewVisible = ref(false)
const previewRecord = ref<any>(null)

function openPublishPreview(r: any) {
  previewRecord.value = r
  previewVisible.value = true
}

function onPreviewPublish() {
  const r = previewRecord.value
  previewVisible.value = false
  if (r) publishRoute(r)
}

// 本次发布完成后的刷新动作（组3 3.1）：发布确认弹窗是行内发布与版本弹窗出口条共用的单入口，
// 出口条链路通过覆盖本刷新函数在发布成功后重开版本弹窗（重开触发既有 open watch 重载版本列表并复位出口条）
const publishRefreshFn = ref<() => Promise<void>>(refreshList)

async function onPublish(nodeIds: number[]) {
  publishVisible.value = false
  const r = publishingRecord.value
  if (!r) return
  await executePublish({
    title: `发布路由: ${r.name}`,
    apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}/publish`,
    nodeIds,
    refreshFn: publishRefreshFn.value,
  })
  publishRefreshFn.value = refreshList
}

// route-save-publish-guidance 1.7：表单保存后的「立即发布」出口 → 复用行内发布同一套链路
// （PublishConfirmModal 选节点 → executePublish），保证节点选择/进度/失败汇总与行内发布完全一致；
// 只在用户点「立即发布」后才走到这里，不自动发布。
function onFormPublishRequested(payload: {
  clusterId: number
  routeId: number | null
  name: string
  currentVersion: number | null
}) {
  if (payload.routeId == null) return
  publishingRecord.value = {
    id: payload.routeId,
    cluster_id: payload.clusterId,
    name: payload.name,
    current_version: payload.currentVersion ?? undefined,
  }
  publishClusterId.value = payload.clusterId
  publishRefreshFn.value = loadRoutes
  publishVisible.value = true
}

// 组3 3.1：版本恢复出口条 → 以版本弹窗上下文资源复用既有发布链路（PublishConfirmModal → executePublish）；
// 发布成功后刷新列表并重开版本弹窗（取消同样返回版本弹窗——恢复本身已落库，不丢失）
function onVmPublishRequested() {
  if (vmId.value == null || vmClusterId.value == null || !vmName.value) return
  publishingRecord.value = { id: vmId.value, cluster_id: vmClusterId.value, name: vmName.value }
  publishClusterId.value = vmClusterId.value
  publishRefreshFn.value = async () => {
    await refreshList()
    vmVisible.value = true
  }
  vmVisible.value = false
  publishVisible.value = true
}

async function deleteRoute(r: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    // 全量拉取统一走共享工具（route-management-ux-batch1 组2）：分页循环取全，
    // >500 节点集群的删除确认清单不再被单页 500 静默截断；失败维持既有降级（空清单）
    nodes = await fetchAllClusterNodes<{ id: number; ip: string; management_port: number }>(r.cluster_id)
  } catch {
    /* ignore */
  }

  showDeleteConfirm({
    title: `确定要删除路由 "${r.name}" 吗？`,
    apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除路由: ${r.name}`,
        apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}`,
        cluster: { id: r.cluster_id, nodes },
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: refreshList,
      })
    },
  })
}

// ── 行选择 + 批量删除（路由批量条唯一入口；页面与面板 Tab 同一实现）──────────────
// 行选择语义照抄节点/上游页（contract 10.6：组标记行不可勾选）：
// rowKey = 数据行 id / 组标记行的合成 key。
// DNS 路由（含 dns_upstream 插件）**不可勾选**：它们是「DNS 代理」页的管理对象，整行动作
// 在设计页（routes.html）已钉为禁用；可勾选会让批量删除绕过该守护（面板旧实现同语义）。
const rowKeyOf = (record: any) => (isGroupHeaderRow(record) ? record.key : record.id)
const selectedRouteKeys = ref<number[]>([])
const rowSelection = computed(() => ({
  selectedRowKeys: selectedRouteKeys.value,
  preserveSelectedRowKeys: true,
  columnWidth: 40,
  onChange: (keys: (string | number)[]) => {
    selectedRouteKeys.value = keys.map((k) => Number(k))
  },
  // 组标记行不可勾选（contract 10.6）：antd-vue 的 getCheckboxProps 入参是**记录本身**
  // （不是 `{ record }` 包裹），故直接交给组合式的 isRowSelectable。
  getCheckboxProps: (rec: any) => ({ disabled: !isRowSelectable(rec) || hasDnsPlugin(rec) }),
}))
/** 勾选行（仅当前页数据源；筛选/翻页会清空选择，不会出现「隐藏行仍被删」） */
const batchSelectedRoutes = computed(() =>
  routes.value.filter((r: { id: number }) => selectedRouteKeys.value.includes(r.id)),
)

function clearBatchSelection() {
  selectedRouteKeys.value = []
}

/** 勾选行按 cluster_id 分组（批量端点只有集群作用域；跨集群顺序请求，同节点/上游批量条） */
function groupRoutesByCluster(
  list: Array<{ id: number; name: string; cluster_id: number; cluster_name?: string }>,
): ClusterRouteBatchGroup[] {
  const groups = new Map<number, ClusterRouteBatchGroup>()
  for (const r of list) {
    const g = groups.get(r.cluster_id)
    const row = { id: r.id, name: r.name }
    if (g) g.routes.push(row)
    else
      groups.set(r.cluster_id, {
        clusterId: r.cluster_id,
        clusterName: r.cluster_name || `集群 ${r.cluster_id}`,
        routes: [row],
        nodeIds: [],
      })
  }
  return Array.from(groups.values())
}

// 批量删除进度（与节点/上游批量条同一状态工厂 + 同一渲染组件）
const batchProgress: BatchProgressState = createBatchProgressState()
const {
  visible: batchProgressVisible,
  title: batchProgressTitle,
  items: batchProgressItems,
  expandedIp: batchProgressExpandedIp,
} = batchProgress

function toggleBatchProgressExpand(ip: string) {
  batchProgressExpandedIp.value = batchProgressExpandedIp.value === ip ? null : ip
}

/**
 * 批量删除路由。
 *
 * 危险确认复用单条删除的同一份告知（showDeleteConfirm：数据库记录 / 可同步删 Edge 已发布配置 /
 * 勾选节点后节点不再承载该路由）；执行走 runClusterGroupedBatchRouteDelete（按 cluster_id 分组
 * 顺序请求集合端点，节点选择逐集群裁剪），进度弹窗与节点/上游批量条同款（BatchActionProgressModal）。
 */
async function handleBatchDelete() {
  const list = batchSelectedRoutes.value
  if (list.length === 0) {
    message.warning('请先勾选要删除的路由')
    return
  }
  const groups = groupRoutesByCluster(list)
  // 确认弹窗的 Edge 节点清单：跨集群时逐节点标注归属集群（showDeleteConfirm 依据 clusterName 去重数自动渲染）
  const nodeRows: Array<{ id: number; ip: string; management_port: number; status?: number; clusterName?: string }> = []
  for (const g of groups) {
    try {
      const nodes = await fetchAllClusterNodes<{ id: number; ip: string; management_port: number; status?: number }>(
        g.clusterId,
      )
      g.nodeIds = nodes.map((n) => n.id)
      for (const n of nodes) nodeRows.push(groups.length > 1 ? { ...n, clusterName: g.clusterName } : { ...n })
    } catch {
      /* 节点明细不可用：Edge 删除退化为后端全量遍历（nodeIds 不传） */
    }
  }

  const names = list.map((r: { name: string }) => r.name)
  const title =
    names.length > 3
      ? `确定要删除选中的 ${names.length} 条路由吗？${names.slice(0, 3).join('、')} 等 ${names.length} 条`
      : `确定要删除选中的 ${names.length} 条路由吗？${names.join('、')}`

  showDeleteConfirm({
    title,
    apiEndpoint: `/clusters/${groups[0].clusterId}/routes`,
    nodes: nodeRows,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      const summaries = await runClusterGroupedBatchRouteDelete(
        groups,
        { deleteDb, deleteEdge, nodeIds },
        { progress: batchProgress },
      )
      const { success, failed, text } = routeBatchSummaryMessage(summaries)
      clearBatchSelection()
      await refreshList()
      if (failed === 0) message.success(`已删除 ${success} 条路由`)
      else message.warning(text)
    },
  })
}

function openVersionManagement(r: any) {
  vmId.value = r.id
  vmClusterId.value = r.cluster_id
  vmName.value = r.name
  vmVisible.value = true
}

/**
 * 行内 ⋯ 菜单条目定义（B3）：三栏结构固定 CRUD → 危险 → 动作（#81），
 * 分组顺序/空栏剔除由 utils/resourceActionMenu 单一构建；点击分发到既有单动作函数（业务不变）。
 */
const ROUTE_MENU_GROUPS = buildResourceActionMenu({
  crud: [
    { key: 'copy', title: '复制路由' },
    { key: 'edit', title: '编辑' },
  ],
  danger: [{ key: 'delete', title: '删除', desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）', danger: true }],
  actions: [{ key: 'version', title: '版本管理', desc: '历史版本查看与回滚' }],
})

/** ⋯ 菜单点击分发（key → 既有动作，签名保持原函数不变） */
function routeMenuAction(key: string, record: any): void {
  if (key === 'copy') copyRoute(record)
  else if (key === 'edit') editRoute(record)
  else if (key === 'delete') void deleteRoute(record)
  else if (key === 'version') openVersionManagement(record)
}

async function loadPlugins() {
  try {
    const res = await api.get('/plugins/builtin')
    pluginOptions.value = res.data?.plugins || []
  } catch {
    /* ignore */
  }
}

// 7.6（规格「Deep link preselects cluster」）：?cluster_id= 只做过滤 + 记录预选集群；
// SHALL NOT 自动打开新建弹窗（与 cluster-stat-links 卡片统计格「查看」语义撞车，
// 2026-10-26 修复；自动开窗分支亦无任何真实消费方）
const deepLinkedClusterId = ref<number | null>(null)

function resolveDeepLinkClusterId(): number | null {
  const clusterId = route.query.cluster_id as string | undefined
  if (!clusterId) return null
  const numeric = Number(clusterId)
  const matched = clusters.value.some((c) => c.id === numeric)
  return matched && Number.isFinite(numeric) ? numeric : null
}

onMounted(() => {
  // 深链集群筛选仅页面形态；scoped（面板 Tab）集群由 props 决定
  const clusterId = isScoped.value ? undefined : (route.query.cluster_id as string | undefined)
  if (clusterId) {
    const numeric = Number(clusterId)
    if (Number.isFinite(numeric)) {
      clusterFilter.value = numeric
      // 深链进入：上游下拉选项随深链集群加载（正常路径由 onClusterChange 触发）
      loadUpstreams(numeric)
    }
  } else if (props.scopedClusterId != null) {
    // scoped：上游筛选下拉的选项来自作用域集群（否则该下拉恒禁用）
    loadUpstreams(props.scopedClusterId)
  }
  // plugin-switches-ux-review-fixes 批 2：「查看引用」深链——/routes?search=<plugin_name>
  // 预填搜索框，随首屏请求过滤（useDebouncedSearch 初始值随 loadRoutes 带 search 参数）
  const searchQuery = route.query.search as string | undefined
  if (searchQuery) searchText.value = searchQuery
  // republish/插件开关 批 7 bug4：「查看引用（路由）」深链——/routes?plugin=<name>
  // 预选「全部插件」下拉（pluginFilter，服务端 ?plugin= 参数过滤），不走搜索框
  const pluginQuery = route.query.plugin as string | undefined
  if (pluginQuery) pluginFilter.value = pluginQuery
  loadClusters()
    .then(() => {
      deepLinkedClusterId.value = resolveDeepLinkClusterId()
    })
    .catch(() => {})
  loadPlugins()
  refreshList()
})

onUnmounted(() => {
  cancelSearch()
})

// 视图模式供测试/调试显式钉位（contract 10.2）
defineExpose({ viewMode })
</script>

<style scoped>
/* scoped 形态（统一管理最大化面板「路由」Tab）：外层沿用页面卡片类，
   保证 `.table-container.l5-card .c-idx` / 行内动作钮 / 批量条等全站解剖规则命中，
   只压掉卡片自身的边框/底色/内距/圆角，使其融入面板 .dbody（不出现卡中卡）。 */
.scope-card {
  border: none;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
  overflow: visible;
}

.text-muted {
  color: var(--muted);
}
.text-sm {
  font-size: 12px;
}
.cell-primary {
  font-weight: 600;
  color: var(--fg);
  /* 长路由名（路径形态）必须省略，否则压进「请求匹配」列（2026-11-21 真机实测） */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.cell-secondary {
  font-size: 12px;
  color: var(--muted);
}

/* 方法 chips 附属行（.l5-chiprow/.f-chips 为全局控制台层单点）；与 filter 槽的「全部方法」下拉同值联动 */
.m-row {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
}
/* 溢出收纳徽章（M9 收敛：slice(0, 3) + 溢出计数）——m-tag 族的弱化变体 */
.m-tag.method-more {
  background: oklch(0% 0 0 / 6%);
  color: var(--muted);
  border-color: transparent;
}

.action-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 发布状态列定宽 160 后：已发布态「vX + 完整时间」超宽走省略号（PublishStatusTag 的
   ps-date 自带 title 悬浮全量时间），避免换行撑高行 */
:deep(.publish-status) {
  max-width: 100%;
  white-space: nowrap;
}

:deep(.ps-date) {
  display: inline-block;
  vertical-align: bottom;
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dns-route-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  background: oklch(55% 0.18 280 / 18%);
  color: oklch(40% 0.18 280);
  border: 1px solid oklch(55% 0.18 280 / 30%);
  line-height: 1.4;
  margin-left: 6px;
  vertical-align: middle;
}
</style>
