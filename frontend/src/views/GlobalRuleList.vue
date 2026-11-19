<template>
  <div class="gr-page">
    <PageHeader title="全局规则" description="全局规则对所属集群的全部路由生效，修改后需发布才会在 Edge 节点生效">
      <template #actions>
        <!-- AGENTS #88 ⑦：批量管理（secondary）在「新建」（primary）左侧 -->
        <button class="btn btn-secondary" :aria-pressed="batchMode" @click="toggleBatchMode">
          {{ batchMode ? '退出批量管理' : '批量管理' }}
        </button>
        <button class="btn btn-primary" @click="openCreateModal">+ 添加全局规则</button>
      </template>
    </PageHeader>

    <!-- 工具条 + 状态行 + 批量条（AGENTS #87/#88：与列表页、其余卡片页同构）-->
    <div class="l5-card sp-card-page">
      <TableToolbar
        v-model:mode="cardMode"
        :count="totalCount"
        count-unit="个全局规则"
        :show-count="false"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <SearchInput
            v-model="searchText"
            placeholder="搜索全局规则名称..."
            :width="150"
            @input="onSearch"
            @clear="loadRules"
          />
          <select v-model="groupFilter" class="l5-select" style="width: 104px" @change="onGroupChange">
            <option value="__all__">全部分组</option>
            <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
            <option value="__ung__">未分组</option>
          </select>
          <ClusterSelect
            v-model="clusterFilter"
            :clusters="filteredClusters"
            allow-all
            style="width: 120px"
            @change="loadRules"
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
        <div class="f-chips status-chips" role="group" aria-label="按发布状态筛选">
          <button
            v-for="t in statusChips"
            :key="t.key"
            type="button"
            class="f-chip chip-status"
            :class="{ active: statusFilter === t.key, empty: t.count === 0 }"
            :aria-pressed="statusFilter === t.key ? 'true' : 'false'"
            @click="statusFilter = t.key"
          >
            {{ t.label }}<span class="f-count">{{ t.count }}</span>
          </button>
        </div>
        <span class="t-spacer"></span>
      </div>

      <!-- 批量条（AGENTS #88 ③）：状态行下、网格上、随流；只有「批量删除」 -->
      <div v-if="batchMode" class="l5-batchbar batchbar-dynamic" :class="{ 'has-sel': selectedIds.length > 0 }">
        <span class="b-count">已选 {{ selectedIds.length }} 项</span>
        <span class="b-sep"></span>
        <button class="btn btn-danger btn-sm need-sel" :disabled="selectedIds.length === 0" @click="batchDelete">
          <StrokeIcon name="trash" :size="12" /> 批量删除
        </button>
        <span class="b-spacer"></span>
        <button class="link-btn" @click="toggleSelectAllFiltered">
          {{ allFilteredSelected ? '取消全选结果' : '全选当前筛选结果' }}
        </button>
        <button class="link-btn" @click="clearSelection">清除选择</button>
      </div>
      <!-- 7.5：超卡片网格单次取数上限截断提示（Dashboard 先例） -->
      <div v-if="rulesTruncated" class="gr-truncate-notice">仅显示前 500 条，请用筛选缩小范围</div>

      <div v-if="loading" class="loading-state">加载中...</div>
      <!-- 7.6 空态两分支：无数据给行动入口，有筛选无结果给清空筛选 -->
      <div v-else-if="displayedRules.length === 0" class="gr-empty">
        <template v-if="hasActiveFilters">
          <div class="gr-empty-icon">◎</div>
          <div class="gr-empty-text">无匹配结果</div>
          <button class="btn btn-secondary gr-empty-action" @click="clearFilters">清空筛选</button>
        </template>
        <template v-else>
          <div class="gr-empty-icon">▣</div>
          <div class="gr-empty-text">暂无全局规则</div>
          <button class="btn btn-primary gr-empty-action" @click="openCreateModal">+ 添加全局规则</button>
        </template>
      </div>
      <div
        v-else
        class="gr-grid card-grid l5-card sp-cards"
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
            v-for="pc in g.rows"
            :key="pc.id"
            class="gr-card std-card l5-panel"
            :class="[
              clusterHueClass(pc.cluster_id),
              {
                selected: selectedIds.includes(pc.id),
                'is-selected': selectedIds.includes(pc.id),
                'is-folded': cardMode === 'group' && !groupVisible(g.clusterId),
              },
            ]"
            @click="batchMode && toggleSelect(pc.id)"
          >
            <span class="lp-check" aria-hidden="true"></span>
            <div class="lp-strip">
              <span class="lp-tag lp-cluster">{{ pc.cluster_name || '-' }}</span>
              <span v-if="pc.cluster_group_name" class="lp-tag group lp-group">{{ pc.cluster_group_name }}</span>
              <span class="st-algo"
                >生效 · <b>全部路由 {{ pc.route_count ?? 0 }} 条</b></span
              >
            </div>
            <div class="lp-head">
              <div class="lp-title">
                <span class="lp-name" :title="pc.name">{{ pc.name }}</span>
              </div>
              <div class="lp-status status-cell-flex">
                <PublishStatusTag
                  :version="pc.current_version"
                  :published-at="pc.published_at"
                  :pending="pc.pending_publish === true"
                  :last-publish-status="pc.last_publish_status"
                />
                <PublishDiffButton
                  :pending="pc.pending_publish === true"
                  :last-publish-status="pc.last_publish_status"
                  @click.stop="openPublishPreview(pc)"
                />
              </div>
            </div>
            <div class="lp-body">
              <div class="lp-row">
                <span class="lp-k">插件</span>
                <div class="lp-chips">
                  <span v-for="pname in pluginNames(pc)" :key="pname" class="lp-chip">{{ pname }}</span>
                  <span v-if="!pluginNames(pc).length" class="lp-v dim" title="发布时将下发空插件集">未选择插件</span>
                </div>
                <span v-if="pluginNames(pc).length" class="lp-cnt">{{ pluginNames(pc).length }} 个</span>
              </div>
              <div v-if="pc.description" class="lp-row">
                <span class="lp-k">描述</span>
                <span class="lp-v dim" :title="pc.description">{{ pc.description }}</span>
              </div>
              <!-- 生效路由数：低信息量单值 → 平铺由 strip 承担（group-only） -->
              <div class="lp-row group-only">
                <span class="lp-k">生效</span>
                <span class="lp-v mono">全部路由 · {{ pc.route_count ?? 0 }} 条</span>
              </div>
            </div>
            <!-- 部分失败：文案两态（republish-failed-nodes D3/D4）+ 重发 / 查看差异双动作 -->
            <div v-if="pc.last_publish_status === 'partial' && !pc.pending_publish" class="lp-notice alert alert-error">
              <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
              <span class="n-txt">{{ partialNoticeText(pc) }}</span>
              <button class="n-act" :disabled="republishLoading" @click.stop="republishFailedNodes(pc)">
                {{ republishLoading ? '获取失败节点…' : '重发失败节点' }}
              </button>
              <button class="n-act ghost" @click.stop="openPublishPreview(pc)">查看差异</button>
            </div>
            <div class="lp-foot" @click.stop>
              <button class="op-pub" @click="publishRule(pc)">发布</button>
              <div class="menu-anchor">
                <button
                  type="button"
                  class="op-btn"
                  title="更多操作"
                  aria-label="更多操作"
                  @click.stop="toggleCardMenu(pc.id, $event)"
                >
                  <StrokeIcon name="dots" :size="14" />
                </button>
                <div class="l5-menu" :class="{ open: openMenuId === pc.id, 'flip-up': menuFlipUp }">
                  <button class="mi" @click="menuView(pc)">
                    <span class="mi-main">查看</span>
                  </button>
                  <button class="mi" @click="menuEdit(pc)">
                    <span class="mi-main">编辑</span>
                  </button>
                  <button class="mi" @click="menuVersion(pc)">
                    <span class="mi-main">版本管理</span>
                    <span class="mi-sub">历史版本查看与回滚</span>
                  </button>
                  <hr class="menu-sep" />
                  <button class="mi danger" @click="menuDelete(pc)">
                    <span class="mi-main">删除</span>
                    <span class="mi-sub">删平台配置，可同步删 Edge 全局规则（弹窗可选）</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <PluginEntityFormModal
      :visible="formVisible"
      :editing-config="editingConfig"
      :clusters="clusters"
      resource-type="global_rule"
      with-publish-guide
      @close="closeForm"
      @saved="onSaved"
      @publish-requested="onFormPublishRequested"
    />

    <GlobalRuleViewDrawer v-model:visible="viewDrawerVisible" :config="viewingGr" />

    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="global_rule"
      :resource-id="vmId"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      :can-publish="true"
      @version-change="loadRules"
      @published="loadRules"
      @publish-requested="onVmPublishRequested"
    />

    <PublishConfirmModal
      v-model:visible="publishVisible"
      :title="publishTitle"
      :cluster-id="publishClusterId"
      :preselected-node-ids="publishPreselected"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />

    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="previewRecord?.cluster_id ?? null"
      :resource-type="'global_rule'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.name"
      @publish="onPreviewPublish"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { useRoute } from 'vue-router'
