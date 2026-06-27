<template>
  <div class="route-list">
    <PageHeader title="路由管理" description="管理 API 路由规则，配置请求匹配、转发目标和插件">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 新建路由</button>
      </template>
    </PageHeader>

    <!-- Method filter chips -->
    <div class="filter-chips">
      <span v-for="m in methodFilters" :key="m.value"
        class="filter-chip" :class="{ active: activeMethod === m.value }"
        @click="activeMethod = m.value; loadRoutes()">{{ m.label }}</span>
    </div>

    <div class="route-filter-bar">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索名称、URI、描述..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width:140px;" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width:160px;" @change="onClusterChange">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <select v-model="upstreamFilter" class="form-input" style="width:160px;" @change="onFilterChange" :disabled="!upstreams.length && !clusterFilter">
        <option value="">全部上游</option>
        <option v-for="u in upstreams" :key="u.id" :value="u.id">{{ u.name }}</option>
      </select>
      <select v-model="pluginFilter" class="form-input plugin-filter" style="width:140px;flex-shrink:0;" @change="onFilterChange">
        <option value="">全部插件</option>
        <option v-for="p in pluginOptions" :key="p.name" :value="p.name">{{ p.display_name || p.name }}</option>
      </select>
      <select v-model="publishFilter" class="form-input" style="width:130px;" @change="onFilterChange">
        <option value="">全部状态</option>
        <option value="published">已发布</option>
        <option value="unpublished">未发布</option>
      </select>
      <span class="text-muted text-sm">共 {{ totalCount }} 条路由</span>
    </div>

    <div class="table-container">
    <a-table
      :data-source="displayedRoutes"
      :columns="columns"
      :row-key="(record: any) => record.id"
      :pagination="{ current: page, pageSize, total: totalCount, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条路由`, pageSizeOptions: ['10', '20', '50'] }"
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
          <div class="cell-primary">{{ record.name }}</div>
          <div class="cell-secondary">{{ record.description || '-' }}</div>
        </template>

        <template v-if="column.key === 'uri'">
          <span class="uri-cell">{{ record.uri }}</span>
        </template>

        <template v-if="column.key === 'methods'">
          <span v-for="m in (record.methods || '').split(',')" :key="m" class="method-tag" :class="m">{{ m }}</span>
        </template>

        <template v-if="column.key === 'upstream'">
          <span class="text-mono text-sm">{{ record.upstream_name || '-' }}</span>
        </template>

        <template v-if="column.key === 'priority'">
          <span class="priority-badge">{{ record.priority }}</span>
        </template>

        <template v-if="column.key === 'version'">
          <span class="text-mono text-sm">v{{ record.current_version || '-' }}</span>
        </template>

        <template v-if="column.key === 'created_at'">
          <span class="cell-secondary">{{ formatDate(record.created_at) }}</span>
        </template>

        <template v-if="column.key === 'actions'">
          <a-dropdown :trigger="['click']">
            <a-button type="text" size="small" class="action-trigger-btn">⋯</a-button>
            <template #overlay>
              <a-menu>
                <a-menu-item @click="copyRoute(record)">复制路由</a-menu-item>
                <a-menu-item @click="editRoute(record)">编辑</a-menu-item>
                <a-menu-item @click="publishRoute(record)">发布</a-menu-item>
                <a-menu-item @click="openVersionManagement(record)">版本管理</a-menu-item>
                <a-menu-item danger @click="deleteRoute(record)">删除</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </template>
      </template>

      <template #empty>
        <div class="empty-state">
          <div class="empty-state-icon">◇</div>
          <p>暂无路由规则</p>
        </div>
      </template>
    </a-table>
    </div>

    <RouteFormModal :visible="formModalVisible" :editing-route="editingRoute" :copying-route="isCopy" :clusters="clusters" @close="closeFormModal" @saved="onSaved" />
    <VersionManagementModal v-model:open="vmVisible" resource-type="route" :resource-id="vmId" :cluster-id="vmClusterId" :resource-name="vmName" @version-change="loadRoutes" @published="loadRoutes" />
    <PublishConfirmModal v-model:visible="publishVisible" title="发布路由" :cluster-id="publishClusterId" @confirm="onPublish" @cancel="publishVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { message } from 'ant-design-vue'
