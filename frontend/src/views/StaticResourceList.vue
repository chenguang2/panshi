<template>
  <!-- 单实现双形态（AGENTS #93 / shared-core-plan 2026-11-21，A 推广第 7 个（最后一个）资源）：
       缺省 = 独立列表页（PageHeader + 分组/集群筛选 + 分组|平铺）；
       传 scopedClusterId = 统一管理最大化面板的「静态资源」Tab（隐藏页头/分组与集群筛选/分组切换与集群带，
       页面级动作改由工具条左侧紧凑钮承载，其余（chips/批量条/卡片网格/卡脚动作/ZIP 弹窗）与页面同一份实现）。 -->
  <div class="sr-page">
    <PageHeader v-if="!isScoped" title="静态资源" description="管理 ZIP 格式的静态资源文件，上传后通过路由分发">
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <!-- 序与设计页一致（AGENTS #88 ⑦）：批量管理（secondary）在「新建」（primary）左侧 -->
        <button class="btn btn-secondary" :aria-pressed="batchMode" @click="toggleBatchMode">
          {{ batchMode ? '退出批量管理' : '批量管理' }}
        </button>
        <button class="btn btn-primary" @click="openAddModal">
          <StrokeIcon name="plus" :size="13" /> 添加静态资源
        </button>
      </template>
    </PageHeader>

    <!-- 工具条 + 状态行（AGENTS #88：与列表页同构）：第一行共享 TableToolbar，第二行 .l5-chiprow -->
    <div class="l5-card sr-card-page" :class="{ 'scope-card': isScoped }">
      <TableToolbar
        v-model:mode="cardMode"
        :count="totalCount"
        count-unit="个静态资源"
        :show-count="false"
        :show-mode="!isScoped"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <!-- scoped：页面级动作（原本在 PageHeader）收敛为工具条左侧紧凑钮（#90 页头动作区规范的 scoped 替代） -->
          <template v-if="isScoped">
            <button class="btn btn-primary btn-sm" data-test="scope-add-static-resource" @click="openAddModal">
              <StrokeIcon name="plus" :size="13" /> 添加静态资源
            </button>
            <button
              class="btn btn-secondary btn-sm"
              data-test="scope-batch-toggle"
              :aria-pressed="batchMode"
              @click="toggleBatchMode"
            >
              {{ batchMode ? '退出批量管理' : '批量管理' }}
            </button>
          </template>
          <SearchInput v-model="searchText" placeholder="搜索名称..." :width="150" @input="onSearch" />
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
        </template>
        <template #mode-extra>
          <button
            v-if="!isScoped && cardMode === 'group'"
            type="button"
            class="tool-btn fold-all-btn"
            data-test="card-fold-all"
            :title="pageHasFolded ? '展开全部集群组' : '收起全部集群组'"
            @click="toggleFoldAll"
          >
            <StrokeIcon :name="pageHasFolded ? 'expandAll' : 'collapseAll'" :size="13" />
            <span class="fold-all-label">{{ pageHasFolded ? '全部展开' : '全部收起' }}</span>
          </button>
        </template>
      </TableToolbar>

      <div class="l5-chiprow" data-test="status-chip-row">
        <span class="chiprow-label">状态</span>
        <div class="f-chips status-chips" role="group" aria-label="按分发状态筛选">
          <button
            v-for="t in statusTabs"
            :key="t.key"
            type="button"
            class="f-chip chip-status"
            :class="{ active: statusFilter === t.key, empty: t.count === 0 }"
            :aria-pressed="statusFilter === t.key ? 'true' : 'false'"
            @click="goStatus(t.key)"
          >
            {{ t.label }}<span class="f-count">{{ t.count }}</span>
          </button>
        </div>
        <span class="t-spacer"></span>
      </div>

      <!-- 批量条（AGENTS #88 ③）：状态行下、网格上、随流；按钮集无「批量发布」 -->
      <div v-if="batchMode" class="l5-batchbar batchbar-dynamic" :class="{ 'has-sel': selectedResourceIds.length > 0 }">
        <span class="b-count">已选 {{ selectedResourceIds.length }} 项</span>
        <span class="b-sep"></span>
        <button
          class="btn btn-danger btn-sm need-sel"
          :disabled="selectedResourceIds.length === 0"
          @click="batchDelete"
        >
          <StrokeIcon name="trash" :size="12" /> 批量删除
        </button>
        <span class="b-spacer"></span>
        <button v-if="showGroupSelectAll" class="link-btn" @click="toggleSelectAllGroup">
          {{ allGroupSelected ? '取消全选分组' : '全选当前分组' }}
        </button>
        <button class="link-btn" @click="toggleSelectAllFiltered">
          {{ allFilteredSelected ? '取消全选结果' : '全选当前筛选结果' }}
        </button>
        <button class="link-btn" @click="clearSelection">清除选择</button>
      </div>

      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="rowsFiltered.length === 0" class="sr-empty">
        <div class="sr-empty-icon">▣</div>
        <div class="sr-empty-text">暂无静态资源</div>
        <button class="btn btn-primary" style="margin-top: 12px" @click="openAddModal">添加静态资源</button>
      </div>
      <div
        v-else
        class="sr-grid card-grid l5-card sr-cards"
        :class="[`mode-${cardMode}`, { 'batch-mode': batchMode, batch: batchMode }]"
      >
        <template v-for="g in renderGroups" :key="g.clusterId">
          <ClusterBand
            v-if="cardMode === 'group'"
            :name="g.clusterName"
            :group="g.groupName"
            :count-label="countLabelOf(g.count)"
            :secondary="secondaryOf(g.rows)"
            :hue-class="g.hueClass"
            :folded="isFolded(g.clusterId)"
            :batch="batchMode"
            :selected-count="selectedCountInGroup(g.rows)"
            @toggle="toggleFold(g.clusterId)"
            @toggle-select="toggleGroupSelect(g.rows)"
          />
          <div
            v-for="sr in g.rows"
            :key="sr.id"
            class="sr-card std-card l5-panel"
            :class="[
              clusterHueClass(sr.cluster_id),
              {
                selected: selectedResourceIds.includes(sr.id),
                'is-selected': selectedResourceIds.includes(sr.id),
                'is-folded': cardMode === 'group' && !groupVisible(g.clusterId),
              },
            ]"
            @click="batchMode && toggleSelect(sr.id)"
          >
            <span class="lp-check" aria-hidden="true"></span>
            <div class="lp-strip">
              <!-- scoped（面板单集群）：集群标识与分组徽标对每张卡恒同值 → 冗余，仅页面形态渲染；
                   右端「绑定 · 路由名」在面板内仍有意义（同集群内各资源绑定的路由仍不同），保留。 -->
              <span v-if="!isScoped" class="lp-tag lp-cluster">{{ sr.cluster_name || '-' }}</span>
              <span v-if="!isScoped && sr.cluster_group_name" class="lp-tag group lp-group">{{
                sr.cluster_group_name
              }}</span>
              <span class="st-algo"
                >绑定 ·
                <b :class="{ 'c-danger': sr.route_exists === false }">{{
                  sr.route_exists === false ? '已删除' : sr.route_name || sr.name
                }}</b></span
              >
            </div>
            <div class="lp-head">
              <div class="lp-title">
                <span class="lp-name" :title="sr.name">{{ sr.name }}</span>
                <span v-if="sr.file_size" class="lp-tag">{{ formatFileSize(sr.file_size) }}</span>
              </div>
              <div class="lp-status">
                <StaticResourceStateTag
                  :current-version="sr.current_version"
                  :last-publish-ok="sr.last_publish_ok ?? null"
                  :route-exists="sr.route_exists ?? null"
                  :updated-at="sr.updated_at"
                  :last-published-at="sr.last_published_at"
                  :publish-detail="sr.last_publish_detail"
                />
              </div>
            </div>
            <div class="lp-body">
              <div class="lp-row">
                <span class="lp-k">路径</span>
                <span class="lp-v mono" :title="sr.url_path">{{ sr.url_path || '—' }}</span>
              </div>
              <!-- 绑定行仅分组视图显示（strip 右端两态都显示绑定路由名，BRIEF §九附） -->
              <div class="lp-row group-only">
                <span class="lp-k">绑定</span>
                <span v-if="sr.route_exists === false" class="lp-v"
                  ><span class="field-danger">关联路由已删除</span></span
                >
                <span v-else class="lp-v"
                  >{{ sr.route_name || sr.name }}
                  <span class="c-dim">{{ sr.route_uri || sr.url_path || '—' }}</span></span
                >
              </div>
              <div v-if="sr.description" class="lp-row">
                <span class="lp-k">描述</span>
                <span class="lp-v dim">{{ sr.description }}</span>
              </div>
              <div class="lp-row">
                <span class="lp-k">上传</span>
                <span class="lp-v mono dim">{{ sr.updated_at ? formatDateTime(sr.updated_at) : '—' }}</span>
              </div>
            </div>
            <!-- 四档提示（BRIEF §4.2）：路由被删 → 配置异常；分发失败 → 附「重发」出口 -->
            <div v-if="staticResourceState(sr) === 'broken'" class="lp-notice alert alert-error">
              <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
              <span class="n-txt">关联路由已不存在，该资源不可访问</span>
            </div>
            <div v-else-if="staticResourceState(sr) === 'failed'" class="lp-notice alert alert-error">
              <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
              <span class="n-txt">{{ failedNoticeText(sr) }}</span>
              <button class="n-act" @click.stop="publishResource(sr)">重发</button>
            </div>
            <div class="lp-foot" @click.stop>
              <button v-if="staticResourceState(sr) === 'failed'" class="op-pub" @click="publishResource(sr)">
                重发失败节点
              </button>
              <button
                v-else
                class="op-pub"
                :disabled="staticResourceState(sr) === 'broken' || !sr.file_size"
                :title="
                  staticResourceState(sr) === 'broken' ? BROKEN_ROUTE_TIP : !sr.file_size ? '暂未上传 ZIP 文件' : ''
                "
                @click="publishResource(sr)"
              >
                发布
              </button>
              <div class="menu-anchor">
                <button
                  type="button"
                  class="op-btn"
                  title="更多操作"
                  aria-label="更多操作"
                  @click.stop="toggleCardMenu(sr.id, $event)"
                >
                  <StrokeIcon name="dots" :size="14" />
                </button>
                <div class="l5-menu" :class="{ open: openMenuId === sr.id, 'flip-up': menuFlipUp }">
                  <template v-if="staticResourceState(sr) !== 'broken'">
                    <button
                      class="mi"
                      :disabled="!sr.file_size"
                      :title="!sr.file_size ? '暂未上传 ZIP 文件' : ''"
                      @click="menuView(sr)"
                    >
                      <span class="mi-main">查看 ZIP 内容</span>
                      <span class="mi-sub">只读列出包内文件</span>
                    </button>
                    <button class="mi" @click="menuEdit(sr)">
                      <span class="mi-main">编辑</span>
                      <span class="mi-sub">改绑路由需重新上传并发布</span>
                    </button>
                    <button class="mi" :disabled="srUploading || !sr.id" @click="menuUpload(sr)">
                      <span class="mi-main">{{ sr.current_version ? '替换 ZIP' : '上传 ZIP' }}</span>
                    </button>
                    <button class="mi" :disabled="!sr.current_version" @click="menuVersion(sr)">
                      <span class="mi-main">版本管理</span>
                      <span class="mi-sub">历史版本查看与回滚</span>
                    </button>
                  </template>
                  <template v-else>
                    <button class="mi" disabled>
                      <span class="mi-main">编辑</span>
                      <span class="mi-sub">关联路由不存在，请先重建路由</span>
                    </button>
                  </template>
                  <hr class="menu-sep" />
                  <button class="mi danger" @click="menuDelete(sr)">
                    <span class="mi-main">删除</span>
                    <span class="mi-sub">删平台配置，可同步删 Edge 已分发文件（弹窗可选）</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
        <!-- 单页全量加载触顶提示（PAGE_SIZE_CARD_GRID=500） -->
        <div
          v-if="totalCount >= PAGE_SIZE_CARD_GRID"
          class="text-sm text-muted"
          style="width: 100%; text-align: center; padding: 12px 0"
        >
          仅显示前 {{ PAGE_SIZE_CARD_GRID }} 个静态资源，请使用搜索缩小范围
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal（B2a：与集群统一管理「静态资源」Tab 共用同一表单组件；页面形态集群不锁、全量可选，
         scoped 形态（面板 Tab）只给作用域集群并锁定） -->
    <StaticResourceFormModal
      :visible="formVisible"
      :editing-resource="editingResource"
      :clusters="formClusterOptions"
      :default-cluster-id="isScoped ? scopedClusterId : null"
      :lock-cluster="isScoped"
      @close="closeForm"
      @saved="onFormSaved"
    />

    <PublishConfirmModal
      v-model:visible="publishVisible"
      :title="publishTitle"
      :cluster-id="publishClusterId"
      :resource-summary="publishSummary"
      overwrite-warning="发布将覆盖所选节点上的现有静态资源文件"
      :preselected-node-ids="publishPreselected"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />
    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="static_resource"
      :resource-id="vmId"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      :hide-config-keys="['file_path', 'route_id', 'edge_uuid']"
      :can-publish="true"
      @version-change="loadResources"
      @published="loadResources"
      @publish-requested="onVmPublishRequested"
    />

    <!-- ZIP Contents Modal（B2a：与集群统一管理「静态资源」Tab 共用同一组件，拉取在组件内） -->
    <ZipContentsModal
      :visible="zipVisible"
      :cluster-id="zipClusterId"
      :resource-id="zipResourceId"
      :resource-name="zipResourceName"
      @close="closeZipContents"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, type Ref } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { formatFileSize, formatDateTime } from '@/utils/format'
