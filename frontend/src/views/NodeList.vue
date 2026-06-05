<template>
  <div class="node-list">
    <PageHeader title="节点管理" description="管理 Edge 网关节点，监控运行状态并执行操作">
      <template #actions>
        <select v-model="clusterFilter" class="form-input" style="width:160px;height:32px;font-size:12px;" @change="onFilterChange">
          <option value="">全部集群</option>
          <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
        </select>
        <button class="btn btn-primary" @click="openAddModal">+ 添加节点</button>
      </template>
    </PageHeader>

    <div class="node-filter-bar">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索 IP 或名称..." class="form-input" @input="onSearchInput">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="statusFilter" class="form-input" style="width:130px;height:32px;font-size:12px;" @change="onFilterChange">
        <option value="">全部状态</option>
        <option :value="1">运行中</option>
        <option :value="0">已停止</option>
      </select>
      <span class="text-muted text-sm">共 {{ totalCount }} 个节点</span>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th style="width:30px;"><input type="checkbox" @change="toggleAll" :checked="allSelected"></th>
            <th>IP</th>
            <th>所属集群</th>
            <th>服务端口</th>
            <th>管理端口</th>
            <th>Edge 路径</th>
            <th>状态</th>
            <th>Edge 版本</th>
            <th style="width:280px;">操作</th>
          </tr>
        </thead>
        <tbody v-if="nodes.length === 0">
          <tr>
            <td colspan="9">
              <div class="empty-state" style="padding:32px;">
                <div class="empty-state-icon">◎</div>
                <p>暂无节点</p>
              </div>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="record in nodes" :key="record.id">
            <td><input type="checkbox" :value="record.id" v-model="selectedIds"></td>
            <td><span class="text-mono">{{ record.ip }}</span></td>
            <td>{{ record.cluster_name || '-' }}</td>
            <td><span class="text-mono text-sm">{{ record.service_port }}</span></td>
            <td><span class="text-mono text-sm">{{ record.management_port }}</span></td>
            <td><span class="text-sm">{{ record.edge_path }}</span></td>
            <td>
              <span v-if="nginxRunning(record)" class="badge badge-success"><span class="status-dot online"></span>运行中</span>
              <span v-else class="badge badge-danger"><span class="status-dot offline"></span>已停止</span>
            </td>
            <td><span class="text-mono text-sm">{{ record.status_detail?.statistic?.edge_version || '-' }}</span></td>
            <td>
              <div class="action-menu-group">
                <button class="btn btn-ghost btn-sm" @click="handleStart(record)">▶ 启动</button>
                <button class="btn btn-ghost btn-sm" @click="handleStop(record)">⏹ 停止</button>
                <button class="btn btn-ghost btn-sm" @click="handleStatus(record)">✓ 状态查询</button>
                <button class="btn btn-ghost btn-sm" @click="viewDetail(record)">ⓘ 详情</button>
                <div class="action-menu">
                  <button class="action-btn" @click.stop="toggleActionMenu(record.id)">⋯</button>
                  <div class="action-dropdown" :class="{ open: openMenuId === record.id }">
                    <button class="action-dropdown-item" @click="handleEdit(record)">编辑</button>
                    <button class="action-dropdown-item danger" @click="handleDelete(record)">删除</button>
                    <button class="action-dropdown-item" @click="handleDiff(record)">数据库对比</button>
                  </div>
                </div>
              </div>
              <div class="operation-log" :class="{ visible: opLogVisible === record.id }" :id="'opLog-' + record.id"></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="table-footer">
      <span class="text-muted text-sm">第 {{ page }} 页，共 {{ totalPages }} 页（{{ totalCount }} 条）</span>
      <div class="pagination">
        <button class="btn btn-sm" :disabled="page <= 1" @click="goPage(page - 1)">‹</button>
        <button v-for="p in pageNumbers" :key="p" class="btn btn-sm" :class="{ 'btn-primary': p === page }" @click="goPage(p)">{{ p }}</button>
        <button class="btn btn-sm" :disabled="page >= totalPages" @click="goPage(page + 1)">›</button>
      </div>
    </div>

    <!-- Add / Edit Node Modal -->
    <div class="modal-overlay" id="nodeFormModal" :style="{ display: formModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ editingNode ? '编辑节点' : '添加节点' }}</h2>
          <button class="modal-close" @click="closeFormModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">所属集群 <span class="required">*</span></label>
              <select v-model="formData.cluster_id" class="form-input" :disabled="!!editingNode">
                <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">IP 地址 <span class="required">*</span></label>
              <input v-model="formData.ip" type="text" class="form-input" placeholder="10.0.0.1">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">服务端口</label>
              <input v-model.number="formData.service_port" type="number" class="form-input" min="1" max="65535">
            </div>
            <div class="form-group">
              <label class="form-label">管理端口</label>
              <input v-model.number="formData.management_port" type="number" class="form-input" min="1" max="65535">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Edge 路径</label>
            <input v-model="formData.edge_path" type="text" class="form-input" placeholder="/usr/local/edge">
            <div class="form-hint">必须以 / 开头</div>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="formData.statusCheck"> <span>{{ formData.statusCheck ? '启用' : '停用' }}</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeFormModal">取消</button>
          <button class="btn btn-primary" @click="handleFormSubmit" :disabled="formSubmitting">{{ formSubmitting ? '提交中...' : '保存' }}</button>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div class="modal-overlay" id="detailModal" :style="{ display: detailModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ detailTitle }}</h2>
          <button class="modal-close" @click="detailModalVisible = false">&times;</button>
        </div>
        <div class="modal-body" v-if="detailNode">
          <div class="node-detail-grid">
            <div class="nd-label">IP 地址</div><div class="nd-value">{{ detailNode.ip }}</div>
            <div class="nd-label">所属集群</div><div class="nd-value">{{ detailNode.cluster_name || '-' }}</div>
            <div class="nd-label">服务端口</div><div class="nd-value">{{ detailNode.service_port }}</div>
            <div class="nd-label">管理端口</div><div class="nd-value">{{ detailNode.management_port }}</div>
            <div class="nd-label">Edge 路径</div><div class="nd-value">{{ detailNode.edge_path }}</div>
            <div class="nd-label">节点状态</div>
            <div class="nd-value">
              <span v-if="nginxRunning(detailNode)" class="badge badge-success">运行中</span>
              <span v-else class="badge badge-danger">已停止</span>
            </div>
            <div class="nd-label">创建时间</div><div class="nd-value">{{ formatDate(detailNode.created_at) }}</div>
          </div>
          <div v-if="clusterStats" class="node-stats">
            <div class="node-stat-card"><div class="ns-value">{{ clusterStats.routes || 0 }}</div><div class="ns-label">路由</div></div>
            <div class="node-stat-card"><div class="ns-value">{{ clusterStats.upstreams || 0 }}</div><div class="ns-label">上游</div></div>
            <div class="node-stat-card"><div class="ns-value">{{ clusterStats.plugin_configs || 0 }}</div><div class="ns-label">插件组</div></div>
            <div class="node-stat-card"><div class="ns-value">{{ clusterStats.global_rules || 0 }}</div><div class="ns-label">全局规则</div></div>
            <div class="node-stat-card"><div class="ns-value">{{ clusterStats.plugin_metadata || 0 }}</div><div class="ns-label">插件元数据</div></div>
            <div class="node-stat-card"><div class="ns-value">{{ clusterStats.static_resources || 0 }}</div><div class="ns-label">静态资源</div></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="detailModalVisible = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- Config Diff Drawer -->
    <ConfigDiff
      v-model:visible="diffDrawerVisible"
      :cluster-id="diffClusterId"
      :initial-node-id="diffNodeId"
    />

    <!-- Execution Result Drawer -->
    <NodeExecutionResultDrawer
      :visible="execDrawerVisible"
      :title="execDrawerTitle"
      :progress="execProgress"
      :logs="execLogs"
      :elapsed="execElapsed"
      :result="execResult"
      :highlights="execHighlights"
      :statistics="execStatistics"
      @update:visible="execDrawerVisible = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import ConfigDiff from '@/views/ConfigDiff.vue'
