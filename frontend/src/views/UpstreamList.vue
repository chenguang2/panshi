<template>
  <div class="upstream-list">
    <PageHeader title="上游管理" description="管理后端上游服务，配置负载均衡和目标节点">
      <template #actions>
        <select v-model="clusterFilter" class="form-input" style="width:160px;height:32px;font-size:12px;" @change="loadUpstreams">
          <option value="">全部集群</option>
          <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
        </select>
        <button class="btn btn-primary" @click="openCreateModal">+ 新建上游</button>
      </template>
    </PageHeader>

    <div class="upstream-filter-bar">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索名称或描述..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="lbFilter" class="form-input" style="width:140px;height:32px;font-size:12px;" @change="loadUpstreams">
        <option value="">全部算法</option>
        <option value="weighted_roundrobin">加权轮询</option>
        <option value="chash">一致性哈希</option>
        <option value="ewma">EWMA</option>
        <option value="least_conn">最少连接</option>
      </select>
      <span class="text-muted text-sm">共 {{ totalCount }} 个上游</span>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th style="width:30px;"><input type="checkbox"></th>
            <th>名称</th>
            <th>集群</th>
            <th>负载均衡</th>
            <th>目标节点</th>
            <th>协议</th>
            <th>版本</th>
            <th>创建时间</th>
            <th style="width:80px;">操作</th>
          </tr>
        </thead>
        <tbody v-if="upstreams.length === 0">
          <tr>
            <td colspan="9">
              <div class="empty-state" style="padding:32px;">
                <div class="empty-state-icon">◎</div>
                <p>暂无上游服务</p>
              </div>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="record in upstreams" :key="record.id">
            <td><input type="checkbox"></td>
            <td>
              <div class="cell-primary">{{ record.name }}</div>
              <div class="cell-secondary">{{ record.description || '-' }}</div>
            </td>
            <td>{{ record.cluster_name || '-' }}</td>
            <td><span class="lb-badge">{{ lbLabels[record.load_balance] || record.load_balance }}</span></td>
            <td>
              <div class="target-list">
                <span v-for="t in record.targets" :key="t.target" class="target-tag">
                  {{ t.target }} <span class="weight">({{ t.weight }})</span>
                </span>
              </div>
            </td>
            <td><span class="text-mono text-sm">{{ record.scheme || 'http' }}</span></td>
            <td><span class="text-mono text-sm">v{{ record.current_version || '-' }}</span></td>
            <td><span class="cell-secondary">{{ formatDate(record.created_at) }}</span></td>
            <td>
              <div class="action-menu">
                <button class="action-btn" @click.stop="toggleActionMenu(record.id)">⋯</button>
                <div class="action-dropdown" :class="{ open: openMenuId === record.id }">
                  <button class="action-dropdown-item" @click="handleAction('edit', record)">编辑</button>
                  <button class="action-dropdown-item" @click="handleAction('publish', record)">发布</button>
                  <button class="action-dropdown-item" @click="handleAction('version', record)">版本管理</button>
                  <button class="action-dropdown-item danger" @click="handleAction('delete', record)">删除</button>
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

    <UpstreamFormModal
      :visible="formModalVisible"
      :editing-upstream="editingUpstream"
      :clusters="clusters"
      @close="closeFormModal"
      @saved="onSaved"
    />

    <VersionManagementModal
      v-model:open="vmModalVisible"
      resource-type="upstream"
      :resource-id="vmResourceId"
      :cluster-id="vmClusterId"
      :resource-name="vmResourceName"
      @version-change="loadUpstreams"
      @published="loadUpstreams"
    />

    <PublishConfirmModal
      v-model:visible="publishModalVisible"
      title="发布上游"
      :cluster-id="publishClusterId"
      @confirm="onPublishConfirm"
      @cancel="onPublishCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import UpstreamFormModal from '@/components/UpstreamFormModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish } from '@/composables/useClusterUtils'
import { showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'

const loading = ref(false)
const upstreams = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchText = ref('')
const clusterFilter = ref('')
const lbFilter = ref('')
const openMenuId = ref<number | null>(null)
const formModalVisible = ref(false)
const editingUpstream = ref<any | null>(null)
const vmModalVisible = ref(false)
const vmResourceId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmResourceName = ref('')
const publishModalVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const pageNumbers = computed(() => {
  const pages: number[] = []
  const tp = totalPages.value
  const cp = page.value
  const start = Math.max(1, cp - 2)
  const end = Math.min(tp, cp + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

const lbLabels: Record<string, string> = {
  weighted_roundrobin: '加权轮询',
  chash: '一致性哈希',
  ewma: 'EWMA',
  least_conn: '最少连接',
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  try { return new Date(dateStr).toLocaleDateString('zh-CN') } catch { return dateStr }
}

function toggleActionMenu(id: number) {
  openMenuId.value = openMenuId.value === id ? null : id
}

function handleAction(action: string, record: any) {
  openMenuId.value = null
  if (action === 'edit') { editingUpstream.value = record; formModalVisible.value = true }
  else if (action === 'publish') { publishingRecord.value = record; publishClusterId.value = record.cluster_id; publishModalVisible.value = true }
  else if (action === 'version') { vmResourceId.value = record.id; vmClusterId.value = record.cluster_id; vmResourceName.value = record.name; vmModalVisible.value = true }
  else if (action === 'delete') deleteUpstream(record)
}

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; loadUpstreams() }, 300)
}

function goPage(p: number) {
  page.value = p
  loadUpstreams()
}

async function loadUpstreams() {
  loading.value = true
  try {
    const params: any = { page: page.value, page_size: pageSize.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (lbFilter.value) params.load_balance = lbFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/upstreams', { params })
    upstreams.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch {
    message.error('加载上游列表失败')
  } finally {
    loading.value = false
  }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

function openCreateModal() {
  editingUpstream.value = null
  formModalVisible.value = true
}

function editUpstream(record: any) {
  editingUpstream.value = record
  formModalVisible.value = true
}

function closeFormModal() {
  formModalVisible.value = false
  editingUpstream.value = null
}

function onSaved() {
  loadUpstreams()
  closeFormModal()
}

async function deleteUpstream(record: any) {
  // Load cluster nodes for delete options
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${record.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch { /* ignore */ }

  showDeleteConfirm({
    title: `确定要删除上游 "${record.name}" 吗？`,
    apiEndpoint: `/clusters/${record.cluster_id}/upstreams/${record.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除上游: ${record.name}`,
        apiEndpoint: `/clusters/${record.cluster_id}/upstreams/${record.id}`,
        cluster: { id: record.cluster_id, nodes } as any,
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadUpstreams,
        clearSelectedFn: () => {},
      })
    },
  })
}

function publishUpstream(record: any) {
  publishingRecord.value = record
  publishClusterId.value = record.cluster_id
  publishModalVisible.value = true
}

async function onPublishConfirm(nodeIds: number[]) {
  publishModalVisible.value = false
  const record = publishingRecord.value
  if (!record) return
  await executePublish({
    title: `发布上游: ${record.name}`,
    apiEndpoint: `/clusters/${record.cluster_id}/upstreams/${record.id}/publish`,
    nodeIds,
    refreshFn: loadUpstreams,
  })
}

function onPublishCancel() {
  publishModalVisible.value = false
}

function openVersionManagement(record: any) {
  vmResourceId.value = record.id
  vmClusterId.value = record.cluster_id
  vmResourceName.value = record.name
  vmModalVisible.value = true
}

function closeMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.action-menu')) openMenuId.value = null
}

onMounted(() => {
  loadClusters()
  loadUpstreams()
  document.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
})
</script>

<style scoped>
.upstream-list { padding: 20px 24px; }
.upstream-filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }

.target-list { display: flex; flex-wrap: wrap; gap: 4px; }
.target-tag {
  display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px;
  border-radius: 10px; font-size: 11px; background: var(--bg);
  border: 1px solid var(--border); font-family: var(--font-mono);
}
.target-tag .weight { color: var(--muted); font-size: 10px; }
.lb-badge {
  font-size: 11px; padding: 1px 7px; border-radius: 10px; font-family: var(--font-mono);
  background: oklch(56% 0.16 210 / 8%); color: var(--accent);
}
.text-mono { font-family: var(--font-mono); }
.text-sm { font-size: 12px; }
.cell-primary { font-weight: 600; color: var(--fg); }
.cell-secondary { font-size: 12px; color: var(--muted); }

/* ── Table ── */
.table-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: visible;
  box-shadow: var(--shadow-sm);
}
table { width: 100%; border-collapse: collapse; }
thead th {
  background: oklch(97% 0.005 250);
  padding: 10px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  user-select: none;
}
tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; }
tbody tr:last-child { border-bottom: none; }
tbody tr:hover { background: oklch(97% 0.005 250 / 60%); }
tbody td { padding: 12px 16px; font-size: 13px; vertical-align: middle; }

/* ── Action Menu ── */
.action-menu { position: relative; display: inline-block; z-index: 10; }
.action-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); border: none;
  background: transparent; cursor: pointer;
  color: var(--muted); font-size: 16px;
}
.action-btn:hover { background: var(--bg); color: var(--fg); }
.action-dropdown {
  position: absolute; right: 0; top: 100%; z-index: 1000;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); box-shadow: var(--shadow-md);
  min-width: 150px; padding: 4px; display: none;
}
.action-dropdown.open { display: block; }
.action-dropdown-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: var(--radius-sm);
  font-size: 13px; color: var(--fg); cursor: pointer;
  border: none; background: transparent; width: 100%; text-align: left;
  font-family: var(--font-body);
}
.action-dropdown-item:hover { background: var(--bg); }
.action-dropdown-item.danger { color: var(--danger); }

/* ── Pagination ── */
.table-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-top: 1px solid var(--border);
  font-size: 12px; color: var(--muted);
}
.pagination { display: flex; gap: 4px; align-items: center; }
</style>