import ClusterSelect from '@/components/ClusterSelect.vue'
import { staticResourceState } from '@/utils/staticResourceRoute'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message } from 'ant-design-vue'
import { PAGE_SIZE_CARD_GRID } from '@/constants'

import api from '@/api'
import type { Cluster } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import TableToolbar from '@/components/TableToolbar.vue'
import ClusterBand from '@/components/ClusterBand.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import StaticResourceFormModal from '@/components/StaticResourceFormModal.vue'
import ZipContentsModal from '@/components/ZipContentsModal.vue'
import StaticResourceStateTag from '@/components/StaticResourceStateTag.vue'
import type { StaticResource } from '@/types'
import {
  executePublish,
  showDeleteConfirm,
  executeDeleteWithProgress,
  routeLabel,
  resultStatusLabel,
} from '@/composables/useClusterUtils'
import { useClusterStaticResources } from '@/composables/useClusterStaticResources'
import { useCardClusterGrouping } from '@/composables/useCardClusterGrouping'
import { useBatchDelete } from '@/composables/useBatchDelete'
import { clusterHueClass } from '@/utils/clusterHue'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'
import SearchInput from '@/components/SearchInput.vue'

const resources = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref<string | number>('')
const groupFilter = ref('__all__')

/**
 * 单实现双形态（AGENTS #93 / docs/refactoring/shared-core-plan-2026-11-21.md，A 推广第 7 个（最后一个）资源）：
 * - 不传 `scopedClusterId`：独立卡片页（跨集群、分组/平铺、集群标识与分组徽标、深链 cluster_id）。
 * - 传 `scopedClusterId`：统一管理最大化面板的「静态资源」Tab——只承载该集群：
 *   隐藏 PageHeader / 分组与集群筛选 / `分组|平铺` 切换器 / 分组带（恒平铺）/ 卡片上的集群与分组徽标 / 深链参数；
 *   页面级动作（添加静态资源 / 批量管理）改由工具条左侧紧凑钮承载；
 *   卡片解剖（绑定 strip / 四档提示 / 卡脚「发布 + ⋯」三栏菜单）、ZIP 弹窗、表单弹窗与页面同一份实现；
 *   发布仍走本页的**逐节点 HTTP 腿**发布链路（与 useClusterStaticResources.publishStaticResource 同文案，
 *   但进度日志只此一份——面板专属组件已退场，见 AGENTS #51）。
 */