import type { TablePaginationConfig } from 'ant-design-vue'
import api from '@/api'
import { PAGE_SIZE_TABLE, PAGE_SIZE_DROPDOWN } from '@/constants'
import PageHeader from '@/components/PageHeader.vue'
import RouteFormModal from '@/components/RouteFormModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
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
  const names = new Set(clusters.value.map(c => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter(c => !c.group_name)
  return clusters.value.filter(c => c.group_name === groupFilter.value)
})

function onGroupChange() {
  clusterFilter.value = ''
  onClusterChange()
}

const displayedRoutes = computed(() => routes.value)
const activeMethod = ref('')
const publishFilter = ref('')
const pluginFilter = ref('')
const pluginOptions = ref<{ name: string; display_name?: string }[]>([])


const formModalVisible = ref(false)
const editingRoute = ref<any | null>(null)
const isCopy = ref(false)
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)

const columns = [
  { title: '#', key: 'index', width: 45 },
  { title: '名称', dataIndex: 'name', key: 'name', sorter: (a: any, b: any) => a.name?.localeCompare(b.name) },
  { title: 'URI', key: 'uri', sorter: (a: any, b: any) => (a.uri || '').localeCompare(b.uri || '') },
  { title: '方法', key: 'methods' },
  { title: '上游', key: 'upstream', sorter: (a: any, b: any) => (a.upstream_name || '').localeCompare(b.upstream_name || '') },
  { title: '集群', dataIndex: 'cluster_name', key: 'cluster_name', sorter: (a: any, b: any) => (a.cluster_name || '').localeCompare(b.cluster_name || '') },
  { title: '优先级', key: 'priority', sorter: (a: any, b: any) => (a.priority || 0) - (b.priority || 0) },
  { title: '版本', key: 'version', sorter: (a: any, b: any) => ((a.current_version || '')+'').localeCompare((b.current_version || '')+'') },
  { title: '创建时间', dataIndex: 'created_at', key: 'created_at', sorter: (a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || '') },
  { title: '操作', key: 'actions', width: 80 },
]

const methodFilters = [
  { label: '全部', value: '' },
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'CONNECT', value: 'CONNECT' },
  { label: 'TRACE', value: 'TRACE' },
]

function formatDate(d: string) {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('zh-CN') } catch { return d }
}

function onFilterChange() {
  page.value = 1
  loadRoutes()
}

function onSearch() {
  onDebouncedSearch(() => { page.value = 1; loadRoutes() })
}