import { listNodes, createNode, updateNode, deleteNode } from '@/api/nodes'

// ── State ──────────────────────────────────────────────────────────────────
const loading = ref(false)
const nodes = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchText = ref('')
const clusterFilter = ref<number | string>('')
const statusFilter = ref<number | string>('')
const selectedIds = ref<number[]>([])
const openMenuId = ref<number | null>(null)
const opLogVisible = ref<number | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let _elapsedTimer: ReturnType<typeof setInterval> | null = null

// Form modal
const formModalVisible = ref(false)
const editingNode = ref<any | null>(null)
const formSubmitting = ref(false)
const formData = reactive({
  cluster_id: '' as number | string,
  ip: '',
  service_port: 80,
  management_port: 9180,
  edge_path: '/usr/local/edge',
  statusCheck: true,
})

// Detail modal
const detailModalVisible = ref(false)
const detailNode = ref<any | null>(null)
const clusterStats = ref<any | null>(null)
const detailTitle = computed(() =>
  detailNode.value ? `节点详情 — ${detailNode.value.ip}` : '节点详情'
)

// Execution drawer
const execDrawerVisible = ref(false)
const execDrawerTitle = ref('')
const execProgress = reactive({ percent: 0, status: 'active' as 'active' | 'success' | 'exception' })
const execLogs = ref<string[]>([])
const execElapsed = ref<number | null>(null)
const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number } | null>(null)
const execHighlights = ref<string[]>([])
const execStatistics = ref<Record<string, string> | null>(null)