const props = withDefaults(defineProps<{ scopedClusterId?: number | null }>(), { scopedClusterId: null })
const isScoped = computed(() => props.scopedClusterId != null)
/** 列表请求的集群过滤：scoped 恒取作用域集群，页面形态取筛选下拉 */
function effectiveClusterId(): number | undefined {
  if (props.scopedClusterId != null) return props.scopedClusterId
  return clusterFilter.value ? Number(clusterFilter.value) : undefined
}
/** 分组过滤仅页面形态生效（面板单集群下恒「全部分组」） */
function effectiveGroupName(): string {
  return isScoped.value ? '__all__' : groupFilter.value
}
/** 表单弹窗的集群清单：scoped 下只给当前集群（并锁定选择） */
const formClusterOptions = computed(() => {
  const id = props.scopedClusterId
  if (id == null) return clusters.value
  const c = clusters.value.find((x: any) => x.id === id)
  return [{ id, name: c?.name ?? '', display_name: c?.display_name }]
})

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
  loadResources()
}

function onClusterChange(): void {
  loadResources()
}

async function refreshList(): Promise<void> {
  await loadClusters()
  await loadResources()
}

function onSearch() {
  onDebouncedSearch(() => {
    loadResources()
  })
}

async function loadResources() {
  loading.value = true
  try {
    const params: any = { page_size: PAGE_SIZE_CARD_GRID, group_name: effectiveGroupName() }
    const clusterId = effectiveClusterId()
    if (clusterId != null) params.cluster_id = clusterId
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/static_resources', { params })
    resources.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch {
    message.error('加载静态资源失败')
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

// ── 状态分段（filter-architecture 方案甲：chips 全站单一形态，前端聚合全量页）──
type StatusKey = 'all' | 'pending_upload' | 'pending_dispatch' | 'dispatched' | 'failed' | 'broken'
const statusFilter = ref<StatusKey>('all')
const statusTabs = computed<{ key: StatusKey; label: string; count: number }[]>(() => {
  const c: Record<Exclude<StatusKey, 'all'>, number> = {
    pending_upload: 0,
    pending_dispatch: 0,
    dispatched: 0,
    failed: 0,
    broken: 0,
  }
  for (const sr of resources.value) c[staticResourceState(sr)]++
  return [
    { key: 'all', label: '全部', count: totalCount.value },
    { key: 'pending_upload', label: '待上传', count: c.pending_upload },
    { key: 'pending_dispatch', label: '待分发', count: c.pending_dispatch },
    { key: 'dispatched', label: '已分发', count: c.dispatched },
    { key: 'failed', label: '分发失败', count: c.failed },
    { key: 'broken', label: '配置异常', count: c.broken },
  ]
})
function goStatus(key: StatusKey) {
  statusFilter.value = key
}

const rowsFiltered = computed(() =>
  statusFilter.value === 'all'
    ? resources.value
    : resources.value.filter((sr: any) => staticResourceState(sr) === statusFilter.value),
)

// ── 集群分组 / 平铺双模式（共享组合式 + ClusterBand，AGENTS #87/#88）──
const {
  mode: cardMode,
  groups: cardGroups,
  countLabel: countLabelOf,
  secondaryOf,
  isFolded,
  toggleFold,
  pageHasFolded,
  toggleFoldAll,
  groupVisible,
} = useCardClusterGrouping<any>({
  rows: () => rowsFiltered.value,
  unit: '个资源',
  clusterIdOf: (sr) => sr.cluster_id,
  clusterNameOf: (sr) => sr.cluster_name,
  groupNameOf: (sr) => sr.cluster_group_name,
  secondary: (rows) => {
    const total = rows.reduce((acc: number, sr: any) => acc + (sr.file_size || 0), 0)
    return total > 0 ? `大小 · ${formatFileSize(total)}` : '大小 · —'
  },
})

// scoped（面板 Tab）= 单集群，分组带无意义 → 恒平铺（切换器同时隐藏，见 template 的 :show-mode）
if (isScoped.value) cardMode.value = 'flat'

const renderGroups = computed(() =>
  cardMode.value === 'group'
    ? cardGroups.value
    : [
        {
          clusterId: -1,
          clusterName: '',
          groupName: '',
          hueClass: 'cluster-c1',
          rows: rowsFiltered.value,
          count: rowsFiltered.value.length,
        },
      ],
)

// ── 批量管理模式 ──
const batchMode = ref(false)
const selectedResourceIds = ref<number[]>([])

function toggleBatchMode(): void {
  batchMode.value = !batchMode.value
  if (!batchMode.value) clearSelection()
}
function toggleSelect(id: number): void {
  const i = selectedResourceIds.value.indexOf(id)
  if (i >= 0) selectedResourceIds.value.splice(i, 1)
  else selectedResourceIds.value.push(id)
}
function clearSelection(): void {
  selectedResourceIds.value = []
}
function selectedCountInGroup(rows: any[]): number {
  return rows.filter((sr) => selectedResourceIds.value.includes(sr.id)).length
}
function toggleGroupSelect(rows: any[]): void {
  const ids = rows.map((sr) => sr.id)
  const all = ids.every((id) => selectedResourceIds.value.includes(id))
  selectedResourceIds.value = all
    ? selectedResourceIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedResourceIds.value, ...ids])]
}
const allFilteredSelected = computed(
  () => rowsFiltered.value.length > 0 && rowsFiltered.value.every((sr) => selectedResourceIds.value.includes(sr.id)),
)
function toggleSelectAllFiltered(): void {
  if (allFilteredSelected.value) {
    clearSelection()
  } else {
    selectedResourceIds.value = [...new Set([...selectedResourceIds.value, ...rowsFiltered.value.map((sr) => sr.id)])]
  }
}
const showGroupSelectAll = computed(() => batchMode.value && cardMode.value === 'group')
const allGroupSelected = computed(() => {
  const ids = cardGroups.value.flatMap((g) => g.rows.map((sr: any) => sr.id))
  return ids.length > 0 && ids.every((id) => selectedResourceIds.value.includes(id))
})
function toggleSelectAllGroup(): void {
  const ids = cardGroups.value.flatMap((g) => g.rows.map((sr: any) => sr.id))
  if (allGroupSelected.value) {
    selectedResourceIds.value = selectedResourceIds.value.filter((id) => !ids.includes(id))
  } else {
    selectedResourceIds.value = [...new Set([...selectedResourceIds.value, ...ids])]
  }
}

