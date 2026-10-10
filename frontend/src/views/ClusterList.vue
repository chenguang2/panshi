<template>
  <div class="cl-page">
    <PageHeader title="集群管理" description="管理所有的网关集群，查看集群资源和运行状态">
      <template #actions>
        <button class="btn btn-secondary" @click="openBackupDownload">备份下载</button>
        <button class="btn btn-primary" @click="showAddModal">+ 新建集群</button>
      </template>
    </PageHeader>

    <!-- topbar 备份下载入口（cluster-ux-close-loop B6.6）：目标集群经弹窗内下拉选择 -->
    <ClusterBackupDialog
      :visible="backupDialogVisible"
      mode="download"
      :cluster="null"
      :clusters="clusters"
      @close="backupDialogVisible = false"
    />

    <div class="cl-header-actions">
      <div class="search-input-wrap">
        <input v-model="filterText" type="text" placeholder="搜索集群名称或显示名..." class="form-input" />
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width: 140px; flex-shrink: 0">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g === '' ? '__ung__' : g">{{ g || '未分组' }}</option>
      </select>
      <select v-model="statusFilter" class="form-input" style="width: 110px; flex-shrink: 0">
        <option value="all">全部状态</option>
        <option value="enabled">已启用</option>
        <option value="disabled">已禁用</option>
      </select>
      <span class="text-sm text-muted">共 {{ filteredClusters.length }} 个集群</span>
      <button v-if="hasCollapsed" class="btn btn-secondary btn-sm" @click="expandAllGroups">全部展开</button>
      <button v-if="hasExpanded" class="btn btn-secondary btn-sm" @click="collapseAllGroups">全部收起</button>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="filteredClusters.length === 0" class="cl-empty">
      <!-- 空状态两分支（cluster-ux-close-loop B6.4）：从未创建 vs 筛选无结果 -->
      <template v-if="hasActiveFilters">
        <div class="cl-empty-icon">◈</div>
        <div class="cl-empty-text">没有符合筛选条件的集群</div>
        <button class="btn btn-secondary btn-sm" @click="clearFilters">清除筛选</button>
      </template>
      <template v-else>
        <div class="cl-empty-icon">◈</div>
        <div class="cl-empty-text">还没有集群</div>
        <button class="btn btn-primary" @click="showAddModal">新建集群</button>
      </template>
    </div>
    <div v-else>
      <div v-for="group in groupedClusters" :key="group.name" class="cl-group">
        <div class="cl-group-header" @click="toggleGroup(group.name)">
          <span class="cl-group-arrow">{{ expandedGroups[group.name] ? '▾' : '▸' }}</span>
          <span class="cl-group-name">{{ group.name || '未分组' }}</span>
          <span class="cl-group-count">(共{{ group.clusters.length }}个)</span>
          <a-button size="small" class="expand-group-btn" @click.stop="toggleGroup(group.name)">
            {{ expandedGroups[group.name] ? '收起' : '展开' }}
          </a-button>
        </div>
        <div v-show="expandedGroups[group.name]" class="cl-grid">
          <ClusterCard v-for="c in group.clusters" :key="c.id" :cluster="c" :route-badge="routeBadge(c)">
            <template #actions>
              <button class="btn btn-secondary btn-sm cl-action-btn" @click="viewCluster(c)">详情</button>
              <button class="btn btn-ghost btn-sm cl-action-btn" @click="testCluster(c)">连接测试</button>
              <button class="btn btn-ghost btn-sm cl-action-btn" @click="editCluster(c)">编辑</button>
              <button class="btn btn-ghost btn-sm cl-action-btn" style="color: var(--danger)" @click="deleteCluster(c)">
                删除
              </button>
              <span style="flex: 1"></span>
            </template>
          </ClusterCard>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <!-- 集群详情弹窗：共享组件唯一实现（cluster-ux-close-loop 3.6） -->
    <ClusterDetailModal :cluster="detailCluster" :visible="detailVisible" @close="detailVisible = false" />

    <!-- Test Connection Modal -->
    <div class="modal-overlay" :style="{ display: testVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>测试连接</h2>
          <button class="modal-close" @click="resetTest">&times;</button>
        </div>
        <div v-if="!testRunning && testLogs.length === 0" class="modal-body">
          <div style="margin-bottom: 12px; font-size: 13px; color: var(--muted)">
            将对下列节点执行管理面连通性测试（集群挂接区域时自动经区域网关）：
          </div>
          <div class="test-nodes-select">
            <div v-for="n in testNodes" :key="n.id" class="test-node-row">
              <span class="node-addr">{{ n.ip }}:{{ n.management_port }}</span>
              <span class="badge" :class="n.status === 1 ? 'badge-success' : 'badge-neutral'">{{
                n.status === 1 ? '在线' : '离线'
              }}</span>
            </div>
          </div>
          <div v-if="testNodes.length === 0" style="text-align: center; padding: 20px 0; color: var(--muted)">
            该集群没有节点
          </div>
        </div>
        <div v-else class="modal-body">
          <div class="test-progress">
            <div v-for="(log, i) in testLogs" :key="i" class="test-log-row" :class="log.status">
              <span v-if="log.status === 'pending'" class="log-spinner">⏳</span>
              <span v-else-if="log.status === 'success'" class="log-icon">✓</span>
              <span v-else-if="log.status === 'error'" class="log-icon log-error">✗</span>
              <span class="log-msg">{{ log.msg }}</span>
              <button
                v-if="log.status === 'error' && log.whitelist && canPushGatewayConfig"
                class="test-action-link"
                @click="goRelayGateways"
              >
                去下发网关配置
              </button>
            </div>
          </div>
          <div v-if="!testRunning" class="test-status-hint">测试结果将更新节点的在线状态标记</div>
        </div>
        <div class="modal-footer">
          <template v-if="!testRunning && testLogs.length === 0">
            <button class="btn btn-secondary" @click="resetTest">取消</button>
            <button class="btn btn-primary" :disabled="testNodes.length === 0" @click="runTest">开始测试</button>
          </template>
          <button v-else class="btn btn-secondary" @click="resetTest">关闭</button>
        </div>
      </div>
    </div>

    <ClusterFormModal
      :visible="modalVisible"
      :editing-cluster="editingCluster"
      :group-options="groupOptions"
      @close="closeClusterForm"
      @saved="onClusterFormSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import ClusterFormModal from '@/components/ClusterFormModal.vue'