// Config diff drawer
const diffDrawerVisible = ref(false)
const diffClusterId = ref(0)
const diffNodeId = ref(0)

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const allSelected = computed(() => nodes.value.length > 0 && selectedIds.value.length === nodes.value.length)
const pageNumbers = computed(() => {
  const pages: number[] = []
  const tp = totalPages.value
  const cp = page.value
  const start = Math.max(1, cp - 2)
  const end = Math.min(tp, cp + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

// ── Data Loading ───────────────────────────────────────────────────────────

async function loadNodes() {
  loading.value = true
  try {
    const res = await listNodes({
      page: page.value,
      pageSize: pageSize.value,
      search: searchText.value || undefined,
      clusterId: clusterFilter.value ? Number(clusterFilter.value) : undefined,
      status: statusFilter.value !== '' ? Number(statusFilter.value) : undefined,
    })
    nodes.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch (error: any) {
    message.error('加载节点列表失败: ' + (error.response?.data?.detail || error.message))
  } finally {
    loading.value = false
  }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || []
  } catch { /* ignore */ }
}

async function loadClusterStats(clusterId: number) {
  try {
    const res = await api.get(`/clusters/${clusterId}/stats`)
    clusterStats.value = res.data
  } catch {
    clusterStats.value = null
  }
}

// ── Filter / Search / Pagination ───────────────────────────────────────────

function onFilterChange() {
  page.value = 1
  loadNodes()
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    loadNodes()
  }, 300)
}

function goPage(p: number) {
  page.value = p
  loadNodes()
}

function toggleAll() {
  if (allSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = nodes.value.map((n: any) => n.id)
  }
}

function toggleActionMenu(id: number) {
  openMenuId.value = openMenuId.value === id ? null : id
}

function closeMenu(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.action-menu')) openMenuId.value = null
}

// ── Form Modal ─────────────────────────────────────────────────────────────

function openAddModal() {
  editingNode.value = null
  formData.cluster_id = ''
  formData.ip = ''
  formData.service_port = 80
  formData.management_port = 9180
  formData.edge_path = '/usr/local/edge'
  formData.statusCheck = true
  formModalVisible.value = true
}

function handleEdit(record: any) {
  editingNode.value = record
  formData.cluster_id = record.cluster_id
  formData.ip = record.ip
  formData.service_port = record.service_port
  formData.management_port = record.management_port
  formData.edge_path = record.edge_path || ''
  formData.statusCheck = record.status === 1
  formModalVisible.value = true
  openMenuId.value = null
}

function closeFormModal() {
  formModalVisible.value = false
  editingNode.value = null
}

async function handleFormSubmit() {
  if (!formData.cluster_id) {
    message.warning('请选择所属集群')
    return
  }
  if (!formData.ip) {
    message.warning('请输入 IP 地址')
    return
  }
  if (formData.edge_path && !formData.edge_path.startsWith('/')) {
    message.warning('Edge 路径必须以 / 开头')
    return
  }

  formSubmitting.value = true
  try {
    const payload = {
      ip: formData.ip,
      service_port: formData.service_port,
      management_port: formData.management_port,
      edge_path: formData.edge_path,
      status: formData.statusCheck ? 1 : 0,
    }

    if (editingNode.value) {
      await updateNode(editingNode.value.cluster_id, editingNode.value.id, payload)
      message.success('节点已更新')
    } else {
      await createNode(Number(formData.cluster_id), payload)
      message.success('节点已添加')
    }
    formModalVisible.value = false
    loadNodes()
  } catch (error: any) {
    const detail = error.response?.data?.detail || error.message
    message.error(typeof detail === 'string' ? detail : '操作失败')
  } finally {
    formSubmitting.value = false
  }
}

// ── Detail ─────────────────────────────────────────────────────────────────

function viewDetail(record: any) {
  detailNode.value = record
  detailModalVisible.value = true
  clusterStats.value = null
  if (record.cluster_id) {
    loadClusterStats(record.cluster_id)
  }
}

// ── Node Actions ───────────────────────────────────────────────────────────

function startElapsedTimer() {
  execElapsed.value = 0
  if (_elapsedTimer) clearInterval(_elapsedTimer)
  _elapsedTimer = setInterval(() => {
    execElapsed.value = (execElapsed.value ?? 0) + 1
  }, 1000)
}

function stopElapsedTimer() {
  if (_elapsedTimer) { clearInterval(_elapsedTimer); _elapsedTimer = null }
}

async function executeAction(record: any, action: string, actionLabel: string) {
  execDrawerTitle.value = `节点 ${actionLabel}`
  execProgress.percent = 0
  execProgress.status = 'active'
  execLogs.value = []
  stopElapsedTimer()
  execElapsed.value = null
  execResult.value = null
  execHighlights.value = []
  execStatistics.value = null
  execDrawerVisible.value = true

  const addLog = (text: string) => {
    execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }

  addLog(`开始对节点 ${record.ip} 执行 ${actionLabel} 操作...`)
  execProgress.percent = 10
  startElapsedTimer()

  try {
    let res
    if (action === 'start') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/start`)
    } else if (action === 'stop') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/stop`)
    } else if (action === 'status') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/statistic`, { ports: String(record.management_port) })
    }

    const data = res?.data || {}
    stopElapsedTimer()
    execProgress.percent = 100

    addLog(`返回码 (rc): ${data.rc}`)
    if (data.stdout) {
      addLog('')
      addLog('--- 输出 (stdout) ---')
      addLog(data.stdout)
    }
    if (data.stderr) {
      addLog('')
      addLog('--- 错误输出 (stderr) ---')
      addLog(data.stderr)
    }
    addLog('')
    if (data.rc === 0) {
      execProgress.status = 'success'
      addLog(`✅ 节点 ${actionLabel} 成功`)
    } else {
      execProgress.status = 'exception'
      addLog(`❌ 节点 ${actionLabel} 失败`)
    }

    execHighlights.value = []
    execStatistics.value = data.statistic ? { ...data.statistic } : null
    execResult.value = {
      stdout: data.stdout || '',
      stderr: data.stderr || '',
      command: data.command || '',
      rc: data.rc,
    }
    loadNodes()
  } catch (error: any) {
    stopElapsedTimer()
    execProgress.status = 'exception'
    execProgress.percent = 100
    const errMsg = error.response?.data?.detail || error.message || '未知错误'
    addLog(`❌ 操作失败: ${errMsg}`)
    execHighlights.value = []
    execStatistics.value = null
    execResult.value = { stdout: '', stderr: errMsg, command: '', rc: -1 }
  }
}

function handleStart(record: any) {
  Modal.confirm({
    title: '确认启动节点',
    content: `即将对节点 ${record.ip} 执行"启动"操作，确认无误后继续。`,
    okText: '确认启动',
    onOk: () => executeAction(record, 'start', '启动'),
  })
  openMenuId.value = null
}

function handleStop(record: any) {
  Modal.confirm({
    title: '确认停止节点',
    content: `即将对节点 ${record.ip} 执行"停止"操作。停止后该节点上的所有流量将中断，请确认操作无误。`,
    okText: '确认停止',
    okType: 'danger' as any,
    onOk: () => executeAction(record, 'stop', '停止'),
  })
  openMenuId.value = null
}

function handleStatus(record: any) {
  executeAction(record, 'status', '状态查询')
  openMenuId.value = null
}

// ── Delete ─────────────────────────────────────────────────────────────────

function handleDelete(record: any) {
  openMenuId.value = null
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除节点 ${record.ip}（${record.cluster_name || ''}）吗？`,
    okText: '确认删除',
    okType: 'danger' as any,
    onOk: async () => {
      try {
        await deleteNode(record.cluster_id, record.id, { delete_db: true, delete_edge: false })
        message.success('节点已删除')
        loadNodes()
      } catch (error: any) {
        message.error(error.response?.data?.detail || '删除失败')
      }
    },
  })
}

