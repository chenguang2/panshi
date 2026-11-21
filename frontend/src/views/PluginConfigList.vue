<template>
  <!-- 单实现双形态（shared-core-plan 2026-11-21，A 推广第 2 个卡片类资源，照 GlobalRuleList 范本）：
       缺省 = 独立列表页（PageHeader + 分组/集群筛选 + 分组|平铺）；
       传 scopedClusterId = 统一管理最大化面板的「插件组」Tab（隐藏页头/分组与集群筛选/分组切换与集群带，
       页面级动作改由工具条左侧紧凑钮承载，其余（chips/批量条/卡片网格/卡脚动作）与页面同一份实现）。 -->
  <div class="pc-page" :class="{ 'pc-page-scoped': isScoped }">
    <PageHeader
      v-if="!isScoped"
      title="插件组"
      description="管理集群级的插件组配置。插件组是一组可复用的插件配置集合，可被多个路由引用。"
    >
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <!-- AGENTS #88 ⑦：批量管理（secondary）在「新建」（primary）左侧 -->
        <button class="btn btn-secondary" :aria-pressed="batchMode" @click="toggleBatchMode">
          {{ batchMode ? '退出批量管理' : '批量管理' }}
        </button>
        <button class="btn btn-primary" @click="openCreateModal">
          <StrokeIcon name="plus" :size="13" /> 添加插件组
        </button>
      </template>
    </PageHeader>

    <!-- 工具条 + 状态行 + 批量条（AGENTS #87/#88：与列表页、四层代理、DNS 两侧同构）-->
    <div class="l5-card sp-card-page" :class="{ 'scope-card': isScoped }">
      <TableToolbar
        v-model:mode="cardMode"
        :count="totalCount"
        count-unit="个插件组"
        :show-count="false"
        :show-mode="!isScoped"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <!-- scoped：页面级动作（原本在 PageHeader）收敛为工具条左侧紧凑钮（#90 页头动作区规范的 scoped 替代） -->
          <template v-if="isScoped">
            <button class="btn btn-primary btn-sm" data-test="scope-add-plugin-config" @click="openCreateModal">
              <StrokeIcon name="plus" :size="13" /> 添加插件组
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
          <SearchInput v-model="searchText" placeholder="搜索插件组名称..." :width="150" @input="onSearch" />
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
            @change="loadConfigs"
          />
          <select
            v-model="pluginFilter"
            :title="pluginOptions.find((pl) => pl.name === pluginFilter)?.display_name || pluginFilter"
            class="l5-select plugin-filter"
            style="width: 104px"
            @change="onPluginFilterChange"
          >
            <option value="">全部插件</option>
            <option v-for="pl in pluginOptions" :key="pl.name" :value="pl.name">
              {{ pl.display_name || pl.name }}
            </option>
          </select>
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
      <div v-if="loading" class="loading-state">加载中...</div>
      <!-- L3 空态两分支：无数据给行动入口，有筛选无结果给清空筛选 -->
      <div v-else-if="displayedConfigs.length === 0" class="pc-empty">
        <template v-if="hasActiveFilters">
          <div class="pc-empty-icon">◎</div>
          <div class="pc-empty-text">无匹配结果</div>
          <button class="btn btn-secondary pc-empty-action" @click="clearFilters">清空筛选</button>
        </template>
        <template v-else>
          <div class="pc-empty-icon">▣</div>
          <div class="pc-empty-text">暂无插件组</div>
          <button class="btn btn-primary pc-empty-action" @click="openCreateModal">添加插件组</button>
        </template>
      </div>
      <div
        v-else
        class="pc-grid card-grid l5-card sp-cards"
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
            class="pc-card std-card l5-panel"
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
              <!-- scoped（面板单集群）：集群标识与分组徽标对每张卡恒同值 → 冗余，仅页面形态渲染；
                   右侧「引用 · N 条路由」在面板内仍有意义（同集群内跨路由复用），保留。 -->
              <span v-if="!isScoped" class="lp-tag lp-cluster">{{ pc.cluster_name || '-' }}</span>
              <span v-if="!isScoped && pc.cluster_group_name" class="lp-tag group lp-group">{{
                pc.cluster_group_name
              }}</span>
              <span class="st-algo"
                >引用 · <b>{{ pc.reference_count ?? 0 }}</b> 条路由</span
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
                  <span v-if="!pluginNames(pc).length" class="lp-v dim">无插件</span>
                </div>
                <span v-if="pluginNames(pc).length" class="lp-cnt">{{ pluginNames(pc).length }} 个</span>
              </div>
              <div class="lp-row group-only">
                <span class="lp-k">引用</span>
                <span class="lp-v mono" :class="{ dim: !pc.reference_count }">{{
                  pc.reference_count ? `${pc.reference_count} 条路由` : '未被引用'
                }}</span>
              </div>
              <div v-if="pc.description" class="lp-row">
                <span class="lp-k">描述</span>
                <span class="lp-v dim" :title="pc.description">{{ pc.description }}</span>
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
              <button class="op-pub" @click="publishConfig(pc)">发布</button>
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
                <!-- 三栏结构（#81）：CRUD → 危险 → 动作；条目/顺序/空栏剔除由 utils/resourceActionMenu
                     统一构建（与表格类页 NodeList/UpstreamList/RouteList 同一构建器），栏间只由 gi 画一条线 -->
                <div class="l5-menu" :class="{ open: openMenuId === pc.id, 'flip-up': menuFlipUp }">
                  <template v-for="(group, gi) in PLUGIN_CONFIG_MENU_GROUPS" :key="group.key">
                    <hr v-if="gi > 0" class="menu-sep" />
                    <button
                      v-for="item in group.items"
                      :key="item.key"
                      type="button"
                      class="mi"
                      :class="{ danger: item.danger }"
                      :disabled="item.disabled"
                      @click="handleMenu(item.key, pc)"
                    >
                      <span class="mi-main">{{ item.title }}</span>
                      <span v-if="item.desc" class="mi-sub">{{ item.desc }}</span>
                    </button>
                  </template>
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
      :clusters="formClusterOptions"
      :default-cluster-id="isScoped ? scopedClusterId : null"
      :lock-cluster="isScoped"
      resource-type="plugin_config"
      with-publish-guide
      @close="closeForm"
      @saved="onSaved"
      @publish-requested="onFormPublishRequested"
    />

    <PluginConfigViewDrawer v-model:visible="viewDrawerVisible" :config="viewingPc" />

    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="plugin_config"
      :resource-id="vmId"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      :can-publish="true"
      @version-change="onVersionWriteSuccess"
      @published="onVersionWriteSuccess"
      @publish-requested="onVmPublishRequested"
    />

    <PublishConfirmModal
      v-model:visible="publishVisible"
      :title="publishTitle"
      :cluster-id="publishClusterId"
      :current-version="publishingRecord?.current_version ?? null"
      :preselected-node-ids="publishPreselected"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />

    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="previewRecord?.cluster_id ?? null"
      :resource-type="'plugin_config'"
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
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import { listPluginConfigs } from '@/api/pluginConfigs'
import { listBuiltinPlugins } from '@/api/pluginMetadata'
import { listClusters, getClusterNodes } from '@/api/clusters'
import PageHeader from '@/components/PageHeader.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import PluginEntityFormModal from '@/components/PluginEntityFormModal.vue'
import PluginConfigViewDrawer from '@/components/PluginConfigViewDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import {
  executePublish,
  showDeleteConfirm,
  executeDeleteWithProgress,
  deletePluginConfigWithReferenceCheck,
} from '@/composables/useClusterUtils'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import SearchInput from '@/components/SearchInput.vue'