import ClusterDetailModal from '@/components/ClusterDetailModal.vue'
import ClusterBackupDialog from '@/components/ClusterBackupDialog.vue'
import ClusterCard from '@/components/ClusterCard.vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useClusterRouteBadge } from '@/composables/useClusterRouteBadge'
import { routeLabel, deleteClusterWithConfirm } from '@/composables/useClusterUtils'
import type { Cluster } from '@/types'
import { PAGE_SIZE_DROPDOWN } from '@/constants'

const authStore = useAuthStore()

const clusters = ref<Cluster[]>([])
const loading = ref(false)
const filterText = ref('')
const groupFilter = ref('__all__')
/** 集群状态筛选（cluster-ux-close-loop 4.3）：语义 = 集群启用位，非节点健康 */
const statusFilter = ref('all')

/** 筛选是否有生效条件（空状态两分支判定，cluster-ux-close-loop B6.4） */
const hasActiveFilters = computed(
  () => filterText.value.trim() !== '' || groupFilter.value !== '__all__' || statusFilter.value !== 'all',
)

function clearFilters() {
  filterText.value = ''
  groupFilter.value = '__all__'
  statusFilter.value = 'all'
}

/** topbar 备份下载入口（cluster-ux-close-loop B6.6） */
const backupDialogVisible = ref(false)

function openBackupDownload() {
  backupDialogVisible.value = true
}
const expandedGroups = ref<Record<string, boolean>>({})

// ── 经中继 / 直连 徽章 ────────────────────────────────────────────────
// 唯一实现在 useClusterRouteBadge composable（cluster-ux-close-loop 3.5）：
// 中继关闭 / 区域数据缺失 / 未绑区域 → null（不渲染徽章，直连是缺省态）。
const { routeBadge } = useClusterRouteBadge(clusters)

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map((c) => c.group_name || ''))
  return Array.from(names).sort((a, b) => {
    if (!a) return 1
    if (!b) return -1
    return a.localeCompare(b)
  })
})

const filteredClusters = computed(() => {
  let list = clusters.value
  const ft = filterText.value?.toLowerCase()
  if (ft)
    list = list.filter((c) => c.name.toLowerCase().includes(ft) || (c.display_name || '').toLowerCase().includes(ft))
  if (groupFilter.value === '__ung__') {
    list = list.filter((c) => !c.group_name)
  } else if (groupFilter.value !== '__all__') {
    list = list.filter((c) => c.group_name === groupFilter.value)
  }
  if (statusFilter.value === 'enabled') list = list.filter((c) => c.status === 1)
  else if (statusFilter.value === 'disabled') list = list.filter((c) => c.status !== 1)
  return list
})

const groupedClusters = computed(() => {
  const groups: { name: string; clusters: Cluster[] }[] = []
  const map = new Map<string, Cluster[]>()
  for (const c of filteredClusters.value) {
    const key = c.group_name || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (!a) return 1
    if (!b) return -1
    return a.localeCompare(b)
  })
  for (const key of keys) groups.push({ name: key, clusters: map.get(key)! })
  return groups
})

