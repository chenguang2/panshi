<template>
  <div class="gr-page">
    <PageHeader title="全局规则" description="全局规则对所属集群的全部路由生效，修改后需发布才会在 Edge 节点生效">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 添加全局规则</button>
      </template>
    </PageHeader>

    <div class="gr-header-actions">
      <div class="search-input-wrap">
        <input
          v-model="searchText"
          type="text"
          placeholder="搜索全局规则名称..."
          class="form-input"
          @input="onSearch"
        />
        <!-- 7.5：图标字体替换 emoji；有输入时提供一键清空（allow-clear 语义） -->
        <button v-if="searchText" class="search-clear" title="清空搜索" @click="clearSearch">&times;</button>
        <SearchOutlined v-else class="search-icon" />
      </div>
      <select v-model="groupFilter" class="form-input" style="width: 140px; flex-shrink: 0" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width: 160px; flex-shrink: 0" @change="loadRules">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <!-- 2.5：未发布/待发布由列表数据本地统计（D9），超 500 截断时基于已加载数据 -->
      <span class="text-sm text-muted"
        >共 {{ totalCount }} 个 · 未发布 {{ unpublishedCount }} · 待发布 {{ pendingCount }}</span
      >
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
    <div v-else class="gr-grid">
      <div v-for="pc in displayedRules" :key="pc.id" class="gr-card" :style="getCardBorderStyle(pc.cluster_group_name)">
        <div class="gr-card-topbar" :style="getGroupColorStyle(pc.cluster_group_name)">
          <span>{{ pc.cluster_name || '-' }}</span>
          <span v-if="pc.cluster_group_name" class="group-badge">{{ pc.cluster_group_name }}</span>
        </div>
        <div class="gr-card-header">
          <div class="gr-card-info">
            <div class="gr-card-name">{{ pc.name }}</div>
            <div v-if="pc.description" class="gr-card-desc">{{ pc.description }}</div>
          </div>
          <div class="gr-card-meta">
            <!-- 2.2：PublishStatusTag 四态单一表达，移除「badge + tag」双显 -->
            <PublishStatusTag
              :version="pc.current_version"
              :published-at="pc.published_at"
              :pending="pc.pending_publish === true"
              :last-publish-status="pc.last_publish_status"
            />
          </div>
        </div>
        <div class="gr-card-plugins">
          <span v-for="(pcfg, pname) in pc.plugins" :key="pname" class="gr-plugin-tag">{{ pname }}</span>
          <span
            v-if="!pc.plugins || Object.keys(pc.plugins).length === 0"
            class="gr-no-plugins"
            title="发布时将下发空插件集"
          >
            未选择插件
          </span>
        </div>
        <div class="gr-card-actions">
          <button class="btn btn-ghost btn-sm gr-action-btn" @click="viewRule(pc)">查看</button>
          <button class="btn btn-ghost btn-sm gr-action-btn" @click="editRule(pc)">编辑</button>
          <button class="btn btn-ghost btn-sm gr-action-btn" style="color: var(--danger)" @click="deleteRule(pc)">
            删除
          </button>
          <span style="flex: 1"></span>
          <button class="btn btn-secondary btn-sm" @click="publishRule(pc)">发布</button>
          <button class="btn btn-secondary btn-sm" @click="openVersionManagement(pc)">版本管理</button>
        </div>
      </div>
    </div>

    <PluginEntityFormModal
      :visible="formVisible"
      :editing-config="editingConfig"
      :clusters="clusters"
      resource-type="global_rule"
      @close="closeForm"
      @saved="onSaved"
    />

    <GlobalRuleViewDrawer v-model:visible="viewDrawerVisible" :config="viewingGr" />

    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="global_rule"
      :resource-id="vmId"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      @version-change="loadRules"
      @published="loadRules"
    />

    <PublishConfirmModal
      v-model:visible="publishVisible"
      :title="publishTitle"
      :cluster-id="publishClusterId"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message } from 'ant-design-vue'
import { SearchOutlined } from '@ant-design/icons-vue'
import { PAGE_SIZE_CARD_GRID, PAGE_SIZE_DROPDOWN } from '@/constants'
import { listGlobalRules } from '@/api/globalRules'
import { listClusters, getClusterNodes } from '@/api/clusters'
import PageHeader from '@/components/PageHeader.vue'
import PluginEntityFormModal from '@/components/PluginEntityFormModal.vue'
import GlobalRuleViewDrawer from '@/components/GlobalRuleViewDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { globalRuleDeleteWarning } from '@/composables/useClusterPluginEntity'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'
import { getApiErrorMessage } from '@/utils/error'
import PublishStatusTag from '@/components/PublishStatusTag.vue'

const rules = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref('')
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
function clearSearch() {
  searchText.value = ''
  loadRules()
}

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
  publishVisible.value = true
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const pc = publishingRecord.value
  if (!pc) return
  await executePublish({
    title: `发布全局规则: ${pc.name}`,
    apiEndpoint: `/clusters/${pc.cluster_id}/global_rules/${pc.id}/publish`,
    nodeIds,
    refreshFn: loadRules,
  })
}

function openVersionManagement(pc: any) {
  vmId.value = pc.id
  vmClusterId.value = pc.cluster_id
  vmName.value = pc.name
  vmVisible.value = true
}

onMounted(() => {
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  loadClusters()
  loadRules()
})

onUnmounted(() => {
  cancelSearch()
})
</script>

<style scoped>
.gr-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}
/* 7.5 搜索一键清空按钮（原生 input 的 allow-clear 语义） */
.search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 2px;
}
.search-clear:hover {
  color: var(--fg);
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
.gr-grid {
  display: grid;
  /* 7.5：卡片网格自适应列数（中屏不再固定 3 列留大量空白） */
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}
.gr-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.gr-card:hover {
  box-shadow: var(--shadow-md);
}
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
@media (max-width: 768px) {
  .gr-grid {
    grid-template-columns: 1fr;
  }
}
</style>