/** 集群 id → 显示名（批量删除节点清单标注归属集群） */
function clusterNameById(id: number): string {
  const c = clusters.value.find((x: any) => x.id === id)
  return c ? c.display_name || c.name || `集群 ${id}` : `集群 ${id}`
}

/** 批量删除（统一入口 composable/useBatchDelete，AGENTS #88 ⑪） */
const batchDelete = useBatchDelete<any>({
  label: '静态资源',
  endpoint: '/static_resources',
  idField: 'static_resource_ids',
  nameField: 'resource_name',
  rows: () => resources.value.filter((sr: any) => selectedResourceIds.value.includes(sr.id)),
  ids: () => selectedResourceIds.value,
  nameOf: (sr: any) => sr.name,
  clusterIdOf: (sr: any) => sr.cluster_id,
  clusterNameOf: clusterNameById,
  refresh: loadResources,
  clearSelection: () => clearSelection(),
  exitBatch: () => toggleBatchMode(),
  subsetConsequence: '未选中的 {n} 个节点将保留已分发的静态资源文件',
  // 连带删除语义显式化：勾选 Edge 节点后提示「会连带删掉目录」（与单条删除同一文案）
  edgeConsequenceHint: '将连带删除所选节点上的静态资源文件目录，该路径下的文件随之不可访问',
})

