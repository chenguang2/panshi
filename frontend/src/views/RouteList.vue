<template>
  <div class="route-list">
    <PageHeader title="路由管理" description="管理 API 路由规则，配置请求匹配、转发目标和插件">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 新建路由</button>
      </template>
    </PageHeader>

    <!-- Method filter chips -->
    <div class="filter-chips">
      <span
        v-for="m in methodFilters"
        :key="m.value"
        class="filter-chip"
        :class="{ active: activeMethod === m.value }"
        @click="selectMethod(m.value)"
        >{{ m.label }}</span
      >
    </div>

    <div class="route-filter-bar">
      <div class="search-input-wrap">
        <input
          v-model="searchText"
          type="text"
          placeholder="搜索名称、URI、描述、域名..."
          class="form-input"
          @input="onSearch"
        />
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width: 140px" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width: 160px" @change="onClusterChange">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <select
        v-model="upstreamFilter"
        class="form-input"
        style="width: 160px"
        @change="onFilterChange"
        :disabled="!upstreams.length && !clusterFilter"
      >
        <option value="">全部上游</option>
        <option v-for="u in upstreams" :key="u.id" :value="u.id">{{ u.name }}</option>
      </select>
      <select
        v-model="pluginFilter"
        class="form-input plugin-filter"
        style="width: 140px; flex-shrink: 0"
        @change="onFilterChange"
      >
        <option value="">全部插件</option>
        <option v-for="p in pluginOptions" :key="p.name" :value="p.name">{{ p.display_name || p.name }}</option>
      </select>
      <select v-model="publishFilter" class="form-input" style="width: 130px" @change="onFilterChange">
        <option value="">全部状态</option>
        <option value="published">已发布</option>
        <option value="pending">待发布</option>
        <option value="unpublished">未发布</option>
      </select>
      <!-- 7.3：全量「方法」下拉，与上方 chips 同值联动（chips 只放常驻高频项） -->
      <select v-model="activeMethod" class="form-input method-filter" style="width: 130px" @change="onFilterChange">
        <option value="">全部方法</option>
        <option v-for="m in methodOptions" :key="m" :value="m">{{ m }}</option>
      </select>
      <span class="filter-count text-muted text-sm">共 {{ totalCount }} 条路由</span>
    </div>

    <div class="table-container">
      <a-table
        :data-source="displayedRoutes"
        :columns="columns"
        :row-key="(record: any) => record.id"
        :pagination="paginationProps({ page, pageSize, total: totalCount }, '条路由')"
        :loading="loading"
        size="middle"
        class="route-table"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'index'">
            <span class="text-muted">{{ (page - 1) * pageSize + index + 1 }}</span>
          </template>
          <template v-if="column.key === 'name'">
            <div class="cell-primary">
              {{ record.name }}
              <span v-if="hasDnsPlugin(record)" class="dns-route-badge">DNS</span>
            </div>
            <div class="cell-secondary">{{ record.description || '-' }}</div>
          </template>

          <template v-if="column.key === 'uri'">
            <span class="uri-cell">{{ record.uri }}</span>
          </template>

          <template v-if="column.key === 'methods'">
            <a-tooltip
              v-if="(record.methods || '').split(',').length > 3"
              :title="(record.methods || '').split(',').join(' ')"
            >
              <span class="method-tags-wrap">
                <span
                  v-for="m in (record.methods || '').split(',').slice(0, 3)"
                  :key="m"
                  class="method-tag"
                  :class="m"
                  >{{ m }}</span
                >
                <span class="method-tag method-more">+{{ (record.methods || '').split(',').length - 3 }}</span>
              </span>
            </a-tooltip>
            <template v-else>
              <span v-for="m in (record.methods || '').split(',')" :key="m" class="method-tag" :class="m">{{ m }}</span>
            </template>
          </template>

          <template v-if="column.key === 'upstream'">
            <span class="text-mono text-sm">{{ record.upstream_name || '-' }}</span>
          </template>

          <template v-if="column.key === 'priority'">
            <span class="priority-badge">{{ record.priority }}</span>
          </template>

          <template v-if="column.key === 'publish_status'">
            <PublishStatusTag
              :version="record.current_version"
              :published-at="record.published_at"
              :pending="record.pending_publish === true"
            />
          </template>

          <template v-if="column.key === 'created_at'">
            <span class="cell-secondary">{{ formatDate(record.created_at) }}</span>
          </template>

          <template v-if="column.key === 'actions'">
            <template v-if="hasDnsPlugin(record)">
              <!-- 7.9：DNS 路由禁用行内操作 + tooltip 指路（替代 toast 拦截）；拍平后发布与菜单一并禁用 -->
              <div class="action-cell">
                <a-tooltip :title="DNS_ROUTE_HINT" placement="top">
                  <a-button size="small" disabled>发布</a-button>
                </a-tooltip>
                <a-tooltip :title="DNS_ROUTE_HINT" placement="top">
                  <a-button type="text" size="small" class="action-trigger-btn" disabled>⋯</a-button>
                </a-tooltip>
              </div>
            </template>
            <template v-else>
              <div class="action-cell">
                <!-- 列表操作统一（方案 A）：发布为高频动作行内拍平，与上游/四层/DNS 页对齐 -->
                <a-button size="small" @click="publishRoute(record)">发布</a-button>
                <a-dropdown :trigger="['click']">
                  <a-button type="text" size="small" class="action-trigger-btn">⋯</a-button>
                  <template #overlay>
                    <a-menu>
                      <a-menu-item @click="editRoute(record)">编辑</a-menu-item>
                      <a-menu-item @click="openVersionManagement(record)">版本管理</a-menu-item>
                      <a-menu-item @click="copyRoute(record)">复制路由</a-menu-item>
                      <a-menu-item danger @click="deleteRoute(record)">删除</a-menu-item>
                    </a-menu>
                  </template>
                </a-dropdown>
              </div>
            </template>
          </template>
        </template>

        <template #emptyText>
          <div class="empty-state">
            <div class="empty-state-icon">◇</div>
            <!-- 7.2：空态双形态——无筛选引导新建，有筛选引导清空（含分组重置，C8） -->
            <template v-if="hasActiveFilters">
              <p>没有符合条件路由</p>
              <button class="btn btn-secondary" @click="clearFilters">清空筛选</button>
            </template>
            <template v-else>
              <p>尚未创建路由</p>
              <button class="btn btn-primary" @click="openCreateModal">新建路由</button>
            </template>
          </div>
        </template>
      </a-table>
    </div>

    <RouteFormModal
      :visible="formModalVisible"
      :editing-route="editingRoute"
      :copying-route="isCopy"
      :clusters="clusters"
      :default-cluster-id="defaultClusterId"
      @close="closeFormModal"
      @saved="onSaved"
    />
    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="route"
      :resource-id="vmId"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      :can-publish="true"
      @version-change="loadRoutes"
      @published="loadRoutes"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { formatDateOnly as formatDate } from '@/utils/format'
