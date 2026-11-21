<template>
  <div class="pml-page">
    <PageHeader title="插件元数据" description="管理集群级的插件元数据配置，定义插件的默认参数和 schema。">
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <!-- AGENTS #88 ⑦：批量管理（secondary）在「新建」（primary）左侧 -->
        <button class="btn btn-secondary" :aria-pressed="batchMode" @click="toggleBatchMode">
          {{ batchMode ? '退出批量管理' : '批量管理' }}
        </button>
        <button class="btn btn-primary" @click="openCreateModal">
          <StrokeIcon name="plus" :size="13" /> 添加插件元数据
        </button>
      </template>
    </PageHeader>

    <!-- 工具条 + 状态行 + 批量条（AGENTS #87/#88）-->
    <div class="l5-card sp-card-page">
      <TableToolbar
        v-model:mode="cardMode"
        :count="totalCount"
        count-unit="个插件元数据"
        :show-count="false"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <SearchInput v-model="searchText" placeholder="搜索插件名称..." :width="150" @input="onSearch" />
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
            @change="onClusterFilterChange"
          />
          <!-- 插件筛选（r28）：选项 = 插件元数据可用的插件（目录 ∩ features.metadataPlugins） -->
          <select
            v-model="pluginFilter"
            :title="
              pluginFilterOptions.find((p: { name: string; label: string }) => p.name === pluginFilter)?.label ||
              pluginFilter
            "
            class="l5-select"
            style="width: 104px"
            @change="onPluginFilterChange"
          >
            <option value="">全部插件</option>
            <option v-for="p in pluginFilterOptions" :key="p.name" :value="p.name">{{ p.label }}</option>
          </select>
        </template>
        <template #mode-extra>
          <!-- 配置 JSON 默认全展开（r27：进页即可见配置内容）；此开关一键开合全部卡片 -->
          <button
            v-if="configCardCount > 0"
            type="button"
            class="tool-btn"
            data-test="config-toggle-all"
            :title="allConfigExpanded ? '收起全部配置 JSON' : '展开全部配置 JSON'"
            @click="toggleAllConfig"
          >
            <StrokeIcon :name="allConfigExpanded ? 'collapseAll' : 'expandAll'" :size="13" />
            <span class="fold-all-label">{{ allConfigExpanded ? '收起配置' : '展开配置' }}</span>
          </button>
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

      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="rowsFiltered.length === 0" class="pml-empty">
        <div class="pml-empty-icon">▣</div>
        <div class="pml-empty-text">暂无插件元数据</div>
      </div>
      <div
        v-else
        class="pml-grid card-grid l5-card sp-cards"
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
            v-for="item in g.rows"
            :key="item.id"
            class="pml-card std-card l5-panel"
            :class="[
              clusterHueClass(item.cluster_id),
              {
                selected: selectedIds.includes(item.id),
                'is-selected': selectedIds.includes(item.id),
                'is-folded': cardMode === 'group' && !groupVisible(g.clusterId),
              },
            ]"
            @click="batchMode && toggleSelect(item.id)"
          >
            <span class="lp-check" aria-hidden="true"></span>
            <div class="lp-strip">
              <span class="lp-tag lp-cluster">{{ item.cluster_name || '-' }}</span>
              <span v-if="item.cluster_group_name" class="lp-tag group lp-group">{{ item.cluster_group_name }}</span>
              <span class="st-algo"
                >参数 · <b>{{ paramCount(item) }}</b> 项</span
              >
            </div>
            <div class="lp-head">
              <div class="lp-title">
                <!-- 中文名为主（与路由页 PluginSelector 一致）；插件名（标识）保留为弱化小字，便于核对/搜索 -->
                <span class="lp-name" :class="{ mono: !pluginLabel(item.plugin_name) }">{{
                  pluginLabel(item.plugin_name) || item.plugin_name
                }}</span>
                <span v-if="pluginLabel(item.plugin_name)" class="lp-key" :title="item.plugin_name">{{
                  item.plugin_name
                }}</span>
              </div>
              <div class="lp-status status-cell-flex">
                <PublishStatusTag
                  :version="item.current_version"
                  :published-at="item.published_at"
                  :pending="item.pending_publish"
                  :last-publish-status="item.last_publish_status"
                />
                <PublishDiffButton
                  :pending="item.pending_publish"
                  :last-publish-status="item.last_publish_status"
                  @click.stop="openPublishPreview(item)"
                />
              </div>
            </div>
            <div class="lp-body">
              <div v-if="displayName(item)" class="lp-row">
                <span class="lp-k">显示名</span>
                <span class="lp-v">{{ displayName(item) }}</span>
              </div>
              <!-- 参数数 + schema 状态：低信息量单值 → 平铺由 strip 承担（group-only） -->
              <div class="lp-row group-only">
                <span class="lp-k">参数</span>
                <span class="lp-v mono">{{ paramCount(item) }} 项</span>
              </div>
              <!-- 配置：折叠式美化 JSON（卡内可读结构；值多时块内滚动，不截断内容）-->
              <div class="lp-row lp-row-config">
                <span class="lp-k">配置</span>
                <button
                  v-if="paramCount(item) > 0"
                  type="button"
                  class="lp-json-toggle"
                  :aria-expanded="isConfigOpen(item.id) ? 'true' : 'false'"
                  :title="isConfigOpen(item.id) ? '收起配置 JSON' : '展开配置 JSON'"
                  @click.stop="toggleConfig(item.id)"
                >
                  <span class="mono">{{ paramCount(item) }} 项</span>
                  <StrokeIcon :name="isConfigOpen(item.id) ? 'collapseAll' : 'expandAll'" :size="12" />
                </button>
                <span v-else class="lp-v dim">无配置</span>
              </div>
              <pre v-if="paramCount(item) > 0 && isConfigOpen(item.id)" class="lp-json" @click.stop>{{
                prettyConfig(item)
              }}</pre>
            </div>
            <!-- 部分失败：文案两态（republish-failed-nodes D3/D4）+ 重发 / 查看差异双动作 -->
            <div
              v-if="item.last_publish_status === 'partial' && !item.pending_publish"
              class="lp-notice alert alert-error"
            >
              <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
              <span class="n-txt">{{ partialNoticeText(item) }}</span>
              <button class="n-act" :disabled="republishLoading" @click.stop="republishFailedNodes(item)">
                {{ republishLoading ? '获取失败节点…' : '重发失败节点' }}
              </button>
              <button class="n-act ghost" @click.stop="openPublishPreview(item)">查看差异</button>
            </div>
            <div class="lp-foot" @click.stop>
              <button class="op-pub" @click="publishItem(item)">发布</button>
              <div class="menu-anchor">
                <button
                  type="button"
                  class="op-btn"
                  title="更多操作"
                  aria-label="更多操作"
                  @click.stop="toggleCardMenu(item.id, $event)"
                >
                  <StrokeIcon name="dots" :size="14" />
                </button>
                <div class="l5-menu" :class="{ open: openMenuId === item.id, 'flip-up': menuFlipUp }">
                  <button class="mi" @click="menuView(item)">
                    <span class="mi-main">查看</span>
                  </button>
                  <button class="mi" @click="menuEdit(item)">
                    <span class="mi-main">编辑</span>
                  </button>
                  <button class="mi" @click="menuVersion(item)">
                    <span class="mi-main">版本管理</span>
                    <span class="mi-sub">历史版本查看与回滚</span>
                  </button>
                  <hr class="menu-sep" />
                  <button class="mi danger" @click="menuDelete(item)">
                    <span class="mi-main">删除</span>
                    <span class="mi-sub">删平台配置，可同步删 Edge 已发布配置（弹窗可选）</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 添加插件元数据（B2c：与统一管理面板共用创建弹窗；本页集群可改） -->
    <PluginMetadataCreateModal
      :visible="createVisible"
      :clusters="clusters"
      @close="createVisible = false"
      @saved="handleCreateSaved"
    />

    <!-- View Drawer -->
    <a-drawer
      v-model:open="viewVisible"
      :title="`查看插件元数据 - ${viewingItem?.plugin_name}`"
      width="560"
      @close="viewVisible = false"
    >
      <div v-if="viewingItem">
        <a-descriptions :column="1" bordered size="small">
          <a-descriptions-item label="插件名称">{{ viewingItem.plugin_name }}</a-descriptions-item>
          <a-descriptions-item label="所属集群">{{ viewingItem.cluster_name }}</a-descriptions-item>
          <a-descriptions-item label="版本">
            <span v-if="viewingItem.current_version">v{{ viewingItem.current_version }}</span>
            <span v-else style="color: var(--muted)">未发布</span>
          </a-descriptions-item>
          <a-descriptions-item label="状态">
            <span v-if="viewingItem.current_version" class="badge badge-success"
              ><span class="status-dot online"></span>已发布</span
            >
            <span v-else class="badge badge-neutral">未发布</span>
          </a-descriptions-item>
        </a-descriptions>
        <a-divider>配置内容</a-divider>
        <pre class="config-preview">{{
          viewingItem.config_data ? JSON.stringify(viewingItem.config_data, null, 2) : '{}'
        }}</pre>
      </div>
    </a-drawer>

    <!-- Edit Drawer -->
    <PluginEditorDrawer
      v-model:open="editorDrawerVisible"
      :plugin="editingPlugin"
      :plugin-info="editingPluginInfo"
      @save="handleEditorSave"
    />

    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="plugin_metadata"
      :resource-id="null"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      :can-publish="true"
      @version-change="loadItems"
      @published="loadItems"
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
      :resource-type="'plugin_metadata'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.plugin_name"
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
import { listGlobalPluginMetadata, listBuiltinPlugins, updateClusterPluginMetadata } from '@/api/pluginMetadata'
import { listClusters, getClusterNodes } from '@/api/clusters'
import PageHeader from '@/components/PageHeader.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import PluginEditorDrawer from '@/components/PluginEditorDrawer.vue'
import PluginMetadataCreateModal from '@/components/PluginMetadataCreateModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import SearchInput from '@/components/SearchInput.vue'
import { clusterHueClass } from '@/utils/clusterHue'
import { useBatchDelete } from '@/composables/useBatchDelete'
import { useRepublishFailedNodes, noticeTextFromPublishDetail } from '@/composables/useRepublishFailedNodes'
import { useCardClusterGrouping } from '@/composables/useCardClusterGrouping'
import StrokeIcon from '@/components/StrokeIcon.vue'
import ClusterBand from '@/components/ClusterBand.vue'
import TableToolbar from '@/components/TableToolbar.vue'
import { useFeaturesStore } from '@/stores/features'
import { filterMetadataPlugins, metadataPluginLabel } from '@/utils/pluginMetadataCatalog'