// ── 卡片 ⋯ 菜单（flip-up + 文档级关闭，AGENTS #81 三栏结构）──
const openMenuId = ref<number | null>(null)
const menuFlipUp = ref(false)

/**
 * 菜单可用空间的底边：菜单是**卡内绝对定位弹层**，会被最近的 `overflow != visible` 祖先裁剪。
 * 面板里 `.max-panel` 与 Tab 的 `.tab-content` 都是 `overflow: hidden`（圆角收口），只按视口判断
 * 会让「点 ⋯ 只看到一条白边」。故按最近裁剪祖先的底边判定（页面形态无裁剪祖先 → 等价视口，行为不变）。
 */
const MENU_HEIGHT_ESTIMATE = 200
function menuBottomLimit(el: HTMLElement | null): number {
  let limit = window.innerHeight
  let node: HTMLElement | null = el?.parentElement ?? null
  while (node) {
    const style = getComputedStyle(node)
    if (style.overflowY !== 'visible' || style.overflowX !== 'visible') {
      limit = Math.min(limit, node.getBoundingClientRect().bottom)
    }
    node = node.parentElement
  }
  return limit
}

function toggleCardMenu(id: number, event?: MouseEvent): void {
  if (openMenuId.value === id) {
    openMenuId.value = null
    return
  }
  openMenuId.value = id
  const el = (event?.currentTarget as HTMLElement | null) ?? null
  const rect = el?.getBoundingClientRect()
  menuFlipUp.value = rect ? rect.bottom + MENU_HEIGHT_ESTIMATE > menuBottomLimit(el) : false
}
function closeCardMenu(): void {
  openMenuId.value = null
}
function onDocClick(): void {
  if (openMenuId.value !== null) openMenuId.value = null
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  cancelSearch()
})

