<template>
  <div class="sr-page">
    <PageHeader title="静态资源" description="管理 ZIP 格式的静态资源文件，上传后通过路由分发">
      <template #actions>
        <!-- 序与设计页一致（AGENTS #88 ⑦）：批量管理（secondary）在「新建」（primary）左侧 -->
        <button class="btn btn-secondary" :aria-pressed="batchMode" @click="toggleBatchMode">
          {{ batchMode ? '退出批量管理' : '批量管理' }}
        </button>
        <button class="btn btn-primary" @click="openAddModal">+ 添加静态资源</button>
      </template>
    </PageHeader>

    <!-- 工具条 + 状态行（AGENTS #88：与列表页同构）：第一行共享 TableToolbar，第二行 .l5-chiprow -->
    <div class="l5-card sr-card-page">
      <TableToolbar
        v-model:mode="cardMode"
        :count="totalCount"
        count-unit="个静态资源"
        :show-count="false"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <SearchInput v-model="searchText" placeholder="搜索名称..." :width="150" @input="onSearch" />
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
            @change="onClusterChange"
          />
        </template>
        <template #mode-extra>
          <button
            v-if="cardMode === 'group'"
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
        <button class="btn btn-primary" style="margin-top: 12px" @click="openAddModal">+ 添加静态资源</button>
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
              <span class="lp-tag lp-cluster">{{ sr.cluster_name || '-' }}</span>
              <span v-if="sr.cluster_group_name" class="lp-tag group lp-group">{{ sr.cluster_group_name }}</span>
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

    <!-- Add/Edit Modal -->
    <div class="modal-overlay" id="srFormModal" :style="{ display: formVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ formMode === 'add' ? '添加静态资源' : '编辑静态资源' }}</h2>
          <button class="modal-close" @click="formVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">所属集群 <span class="required">*</span></label>
            <ClusterSelect v-model="formData.cluster_id" :clusters="clusters" :disabled="formMode === 'edit'" />
          </div>
          <div class="form-group">
            <label class="form-label"
              >{{ formMode === 'add' ? '选择路由' : '关联路由（可换绑）' }} <span class="required">*</span></label
            >
            <select v-model="formData.route_id" class="form-input" @change="onRouteChange">
              <option value="">请选择路由</option>
              <option
                v-for="r in availableRoutes"
                :key="r.id"
                :value="r.id"
                :disabled="!staticResourceRouteEligibility(r).eligible"
              >
                {{ r.name }} ({{ r.uri }}){{ routeEligibilitySuffix(r) }}
              </option>
            </select>
            <div class="route-validation">
              <div class="form-hint">选择路由的要求：</div>
              <div class="route-validation-item" :class="uriValid ? 'valid' : 'invalid'">
                {{ uriValid ? '✅' : '❌' }} 路由路径必须以 /* 结尾
              </div>
              <div class="route-validation-item" :class="publishedValid ? 'valid' : 'invalid'">
                {{ publishedValid ? '✅' : '❌' }} 路由必须已发布到 Edge 节点
              </div>
              <div class="route-validation-item" :class="pluginValid ? 'valid' : 'invalid'">
                {{ pluginValid ? '✅' : '❌' }} 路由必须挂载 static_resource 插件
              </div>
              <div v-if="editRouteChanged" class="route-validation-item" style="color: #fa8c16">
                ⚠ 换绑路由后需重新上传并发布到 Edge 节点
              </div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea v-model="formData.description" class="form-input" rows="2" placeholder="可选描述"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="formVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleSubmit" :disabled="formMode === 'add' && !formValid">
            {{ formMode === 'add' ? '创建' : '保存' }}
          </button>
        </div>
      </div>
    </div>

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

    <!-- ZIP Contents Modal -->
    <div class="modal-overlay" id="zipContentsModal" :style="{ display: zipContentsModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide" style="max-width: 800px">
        <div class="modal-header">
          <h2>ZIP 内容 — {{ zipContentsResource?.name || '' }}</h2>
          <button class="modal-close" @click="closeZipContents">&times;</button>
        </div>
        <div class="modal-body" style="max-height: 60vh; overflow: auto">
          <div v-if="zipContentsLoading" class="loading-state">加载中...</div>
          <div v-else-if="zipContentsError" class="sr-empty">
            <div class="sr-empty-icon" style="color: var(--danger)">⚠</div>
            <div class="sr-empty-text" style="color: var(--danger)">{{ zipContentsError }}</div>
          </div>
          <div v-else-if="zipContentsData.items.length === 0" class="sr-empty">
            <div class="sr-empty-icon">📦</div>
            <div class="sr-empty-text">{{ zipContentsMessage || 'ZIP 包内无文件' }}</div>
          </div>
          <div v-else>
            <div
              v-if="zipContentsData.items.length < zipContentsData.total_count"
              style="margin-bottom: 8px; font-size: 12px; color: var(--muted)"
            >
              仅显示前 {{ zipContentsData.items.length }} 个 / 共 {{ zipContentsData.total_count }} 个文件
            </div>
            <table class="zip-table">
              <thead>
                <tr>
                  <th style="width: 50%">文件名</th>
                  <th style="width: 15%; text-align: right">文件大小</th>
                  <th style="width: 15%; text-align: right">压缩后</th>
                  <th style="width: 20%; text-align: right">修改时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in zipContentsData.items" :key="idx">
                  <td style="font-family: var(--font-mono); font-size: 12px">{{ item.name }}</td>
                  <td style="text-align: right; font-family: var(--font-mono); font-size: 12px">
                    {{ formatFileSize(item.file_size) }}
                  </td>
                  <td style="text-align: right; font-family: var(--font-mono); font-size: 12px">
                    {{ formatFileSize(item.compressed_size) }}
                  </td>
                  <td style="text-align: right; font-family: var(--font-mono); font-size: 12px">
                    {{ formatDate(item.modified) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeZipContents">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted, onUnmounted, type Ref } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { formatFileSize, formatDate, formatDateTime } from '@/utils/format'
import ClusterSelect from '@/components/ClusterSelect.vue'
import {
  staticResourceRouteEligibility,
  routeEligibilitySuffix,
  staticResourceState,
} from '@/utils/staticResourceRoute'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message } from 'ant-design-vue'
import { PAGE_SIZE_CARD_GRID, PAGE_SIZE_DROPDOWN } from '@/constants'

import api from '@/api'
import type { Cluster } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import TableToolbar from '@/components/TableToolbar.vue'
import ClusterBand from '@/components/ClusterBand.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
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
import { showDangerConfirm } from '@/composables/useOverlayModal'
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
    const params: any = { page_size: PAGE_SIZE_CARD_GRID, group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
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
})

// ── 卡片 ⋯ 菜单（flip-up + 文档级关闭，AGENTS #81 三栏结构）──
const openMenuId = ref<number | null>(null)
const menuFlipUp = ref(false)
function toggleCardMenu(id: number, event?: MouseEvent): void {
  if (openMenuId.value === id) {
    openMenuId.value = null
    return
  }
  openMenuId.value = id
  const rect = (event?.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  menuFlipUp.value = rect ? rect.bottom + 200 > window.innerHeight : false
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
const formVisible = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const formData = reactive({
  cluster_id: '' as number | string,
  // 铁律（约束 #204 派生）：原生 select 的模型初值/重置点必须与占位 option value='' 精确匹配
  route_id: '' as number | string,
  name: '',
  url_path: '',
  description: '',
})
const editingResource = ref<any | null>(null)
const availableRoutes = ref<any[]>([])
// static-resources-ux-close-loop 8.3：编辑打开时的原路由绑定（换绑检测基准）
const editingOriginalRouteId = ref<number | null>(null)
const editRouteChanged = computed(() => formMode.value === 'edit' && formData.route_id !== editingOriginalRouteId.value)

const uriValid = computed(() => {
  const route = availableRoutes.value.find((r: any) => r.id === formData.route_id)
  return route ? (route.uri || '').trim().endsWith('/*') : false
})
const publishedValid = computed(() => {
  const route = availableRoutes.value.find((r: any) => r.id === formData.route_id)
  return route ? !!(route.current_version || route.published_at) : false
})
const pluginValid = computed(() => {
  const route = availableRoutes.value.find((r: any) => r.id === formData.route_id)
  if (!route) return false
  return (route.plugins || []).some((p: any) => p.plugin_name === 'static_resource')
})
const formValid = computed(() => formData.route_id && uriValid.value && publishedValid.value && pluginValid.value)

const zipContentsModalVisible = ref(false)
const zipContentsResource = ref<any | null>(null)
const zipContentsLoading = ref(false)
const zipContentsError = ref('')
const zipContentsData = ref<{ items: any[]; total_count: number }>({ items: [], total_count: 0 })
const zipContentsMessage = ref('')

async function viewZipContents(sr: any) {
  zipContentsResource.value = sr
  zipContentsModalVisible.value = true
  zipContentsLoading.value = true
  zipContentsError.value = ''
  zipContentsData.value = { items: [], total_count: 0 }
  zipContentsMessage.value = ''
  try {
    const res = await api.get(`/clusters/${sr.cluster_id}/static-resources/${sr.id}/zip-contents`)
    zipContentsData.value = res.data
    zipContentsMessage.value = res.data.message || ''
  } catch (e: any) {
    zipContentsError.value = e?.response?.data?.detail || '获取 ZIP 内容失败'
  } finally {
    zipContentsLoading.value = false
  }
}

function closeZipContents() {
  zipContentsModalVisible.value = false
  zipContentsResource.value = null
}

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

async function openAddModal() {
  formMode.value = 'add'
  formData.cluster_id = ''
  formData.route_id = ''
  formData.name = ''
  formData.url_path = ''
  formData.description = ''
  editingResource.value = null
  availableRoutes.value = []
  formVisible.value = true
}

function editResource(sr: any) {
  formMode.value = 'edit'
  formData.cluster_id = sr.cluster_id
  formData.route_id = sr.route_id
  editingOriginalRouteId.value = sr.route_id ?? null
  formData.name = sr.name
  formData.url_path = sr.url_path || ''
  formData.description = sr.description || ''
  editingResource.value = sr
  // 8.3：换绑下拉需要该集群路由清单（不合格项 disabled + 标注）
  if (sr.cluster_id) void loadRoutes(sr.cluster_id)
  formVisible.value = true
}

async function loadRoutes(cid: number | string) {
  try {
    const res = await api.get(`/clusters/${cid}/routes`, { params: { page_size: PAGE_SIZE_DROPDOWN } })
    availableRoutes.value = res.data.items || []
  } catch {
    availableRoutes.value = []
  }
}

function onRouteChange() {}

watch(
  () => formData.cluster_id,
  (cid) => {
    if (cid && formMode.value === 'add') {
      formData.route_id = ''
      loadRoutes(cid)
    }
  },
)

async function handleSubmit() {
  if (formMode.value === 'add') {
    const cid = formData.cluster_id
    if (!cid) {
      message.warning('请选择所属集群')
      return
    }
    try {
      await api.post(`/clusters/${cid}/static-resources`, {
        route_id: formData.route_id,
        description: formData.description,
      })
      message.success('静态资源已创建')
      formVisible.value = false
      loadResources()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '创建失败')
    }
  } else if (editingResource.value) {
    // static-resources-ux-close-loop 8.3：编辑换绑——变更时校验资格并二次确认
    const routeChanged = editRouteChanged.value && editingOriginalRouteId.value !== null && !!formData.route_id
    if (routeChanged && !formValid.value) {
      message.warning('请选择符合条件（已发布到 Edge 节点且路径以 /* 结尾）的路由')
      return
    }

    const doUpdate = async () => {
      const payload: Record<string, unknown> = { description: formData.description }
      if (routeChanged) payload.route_id = formData.route_id
      await api.put(
        `/clusters/${editingResource.value.cluster_id}/static-resources/${editingResource.value.id}`,
        payload,
      )
      message.success(routeChanged ? '静态资源已换绑，请重新上传并发布' : '静态资源已更新')
      formVisible.value = false
      loadResources()
    }

    if (routeChanged) {
      showDangerConfirm('换绑路由', '换绑路由后需重新上传并发布到 Edge 节点。确定换绑？', '确认换绑', async () => {
        try {
          await doUpdate()
        } catch (e: any) {
          message.error(e?.response?.data?.detail || '更新失败')
        }
      })
      return
    }

    try {
      await doUpdate()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '更新失败')
    }
  }
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
  const clusterId = route.query.cluster_id as string | undefined
  const numeric = Number(clusterId)
  if (Number.isFinite(numeric)) clusterFilter.value = numeric
  loadClusters()
  loadResources()
})
</script>

<style scoped>
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
.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.required {
  color: var(--danger);
}

.form-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

.form-value {
  font-size: 13px;
  color: var(--fg);
  padding: 6px 0;
}

.route-validation {
  margin-top: 6px;
  font-size: 12px;
}

.route-validation-item {
  font-size: 11px;
  margin-top: 2px;
}
.route-validation-item.valid {
  color: #52c41a;
}
.route-validation-item.invalid {
  color: #ff4d4f;
}

.zip-table {
  width: 100%;
  border-collapse: collapse;
}
.zip-table th,
.zip-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}
.zip-table th {
  font-size: 11px;
  color: var(--muted);
  font-weight: 500;
  text-transform: uppercase;
  position: sticky;
  top: 0;
  background: var(--surface);
}
.zip-table tbody tr:hover {
  background: oklch(50% 0 0 / 4%);
}
</style>
