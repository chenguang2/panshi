<template>
  <div class="route-list">
    <PageHeader title="路由管理" description="管理 API 路由规则，配置请求匹配、转发目标和插件">
      <template #actions>
        <select v-model="clusterFilter" class="form-input" style="width:160px;height:32px;font-size:12px;" @change="loadRoutes">
          <option value="">全部集群</option>
          <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
        </select>
        <button class="btn btn-primary" @click="openCreateModal">+ 新建路由</button>
      </template>
    </PageHeader>

    <!-- Method filter chips -->
    <div class="filter-chips">
      <span v-for="m in methodFilters" :key="m.value"
        class="filter-chip" :class="{ active: activeMethod === m.value }"
        @click="activeMethod = m.value; loadRoutes()">{{ m.label }}</span>
    </div>

    <!-- Filter bar -->
    <div class="route-filter-bar">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索名称、URI、描述..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="publishFilter" class="form-input" style="width:130px;height:32px;font-size:12px;" @change="loadRoutes">
        <option value="">全部状态</option>
        <option value="published">已发布</option>
        <option value="unpublished">未发布</option>
      </select>
      <span class="text-muted text-sm">共 {{ totalCount }} 条路由</span>
    </div>

    <!-- Table -->
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th style="width:30px;"><input type="checkbox"></th>
            <th>名称</th>
            <th>URI</th>
            <th>方法</th>
            <th>集群</th>
            <th>优先级</th>
            <th>版本</th>
            <th>创建时间</th>
            <th style="width:80px;">操作</th>
          </tr>
        </thead>
        <tbody v-if="routes.length === 0">
          <tr><td colspan="9"><div class="empty-state" style="padding:32px;"><div class="empty-state-icon">◇</div><p>暂无路由规则</p></div></td></tr>
        </tbody>
        <tbody v-else>
          <tr v-for="record in routes" :key="record.id">
            <td><input type="checkbox"></td>
            <td><div class="cell-primary">{{ record.name }}</div><div class="cell-secondary">{{ record.description || '-' }}</div></td>
            <td><span class="uri-cell">{{ record.uri }}</span></td>
            <td><span v-for="m in (record.methods || '').split(',')" :key="m" class="method-tag" :class="m">{{ m }}</span></td>
            <td>{{ record.cluster_name || '-' }}</td>
            <td><span class="priority-badge">{{ record.priority }}</span></td>
            <td><span class="text-mono text-sm">v{{ record.current_version || '-' }}</span></td>
            <td><span class="cell-secondary">{{ formatDate(record.created_at) }}</span></td>
            <td>
              <div class="action-menu">
                <button class="action-btn" @click.stop="toggleMenu(record.id)">⋯</button>
                <div class="action-dropdown" :class="{ open: openMenuId === record.id }">
                  <button class="action-dropdown-item" @click="copyRoute(record)">复制路由</button>
                  <button class="action-dropdown-item" @click="editRoute(record)">编辑</button>
                  <button class="action-dropdown-item" @click="publishRoute(record)">发布</button>
                  <button class="action-dropdown-item" @click="openVersionManagement(record)">版本管理</button>
                  <button class="action-dropdown-item danger" @click="deleteRoute(record)">删除</button>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="table-footer">
      <span class="text-muted text-sm">第 {{ page }} 页，共 {{ totalPages }} 页</span>
      <div class="pagination">
        <button class="btn btn-sm" :disabled="page <= 1" @click="goPage(page - 1)">‹</button>
        <button v-for="p in pageNumbers" :key="p" class="btn btn-sm" :class="{ 'btn-primary': p === page }" @click="goPage(p)">{{ p }}</button>
        <button class="btn btn-sm" :disabled="page >= totalPages" @click="goPage(page + 1)">›</button>
      </div>
    </div>

    <RouteFormModal :visible="formModalVisible" :editing-route="editingRoute" :copying-route="isCopy" :clusters="clusters" @close="closeFormModal" @saved="onSaved" />
    <VersionManagementModal v-model:open="vmVisible" resource-type="route" :resource-id="vmId" :cluster-id="vmClusterId" :resource-name="vmName" @version-change="loadRoutes" @published="loadRoutes" />
    <PublishConfirmModal v-model:visible="publishVisible" title="发布路由" :cluster-id="publishClusterId" @confirm="onPublish" @cancel="publishVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import RouteFormModal from '@/components/RouteFormModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'