function menuView(sr: any): void {
  closeCardMenu()
  viewZipContents(sr)
}
function menuEdit(sr: any): void {
  closeCardMenu()
  editResource(sr)
}
function menuUpload(sr: any): void {
  closeCardMenu()
  uploadStaticResource(sr)
}
function menuVersion(sr: any): void {
  closeCardMenu()
  openVersionManagement(sr)
}
function menuDelete(sr: any): void {
  closeCardMenu()
  deleteResource(sr)
}

/** 分发失败警示文案（failed_nodes 取真实持久化 detail，#43：形状以端点实现为准） */
function failedNoticeText(sr: any): string {
  const failed = sr.last_publish_detail?.failed_nodes || []
  if (!failed.length) return '部分节点分发失败'
  const first = failed[0]
  const detail = first.error ? `${first.node} ${first.error}` : first.node
  return `${failed.length} 个节点分发失败（${detail}${failed.length > 1 ? ' 等' : ''}）`
}

const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)
// 版本弹窗出口链：发布完成后的刷新回调可注入「重开版本弹窗」（RouteList 同款范式）
const publishRefreshFn = ref<() => Promise<void>>(loadResources)
// static-resources-ux-close-loop 7.3：失败态预选（其余场景为空数组=默认全选在线）
const publishPreselected = ref<number[]>([])
// 7.3：配置异常态 tooltip 指路文案（两入口同文案）
const BROKEN_ROUTE_TIP = '关联路由不存在，请删除该资源或重建路由'
// ── 上传走共享流（static-resources-ux-close-loop 1.2）────────────────────────
// 本地 input+api.post 直传实现已删除，改用 useClusterStaticResources.uploadStaticResource
// （预检 + 进度弹窗 + 结果行，与集群统一管理 Tab 同款）；上传中禁用全部上传按钮。
const versionModal: VersionModalState = {
  type: ref<'static_resource'>('static_resource'),
  visible: vmVisible,
  resourceId: vmId,
  clusterId: vmClusterId,
  resourceName: vmName,
  edgeUuid: ref(''),
}
const { uploadStaticResource, uploading: srUploading } = useClusterStaticResources({
  clusters: clusters as Ref<Cluster[]>,
  versionModal,
  openPublishModal: async () => [],
  loadRoutes: async () => {},
  afterUpload: () => loadResources(),
})