import { message } from 'ant-design-vue'
import type { TablePaginationConfig } from 'ant-design-vue'
import api from '@/api'
import { PAGE_SIZE_TABLE, PAGE_SIZE_DROPDOWN } from '@/constants'
import PageHeader from '@/components/PageHeader.vue'
import RouteFormModal from '@/components/RouteFormModal.vue'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import {
  executePublish,
  showDeleteConfirm,
  executeDeleteWithProgress,
  fetchAllClusterNodes,
} from '@/composables/useClusterUtils'
import { paginationProps } from '@/composables/usePagination'
import { useRoute } from 'vue-router'

const route = useRoute()
const loading = ref(false)
const routes = ref<any[]>([])
const clusters = ref<any[]>([])
const upstreams = ref<any[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_TABLE)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref('')
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
  onClusterChange()
}

const displayedRoutes = computed(() => routes.value)
const activeMethod = ref('')

/** 切换 Method 过滤并重新加载。
 *  必须抽为函数：多语句写在模板内联属性里会被 prettier 重排成无分号的多行，
 *  导致 rolldown/vite:vue 解析失败（构建红、vue-tsc 不报）——见约定 #25。 */
function selectMethod(value: string) {
  activeMethod.value = value
  loadRoutes()
}
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

const columns = [
  { title: '#', key: 'index', width: 45 },
  { title: '名称', dataIndex: 'name', key: 'name', sorter: true },
  { title: 'URI', key: 'uri', sorter: true },
  { title: '方法', key: 'methods' },
  { title: '上游', key: 'upstream' },
  { title: '集群', dataIndex: 'cluster_name', key: 'cluster_name' },
  { title: '优先级', key: 'priority', sorter: true },
  {
    title: '发布状态',
    key: 'publish_status',
    // 定宽收敛（用户反馈：auto 宽度挤压行内发布后的操作列）；已发布态的完整时间在 ps-date
    // 省略号截断，悬浮 title 已带全量时间（PublishStatusTag 内建）
    width: 160,
  },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    sorter: true,
  },
  { title: '操作', key: 'actions', width: 110 },
]