/**
 * 单实现双形态（docs/refactoring/shared-core-plan-2026-11-21.md，A 推广第 2 个卡片类资源）：
 * - 不传 `scopedClusterId`：独立卡片页（跨集群、分组/平铺、集群标识与分组徽标）。
 * - 传 `scopedClusterId`：统一管理最大化面板的「插件组」Tab——只承载该集群：
 *   隐藏 PageHeader / 分组与集群筛选 / `分组|平铺` 切换器 / 分组带（恒平铺）/ 卡片上的集群与分组徽标；
 *   页面级动作（添加插件组 / 批量管理）改由工具条左侧紧凑钮承载；
 *   卡内「引用 · N 条路由」（reference_count）在面板内保留（同集群跨路由复用仍有意义）；
 *   删除守卫 PLG-07 与页面同源（deletePluginConfigWithReferenceCheck + 后端 RE-07/PLG-07 兜底），不新造判断；
 *   卡内插件 chips 按「以页面为准」保留纯展示形态（面板旧的可点查看已随 ClusterPluginConfigs 退场）。
 */
const props = withDefaults(defineProps<{ scopedClusterId?: number | null }>(), { scopedClusterId: null })
const isScoped = computed(() => props.scopedClusterId != null)
/**
 * 写操作成功后的面板通知：统一管理面板以 `@refresh="loadClusters"` 挂载本组件，
 * 借此重载左侧集群卡片与 Tab 徽标计数（增/改/删/批量删/发布/版本回滚后立即生效）。
 * **只在写操作成功后 emit**——挂载、翻页、搜索、筛选、切 chip 一律不调，
 * 否则父级重载会经 prop/数据变化反馈回本组件，形成请求风暴。页面形态无监听者 = 零副作用。
 */