const hasCollapsed = computed(() => Object.values(expandedGroups.value).some((v) => !v))
const hasExpanded = computed(() => Object.values(expandedGroups.value).some((v) => v))

function toggleGroup(name: string) {
  expandedGroups.value[name] = !expandedGroups.value[name]
}
function expandAllGroups() {
  for (const k of Object.keys(expandedGroups.value)) expandedGroups.value[k] = true
}
function collapseAllGroups() {
  for (const k of Object.keys(expandedGroups.value)) expandedGroups.value[k] = false
}

async function loadClusters() {
  loading.value = true
  try {
    const endpoint = authStore.user?.role === 'admin' ? '/clusters' : '/clusters/my'
    const res = await api.get(endpoint, { params: { page: 1, page_size: PAGE_SIZE_DROPDOWN } })
    clusters.value = res.data.items || []
    for (const c of clusters.value) {
      const key = c.group_name || ''
      if (!(key in expandedGroups.value)) expandedGroups.value[key] = true
    }
    // 数据加载完成后恢复之前保存的滚动位置
    const savedScroll = sessionStorage.getItem('panshi_scroll_/clusters')
    if (savedScroll) {
      sessionStorage.removeItem('panshi_scroll_/clusters')
      const { x, y } = JSON.parse(savedScroll)
      // double rAF: 等待 DOM 更新后再滚动
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(x, y)))
    }
  } catch (e: any) {
    message.error('加载集群列表失败: ' + (e.response?.data?.detail || e.message))
  } finally {
    loading.value = false
  }
}

// Detail
const detailVisible = ref(false)
const detailCluster = ref<Cluster | null>(null)
function viewCluster(c: Cluster) {
  detailCluster.value = c
  detailVisible.value = true
}

// Test
const testVisible = ref(false)
const testRunning = ref(false)
const testNodes = ref<{ id: number; ip: string; service_port: number; management_port: number; status: number }[]>([])
const testLogs = ref<{ status: 'pending' | 'success' | 'error'; msg: string; whitelist?: boolean }[]>([])

/** 白名单 403 快捷动作仅对具备 relay_gateway 权限的用户渲染（与侧边栏菜单权限键同源） */
const canPushGatewayConfig = computed(() => authStore.hasPermission('relay_gateway'))
const testRouter = useRouter()

function goRelayGateways() {
  resetTest()
  void testRouter.push('/relay-gateways')
}

/** POST /clusters/{id}/test 的逐节点结果 */
interface ConnectionTestResult {
  node_id: number
  ip: string
  port: number
  ok: boolean
  msg?: string
  version?: string
  /** 节点执行路径（后端提供；缺失时不显示标签） */
  route?: 'relay' | 'direct'
  /** 经中继时的网关地址 */
  relay_via?: string
}
let testingCluster: Cluster | null = null

function resetTest() {
  testVisible.value = false
  testRunning.value = false
  testNodes.value = []
  testLogs.value = []
  testingCluster = null
}

async function testCluster(c: Cluster) {
  testingCluster = c
  testLogs.value = []
  testRunning.value = false
  try {
    const res = await api.get(`/clusters/${c.id}/nodes`, { params: { page: 1, page_size: PAGE_SIZE_DROPDOWN } })
    testNodes.value = (res.data.items || []).map((n: any) => ({
      id: n.id,
      ip: n.ip,
      service_port: n.service_port,
      management_port: n.management_port,
      status: n.status,
    }))
  } catch {
    testNodes.value = []
  }
  testVisible.value = true
}