// ——— List view state ———
const items = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref<string | number>('')
const groupFilter = ref('__all__')
/** 插件筛选（r28）：空串 = 全部插件（后端精确匹配 plugin_name） */
const pluginFilter = ref<string>('')

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map((c) => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter((c) => !c.group_name)
  return clusters.value.filter((c) => c.group_name === groupFilter.value)
})

const displayedItems = computed(() => {
  return [...items.value].sort((a, b) => {
    const ga = a.cluster_group_name || ''
    const gb = b.cluster_group_name || ''
    if (ga && !gb) return 1
    if (!ga && gb) return -1
    return ga.localeCompare(gb)
  })
})

function onGroupChange() {
  clusterFilter.value = ''
  loadItems()
}

// ——— Create modal state ———
const createVisible = ref(false)

// ——— Edit drawer state ———
const builtinPlugins = ref<any[]>([])
const editorDrawerVisible = ref(false)
const editingPlugin = ref<any>(null)
const editingPluginInfo = ref<any>(null)
const editingPluginName = ref('')
const editingItemClusterId = ref(0)

// ——— View drawer state ———
const viewVisible = ref(false)
const viewingItem = ref<any | null>(null)

// ——— Publish state ———
const publishVisible = ref(false)
const publishTitle = ref('')
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)
/** 本次发布完成后的刷新动作：卡片发布刷新页面列表；版本弹窗出口条发布额外重开弹窗重载版本列表 */
const publishRefreshFn = ref<() => Promise<void>>(loadItems)