import ClusterSelect from '@/components/ClusterSelect.vue'

const route = useRoute()
import { message } from 'ant-design-vue'
import { PAGE_SIZE_CARD_GRID, PAGE_SIZE_DROPDOWN } from '@/constants'
import { listGlobalRules } from '@/api/globalRules'
import { listBuiltinPlugins } from '@/api/pluginMetadata'
import { listClusters, getClusterNodes } from '@/api/clusters'
import PageHeader from '@/components/PageHeader.vue'
import PluginEntityFormModal from '@/components/PluginEntityFormModal.vue'
import GlobalRuleViewDrawer from '@/components/GlobalRuleViewDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { globalRuleDeleteWarning } from '@/composables/useClusterPluginEntity'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'
import { getApiErrorMessage } from '@/utils/error'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import SearchInput from '@/components/SearchInput.vue'

const rules = ref<any[]>([])
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

// ── 插件引用过滤（plugin-ref-filter D3/D4）：常驻「插件」下拉（服务端过滤）──
// 选项 = /plugins/builtin?all=1（含已禁用插件）：禁用插件的既有引用是「查看引用」
// 高频场景——与 RouteList（仅启用）有意不同构，勿「统一」掉。
const pluginFilter = ref('')
const pluginOptions = ref<{ name: string; display_name?: string }[]>([])

