<template>
  <div class="upstream-list">
    <PageHeader title="上游管理" description="管理后端上游服务，配置负载均衡和目标节点">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 新建上游</button>
      </template>
    </PageHeader>

    <div class="upstream-filter-bar">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索名称或描述..." class="form-input" @input="onSearch" />
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width: 140px" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width: 160px" @change="onFilterChange">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <select v-model="lbFilter" class="form-input" style="width: 140px" @change="onFilterChange">
        <option value="">全部算法</option>
        <option value="weighted_roundrobin">加权轮询</option>
        <option value="chash">一致性哈希</option>
        <option value="ewma">延迟最小</option>
        <option value="least_conn">最少连接</option>
      </select>
      <span class="text-muted text-sm">共 {{ totalCount }} 个上游</span>
    </div>

    <div class="table-container">
      <a-table
        :data-source="displayedUpstreams"
        :columns="columns"
        :row-key="(record: any) => record.id"
        :pagination="paginationProps({ page, pageSize, total: totalCount }, '个上游')"
        :loading="loading"
        size="middle"
        class="upstream-table"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
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
            <span class="text-mono text-sm">{{ record.scheme || '—' }}</span>
          </template>

          <template v-if="column.key === 'publish_status'">
            <PublishStatusTag
              :version="record.current_version"
              :published-at="record.published_at"
              :pending="record.pending_publish === true"
              :last-publish-status="record.last_publish_status"
            />
          </template>

          <template v-if="column.key === 'actions'">
            <div class="action-cell">
              <a-button type="primary" size="small" @click="openPublishModal(record)">发布</a-button>
              <a-dropdown :trigger="['click']">
                <a-button type="text" size="small" class="action-trigger-btn">⋯</a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item @click="handleAction('edit', record)">编辑</a-menu-item>
                    <a-menu-item @click="handleAction('version', record)">版本管理</a-menu-item>
                    <a-menu-item @click="handleAction('copy', record)">复制</a-menu-item>
                    <a-menu-item danger @click="handleAction('delete', record)">删除</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </template>
        </template>

        <template #empty>
          <div class="empty-state">
            <div class="empty-state-icon">◎</div>
            <template v-if="hasActiveFilters">
              <p>没有符合筛选条件的上游</p>
              <button class="btn btn-secondary" @click="clearFilters">清除筛选</button>
            </template>
            <template v-else>
              <p>还没有上游</p>
              <button class="btn btn-primary" @click="openCreateModal">新建上游</button>
            </template>
          </div>
        </template>
      </a-table>
    </div>

    <UpstreamFormModal
      :visible="formModalVisible"
      :editing-upstream="editingUpstream"
      :copying-upstream="copyingUpstream"
      :clusters="clusters"
      @close="closeFormModal"
      @saved="onSaved"
      @publish-requested="onFormPublishRequested"
    />

    <VersionManagementModal
      v-model:open="vmModalVisible"
      resource-type="upstream"
      :resource-id="vmResourceId"
      :cluster-id="vmClusterId"
      :resource-name="vmResourceName"
      :can-publish="true"
      @version-change="loadUpstreams"
      @published="loadUpstreams"
      @publish-requested="onVmPublishRequested"
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
import { listUpstreams } from '@/api/upstreams'
import { listClusters, getClusterNodes } from '@/api/clusters'
import { PAGE_SIZE_TABLE } from '@/constants'
import PageHeader from '@/components/PageHeader.vue'
import UpstreamFormModal from '@/components/UpstreamFormModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import { executePublish } from '@/composables/useClusterUtils'
import { showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { paginationProps } from '@/composables/usePagination'
import { useRoute } from 'vue-router'

const route = useRoute()
const loading = ref(false)
const upstreams = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_TABLE)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref('')
const groupFilter = ref('__all__')
const lbFilter = ref('')

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
  loadUpstreams()
}

const displayedUpstreams = computed(() => upstreams.value)
const formModalVisible = ref(false)
const editingUpstream = ref<any | null>(null)
const copyingUpstream = ref(false)
const vmModalVisible = ref(false)
const vmResourceId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmResourceName = ref('')
const publishModalVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '集群', dataIndex: 'cluster_name', key: 'cluster_name' },
  { title: '负载均衡', key: 'load_balance' },
  { title: '目标节点', key: 'targets' },
  { title: '协议', key: 'scheme' },
  { title: '发布状态', key: 'publish_status' },
  { title: '操作', key: 'actions', width: 150 },
]