// ── 重发失败节点（republish-failed-nodes：预览取失败集合并预选，单一实现）──
const { loading: republishLoading, resolve: resolveFailedNodes } = useRepublishFailedNodes()
// 解析成功后的具体文案缓存（会话内按资源 id；主键全库唯一）
const republishNotices = ref<Record<number, string>>({})
const publishPreselected = ref<number[]>([])

/** 卡内「发布未完全生效」文案：默认泛化；解析成功后升级为具体失败节点 */
function partialNoticeText(item: any): string {
  // 三级回退（D11）：持久化明细（方案 B，打开即见）→ 会话内预览解析缓存 → 泛化
  return (
    noticeTextFromPublishDetail(item?.last_publish_detail) ??
    republishNotices.value[item?.id] ??
    '发布未完全生效，请查看发布差异'
  )
}

async function republishFailedNodes(item: any): Promise<void> {
  const outcome = await resolveFailedNodes({ id: item.id, cluster_id: item.cluster_id }, 'plugin_metadata')
  if (!outcome) return
  if (outcome.ok && outcome.noticeText) {
    republishNotices.value[item.id] = outcome.noticeText
    publishingRecord.value = item
    publishTitle.value = `发布插件元数据: ${item.plugin_name}`
    publishClusterId.value = item.cluster_id
    publishRefreshFn.value = loadItems
    publishPreselected.value = outcome.failedNodeIds
    publishVisible.value = true
  } else {
    message.warning('未能获取失败节点，请通过「查看差异」排查')
  }
}