async function loadPluginOptions() {
  try {
    const res = await listBuiltinPlugins({ all: 1 })
    const opts = (res.data?.plugins || []) as { name: string; display_name?: string }[]
    // 深链兜底（约束 #204：值必须命中 option 才有选中态）：features.yaml enabled_plugins
    // 白名单是 all=1 也绕不开的硬上限——历史引用的插件可能不在部署契约内，深链值
    // 不在选项集时追加裸名选项（display 缺省回落标识名），否则下拉空白。
    if (pluginFilter.value && !opts.some((o) => o.name === pluginFilter.value)) {
      opts.push({ name: pluginFilter.value })
    }
    pluginOptions.value = opts
  } catch {
    /* ignore */
  }
}

function onPluginFilterChange() {
  loadRules()
}

function onGroupChange() {
  clusterFilter.value = ''
  loadRules()
}

const displayedRules = computed(() => {
  return [...rules.value].sort((a, b) => {
    const ga = a.cluster_group_name || ''
    const gb = b.cluster_group_name || ''
    if (ga && !gb) return 1
    if (!ga && gb) return -1
    return ga.localeCompare(gb)
  })
})

// ── 2.5 工具栏计数（D9：本地统计，不发新请求；截断时基于已加载数据） ──
const unpublishedCount = computed(() => rules.value.filter((r) => !r.current_version).length)
const pendingCount = computed(() => rules.value.filter((r) => r.pending_publish === true).length)
/** 7.5 截断提示：列表达到卡片网格单次取数上限（软措辞兜住恰好 500 的假阳性，Dashboard 先例） */
const rulesTruncated = computed(() => rules.value.length >= PAGE_SIZE_CARD_GRID)