// ── B2a 表单共用（shared-core-plan 3.1）：页面只持有开关与刷新，
//    字段集/资格校验/换绑二次确认全在共享 StaticResourceFormModal 内（与集群 Tab 同款）。 ──
const formVisible = ref(false)
const editingResource = ref<StaticResource | null>(null)

function openAddModal(): void {
  editingResource.value = null
  formVisible.value = true
}

function editResource(sr: StaticResource): void {
  editingResource.value = sr
  formVisible.value = true
}

function closeForm(): void {
  formVisible.value = false
  editingResource.value = null
}

/** 保存成功（组件已 emit saved + close）：刷新本页列表 */
function onFormSaved(): void {
  closeForm()
  void loadResources()
}

// ── ZIP 内容弹窗（B2a 共享 ZipContentsModal：内容拉取/加载/错误/空态均在组件内）──
const zipVisible = ref(false)
const zipClusterId = ref<number | null>(null)
const zipResourceId = ref<number | null>(null)
const zipResourceName = ref('')

function viewZipContents(sr: StaticResource): void {
  zipClusterId.value = sr.cluster_id ?? null
  zipResourceId.value = sr.id
  zipResourceName.value = sr.name
  zipVisible.value = true
}

function closeZipContents(): void {
  zipVisible.value = false
  zipResourceId.value = null
}

function applyPublishContext(sr: any) {
  publishingRecord.value = sr
  publishClusterId.value = sr.cluster_id
  // static-resources-ux-close-loop 7.3：失败态「重发失败节点」——以持久化 failed_nodes 预选
  publishPreselected.value =
    staticResourceState(sr) === 'failed'
      ? (sr.last_publish_detail?.failed_nodes || [])
          .map((n: { node_id?: number }) => n.node_id)
          .filter((id: number | undefined): id is number => typeof id === 'number')
      : []
}

function publishResource(sr: any) {
  publishRefreshFn.value = loadResources
  applyPublishContext(sr)
  publishVisible.value = true
}

// 版本弹窗「立即发布恢复的配置」出口（共享 VersionManagementModal canPublish 接线）：
// 先关版本弹窗再打开发布确认弹窗（两 overlay 不同屏——版本弹窗 Teleport 到 body 末尾，
// 同 z-index 下恒压住视图内发布框），发布完成后经 publishRefreshFn 刷新并重开版本弹窗
function onVmPublishRequested() {
  const sr = resources.value.find((r: { id: number | null }) => r.id === vmId.value)
  if (!sr) return
  publishRefreshFn.value = async () => {
    await loadResources()
    vmVisible.value = true
  }
  vmVisible.value = false
  applyPublishContext(sr)
  publishVisible.value = true
}

// static-resources-ux-close-loop 9.1：发布确认资源摘要（与 composable 同文案；
// 静态资源发布不产生新版本，不复用 currentVersion 版本提示行）
const publishSummary = computed(() => {
  const sr = publishingRecord.value
  if (!sr) return ''
  return `将把「${sr.name}」v${sr.current_version ?? '-'}（${formatFileSize(sr.file_size || 0)}，${sr.url_path || ''}）分发到所选节点`
})