// ——— Version management state ———
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')

const featuresStore = useFeaturesStore()

function onSearch() {
  onDebouncedSearch(() => {
    loadItems()
  })
}

function onClusterFilterChange() {
  loadItems()
}

function onPluginFilterChange(): void {
  loadItems()
}

/** 「全部插件」下拉选项 = 该功能可用的插件清单（目录 ∩ features.plugin_metadata_plugins，**不**排除已配置项——
 *  筛选要能选到「暂无记录」的插件，与创建弹窗的下拉（排除已配置）语义不同；两者共用
 *  `utils/pluginMetadataCatalog` 的同一过滤实现，此处不传排除集合即可）。
 *  文案用**中文名**（`display_name || name`，与路由/上游的 PluginSelector 一致），值仍是插件名。 */
const pluginFilterOptions = computed(() =>
  filterMetadataPlugins(builtinPlugins.value, featuresStore.metadataPlugins)
    .map((p: any) => ({ name: p.name, label: metadataPluginLabel(p) }))
    .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'zh-CN')),
)

async function loadItems() {
  loading.value = true
  try {
    const params: any = { page_size: PAGE_SIZE_CARD_GRID, group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (pluginFilter.value) params.plugin_name = pluginFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await listGlobalPluginMetadata(params)
    items.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch {
    message.error('加载插件元数据失败')
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

async function loadBuiltinPlugins() {
  // features 清单兜底加载（插件元数据可选插件的过滤依赖 features.yaml 的
  // plugin_metadata_plugins；main.ts 启动已预载，此处仅覆盖未加载的边角，失败静默 = 不限制）
  featuresStore.load().catch(() => {})
  try {
    const res = await listBuiltinPlugins()
    builtinPlugins.value = res.data.plugins || []
  } catch {
    /* ignore */
  }
}

// ——— Create ———
function openCreateModal() {
  createVisible.value = true
}

/** 共享创建弹窗保存成功：刷新列表 + publish-guide 单通道引导（「立即发布」复用既有发布链路） */
async function handleCreateSaved(payload: { clusterId: number; pluginName: string }) {
  await loadItems()
  showOverlayModal({
    title: '保存成功',
    content: '配置尚未发布，发布后才会推送到 Edge 节点生效。',
    okText: '立即发布',
    cancelText: '稍后',
    onOk: () => {
      publishItem({ cluster_id: payload.clusterId, plugin_name: payload.pluginName })
    },
  })
}

// ——— View ———
function viewItem(item: any) {
  viewingItem.value = item
  viewVisible.value = true
}

// ——— Edit ———
function editItem(item: any) {
  const pluginInfo = builtinPlugins.value.find((p: any) => p.name === item.plugin_name)
  editingPluginName.value = item.plugin_name
  editingItemClusterId.value = item.cluster_id
  editingPlugin.value = {
    plugin_name: item.plugin_name,
    config: JSON.stringify(item.config_data || {}, null, 2),
  }
  editingPluginInfo.value = {
    ...(pluginInfo || {}),
    schema: pluginInfo?.metadata_schema || pluginInfo?.schema || {},
  }
  editorDrawerVisible.value = true
}

async function handleEditorSave(config: string) {
  try {
    const metadata = typeof config === 'string' ? JSON.parse(config) : config
    await updateClusterPluginMetadata(editingItemClusterId.value, editingPluginName.value, metadata)
    editorDrawerVisible.value = false
    await loadItems()
    // publish-guide 批 3：单通道引导替代 toast；立即发布复用既有发布链路
    showOverlayModal({
      title: '保存成功',
      content: '配置尚未发布，发布后才会推送到 Edge 节点生效。',
      okText: '立即发布',
      cancelText: '稍后',
      onOk: () => {
        publishItem({ cluster_id: editingItemClusterId.value, plugin_name: editingPluginName.value })
      },
    })
  } catch (error) {
    message.error('保存失败')
    throw error
  }
}

// ——— Delete ———
async function deleteItem(item: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await getClusterNodes(item.cluster_id)
    nodes = res.data?.items || []
  } catch {
    /* ignore */
  }

  showDeleteConfirm({
    title: `确定要删除插件元数据 "${item.plugin_name}" 吗？`,
    apiEndpoint: `/clusters/${item.cluster_id}/plugin-metadata/${item.plugin_name}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除插件元数据: ${item.plugin_name}`,
        apiEndpoint: `/clusters/${item.cluster_id}/plugin-metadata/${item.plugin_name}`,
        cluster: { id: item.cluster_id, nodes },
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadItems,
        clearSelectedFn: () => {},
      })
    },
  })
}

