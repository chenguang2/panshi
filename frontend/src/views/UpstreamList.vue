<template>
  <div class="upstream-list">
    <PageHeader title="上游管理" description="管理后端上游服务，配置负载均衡和目标节点">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 新建上游</button>
      </template>
    </PageHeader>

    <div class="upstream-filter-bar">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索名称或描述..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width:140px;" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width:160px;" @change="loadUpstreams">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <select v-model="lbFilter" class="form-input" style="width:140px;" @change="loadUpstreams">
        <option value="">全部算法</option>
        <option value="weighted_roundrobin">加权轮询</option>
        <option value="chash">一致性哈希</option>
        <option value="ewma">EWMA</option>
        <option value="least_conn">最少连接</option>
      </select>
      <span class="text-muted text-sm">共 {{ groupFilter !== '__all__' ? displayedUpstreams.length : totalCount }} 个上游</span>
    </div>

    <div class="table-container">
    <a-table
      :data-source="displayedUpstreams"
      :columns="columns"
      :row-key="(record: any) => record.id"
      :pagination="{
        current: page,
        pageSize,
        total: totalCount,
        showSizeChanger: true,
        showTotal: (total: number) => `共 ${total} 个上游`,
        pageSizeOptions: ['10', '20', '50'],
      }"
      :loading="loading"
      size="middle"
      class="upstream-table"
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

        <template v-if="column.key === 'load_balance'">
          <span class="lb-badge">{{ lbLabels[record.load_balance] || record.load_balance }}</span>
        </template>

        <template v-if="column.key === 'targets'">
          <div class="target-list" v-if="record.targets?.length">
            <span v-for="t in record.targets" :key="t.target" class="target-tag">
              {{ t.target }} <span class="weight">({{ t.weight }})</span>
            </span>
          </div>
          <span v-else class="text-muted text-sm">—</span>
        </template>

        <template v-if="column.key === 'scheme'">
          <span class="text-mono text-sm">{{ record.scheme || 'http' }}</span>
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
                <a-menu-item @click="handleAction('edit', record)">编辑</a-menu-item>
                <a-menu-item @click="handleAction('publish', record)">发布</a-menu-item>
                <a-menu-item @click="handleAction('version', record)">版本管理</a-menu-item>
                <a-menu-item danger @click="handleAction('delete', record)">删除</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </template>
      </template>

      <template #empty>
        <div class="empty-state">
          <div class="empty-state-icon">◎</div>
          <p>暂无上游服务</p>
        </div>
      </template>
    </a-table>
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
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { message, Modal } from 'ant-design-vue'
import type { TablePaginationConfig } from 'ant-design-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import UpstreamFormModal from '@/components/UpstreamFormModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish } from '@/composables/useClusterUtils'
import { showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { useRoute } from 'vue-router'

const route = useRoute()
const loading = ref(false)
const upstreams = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(20)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref('')
const groupFilter = ref('__all__')
const lbFilter = ref('')

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
  loadUpstreams()
}

const displayedUpstreams = computed(() => {
  if (groupFilter.value === '__all__') return upstreams.value
  const gIds = new Set(filteredClusters.value.map(c => c.id))
  return upstreams.value.filter(u => gIds.has(u.cluster_id))
})
const formModalVisible = ref(false)
const editingUpstream = ref<any | null>(null)
const vmModalVisible = ref(false)
const vmResourceId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmResourceName = ref('')
const publishModalVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)


const columns = [
  { title: '#', key: 'index', width: 45 },
  { title: '名称', dataIndex: 'name', key: 'name', sorter: (a: any, b: any) => a.name?.localeCompare(b.name) },
  { title: '集群', dataIndex: 'cluster_name', key: 'cluster_name', sorter: (a: any, b: any) => (a.cluster_name || '').localeCompare(b.cluster_name || '') },
  { title: '负载均衡', key: 'load_balance', sorter: (a: any, b: any) => (a.load_balance || '').localeCompare(b.load_balance || '') },
  { title: '目标节点', key: 'targets', sorter: (a: any, b: any) => ((a.targets?.[0]?.target) || '').localeCompare((b.targets?.[0]?.target) || '') },
  { title: '协议', key: 'scheme' },
  { title: '版本', key: 'version', sorter: (a: any, b: any) => ((a.current_version || '')+'').localeCompare((b.current_version || '')+'') },
  { title: '创建时间', dataIndex: 'created_at', key: 'created_at', sorter: (a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || '') },
  { title: '操作', key: 'actions', width: 80 },
]

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

function handleAction(action: string, record: any) {
  if (action === 'edit') { editingUpstream.value = record; formModalVisible.value = true }
  else if (action === 'publish') { publishingRecord.value = record; publishClusterId.value = record.cluster_id; publishModalVisible.value = true }
  else if (action === 'version') { vmResourceId.value = record.id; vmClusterId.value = record.cluster_id; vmResourceName.value = record.name; vmModalVisible.value = true }
  else if (action === 'delete') deleteUpstream(record)
}

function onSearch() {
  onDebouncedSearch(() => { page.value = 1; loadUpstreams() })
}

function handleTableChange(pagination: TablePaginationConfig) {
  page.value = pagination.current || 1
  if (pagination.pageSize) pageSize.value = pagination.pageSize
  loadUpstreams()
}

async function loadUpstreams() {
  loading.value = true
  try {
    const isGroupMode = groupFilter.value !== '__all__' && !clusterFilter.value
    const params: any = { page: isGroupMode ? 1 : page.value, page_size: isGroupMode ? 9999 : pageSize.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (lbFilter.value) params.load_balance = lbFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/upstreams', { params })
    upstreams.value = res.data.items || []
    totalCount.value = isGroupMode ? upstreams.value.length : (res.data.total || 0)
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

function closeFormModal() {
  formModalVisible.value = false
  editingUpstream.value = null
}

function onSaved() {
  loadUpstreams()
  closeFormModal()
}

async function deleteUpstream(record: any) {
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

onMounted(() => {
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  loadClusters()
  loadUpstreams()
})

onUnmounted(() => {
  cancelSearch()
})
</script>

<style scoped>
.upstream-list { padding: 20px 24px; }
.upstream-filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: nowrap; }
.text-muted { color: var(--muted); }
.text-sm { font-size: 12px; }
.text-mono { font-family: var(--font-mono); }
.cell-primary { font-weight: 600; color: var(--fg); }
.cell-secondary { font-size: 12px; color: var(--muted); }

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
.upstream-table :deep(.ant-table-thead > tr > th) {
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
.upstream-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}

/* ── 行分割线 ── */
.upstream-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 16px;
  font-size: 13px;
  white-space: nowrap;
  background: transparent !important;
  border-bottom: 1px solid var(--border);
}
.upstream-table :deep(.ant-table-tbody > tr:hover > td) {
  background: oklch(97% 0.005 250 / 60%) !important;
}

/* ── 分页脚注 ── */
.upstream-table :deep(.ant-table-pagination) {
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