// ── Diff ───────────────────────────────────────────────────────────────────

function handleDiff(record: any) {
  diffClusterId.value = record.cluster_id
  diffNodeId.value = record.id
  diffDrawerVisible.value = true
  openMenuId.value = null
}

// ── Utils ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString('zh-CN')
  } catch {
    return dateStr
  }
}

function nginxRunning(node: any): boolean {
  const sd = node.status_detail
  if (sd?.nginx?.nginx_running !== undefined) return sd.nginx.nginx_running
  return node.status === 1
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(() => {
  loadClusters()
  loadNodes()
  document.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
})
</script>

<style scoped>
.node-list {
  padding: 20px 24px;
}

.node-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

/* ── Table ── */
.table-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: visible;
  box-shadow: var(--shadow-sm);
}

table {
  width: 100%;
  border-collapse: collapse;
}

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

tbody tr {
  border-bottom: 1px solid var(--border);
  transition: background 0.1s;
}

tbody tr:last-child { border-bottom: none; }

tbody tr:hover {
  background: oklch(97% 0.005 250 / 60%);
}

tbody td {
  padding: 12px 16px;
  font-size: 13px;
  vertical-align: middle;
}

.text-mono { font-family: var(--font-mono); }
.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }

/* ── Action Menu ── */
.action-menu-group {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: center;
}