const emit = defineEmits<{ refresh: [] }>()
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

const configs = ref<any[]>([])
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
  loadConfigs()
}

function onGroupChange() {
  clusterFilter.value = ''
  loadConfigs()
}

/** L3 空态两分支判定：搜索词或集群筛选任一生效即为「有匹配条件」 */
const hasActiveFilters = computed(() => searchText.value.trim() !== '' || clusterFilter.value !== '')

function clearFilters() {
  searchText.value = ''
  clusterFilter.value = ''
  loadConfigs()
}

const displayedConfigs = computed(() => {
  return [...configs.value].sort((a, b) => {
    const ga = a.cluster_group_name || ''
    const gb = b.cluster_group_name || ''
    if (ga && !gb) return 1
    if (!ga && gb) return -1
    return ga.localeCompare(gb)
  })
})

const formVisible = ref(false)
const editingConfig = ref<any | null>(null)
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const viewDrawerVisible = ref(false)
const viewingPc = ref<any | null>(null)
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)
/** 本次发布完成后的刷新动作：卡片发布刷新列表；版本弹窗出口条发布额外重开弹窗重载版本列表 */
const publishRefreshFn = ref<() => Promise<void>>(loadAfterWrite)

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
  const outcome = await resolveFailedNodes({ id: pc.id, cluster_id: pc.cluster_id }, 'plugin_config')
  if (!outcome) return
  if (outcome.ok && outcome.noticeText) {
    republishNotices.value[pc.id] = outcome.noticeText
    publishingRecord.value = pc
    publishClusterId.value = pc.cluster_id
    publishRefreshFn.value = loadAfterWrite
    publishPreselected.value = outcome.failedNodeIds
    publishVisible.value = true
  } else {
    message.warning('未能获取失败节点，请通过「查看差异」排查')
  }
}

/** M5：发布确认弹窗标题携带资源名 */
const publishTitle = computed(() =>
  publishingRecord.value ? `发布插件组: ${publishingRecord.value.name}` : '发布插件组',
)

function onSearch() {
  onDebouncedSearch(() => {
    loadConfigs()
  })
}