// ——— Publish ———
function publishItem(item: any) {
  publishingRecord.value = item
  publishClusterId.value = item.cluster_id
  publishTitle.value = `发布插件元数据: ${item.plugin_name}`
  publishRefreshFn.value = loadItems
  // 常规发布不带预选（仅「重发失败节点」入口设置；防上一次重发残留）
  publishPreselected.value = []
  publishVisible.value = true
}

// 发布差异预览（publish-diff-preview-batch1）：弹窗自持拉取；「去发布」接既有发布流程
const previewVisible = ref(false)
const previewRecord = ref<any | null>(null)

function openPublishPreview(item: any) {
  previewRecord.value = item
  previewVisible.value = true
}

function onPreviewPublish() {
  const item = previewRecord.value
  previewVisible.value = false
  if (item) publishItem(item)
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const item = publishingRecord.value
  if (!item) return
  await executePublish({
    title: publishTitle.value,
    apiEndpoint: `/clusters/${item.cluster_id}/plugin-metadata/${item.plugin_name}/publish`,
    nodeIds,
    refreshFn: publishRefreshFn.value,
  })
  publishRefreshFn.value = loadItems
}

// ——— Version management ———
function openVersionManagement(item: any) {
  vmId.value = item.id
  vmClusterId.value = item.cluster_id
  vmName.value = item.plugin_name
  vmVisible.value = true
}

// 4.2 版本恢复出口条：以版本弹窗上下文资源（调用侧镜像 ref）复用既有发布链路；
// 发布成功后刷新页面列表并重开版本弹窗（重设 open 触发既有 watch → loadHistory 重载版本列表）
function onVmPublishRequested() {
  if (!vmName.value || !vmClusterId.value) return
  const name = vmName.value
  publishingRecord.value = { id: vmId.value, cluster_id: vmClusterId.value, plugin_name: name }
  publishClusterId.value = vmClusterId.value
  publishTitle.value = `发布插件元数据: ${name}`
  publishRefreshFn.value = async () => {
    await loadItems()
    if (vmName.value === name) {
      vmVisible.value = true
    }
  }
  publishPreselected.value = []
  vmVisible.value = false
  publishVisible.value = true
}