// 确认/进度标题统一「发布静态资源「{name}」」（static-resources-ux-close-loop 4.4，双入口一致）
const publishTitle = computed(() =>
  publishingRecord.value ? `发布静态资源「${publishingRecord.value.name}」` : '发布静态资源',
)

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const sr = publishingRecord.value
  if (!sr) return
  await executePublish({
    title: `发布静态资源「${sr.name}」`,
    apiEndpoint: `/clusters/${sr.cluster_id}/static-resources/${sr.id}/publish`,
    nodeIds,
    refreshFn: publishRefreshFn.value,
    handleResult: (data: any, addLog: (msg: string) => void, progress: { percent: number; status: string }) => {
      if (data.current_version !== undefined) addLog(`当前版本: v${data.current_version}`)
      if (data.results && data.results.length > 0) {
        addLog('')
        addLog('节点同步结果:')
        for (const r of data.results) {
          const rl = routeLabel(r.route, r)
          // static-resources-ux-close-loop 2.2：状态经 resultStatusLabel 出中文
          addLog(`  ${r.node}: ${resultStatusLabel(r.status)}${r.error ? ' - ' + r.error : ''}${rl ? `（${rl}）` : ''}`)
        }
      }
      progress.percent = 100
      addLog('')
      if (data.success) {
        progress.status = 'success'
        addLog('✅ 发布成功!')
      } else {
        progress.status = 'exception'
        addLog('⚠️ 发布完成，部分节点失败')
      }
    },
  })
  publishRefreshFn.value = loadResources
}

async function deleteResource(sr: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${sr.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch {
    /* ignore */
  }

  showDeleteConfirm({
    title: `确定要删除静态资源 "${sr.name}" 吗？`,
    apiEndpoint: `/clusters/${sr.cluster_id}/static-resources/${sr.id}`,
    nodes,
    // 连带删除语义显式化（AGENTS #88 ⑪ / ssl 域同款）：勾选 Edge 后提示会连带删掉节点上的目录
    edgeConsequenceHint: '将连带删除所选节点上的静态资源文件目录，该路径下的文件随之不可访问',
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除静态资源: ${sr.name}`,
        apiEndpoint: `/clusters/${sr.cluster_id}/static-resources/${sr.id}`,
        cluster: { id: sr.cluster_id, nodes },
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadResources,
        clearSelectedFn: () => {},
      })
    },
  })
}

function openVersionManagement(sr: any) {
  vmId.value = sr.id
  vmClusterId.value = sr.cluster_id
  vmName.value = sr.name
  vmVisible.value = true
}

onMounted(() => {
  // 深链参数仅页面形态生效（面板 Tab 的集群由 props 上下文决定）
  if (!isScoped.value) {
    const clusterId = route.query.cluster_id as string | undefined
    const numeric = Number(clusterId)
    if (Number.isFinite(numeric)) clusterFilter.value = numeric
  }
  loadClusters()
  loadResources()
})

/** 页头徽标（#86② 补充维度）：涉及集群数 + 资源总大小 */
const headerStatItems = computed(() => {
  const total = resources.value.reduce((n, r) => n + (r.file_size || 0), 0)
  return [
    { value: new Set(resources.value.map((r) => r.cluster_id)).size, label: '集群' },
    { value: total > 0 ? formatFileSize(total) : '—', label: '总量' },
  ]
})
</script>

<style scoped>
/* scoped 形态（统一管理最大化面板「静态资源」Tab）：外层沿用页面卡片类，保证工具条/chips/批量条/
   卡片网格的全局解剖规则命中，只压掉外层卡片自身的边框/底色/阴影/圆角，使其融入面板 .dbody 的
   `.tab-content` 封闭容器（不出现卡中卡）。 */
.scope-card {
  border: none;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
  overflow: visible;
}
.loading-state {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
  font-size: 14px;
}
.sr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}
.sr-empty-icon {
  font-size: 40px;
  color: var(--muted);
  margin-bottom: 12px;
  opacity: 0.4;
}
.sr-empty-text {
  font-size: 14px;
  color: var(--muted);
}
/* 网格/卡片解剖样式已上移共享 .card-grid / .std-card / .l5-panel（style.css 单点） */
.sr-card {
  cursor: default;
}
.sr-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px oklch(56% 0.16 210 / 35%);
}
.batch-mode .sr-card {
  cursor: pointer;
}
.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
}
/* 表单（.form-group/.form-label/.route-validation）与 ZIP 表格样式随共享组件迁走（B2a），
   两入口不再各写一份。 */
</style>