// 7.3：chips 收敛为常驻高频项（全部/GET/POST/PUT/DELETE/PATCH）；全量方法入口
// 收敛到「方法」下拉（methodOptions，与表单方法集一致）
const methodFilters = [
  { label: '全部', value: '' },
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'PATCH', value: 'PATCH' },
]
const methodOptions = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']

// 7.9：DNS 路由行内操作统一指路文案（独立页 tooltip 与 Tab 页 tooltip 共用语义）
const DNS_ROUTE_HINT = 'DNS 路由请在「DNS 代理」页管理'

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
  loadRoutes()
}

function onFilterChange() {
  page.value = 1
  loadRoutes()
}

function onSearch() {
  onDebouncedSearch(() => {
    page.value = 1
    loadRoutes()
  })
}

// ── 服务端排序（batch1 组5 5.1）──
// A4：可排序收敛 name/uri/priority/created_at（列 sorter: true），值域与后端
// routes.py ALLOWED_SORT_FIELDS 对齐（后端保留 status 但前端状态列不渲染、不入口）。
// A5：集群/上游两列移除本地 sorter——本地排序只重排当前页，是排序假象。
const SORTABLE_COLUMNS = ['name', 'uri', 'priority', 'created_at']
const sortBy = ref('')
const sortOrder = ref('')

interface TableSorterEvent {
  field?: string | string[]
  column?: { key?: string }
  order?: 'ascend' | 'descend' | null
}

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
    const params: any = { page: page.value, page_size: pageSize.value, group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (upstreamFilter.value) params.upstream_id = upstreamFilter.value
    if (activeMethod.value) params.method = activeMethod.value
    if (publishFilter.value) params.publish_status = publishFilter.value
    if (pluginFilter.value) params.plugin = pluginFilter.value
    if (searchText.value) params.search = searchText.value
    if (sortBy.value) {
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
  loadUpstreams(Number(clusterFilter.value) || undefined)
  loadRoutes()
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
  loadRoutes()
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
  publishRefreshFn.value = loadRoutes
  publishVisible.value = true
}

// 本次发布完成后的刷新动作（组3 3.1）：发布确认弹窗是行内发布与版本弹窗出口条共用的单入口，
// 出口条链路通过覆盖本刷新函数在发布成功后重开版本弹窗（重开触发既有 open watch 重载版本列表并复位出口条）
const publishRefreshFn = ref<() => Promise<void>>(loadRoutes)

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
  publishRefreshFn.value = loadRoutes
}