function handleTableChange(pagination: TablePaginationConfig) {
  page.value = pagination.current || 1
  if (pagination.pageSize) pageSize.value = pagination.pageSize
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
    const res = await api.get('/routes', { params })
    routes.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch (error: any) {
    const detail = error?.response?.data?.detail
    const msg = typeof detail === 'string' ? detail : (detail?.msg || error?.message || '未知错误')
    message.error('加载路由列表失败: ' + msg)
  }
  finally { loading.value = false }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

async function loadUpstreams(cid?: number) {
  if (!cid) { upstreams.value = []; return }
  try {
    const res = await api.get(`/clusters/${cid}/upstreams`, { params: { page_size: PAGE_SIZE_DROPDOWN } })
    upstreams.value = res.data.items || []
  } catch { upstreams.value = [] }
}

function onClusterChange() {
  upstreamFilter.value = ''
  page.value = 1
  loadUpstreams(Number(clusterFilter.value) || undefined)
  loadRoutes()
}

function openCreateModal() { editingRoute.value = null; isCopy.value = false; formModalVisible.value = true }
function editRoute(r: any) { editingRoute.value = r; isCopy.value = false; formModalVisible.value = true }
function closeFormModal() { formModalVisible.value = false; editingRoute.value = null; isCopy.value = false }
function onSaved() { loadRoutes(); closeFormModal() }

function copyRoute(r: any) {
  editingRoute.value = r; isCopy.value = true; formModalVisible.value = true
}

function publishRoute(r: any) {
  publishingRecord.value = r; publishClusterId.value = r.cluster_id; publishVisible.value = true
}
async function onPublish(nodeIds: number[]) {
  publishVisible.value = false
  const r = publishingRecord.value
  if (!r) return
  await executePublish({ title: `发布路由: ${r.name}`, apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}/publish`, nodeIds, refreshFn: loadRoutes })
}

async function deleteRoute(r: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${r.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch { /* ignore */ }

  showDeleteConfirm({
    title: `确定要删除路由 "${r.name}" 吗？`,
    apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除路由: ${r.name}`,
        apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}`,
        cluster: { id: r.cluster_id, nodes } as any,
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadRoutes,
      })
    },
  })
}

function openVersionManagement(r: any) {
  vmId.value = r.id; vmClusterId.value = r.cluster_id; vmName.value = r.name; vmVisible.value = true
}

async function loadPlugins() {
  try {
    const res = await api.get('/plugins/builtin')
    pluginOptions.value = res.data?.plugins || []
  } catch { /* ignore */ }
}

onMounted(() => {
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  loadClusters()
  loadPlugins()
  loadRoutes()
})

onUnmounted(() => { cancelSearch() })
</script>

<style scoped>
.route-list { padding: 20px 24px; }
.route-filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: nowrap; }
.text-muted { color: var(--muted); }
.text-sm { font-size: 12px; }
.text-mono { font-family: var(--font-mono); }
.cell-primary { font-weight: 600; color: var(--fg); }
.cell-secondary { font-size: 12px; color: var(--muted); }

.filter-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.filter-chip {
  padding: 4px 12px; border-radius: 14px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border); background: var(--surface); color: var(--muted);
  user-select: none; transition: all 0.15s;
}
.filter-chip:hover { border-color: var(--accent); color: var(--accent); }
.filter-chip.active { background: oklch(56% 0.16 210 / 10%); border-color: var(--accent); color: var(--accent); }

.method-tag {
  display: inline-block; padding: 0 5px; border-radius: 3px; font-size: 10px; font-weight: 600;
  font-family: var(--font-mono); margin-right: 2px; background: var(--bg); border: 1px solid var(--border);
}
.method-tag.GET { border-color: oklch(55% 0.15 145 / 30%); color: var(--success); }
.method-tag.POST { border-color: oklch(56% 0.16 210 / 30%); color: var(--accent); }
.method-tag.PUT { border-color: oklch(65% 0.15 85 / 30%); color: var(--warning); }
.method-tag.DELETE { border-color: oklch(55% 0.18 28 / 30%); color: var(--danger); }
.method-tag.PATCH { border-color: oklch(55% 0.12 240 / 30%); color: var(--info); }
.method-tag.CONNECT { border-color: oklch(55% 0.15 280 / 30%); color: oklch(55% 0.15 280); }
.method-tag.TRACE { border-color: oklch(55% 0.10 200 / 30%); color: oklch(55% 0.10 200); }

.priority-badge { font-family: var(--font-mono); font-size: 11px; }
.uri-cell { font-family: var(--font-mono); font-size: 12px; }

/* ── 表格外框 ── */
.table-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.table-container :deep(.ant-table) {
  background: transparent !important;
  border: none !important;
}

/* ── 表头 ── */
.route-table :deep(.ant-table-thead > tr > th) {
  background: oklch(97% 0.005 250);
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  white-space: nowrap;
  user-select: none;
  border-bottom: 1px solid var(--border) !important;
}
.route-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}

/* ── 行分割线 ── */
.route-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 16px;
  font-size: 13px;
  white-space: nowrap;
  background: transparent !important;
  border-bottom: 1px solid var(--border);
}
.route-table :deep(.ant-table-tbody > tr:hover > td) {
  background: oklch(97% 0.005 250 / 60%) !important;
}

/* ── 分页脚注 ── */
.route-table :deep(.ant-table-pagination) {
  background: var(--bg) !important;
  margin: 0 !important;
  padding: 12px 16px !important;
  border-top: 1px solid var(--border) !important;
}

.action-trigger-btn {
  border: none !important;
  background: transparent !important;
  font-size: 16px !important;
  color: var(--muted) !important;
}

.empty-state { text-align: center; color: var(--muted); padding: 32px; }
.empty-state-icon { font-size: 32px; margin-bottom: 8px; }
</style>