async function loadConfigs() {
  loading.value = true
  try {
    const params: any = { page_size: PAGE_SIZE_CARD_GRID, group_name: effectiveGroupName() }
    const clusterId = effectiveClusterId()
    if (clusterId != null) params.cluster_id = clusterId
    if (searchText.value) params.search = searchText.value
    if (pluginFilter.value) params.plugin = pluginFilter.value
    const res = await listPluginConfigs(params)
    configs.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch {
    message.error('加载插件组失败')
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

/**
 * 「写操作成功后」的刷新：先通知面板重载集群卡片/徽标，再刷新本页列表。
 * 共享流程（executePublish / executeDeleteWithProgress / useBatchDelete）的刷新回调
 * 只在请求成功后调用，故把它当作刷新回调传递即等价于「成功后 emit」，
 * 不必改共享 composable 语义（AGENTS #217）。
 */
async function loadAfterWrite(): Promise<void> {
  emit('refresh')
  await loadConfigs()
}

function openCreateModal() {
  editingConfig.value = null
  formVisible.value = true
}
function editConfig(pc: any) {
  editingConfig.value = pc
  formVisible.value = true
}
function closeForm() {
  formVisible.value = false
  editingConfig.value = null
}
function onSaved() {
  closeForm()
  void loadAfterWrite()
}

/** 版本管理弹窗内写成功（回滚/还原、弹窗内发布）→ 本页刷新 + 通知面板重载徽标 */
function onVersionWriteSuccess() {
  void loadAfterWrite()
}

// publish-guide 批 1：表单保存引导「立即发布」→ 打开该插件组的发布弹窗（与行内发布同链路）
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

function viewConfig(pc: any) {
  viewingPc.value = pc
  viewDrawerVisible.value = true
}

async function deleteConfig(pc: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await getClusterNodes(pc.cluster_id)
    nodes = res.data?.items || []
  } catch {
    /* ignore */
  }

  const apiEndpoint = `/clusters/${pc.cluster_id}/plugin_configs/${pc.id}`
  // H4 删除前置引用检查（决策 A）：被引用时不弹共享删除确认，改阻断提示
  // （无任何删除入口，网关侧与平台侧均不允许删除）；无引用/查询失败 → 既有
  // 共享确认全流程不变；后端 PLG-07 守卫（任意删除组合均 400）仍是最终兜底
  await deletePluginConfigWithReferenceCheck({
    apiEndpoint,
    onUnreferenced: () => {
      showDeleteConfirm({
        title: `确定要删除插件组 "${pc.name}" 吗？`,
        apiEndpoint,
        nodes,
        onOk: async (deleteDb, deleteEdge, nodeIds) => {
          await executeDeleteWithProgress({
            title: `删除插件组: ${pc.name}`,
            apiEndpoint,
            cluster: { id: pc.cluster_id, nodes },
            deleteDb,
            deleteEdge,
            nodeIds,
            refreshFn: loadAfterWrite,
            clearSelectedFn: () => {},
          })
        },
      })
    },
  })
}

function publishConfig(pc: any) {
  publishingRecord.value = pc
  publishClusterId.value = pc.cluster_id
  publishRefreshFn.value = loadAfterWrite
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
  if (pc) publishConfig(pc)
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const pc = publishingRecord.value
  if (!pc) return
  await executePublish({
    title: `发布插件组: ${pc.name}`,
    apiEndpoint: `/clusters/${pc.cluster_id}/plugin_configs/${pc.id}/publish`,
    nodeIds,
    refreshFn: publishRefreshFn.value,
  })
  publishRefreshFn.value = loadAfterWrite
}

// 4.x：版本恢复出口条 → 以版本弹窗上下文资源（调用侧镜像 ref）复用既有发布链路；
// 发布成功后刷新列表并重开版本弹窗（重开触发组件既有 open watch → 重载版本列表并复位出口条）
function onVmPublishRequested() {
  if (vmId.value == null || vmClusterId.value == null || !vmName.value) return
  publishingRecord.value = { id: vmId.value, cluster_id: vmClusterId.value, name: vmName.value }
  publishClusterId.value = vmClusterId.value
  publishRefreshFn.value = async () => {
    await loadAfterWrite()
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
  // 深链参数仅页面形态生效（面板 Tab 的集群/插件筛选由上下文决定）
  if (!isScoped.value) {
    // 深链预选（D4）：?plugin=<name> → 预选「插件」下拉（服务端过滤），批 7A 客户端过滤退场
    const pluginQuery = route.query.plugin as string | undefined
    if (pluginQuery) pluginFilter.value = pluginQuery
    const clusterId = route.query.cluster_id as string | undefined
    const numeric = Number(clusterId)
    if (Number.isFinite(numeric)) clusterFilter.value = numeric
  }
  loadClusters()
  loadPluginOptions()
  loadConfigs()
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
import { buildResourceActionMenu } from '@/utils/resourceActionMenu'

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
  configs.value.forEach((row: any) => c[statusOf(row)]++)
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
    ? displayedConfigs.value
    : displayedConfigs.value.filter((row: any) => statusOf(row) === statusFilter.value),
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
  unit: '个插件组',
  clusterIdOf: (row) => row.cluster_id,
  clusterNameOf: (row) => row.cluster_name,
  groupNameOf: (row) => row.cluster_group_name,
  secondary: (rows) => `被 ${rows.reduce((n, pc) => n + (pc.reference_count ?? 0), 0)} 条路由引用`,
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

async function refreshList(): Promise<void> {
  await loadClusters()
  await loadConfigs()
}

function clusterNameById(id: number): string {
  const c = clusters.value.find((x: any) => x.id === id)
  return c ? c.display_name || c.name || `集群 ${id}` : `集群 ${id}`
}

// ── 批量管理（只有「批量删除」）──
const batchMode = ref(false)
const selectedIds = ref<number[]>([])
const selectedRows = computed(() => configs.value.filter((row: any) => selectedIds.value.includes(row.id)))
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
  label: '插件组',
  endpoint: '/plugin_configs',
  idField: 'plugin_config_ids',
  nameField: 'config_name',
  rows: () => selectedRows.value,
  ids: () => selectedIds.value,
  nameOf: (row: any) => row.name,
  clusterIdOf: (row: any) => row.cluster_id,
  clusterNameOf: clusterNameById,
  refresh: loadAfterWrite,
  clearSelection: () => clearSelection(),
  exitBatch: () => toggleBatchMode(),
  subsetConsequence: '未选中的 {n} 个节点将保留该插件组',
})

// ── ⋯ 菜单（同屏只开一个；空间不足向上翻转，AGENTS #88 ⑥）──
/**
 * 卡片 ⋯ 菜单条目定义（#81 三栏结构）：CRUD → 危险 → 动作。
 * 分组顺序/空栏剔除由 utils/resourceActionMenu 单一构建（与表格类页共用），
 * 点击按条目 key 分发回既有 menu* 函数。
 */
const PLUGIN_CONFIG_MENU_GROUPS = buildResourceActionMenu({
  crud: [
    { key: 'view', title: '查看' },
    { key: 'edit', title: '编辑' },
  ],
  danger: [{ key: 'delete', title: '删除', desc: '删平台配置，可同步删 Edge 插件组（弹窗可选）', danger: true }],
  actions: [{ key: 'version', title: '版本管理', desc: '历史版本查看与回滚' }],
})

const openMenuId = ref<number | null>(null)
const menuFlipUp = ref(false)

/**
 * 菜单可用空间的底边：菜单是**卡内绝对定位弹层**，会被最近的 `overflow != visible` 祖先裁剪。
 * 面板里 `.max-panel` 与 Tab 的 `.tab-content` 都是 `overflow: hidden`（圆角收口），只按视口判断
 * 会让「点 ⋯ 只看到一条白边」。故按最近裁剪祖先的底边判定（与 GlobalRuleList 同一实现）。
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
onUnmounted(() => document.removeEventListener('click', onDocClick))

function menuView(row: any): void {
  closeCardMenu()
  viewConfig(row)
}
function menuEdit(row: any): void {
  closeCardMenu()
  editConfig(row)
}
function menuVersion(row: any): void {
  closeCardMenu()
  openVersionManagement(row)
}
function menuDelete(row: any): void {
  closeCardMenu()
  deleteConfig(row)
}
/** 菜单条目 key → 既有动作（三栏构建器只负责分组/文案，业务分发留在此处） */
function handleMenu(key: string, row: any): void {
  if (key === 'view') menuView(row)
  else if (key === 'edit') menuEdit(row)
  else if (key === 'version') menuVersion(row)
  else if (key === 'delete') menuDelete(row)
}

function pluginNames(pc: any): string[] {
  return pc?.plugins ? Object.keys(pc.plugins) : []
}

/** 页头徽标（#86② 补充维度）：涉及集群数 + 插件项总数 */
const headerStatItems = computed(() => [
  { value: new Set(configs.value.map((c) => c.cluster_id)).size, label: '集群' },
  {
    value: configs.value.reduce((n, c) => n + (c.plugins ? Object.keys(c.plugins).length : 0), 0),
    label: '个插件',
  },
])
</script>

<style scoped>
/* scoped 形态（统一管理最大化面板「插件组」Tab）：外层沿用页面卡片类，保证工具条/chips/批量条/
   卡片网格的全站解剖规则命中，只压掉外层卡片自身的边框/底色/阴影/圆角，使其融入面板 .dbody 的
   `.tab-content` 封闭容器（不出现卡中卡）。页面形态的「外层卡 + 卡片网格卡」两级结构在面板里
   退化为「.tab-content 卡 + 卡片网格卡」，观感与独立页一致。 */
.scope-card {
  border: none;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
  overflow: visible;
}
.pc-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}
.loading-state {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
  font-size: 14px;
}
.pc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}
.pc-empty-icon {
  font-size: 40px;
  color: var(--muted);
  margin-bottom: 12px;
  opacity: 0.4;
}
.pc-empty-text {
  font-size: 14px;
  color: var(--muted);
}
.pc-empty-action {
  margin-top: 12px;
}
/* 网格与卡片容器样式已上移共享 .card-grid / .std-card（style.css 卡片一致性单点） */
.pc-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  padding: 12px 20px 0;
}
.pc-card-topbar {
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
.pc-card-info {
  flex: 1;
}
.pc-card-name {
  font-size: 14px;
  font-weight: 600;
}
.pc-card-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  line-height: 1.5;
}
.pc-card-meta {
  text-align: right;
  flex-shrink: 0;
  margin-left: 12px;
}
.pc-card-plugins {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  padding: 0 20px;
}
.pc-plugin-tag {
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
.pc-no-plugins {
  font-size: 11px;
  color: var(--muted);
  font-style: italic;
}
.pc-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: auto;
  padding: 10px 20px 16px;
  border-top: 1px solid var(--border);
}
.pc-action-btn {
  background: none !important;
  background-color: transparent !important;
}
.pc-action-btn:hover {
  background: var(--bg) !important;
}
.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
}
.config-preview {
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