onMounted(() => {
  const clusterId = route.query.cluster_id as string | undefined
  const numeric = Number(clusterId)
  if (Number.isFinite(numeric)) clusterFilter.value = numeric
  loadClusters()
  loadItems()
  loadBuiltinPlugins()
})

onUnmounted(() => {
  cancelSearch()
})

// ── 卡片辅助（设计 plugin-metadata：参数数 / schema 徽标 / 配置摘要）──
function paramCount(item: any): number {
  const cfg = item?.config_data
  const obj = typeof cfg === 'string' ? safeParse(cfg) : cfg
  return obj && typeof obj === 'object' ? Object.keys(obj).length : 0
}

function safeParse(raw: string): any {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function displayName(item: any): string {
  return item?.description || item?.display_name || ''
}

/** 卡内展开的配置美化 JSON（缩进 2 空格；块内滚动，不截断内容） */
function prettyConfig(item: any): string {
  const cfg = item?.config_data
  const obj = typeof cfg === 'string' ? safeParse(cfg) : cfg
  return JSON.stringify(obj ?? {}, null, 2)
}

/** 配置 JSON 展开态（r27：默认**全部展开**，进页即可见配置内容）。
 *  只记忆「被用户收起」的 id，切视图/筛选不丢；新增记录默认展开。 */
const configCollapsedIds = ref<number[]>([])
function isConfigOpen(id: number): boolean {
  return !configCollapsedIds.value.includes(id)
}
function toggleConfig(id: number): void {
  configCollapsedIds.value = isConfigOpen(id)
    ? [...configCollapsedIds.value, id]
    : configCollapsedIds.value.filter((x) => x !== id)
}

/** 有配置的卡片数 + 是否全部展开（全局开关的显隐与文案） */
const configCardCount = computed(() => rowsFiltered.value.filter((item: any) => paramCount(item) > 0).length)
const allConfigExpanded = computed(
  () =>
    configCardCount.value > 0 &&
    rowsFiltered.value.filter((item: any) => paramCount(item) > 0).every((item: any) => isConfigOpen(item.id)),
)
function toggleAllConfig(): void {
  const ids = rowsFiltered.value.filter((item: any) => paramCount(item) > 0).map((item: any) => item.id)
  configCollapsedIds.value = allConfigExpanded.value
    ? [...new Set([...configCollapsedIds.value, ...ids])]
    : configCollapsedIds.value.filter((id) => !ids.includes(id))
}

/** 插件名 → 中文显示名（目录 display_name；缺省回落插件名——与路由页 PluginSelector 同口径） */
function pluginLabel(name: string): string {
  const p = builtinPlugins.value.find((x: any) => x.name === name)
  return p?.display_name || ''
}

/** 集群 id → 显示名（批量删除节点清单标注归属集群） */
function clusterNameById(id: number): string {
  const c = clusters.value.find((x: any) => x.id === id)
  return c ? c.display_name || c.name || `集群 ${id}` : `集群 ${id}`
}

// ── 状态 chips（本页全量拉取，前端聚合）──
type StatusKey = 'all' | 'unpublished' | 'pending' | 'published' | 'partial'
const statusFilter = ref<StatusKey>('all')

function statusOf(item: any): Exclude<StatusKey, 'all'> {
  if (item.pending_publish === true) return 'pending'
  if (item.last_publish_status === 'partial') return 'partial'
  if (item.current_version) return 'published'
  return 'unpublished'
}

const statusChips = computed(() => {
  const c = { unpublished: 0, pending: 0, published: 0, partial: 0 }
  items.value.forEach((item: any) => c[statusOf(item)]++)
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
    ? displayedItems.value
    : displayedItems.value.filter((item: any) => statusOf(item) === statusFilter.value),
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
  unit: '个插件元数据',
  clusterIdOf: (item) => item.cluster_id,
  clusterNameOf: (item) => item.cluster_name,
  groupNameOf: (item) => item.cluster_group_name,
  secondary: (rows) => `参数 · ${rows.reduce((n, item) => n + paramCount(item), 0)} 项`,
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
  await loadItems()
}

// ── 批量管理（只有「批量删除」）──
const batchMode = ref(false)
const selectedIds = ref<number[]>([])
const selectedItems = computed(() => items.value.filter((item: any) => selectedIds.value.includes(item.id)))
const allFilteredSelected = computed(
  () => rowsFiltered.value.length > 0 && rowsFiltered.value.every((item: any) => selectedIds.value.includes(item.id)),
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
    const ids = new Set(rowsFiltered.value.map((item: any) => item.id))
    selectedIds.value = selectedIds.value.filter((id) => !ids.has(id))
  } else {
    selectedIds.value = [...new Set([...selectedIds.value, ...rowsFiltered.value.map((item: any) => item.id)])]
  }
}
function selectedCountInGroup(rows: any[]): number {
  return rows.filter((item) => selectedIds.value.includes(item.id)).length
}
function toggleGroupSelect(rows: any[]): void {
  const ids = rows.map((item) => item.id)
  const allSelected = ids.every((id) => selectedIds.value.includes(id))
  selectedIds.value = allSelected
    ? selectedIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedIds.value, ...ids])]
}