/** 7.6 空态两分支判定：搜索词 / 分组 / 集群任一筛选生效即为「有匹配条件」 */
const hasActiveFilters = computed(
  () => searchText.value.trim() !== '' || clusterFilter.value !== '' || groupFilter.value !== '__all__',
)

function clearFilters() {
  searchText.value = ''
  clusterFilter.value = ''
  groupFilter.value = '__all__'
  loadRules()
}

/** 7.5 搜索一键清空（allow-clear 语义）：清词并立即重载 */
const formVisible = ref(false)
const editingConfig = ref<any | null>(null)
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const viewDrawerVisible = ref(false)
const viewingGr = ref<any | null>(null)
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)
/** 本次发布完成后的刷新动作：卡片发布刷新列表；版本弹窗出口条发布额外重开弹窗重载版本列表 */
const publishRefreshFn = ref<() => Promise<void>>(loadRules)

// ── 重发失败节点（republish-failed-nodes：预览取失败集合并预选，单一实现）──
const { loading: republishLoading, resolve: resolveFailedNodes } = useRepublishFailedNodes()
// 解析成功后的具体文案缓存（会话内按资源 id；主键全库唯一）
const republishNotices = ref<Record<number, string>>({})
const publishPreselected = ref<number[]>([])

/** 卡内「发布未完全生效」文案：默认泛化；解析成功后升级为具体失败节点 */
function partialNoticeText(pc: any): string {
  // 三级回退（D11）：持久化明细（方案 B，打开即见）→ 会话内预览解析缓存 → 泛化
  return (
    noticeTextFromPublishDetail(pc?.last_publish_detail) ??
    republishNotices.value[pc?.id] ??
    '发布未完全生效，请查看发布差异'
  )
}

async function republishFailedNodes(pc: any): Promise<void> {
  const outcome = await resolveFailedNodes({ id: pc.id, cluster_id: pc.cluster_id }, 'global_rule')
  if (!outcome) return
  if (outcome.ok && outcome.noticeText) {
    republishNotices.value[pc.id] = outcome.noticeText
    publishingRecord.value = pc
    publishClusterId.value = pc.cluster_id
    publishRefreshFn.value = loadRules
    publishPreselected.value = outcome.failedNodeIds
    publishVisible.value = true
  } else {
    message.warning('未能获取失败节点，请通过「查看差异」排查')
  }
}

/** 7.1：发布确认弹窗标题携带资源名 */
const publishTitle = computed(() =>
  publishingRecord.value ? `发布全局规则: ${publishingRecord.value.name}` : '发布全局规则',
)

function onSearch() {
  onDebouncedSearch(() => {
    loadRules()
  })
}