async function runTest() {
  if (!testingCluster) return
  testRunning.value = true
  testLogs.value = []
  const nodeIds = testNodes.value.map((n) => n.id)
  if (nodeIds.length === 0) {
    testLogs.value.push({ status: 'error', msg: '没有节点可测试' })
    testRunning.value = false
    return
  }
  const startTime = Date.now()
  for (const n of testNodes.value) {
    testLogs.value.push({ status: 'pending', msg: `${n.ip}:${n.management_port} 测试中...` })
  }
  try {
    const res = await api.post(`/clusters/${testingCluster.id}/test`, { node_ids: nodeIds })
    const results: ConnectionTestResult[] = res.data.results || []
    let successCount = 0
    let failCount = 0
    for (const r of results) {
      const idx = testNodes.value.findIndex((n) => n.id === r.node_id)
      if (idx >= 0) {
        const label = `${r.ip}:${r.port}`
        const rl = routeLabel(r.route)
        const routeSuffix = rl ? `（${rl}）` : ''
        if (r.ok) {
          successCount++
          testLogs.value[idx] = { status: 'success', msg: `${label} 连接成功${routeSuffix}` }
        } else {
          failCount++
          testLogs.value[idx] = {
            status: 'error',
            msg: `${label} 连接失败 — ${r.msg}${routeSuffix}`,
            whitelist: !!(r.msg && r.msg.includes('白名单')),
          }
        }
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const failNote =
      failCount > 0 ? ` ⚠ 存在 ${failCount} 个失败节点，请检查失败原因（白名单 403 需先下发网关配置）` : ''
    testLogs.value.push({
      status: failCount > 0 ? 'error' : 'success',
      msg: `测试完成 — 共 ${results.length} 个节点，成功 ${successCount}，失败 ${failCount}，耗时 ${elapsed}s${failNote}`,
    })
  } catch (e: any) {
    for (let i = 0; i < testLogs.value.length; i++) {
      if (testLogs.value[i].status === 'pending') {
        const n = testNodes.value[i]
        testLogs.value[i] = {
          status: 'error',
          msg: `${n.ip}:${n.management_port} 测试异常 — ${e.response?.data?.detail || e.message}`,
        }
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    testLogs.value.push({ status: 'error', msg: `测试异常终止，耗时 ${elapsed}s` })
  }
  testRunning.value = false
  await loadClusters()
}

// Add/Edit
const modalVisible = ref(false)
const editingCluster = ref<Cluster | null>(null)

function closeClusterForm(): void {
  modalVisible.value = false
  editingCluster.value = null
}

function onClusterFormSaved(): void {
  closeClusterForm()
  void loadClusters()
}

function showAddModal() {
  editingCluster.value = null
  modalVisible.value = true
}
function editCluster(c: Cluster) {
  editingCluster.value = c
  modalVisible.value = true
}

function deleteCluster(c: Cluster) {
  void deleteClusterWithConfirm(c, { refreshFn: () => loadClusters() })
}

onMounted(() => {
  loadClusters()
})
</script>

<style scoped>
.cl-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}
.cl-header-actions .search-input-wrap {
  width: 200px;
  flex-shrink: 0;
}
.cl-header-actions :deep(.form-input) {
  width: 100%;
}
.loading-state {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
  font-size: 14px;
}
.cl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}
.cl-empty-icon {
  font-size: 40px;
  color: var(--muted);
  margin-bottom: 12px;
  opacity: 0.4;
}
.cl-empty-text {
  font-size: 14px;
  color: var(--muted);
}

.cl-group {
  margin-bottom: 12px;
}
.cl-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--radius-md);
  background: oklch(94.5% 0.008 240);
  transition: background 0.15s;
  user-select: none;
}
.cl-group-header:hover {
  background: var(--accent-bg);
}
.cl-group-arrow {
  font-size: 12px;
  color: var(--muted);
  width: 14px;
  flex-shrink: 0;
}
.expand-group-btn {
  flex-shrink: 0;
  margin-left: auto;
}
.cl-group-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}
.cl-group-count {
  font-size: 12px;
  color: var(--muted);
}

.cl-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

/* 卡片解剖样式（卡片容器/头部/统计条/节点区等）已收敛至
   components/ClusterCard.vue（档位 C 统一实现），本页仅保留页面专属规则。 */
.cl-action-btn {
  background: none !important;
  background-color: transparent !important;
}
.cl-action-btn:hover {
  background: var(--bg) !important;
}

.test-nodes-select {
  max-height: 320px;
  overflow-y: auto;
}
.test-node-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
  border-bottom: 1px solid var(--border);
}
.test-node-row:last-child {
  border-bottom: none;
}
.node-addr {
  font-family: var(--font-mono);
  font-size: 14px;
}
.test-progress {
  max-height: 400px;
  overflow-y: auto;
}
.test-log-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}
.test-log-row:last-child {
  border-bottom: none;
}
.test-log-row.success {
  color: var(--success);
}
.test-log-row.error {
  color: var(--danger);
}
.test-action-link {
  border: none;
  background: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  text-decoration: underline;
}
.test-status-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
.log-spinner {
  width: 16px;
  text-align: center;
}
.log-icon {
  font-weight: 700;
  width: 16px;
  text-align: center;
}
.log-icon.log-error {
  color: var(--danger);
}
.log-msg {
  font-family: var(--font-mono);
  font-size: 12px;
}

.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
}

/* Modal overlay (matching NodeList add node modal style) */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 40%);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.modal-wide {
  max-width: 700px;
}

@media (max-width: 1200px) {
  .cl-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 768px) {
  .cl-grid {
    grid-template-columns: 1fr;
  }
  .cl-header-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