/** 批量删除（统一入口 composable/useBatchDelete，AGENTS #88 ⑪） */
const batchDelete = useBatchDelete<any>({
  label: '插件元数据',
  endpoint: '/plugin_metadata',
  idField: 'metadata_ids',
  nameField: 'plugin_name',
  rows: () => selectedItems.value,
  ids: () => selectedIds.value,
  nameOf: (item: any) => item.plugin_name,
  clusterIdOf: (item: any) => item.cluster_id,
  clusterNameOf: clusterNameById,
  refresh: loadItems,
  clearSelection: () => clearSelection(),
  exitBatch: () => toggleBatchMode(),
  subsetConsequence: '未选中的 {n} 个节点将保留该插件元数据',
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

function menuView(item: any): void {
  closeCardMenu()
  viewItem(item)
}
function menuEdit(item: any): void {
  closeCardMenu()
  editItem(item)
}
function menuVersion(item: any): void {
  closeCardMenu()
  openVersionManagement(item)
}
function menuDelete(item: any): void {
  closeCardMenu()
  deleteItem(item)
}

/** 页头徽标（#86② 补充维度）：涉及集群数 + 去重插件数 */
const headerStatItems = computed(() => [
  { value: new Set(items.value.map((i) => i.cluster_id)).size, label: '集群' },
  { value: new Set(items.value.map((i) => i.plugin_name)).size, label: '插件' },
])
</script>

<style scoped>
.pml-header-actions {
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
.pml-empty {
  text-align: center;
  padding: 60px 20px;
  font-size: 14px;
  color: var(--muted);
}
.pml-empty-icon {
  font-size: 40px;
  color: var(--muted);
  margin-bottom: 12px;
  opacity: 0.4;
}
.pml-empty-text {
  font-size: 14px;
  color: var(--muted);
}
/* 网格与卡片容器样式已上移共享 .card-grid / .std-card（style.css 卡片一致性单点） */
.pml-card-topbar {
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
.pml-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 20px 0;
}
.pml-card-info {
  flex: 1;
}
.pml-card-name {
  font-size: 14px;
  font-weight: 600;
}
.pml-card-meta {
  text-align: right;
  flex-shrink: 0;
  margin-left: 12px;
}
.pml-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: auto;
  padding: 10px 20px 16px;
  border-top: 1px solid var(--border);
}
.pml-action-btn {
  background: none !important;
  background-color: transparent !important;
}
.pml-action-btn:hover {
  background: var(--bg) !important;
}
.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
}
.config-preview {
  background: var(--bg);
  padding: 12px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-size: 12px;
  font-family: var(--font-mono);
  max-height: 400px;
  overflow-y: auto;
}

/* ── 添加弹窗已抽共享组件 PluginMetadataCreateModal（B2c，样式随组件） ── */
/* 网格/卡片容器断点已上移共享 .card-grid（style.css） */
</style>