.action-menu {
  position: relative;
  display: inline-block;
  z-index: 10;
}

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
  min-width: 130px; padding: 4px; display: none;
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

/* ── Detail Grid ── */
.node-detail-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 6px 16px;
  font-size: 13px;
  margin-bottom: 16px;
}

.node-detail-grid .nd-label { color: var(--muted); font-weight: 500; }
.node-detail-grid .nd-value { font-family: var(--font-mono); word-break: break-all; }

.node-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.node-stat-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px;
  text-align: center;
}

.node-stat-card .ns-value {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
}

.node-stat-card .ns-label {
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 2px;
}

.empty-state { text-align: center; color: var(--muted); }
.empty-state-icon { font-size: 32px; margin-bottom: 8px; }

.operation-log {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  margin-top: 12px;
  max-height: 200px;
  overflow-y: auto;
  font-size: 12px;
  display: none;
}

.operation-log.visible { display: block; }
.operation-log .log-line { font-family: var(--font-mono); padding: 2px 0; white-space: pre-wrap; }
.operation-log .log-line.success { color: var(--success); }
.operation-log .log-line.error { color: var(--danger); }

/* ── Modal ── */
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

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: oklch(56% 0.16 210 / 10%);
}
.modal-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fg);
}

.modal-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: var(--muted);
  border-radius: var(--radius-sm);
}
.modal-close:hover {
  background: var(--bg);
  color: var(--fg);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}

.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 0;
}

.form-group {
  flex: 1;
  margin-bottom: 16px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.required { color: var(--danger); }

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
}

.form-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}
</style>