const routes = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchText = ref('')
const clusterFilter = ref('')
const activeMethod = ref('')
const publishFilter = ref('')
const openMenuId = ref<number | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

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

const methodFilters = [
  { label: '全部', value: '' },
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'PATCH', value: 'PATCH' },
]

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const pageNumbers = computed(() => {
  const pages: number[] = []
  const start = Math.max(1, page.value - 2)
  const end = Math.min(totalPages.value, page.value + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

function formatDate(d: string) {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('zh-CN') } catch { return d }
}

function toggleMenu(id: number) { openMenuId.value = openMenuId.value === id ? null : id }
function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; loadRoutes() }, 300)
}
function goPage(p: number) { page.value = p; loadRoutes() }

async function loadRoutes() {
  try {
    const params: any = { page: page.value, page_size: pageSize.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (activeMethod.value) params.method = activeMethod.value
    if (publishFilter.value) params.publish_status = publishFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/routes', { params })
    routes.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch { message.error('加载路由列表失败') }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

function openCreateModal() { editingRoute.value = null; isCopy.value = false; formModalVisible.value = true }
function editRoute(r: any) { editingRoute.value = r; isCopy.value = false; formModalVisible.value = true }
function closeFormModal() { formModalVisible.value = false; editingRoute.value = null; isCopy.value = false }
function onSaved() { loadRoutes(); closeFormModal() }

async function copyRoute(r: any) {
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

function deleteRoute(r: any) {
  Modal.confirm({
    title: '删除路由', content: `确定删除路由 "${r.name}" 吗？`,
    okText: '删除', okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/clusters/${r.cluster_id}/routes/${r.id}`, { data: { delete_db: true, delete_edge: false } })
        message.success('路由已删除'); loadRoutes()
      } catch (e: any) { message.error(e?.response?.data?.detail || '删除失败') }
    },
  })
}

function openVersionManagement(r: any) {
  vmId.value = r.id; vmClusterId.value = r.cluster_id; vmName.value = r.name; vmVisible.value = true
}

function closeMenu(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.action-menu')) openMenuId.value = null
}

onMounted(() => { loadClusters(); loadRoutes(); document.addEventListener('click', closeMenu) })
onUnmounted(() => { document.removeEventListener('click', closeMenu) })
</script>

<style scoped>
.route-list { padding: 20px 24px; }
.route-filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
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
.priority-badge { font-family: var(--font-mono); font-size: 11px; }
.uri-cell { font-family: var(--font-mono); font-size: 12px; }
.text-mono { font-family: var(--font-mono); }
.text-sm { font-size: 12px; }
.cell-primary { font-weight: 600; color: var(--fg); }
.cell-secondary { font-size: 12px; color: var(--muted); }
.table-container { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
table { width: 100%; border-collapse: collapse; }
thead th { background: oklch(97% 0.005 250); padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; user-select: none; }
tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; }
tbody tr:last-child { border-bottom: none; }
tbody tr:hover { background: oklch(97% 0.005 250 / 60%); }
tbody td { padding: 12px 16px; font-size: 13px; vertical-align: middle; }
.action-menu { position: relative; display: inline-block; z-index: 10; }
.action-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); border: none; background: transparent; cursor: pointer; color: var(--muted); font-size: 16px; }
.action-btn:hover { background: var(--bg); color: var(--fg); }
.action-dropdown { position: absolute; right: 0; top: 100%; z-index: 1000; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-md); min-width: 150px; padding: 4px; display: none; }
.action-dropdown.open { display: block; }
.action-dropdown-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius-sm); font-size: 13px; color: var(--fg); cursor: pointer; border: none; background: transparent; width: 100%; text-align: left; font-family: var(--font-body); }
.action-dropdown-item:hover { background: var(--bg); }
.action-dropdown-item.danger { color: var(--danger); }
.table-footer { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
.pagination { display: flex; gap: 4px; align-items: center; }
</style>