async function loadRules() {
  loading.value = true
  try {
    const params: any = { page_size: PAGE_SIZE_CARD_GRID, group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (searchText.value) params.search = searchText.value
    if (pluginFilter.value) params.plugin = pluginFilter.value
    const res = await listGlobalRules(params)
    rules.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch (error: unknown) {
    // 7.2：错误经 getApiErrorMessage 透出后端原因
    message.error(`加载全局规则失败：${getApiErrorMessage(error)}`)
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
  editingConfig.value = null
  formVisible.value = true
}
function editRule(pc: any) {
  editingConfig.value = pc
  formVisible.value = true
}
function closeForm() {
  formVisible.value = false
  editingConfig.value = null
}
function onSaved() {
  loadRules()
  closeForm()
}

// publish-guide 批 2：表单保存引导「立即发布」→ 打开该全局规则的发布弹窗（与行内发布同链路）
function onFormPublishRequested(payload: {
  clusterId: number | string
  entityId: number | null
  name: string
  currentVersion: number | null
}) {
  publishingRecord.value = {
    id: payload.entityId,
    cluster_id: payload.clusterId,
    name: payload.name,
    current_version: payload.currentVersion,
  }
  publishClusterId.value = payload.clusterId as number
  publishPreselected.value = []
  publishVisible.value = true
}

function viewRule(pc: any) {
  viewingGr.value = pc
  viewDrawerVisible.value = true
}

async function deleteRule(pc: any) {
  // 5.1（M4）：删除链路节点取数显式全量（对齐删集群先例 page_size=PAGE_SIZE_DROPDOWN）
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await getClusterNodes(pc.cluster_id, { page: 1, page_size: PAGE_SIZE_DROPDOWN })
    nodes = res.data?.items || []
  } catch {
    /* ignore */
  }

  showDeleteConfirm({
    title: `确定要删除全局规则 "${pc.name}" 吗？`,
    apiEndpoint: `/clusters/${pc.cluster_id}/global_rules/${pc.id}`,
    nodes,
    // 3.2（H4）：集群级警示行，文案与集群子页共用 globalRuleDeleteWarning 单点
    extraWarning: pc.cluster_name ? globalRuleDeleteWarning(pc.cluster_name) : undefined,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除全局规则: ${pc.name}`,
        apiEndpoint: `/clusters/${pc.cluster_id}/global_rules/${pc.id}`,
        cluster: { id: pc.cluster_id, nodes },
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadRules,
        clearSelectedFn: () => {},
      })
    },
  })
}

function publishRule(pc: any) {
  publishingRecord.value = pc
  publishClusterId.value = pc.cluster_id
  publishRefreshFn.value = loadRules
  // 常规发布不带预选（仅「重发失败节点」入口设置；防上一次重发残留）
  publishPreselected.value = []
  publishVisible.value = true
}

// 发布差异预览（publish-diff-preview-batch1）：弹窗自持拉取；「去发布」接既有发布流程
const previewVisible = ref(false)
const previewRecord = ref<any | null>(null)

function openPublishPreview(pc: any) {
  previewRecord.value = pc
  previewVisible.value = true
}

function onPreviewPublish() {
  const pc = previewRecord.value
  previewVisible.value = false
  if (pc) publishRule(pc)
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const pc = publishingRecord.value
  if (!pc) return
  await executePublish({
    title: `发布全局规则: ${pc.name}`,
    apiEndpoint: `/clusters/${pc.cluster_id}/global_rules/${pc.id}/publish`,
    nodeIds,
    refreshFn: publishRefreshFn.value,
  })
  publishRefreshFn.value = loadRules
}

// 4.x：版本恢复出口条 → 以版本弹窗上下文资源（调用侧镜像 ref）复用既有发布链路；
// 发布成功后刷新列表并重开版本弹窗（重开触发组件既有 open watch → 重载版本列表并复位出口条）
function onVmPublishRequested() {
  if (vmId.value == null || vmClusterId.value == null || !vmName.value) return
  publishingRecord.value = { id: vmId.value, cluster_id: vmClusterId.value, name: vmName.value }
  publishClusterId.value = vmClusterId.value
  publishRefreshFn.value = async () => {
    await loadRules()
    vmVisible.value = true
  }
  publishPreselected.value = []
  vmVisible.value = false
  publishVisible.value = true
}

function openVersionManagement(pc: any) {
  vmId.value = pc.id
  vmClusterId.value = pc.cluster_id
  vmName.value = pc.name
  vmVisible.value = true
}

onMounted(() => {
  // 深链预选（D4）：?plugin=<name> → 预选「插件」下拉（服务端过滤），批 7A 客户端过滤退场
  const pluginQuery = route.query.plugin as string | undefined
  if (pluginQuery) pluginFilter.value = pluginQuery
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  loadClusters()
  loadPluginOptions()
  loadRules()
})

onUnmounted(() => {
  cancelSearch()
})

import { clusterHueClass } from '@/utils/clusterHue'
import { useBatchDelete } from '@/composables/useBatchDelete'
import { useRepublishFailedNodes, noticeTextFromPublishDetail } from '@/composables/useRepublishFailedNodes'
import { useCardClusterGrouping } from '@/composables/useCardClusterGrouping'
import StrokeIcon from '@/components/StrokeIcon.vue'
import ClusterBand from '@/components/ClusterBand.vue'
import TableToolbar from '@/components/TableToolbar.vue'

// ── 状态 chips（本页全量拉取，前端聚合）──
type StatusKey = 'all' | 'unpublished' | 'pending' | 'published' | 'partial'
const statusFilter = ref<StatusKey>('all')

function statusOf(row: any): Exclude<StatusKey, 'all'> {
  if (row.pending_publish === true) return 'pending'
  if (row.last_publish_status === 'partial') return 'partial'
  if (row.current_version) return 'published'
  return 'unpublished'
}

const statusChips = computed(() => {
  const c = { unpublished: 0, pending: 0, published: 0, partial: 0 }
  rules.value.forEach((row: any) => c[statusOf(row)]++)
  return [
    { key: 'all' as StatusKey, label: '全部', count: totalCount.value },
    { key: 'unpublished' as StatusKey, label: '未发布', count: c.unpublished },
    { key: 'pending' as StatusKey, label: '待发布', count: c.pending },
    { key: 'published' as StatusKey, label: '已发布', count: c.published },
    { key: 'partial' as StatusKey, label: '部分失败', count: c.partial },
  ]
})

const rowsFiltered = computed(() =>
  statusFilter.value === 'all'
    ? displayedRules.value
    : displayedRules.value.filter((row: any) => statusOf(row) === statusFilter.value),
)

// ── 集群分组 / 平铺双视图（AGENTS #87/#88）──
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
  unit: '条全局规则',
  clusterIdOf: (row) => row.cluster_id,
  clusterNameOf: (row) => row.cluster_name,
  groupNameOf: (row) => row.cluster_group_name,
  secondary: (rows) => `生效 全部路由 · ${rows.reduce((n, pc) => Math.max(n, pc.route_count ?? 0), 0)} 条`,
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

async function refreshList(): Promise<void> {
  await loadClusters()
  await loadRules()
}

function clusterNameById(id: number): string {
  const c = clusters.value.find((x: any) => x.id === id)
  return c ? c.display_name || c.name || `集群 ${id}` : `集群 ${id}`
}

// ── 批量管理（只有「批量删除」）──
const batchMode = ref(false)
const selectedIds = ref<number[]>([])
const selectedRows = computed(() => rules.value.filter((row: any) => selectedIds.value.includes(row.id)))
const allFilteredSelected = computed(
  () => rowsFiltered.value.length > 0 && rowsFiltered.value.every((row: any) => selectedIds.value.includes(row.id)),
)

function toggleBatchMode(): void {
  batchMode.value = !batchMode.value
  if (!batchMode.value) selectedIds.value = []
}
function toggleSelect(id: number): void {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((x) => x !== id)
    : [...selectedIds.value, id]
}
function clearSelection(): void {
  selectedIds.value = []
}
function toggleSelectAllFiltered(): void {
  if (allFilteredSelected.value) {
    const ids = new Set(rowsFiltered.value.map((row: any) => row.id))
    selectedIds.value = selectedIds.value.filter((id) => !ids.has(id))
  } else {
    selectedIds.value = [...new Set([...selectedIds.value, ...rowsFiltered.value.map((row: any) => row.id)])]
  }
}
function selectedCountInGroup(rows: any[]): number {
  return rows.filter((row) => selectedIds.value.includes(row.id)).length
}
function toggleGroupSelect(rows: any[]): void {
  const ids = rows.map((row) => row.id)
  const allSelected = ids.every((id) => selectedIds.value.includes(id))
  selectedIds.value = allSelected
    ? selectedIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedIds.value, ...ids])]
}

const batchDelete = useBatchDelete<any>({
  label: '全局规则',
  endpoint: '/global_rules',
  idField: 'rule_ids',
  nameField: 'rule_name',
  rows: () => selectedRows.value,
  ids: () => selectedIds.value,
  nameOf: (row: any) => row.name,
  clusterIdOf: (row: any) => row.cluster_id,
  clusterNameOf: clusterNameById,
  refresh: loadRules,
  clearSelection: () => clearSelection(),
  exitBatch: () => toggleBatchMode(),
  subsetConsequence: '未选中的 {n} 个节点将保留该全局规则',
})

// ── ⋯ 菜单（同屏只开一个；空间不足向上翻转，AGENTS #88 ⑥）──
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
onUnmounted(() => document.removeEventListener('click', onDocClick))

function menuView(row: any): void {
  closeCardMenu()
  viewRule(row)
}
function menuEdit(row: any): void {
  closeCardMenu()
  editRule(row)
}
function menuVersion(row: any): void {
  closeCardMenu()
  openVersionManagement(row)
}
function menuDelete(row: any): void {
  closeCardMenu()
  deleteRule(row)
}

function pluginNames(pc: any): string[] {
  return pc?.plugins ? Object.keys(pc.plugins) : []
}
</script>

<style scoped>
.gr-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}
/* 7.5 超量截断提示 */
.gr-truncate-notice {
  font-size: 12px;
  color: var(--muted);
  margin: -8px 0 12px;
}
.loading-state {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
  font-size: 14px;
}
.gr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}
.gr-empty-icon {
  font-size: 40px;
  color: var(--muted);
  margin-bottom: 12px;
  opacity: 0.4;
}
.gr-empty-text {
  font-size: 14px;
  color: var(--muted);
}
.gr-empty-action {
  margin-top: 12px;
}
/* 网格与卡片容器样式已上移共享 .card-grid / .std-card（style.css 卡片一致性单点） */
.gr-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  padding: 12px 20px 0;
}
.gr-card-info {
  flex: 1;
}
.gr-card-name {
  font-size: 14px;
  font-weight: 600;
}
.gr-card-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  line-height: 1.5;
}
.gr-card-meta {
  text-align: right;
  flex-shrink: 0;
  margin-left: 12px;
}
.gr-card-topbar {
  padding: 4px 16px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: oklch(56% 0.16 210 / 8%);
  border-bottom: 1px solid oklch(56% 0.16 210 / 12%);
  display: flex;
  align-items: center;
  gap: 6px;
}
.group-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--badge-bg, oklch(50% 0.12 170 / 15%));
  color: var(--badge-fg, oklch(45% 0.12 170));
  border: 1px solid var(--badge-border, oklch(50% 0.12 170 / 25%));
  line-height: 1.4;
  flex-shrink: 0;
}
.gr-card-plugins {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  padding: 0 20px;
}
.gr-plugin-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  background: oklch(56% 0.16 210 / 10%);
  color: var(--accent);
  border: 1px solid oklch(56% 0.16 210 / 20%);
  font-family: var(--font-mono);
}
.gr-no-plugins {
  font-size: 11px;
  color: var(--muted);
  font-style: italic;
}
.gr-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: auto;
  padding: 10px 20px 16px;
  border-top: 1px solid var(--border);
}
.gr-action-btn {
  background: none !important;
  background-color: transparent !important;
}
.gr-action-btn:hover {
  background: var(--bg) !important;
}
.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
}
.rule-preview {
  font-size: 12px;
  white-space: pre-wrap;
  background: var(--bg);
  padding: 12px;
  border-radius: var(--radius-sm);
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
/* 网格/卡片容器断点已上移共享 .card-grid（style.css） */
</style>