// 组3 3.1：版本恢复出口条 → 以版本弹窗上下文资源复用既有发布链路（PublishConfirmModal → executePublish）；
// 发布成功后刷新列表并重开版本弹窗（取消同样返回版本弹窗——恢复本身已落库，不丢失）
function onVmPublishRequested() {
  if (vmId.value == null || vmClusterId.value == null || !vmName.value) return
  publishingRecord.value = { id: vmId.value, cluster_id: vmClusterId.value, name: vmName.value }
  publishClusterId.value = vmClusterId.value
  publishRefreshFn.value = async () => {
    await loadRoutes()
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
        refreshFn: loadRoutes,
      })
    },
  })
}

function openVersionManagement(r: any) {
  vmId.value = r.id
  vmClusterId.value = r.cluster_id
  vmName.value = r.name
  vmVisible.value = true
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
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  // plugin-switches-ux-review-fixes 批 2：「查看引用」深链——/routes?search=<plugin_name>
  // 预填搜索框，随首屏请求过滤（useDebouncedSearch 初始值随 loadRoutes 带 search 参数）
  const searchQuery = route.query.search as string | undefined
  if (searchQuery) searchText.value = searchQuery
  loadClusters()
    .then(() => {
      deepLinkedClusterId.value = resolveDeepLinkClusterId()
    })
    .catch(() => {})
  loadPlugins()
  loadRoutes()
})

onUnmounted(() => {
  cancelSearch()
})
</script>

<style scoped>
.route-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  /* 7.10：窄屏允许换行，筛选控件不再挤压 */
  flex-wrap: wrap;
}
.text-muted {
  color: var(--muted);
}
/* 7.10：计数与（后续的）刷新控制右置同组 */
.filter-count {
  margin-left: auto;
}
.text-sm {
  font-size: 12px;
}
.text-mono {
  font-family: var(--font-mono);
}
.cell-primary {
  font-weight: 600;
  color: var(--fg);
}
.cell-secondary {
  font-size: 12px;
  color: var(--muted);
}

.filter-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.filter-chip {
  padding: 4px 12px;
  border-radius: 14px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  user-select: none;
  transition: all 0.15s;
}
.filter-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.filter-chip.active {
  background: oklch(56% 0.16 210 / 10%);
  border-color: var(--accent);
  color: var(--accent);
}

.method-tag {
  display: inline-block;
  padding: 0 5px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  margin-right: 2px;
  background: var(--bg);
  border: 1px solid var(--border);
}
.method-tags-wrap {
  display: inline-flex;
  align-items: center;
}
.method-tag.method-more {
  background: oklch(0% 0 0 / 6%);
  color: var(--muted);
}
.method-tag.GET {
  border-color: oklch(55% 0.15 145 / 30%);
  color: var(--success);
}
.method-tag.POST {
  border-color: oklch(56% 0.16 210 / 30%);
  color: var(--accent);
}
.method-tag.PUT {
  border-color: oklch(65% 0.15 85 / 30%);
  color: var(--warning);
}
.method-tag.DELETE {
  border-color: oklch(55% 0.18 28 / 30%);
  color: var(--danger);
}
.method-tag.PATCH {
  border-color: oklch(55% 0.12 240 / 30%);
  color: var(--info);
}
.method-tag.CONNECT {
  border-color: oklch(55% 0.15 280 / 30%);
  color: oklch(55% 0.15 280);
}
.method-tag.TRACE {
  border-color: oklch(55% 0.1 200 / 30%);
  color: oklch(55% 0.1 200);
}

.priority-badge {
  font-family: var(--font-mono);
  font-size: 11px;
}
.uri-cell {
  font-family: var(--font-mono);
  font-size: 12px;
}

.action-trigger-btn {
  border: none !important;
  background: transparent !important;
  font-size: 16px !important;
  color: var(--muted) !important;
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
.empty-state {
  text-align: center;
  color: var(--muted);
  padding: 32px;
}
.empty-state-icon {
  font-size: 32px;
  margin-bottom: 8px;
}
</style>