const lbLabels: Record<string, string> = {
  weighted_roundrobin: '加权轮询',
  chash: '一致性哈希',
  ewma: '延迟最小',
  least_conn: '最少连接',
}

// ── 4.6 空状态两分支：「从未创建」 vs 「筛选后为空」 ──
const hasActiveFilters = computed(
  () => !!searchText.value || !!clusterFilter.value || !!lbFilter.value || groupFilter.value !== '__all__',
)

function clearFilters() {
  searchText.value = ''
  clusterFilter.value = ''
  lbFilter.value = ''
  groupFilter.value = '__all__'
  page.value = 1
  loadUpstreams()
}

function handleAction(action: string, record: any) {
  if (action === 'copy') {
    editingUpstream.value = record
    copyingUpstream.value = true
    formModalVisible.value = true
  } else if (action === 'edit') {
    editingUpstream.value = record
    copyingUpstream.value = false
    formModalVisible.value = true
  } else if (action === 'version') {
    vmResourceId.value = record.id
    vmClusterId.value = record.cluster_id
    vmResourceName.value = record.name
    vmModalVisible.value = true
  } else if (action === 'delete') deleteUpstream(record)
}

function openPublishModal(record: any) {
  publishingRecord.value = record
  publishClusterId.value = record.cluster_id
  publishModalVisible.value = true
}

// 1.3：版本管理弹窗恢复成功后的「立即发布恢复的配置」出口 → 同一行内发布的链路
function onVmPublishRequested() {
  vmModalVisible.value = false
  const record = upstreams.value.find((u) => u.id === vmResourceId.value)
  openPublishModal(record || { id: vmResourceId.value, cluster_id: vmClusterId.value, name: vmResourceName.value })
}

// 3.1/3.2：表单保存引导「立即发布」→ 打开该上游的发布弹窗（与行内发布同链路）
function onFormPublishRequested(payload: { clusterId: number | string; upstreamId: number | null; name: string }) {
  publishingRecord.value = { id: payload.upstreamId, cluster_id: payload.clusterId, name: payload.name }
  publishClusterId.value = payload.clusterId as number
  publishModalVisible.value = true
}

function onFilterChange() {
  page.value = 1
  loadUpstreams()
}

function onSearch() {
  onDebouncedSearch(() => {
    page.value = 1
    loadUpstreams()
  })
}

function handleTableChange(pagination: TablePaginationConfig) {
  page.value = pagination.current || 1
  if (pagination.pageSize) pageSize.value = pagination.pageSize
  loadUpstreams()
}

async function loadUpstreams() {
  loading.value = true
  try {
    const params: any = { page: page.value, page_size: pageSize.value, group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (lbFilter.value) params.load_balance = lbFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await listUpstreams(params)
    upstreams.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch (error: any) {
    const detail = error?.response?.data?.detail
    const msg = typeof detail === 'string' ? detail : detail?.msg || error?.message || '未知错误'
    message.error('加载上游列表失败: ' + msg)
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
  editingUpstream.value = null
  copyingUpstream.value = false
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
    const res = await getClusterNodes(record.cluster_id)
    nodes = res.data?.items || []
  } catch {
    /* ignore */
  }

  showDeleteConfirm({
    title: `确定要删除上游 "${record.name}" 吗？`,
    apiEndpoint: `/clusters/${record.cluster_id}/upstreams/${record.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除上游: ${record.name}`,
        apiEndpoint: `/clusters/${record.cluster_id}/upstreams/${record.id}`,
        cluster: { id: record.cluster_id, nodes },
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
.upstream-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}
.text-muted {
  color: var(--muted);
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

.target-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.target-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
.target-tag .weight {
  color: var(--muted);
  font-size: 11px;
}
.lb-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  font-family: var(--font-mono);
  background: oklch(56% 0.16 210 / 8%);
  color: var(--accent);
}

.action-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.action-trigger-btn {
  border: none !important;
  background: transparent !important;
  font-size: 16px !important;
  color: var(--muted) !important;
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
