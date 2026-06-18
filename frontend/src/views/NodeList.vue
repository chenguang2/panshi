<template>
  <div class="node-list">
    <PageHeader title="节点管理" description="管理 Edge 网关节点，监控运行状态并执行操作">
      <template #actions>
        <button class="btn btn-primary" @click="openAddModal">+ 添加节点</button>
      </template>
    </PageHeader>

    <div class="node-filter-bar">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索 IP 或名称..." class="form-input" @input="onSearchInput">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="clusterFilter" class="form-input" style="width:160px;" @change="onFilterChange">
        <option value="">全部集群</option>
        <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <select v-model="statusFilter" class="form-input" style="width:130px;" @change="onFilterChange">
        <option value="">全部状态</option>
        <option :value="1">运行中</option>
        <option :value="0">已停止</option>
      </select>
      <span class="text-muted text-sm">共 {{ totalCount }} 个节点</span>
    </div>

    <div class="table-container">
      <a-table
        :data-source="nodes"
        :columns="columns"
        :row-key="(record: any) => record.id"
        :pagination="{
          current: page,
          pageSize,
          total: totalCount,
          showSizeChanger: true,
          showTotal: (total: number) => `共 ${total} 个节点`,
          pageSizeOptions: ['10', '20', '50'],
        }"
        :loading="loading"
        size="middle"
        class="node-table"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'index'">
            <span class="text-muted">{{ (page - 1) * pageSize + index + 1 }}</span>
          </template>
          <template v-if="column.key === 'ip'">
            <span class="text-mono">{{ record.ip }}</span>
          </template>

          <template v-if="column.key === 'service_port'">
            <span class="text-mono text-sm">{{ record.service_port }}</span>
          </template>

          <template v-if="column.key === 'management_port'">
            <span class="text-mono text-sm">{{ record.management_port }}</span>
          </template>

          <template v-if="column.key === 'edge_path'">
            <span class="text-sm">{{ record.edge_path || '-' }}</span>
          </template>

          <template v-if="column.key === 'edge_install_path'">
            <span class="text-sm">{{ record.edge_install_path || '（同Edge路径）' }}</span>
          </template>

          <template v-if="column.key === 'status'">
            <span v-if="nginxRunning(record)" class="badge badge-success"><span class="status-dot online"></span>运行中</span>
            <span v-else class="badge badge-danger"><span class="status-dot offline"></span>已停止</span>
          </template>

          <template v-if="column.key === 'edge_version'">
            <span class="text-mono text-sm">{{ record.status_detail?.statistic?.edge_version || '-' }}</span>
          </template>

          <template v-if="column.key === 'actions'">
            <div class="node-actions-wrap">
              <button class="btn btn-ghost btn-sm" @click="handleStart(record)">▶ 启动</button>
              <button class="btn btn-ghost btn-sm" @click="handleStop(record)">⏹ 停止</button>
              <button class="btn btn-ghost btn-sm" @click="handleStatus(record)">✓ 状态</button>
              <button class="btn btn-ghost btn-sm" @click="viewDetail(record)">ⓘ 详情</button>
              <a-dropdown :trigger="['click']">
                <a-button type="text" size="small" class="action-trigger-btn">⋯</a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item @click="handleEdit(record)">编辑</a-menu-item>
                    <a-menu-item danger @click="handleDelete(record)">删除</a-menu-item>
                    <a-menu-item @click="handleDiff(record)">数据库对比</a-menu-item>
                    <a-menu-divider v-if="featuresStore.has('install_openresty') || featuresStore.has('install_edge')" />
                    <a-menu-item v-if="featuresStore.has('install_openresty')" @click="handleInstallOpenresty(record)">安装 OpenResty</a-menu-item>
                    <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleInstallEdge(record)">安装 Edge</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
            <div class="operation-log" :class="{ visible: opLogVisible === record.id }" :id="'opLog-' + record.id"></div>
          </template>
        </template>

        <template #empty>
          <div class="empty-state">
            <div class="empty-state-icon">◎</div>
            <p>暂无节点</p>
          </div>
        </template>
      </a-table>
    </div>

    <!-- Add / Edit Node Modal -->
    <div class="modal-overlay" :style="{ display: formModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ editingNode ? '编辑节点' : '添加节点' }}</h2>
          <button class="modal-close" @click="closeFormModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">所属集群 <span class="required">*</span></label>
              <select v-model="formData.cluster_id" class="form-input" :class="{ 'has-error': formErrors.cluster_id }" :disabled="!!editingNode">
                <option value="">请选择集群</option>
                <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
              </select>
              <span class="form-error" v-if="formErrors.cluster_id">{{ formErrors.cluster_id }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">IP 地址 <span class="required">*</span></label>
              <input v-model="formData.ip" type="text" class="form-input" :class="{ 'has-error': formErrors.ip }" placeholder="10.0.0.1">
              <span class="form-error" v-if="formErrors.ip">{{ formErrors.ip }}</span>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">服务端口 <span class="required">*</span></label>
              <input v-model.number="formData.service_port" type="number" class="form-input" :class="{ 'has-error': formErrors.service_port }" min="1" max="65535">
              <span class="form-error" v-if="formErrors.service_port">{{ formErrors.service_port }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">管理端口 <span class="required">*</span></label>
              <input v-model.number="formData.management_port" type="number" class="form-input" :class="{ 'has-error': formErrors.management_port }" min="1" max="65535">
              <span class="form-error" v-if="formErrors.management_port">{{ formErrors.management_port }}</span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Edge 路径 <span class="required">*</span></label>
            <input v-model="formData.edge_path" type="text" class="form-input" :class="{ 'has-error': formErrors.edge_path }" placeholder="/usr/local/edge">
            <span class="form-error" v-if="formErrors.edge_path">{{ formErrors.edge_path }}</span>
          </div>
          <div class="form-group">
            <label class="form-label">安装路径</label>
            <input v-model="formData.edge_install_path" type="text" class="form-input" :class="{ 'has-error': formErrors.edge_install_path }" placeholder="留空则与Edge路径相同">
            <span class="form-error" v-if="formErrors.edge_install_path">{{ formErrors.edge_install_path }}</span>
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
    <div class="modal-overlay" :style="{ display: detailModalVisible ? 'flex' : 'none' }">
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
          <div class="nd-label">安装路径</div><div class="nd-value">{{ detailNode.edge_install_path || '（同Edge路径）' }}</div>
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
      :installing="installInstalling"
      :stream-error="installError"
      :stream-status="installStatus"
      @update:visible="execDrawerVisible = $event"
      @cancel="handleCancelInstall"
    />

    <!-- Custom Confirm Modal -->
    <Teleport to="body">
    <div class="modal-overlay" :style="{ display: confirmState.visible ? 'flex' : 'none', zIndex: 2000 }">
      <div class="modal" style="max-width: 420px;">
        <div class="modal-header">
          <h2>{{ confirmState.title }}</h2>
          <button class="modal-close" @click="confirmState.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--muted); line-height: 1.6;">{{ confirmState.content }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="confirmState.visible = false">取消</button>
          <button class="btn btn-danger" :disabled="confirmState.loading" @click="executeConfirm">
            {{ confirmState.loading ? '处理中...' : confirmState.confirmText }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { message } from 'ant-design-vue'
import type { TablePaginationConfig } from 'ant-design-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import ConfigDiff from '@/views/ConfigDiff.vue'
import { useInstallStream } from '@/composables/useInstallStream'
import { useFeaturesStore } from '@/stores/features'
import { listNodes, createNode, updateNode, deleteNode } from '@/api/nodes'
import { useRoute } from 'vue-router'

const route = useRoute()
const featuresStore = useFeaturesStore()

// ── State ──
const loading = ref(false)
const nodes = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(20)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref<string>('')
const statusFilter = ref<string | number>('')
const opLogVisible = ref<number | null>(null)

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
  edge_install_path: '',
  statusCheck: true,
})
const formErrors = reactive<Record<string, string>>({})
const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

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
const execTargetNode = ref<any | null>(null)
const cancelling = ref(false)

// Custom confirm modal state
const confirmState = reactive({
  visible: false,
  title: '',
  content: '',
  confirmText: '',
  loading: false,
  onConfirm: null as (() => Promise<void>) | null,
})

// Config diff drawer
const diffDrawerVisible = ref(false)
const diffClusterId = ref(0)
const diffNodeId = ref(0)

const columns = [
  { title: '#', key: 'index', width: 45 },
  { title: 'IP', dataIndex: 'ip', key: 'ip', sorter: (a: any, b: any) => a.ip?.localeCompare(b.ip) },
  { title: '所属集群', dataIndex: 'cluster_name', key: 'cluster_name', sorter: (a: any, b: any) => (a.cluster_name || '').localeCompare(b.cluster_name || '') },
  { title: '服务端口', key: 'service_port', sorter: (a: any, b: any) => (a.service_port || 0) - (b.service_port || 0) },
  { title: '管理端口', key: 'management_port', sorter: (a: any, b: any) => (a.management_port || 0) - (b.management_port || 0) },
  { title: 'Edge 路径', key: 'edge_path', sorter: (a: any, b: any) => (a.edge_path || '').localeCompare(b.edge_path || '') },
  { title: '安装路径', key: 'edge_install_path', sorter: (a: any, b: any) => (a.edge_install_path || '').localeCompare(b.edge_install_path || '') },
  { title: '状态', key: 'status', sorter: (a: any, b: any) => (a.status || 0) - (b.status || 0) },
  { title: 'Edge 版本', key: 'edge_version', sorter: (a: any, b: any) => ((a.status_detail?.statistic?.edge_version) || '').localeCompare((b.status_detail?.statistic?.edge_version) || '') },
  { title: '操作', key: 'actions', width: 320 },
]

// ── Data Loading ──

async function loadNodes() {
  loading.value = true
  try {
    const res = await listNodes({
      page: page.value,
      pageSize: pageSize.value,
      search: searchText.value || undefined,
      clusterId: clusterFilter.value ? Number(clusterFilter.value) : undefined,
      status: statusFilter.value !== '' && statusFilter.value !== undefined ? Number(statusFilter.value) : undefined,
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

// ── Filter / Search / Pagination ──

function handleTableChange(pagination: TablePaginationConfig) {
  page.value = pagination.current || 1
  if (pagination.pageSize) pageSize.value = pagination.pageSize
  loadNodes()
}

function onFilterChange() {
  page.value = 1
  loadNodes()
}

function onSearchInput() {
  onDebouncedSearch(() => { page.value = 1; loadNodes() })
}

// ── Form Modal ──

function openAddModal() {
  editingNode.value = null
  formData.cluster_id = ''
  formData.ip = ''
  formData.service_port = 80
  formData.management_port = 9180
  formData.edge_path = '/usr/local/edge'
  formData.edge_install_path = ''
  formData.statusCheck = true
  formErrors.cluster_id = ''
  formErrors.ip = ''
  formErrors.service_port = ''
  formErrors.management_port = ''
  formErrors.edge_path = ''
  formErrors.edge_install_path = ''
  formModalVisible.value = true
}

function handleEdit(record: any) {
  editingNode.value = record
  formData.cluster_id = record.cluster_id
  formData.ip = record.ip
  formData.service_port = record.service_port
  formData.management_port = record.management_port
  formData.edge_path = record.edge_path || ''
  formData.edge_install_path = record.edge_install_path || ''
  formData.statusCheck = record.status === 1
  formErrors.cluster_id = ''
  formErrors.ip = ''
  formErrors.service_port = ''
  formErrors.management_port = ''
  formErrors.edge_path = ''
  formModalVisible.value = true
}

function closeFormModal() {
  formModalVisible.value = false
  editingNode.value = null
}

async function handleFormSubmit() {
  formErrors.cluster_id = ''
  formErrors.ip = ''
  formErrors.service_port = ''
  formErrors.management_port = ''
  formErrors.edge_path = ''
  formErrors.edge_install_path = ''
  let valid = true
  if (!formData.cluster_id) {
    formErrors.cluster_id = '请选择所属集群'
    valid = false
  }
  if (!formData.ip) {
    formErrors.ip = '请输入 IP 地址'
    valid = false
  } else if (!IP_PATTERN.test(formData.ip)) {
    formErrors.ip = 'IP 地址格式不正确'
    valid = false
  }
  if (!formData.service_port || formData.service_port < 1 || formData.service_port > 65535) {
    formErrors.service_port = '请输入有效的端口号 (1-65535)'
    valid = false
  }
  if (!formData.management_port || formData.management_port < 1 || formData.management_port > 65535) {
    formErrors.management_port = '请输入有效的端口号 (1-65535)'
    valid = false
  }
  if (!formData.edge_path) {
    formErrors.edge_path = '请输入 Edge 路径'
    valid = false
  } else if (!formData.edge_path.startsWith('/')) {
    formErrors.edge_path = '路径必须以 / 开头'
    valid = false
  } else if (formData.edge_path.endsWith('/')) {
    formErrors.edge_path = '路径末尾不能为 /'
    valid = false
  }
  if (formData.edge_install_path) {
    if (!formData.edge_install_path.startsWith('/')) {
      formErrors.edge_install_path = '路径必须以 / 开头'
      valid = false
    } else if (formData.edge_install_path.endsWith('/')) {
      formErrors.edge_install_path = '路径末尾不能为 /'
      valid = false
    }
  }
  if (!valid) return

  formSubmitting.value = true
  try {
    const payload = {
      ip: formData.ip,
      service_port: formData.service_port,
      management_port: formData.management_port,
      edge_path: formData.edge_path,
      edge_install_path: formData.edge_install_path || undefined,
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

// ── Detail ──

function viewDetail(record: any) {
  detailNode.value = record
  detailModalVisible.value = true
  clusterStats.value = null
  if (record.cluster_id) {
    loadClusterStats(record.cluster_id)
  }
}

// ── Node Actions ──

function startElapsedTimer() {
  execElapsed.value = 0
  if (_elapsedTimer) clearInterval(_elapsedTimer)
  _elapsedTimer = setInterval(() => {
    execElapsed.value = (execElapsed.value ?? 0) + 1
    execProgress.percent = Math.min(Math.round((execElapsed.value ?? 0) / 200 * 100), 99)
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

  // Build pending command for display even on failure
  const nginxCmdMap: Record<string, string> = { start: 'nginx_start', stop: 'nginx_stop', status: 'edge_statistic' }
  const nginxCmd = nginxCmdMap[action] || action
  const tag = nginxCmd === 'edge_statistic' ? 'edge_statistic' : 'nginx_cmd_run'
  const ev = JSON.stringify({ prefix: record.edge_path || '', ports: String(record.management_port), ips: record.ip })
  const pendingCommand = `ansible-playbook -i /home/qcg/panshi/backend/ansible/inventory -e @/home/qcg/panshi/backend/ansible/env/extravars -e '${ev}' --tags ${tag} edge.yml`

  const addLog = (text: string) => {
    execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }

  // Set command immediately so command tab shows it from the start
  execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null as any }
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
    const finalCommand = data.command || pendingCommand

    addLog(`返回码 (rc): ${data.rc}`)
    if (finalCommand) { addLog(''); addLog(`--- 执行命令 ---`); addLog(finalCommand) }
    if (data.stdout) { addLog(''); addLog('--- 输出 (stdout) ---'); addLog(data.stdout) }
    if (data.stderr) { addLog(''); addLog('--- 错误输出 (stderr) ---'); addLog(data.stderr) }
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
    execResult.value = { stdout: data.stdout || '', stderr: data.stderr || '', command: finalCommand, rc: data.rc }
    loadNodes()
  } catch (error: any) {
    stopElapsedTimer()
    execProgress.status = 'exception'
    execProgress.percent = 100
    const errMsg = error.response?.data?.detail || error.message || '未知错误'
    addLog(`❌ 操作失败: ${errMsg}`)
    execHighlights.value = []
    execStatistics.value = null
    execResult.value = { stdout: '', stderr: errMsg, command: pendingCommand, rc: -1 }
  }
}

function handleStart(record: any) {
  showConfirm(
    '确认启动节点',
    `即将对节点 ${record.ip} 执行"启动"操作，确认无误后继续。`,
    '确认启动',
    async () => { await executeAction(record, 'start', '启动') },
  )
}

function handleStop(record: any) {
  showConfirm(
    '确认停止节点',
    `即将对节点 ${record.ip} 执行"停止"操作。停止后该节点上的所有流量将中断，请确认操作无误。`,
    '确认停止',
    async () => { await executeAction(record, 'stop', '停止') },
  )
}

function handleStatus(record: any) {
  executeAction(record, 'status', '状态查询')
}

// ── Install OpenResty / Edge (streaming) ──────────────────────────
const installStream = useInstallStream()
const { installing: installInstalling, error: installError, status: installStatus } = installStream

function buildInstallCommand(record: any, tag: string, extravars: Record<string, string>) {
  const ev = JSON.stringify({ ...extravars, ips: record.ip })
  const ansibleCmd = `ansible-playbook -i /home/qcg/panshi/backend/ansible/inventory -e @/home/qcg/panshi/backend/ansible/env/extravars -e '${ev}' --tags ${tag} edge.yml`
  // install-edge 只走 Ansible, 不执行 SSH; install-openresty 才走 Ansible + SSH 两阶段
  if (tag === 'install_edge') {
    return `# Ansible 命令:\n${ansibleCmd}`
  }
  const prefix = extravars.prefix || record.edge_path || ''
  const destpath = prefix.replace(/\/[^/]+$/, '') + '/'
  const sshCmd = [
    'ssh',
    '-i', '~/.ssh/id_rsa',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=30',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    `jboss@${record.ip}`,
    `"source /etc/profile; cd ${destpath}soft/install-edge/ && ./install-edge.sh ${prefix}; wait"`,
  ].join(' ')
  return `# Ansible 命令:\n${ansibleCmd}\n\n# SSH 编译命令:\n${sshCmd}`
}

function handleInstallOpenresty(record: any) {
  showConfirm(
    '\u786e\u8ba4\u5b89\u88c5 OpenResty',
    `\u5373\u5c06\u5728\u8282\u70b9 ${record.ip} \u4e0a\u5b89\u88c5 OpenResty\uff08${record.edge_install_path || record.edge_path}\uff09\uff0c\u786e\u8ba4\u5f00\u59cb\uff1f`,
    '\u786e\u8ba4\u5b89\u88c5',
    async () => {
      execTargetNode.value = record
      execDrawerTitle.value = `\u5b89\u88c5 OpenResty - ${record.ip}`
      execDrawerVisible.value = true
      execLogs.value = []
      execProgress.percent = 0
      execProgress.status = 'active'

      const prefix = record.edge_install_path || record.edge_path || '/data/openresty'
      const destpath = prefix.replace(/\/[^/]+$/, '') + '/'
      const pendingCommand = buildInstallCommand(record, 'install_openresty', { prefix, srcpath: '/home/qcg/panshi/backend/ansible/soft', destpath })
      execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null as any }
      startElapsedTimer()

      installStream.start(
        `/clusters/${record.cluster_id}/nodes/${record.id}/install-openresty`,
        { prefix },
        {
          onLine: (line: string) => { execLogs.value = [...execLogs.value, line] },
          onProgress: (percent: number) => { if (percent > execProgress.percent) execProgress.percent = percent },
          onComplete: (rc: number, _status: string) => {
            stopElapsedTimer()
            execProgress.status = rc === 0 ? 'success' : 'exception'
            execProgress.percent = 100
            const prevCmd = execResult.value?.command || ''
            execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
          },
          onError: (err: string) => {
            execLogs.value = [...execLogs.value, `\u274c ${err}`]
          },
        },
      )
    },
  )
}

function handleInstallEdge(record: any) {
  showConfirm(
    '\u786e\u8ba4\u5b89\u88c5 Edge',
    `\u5373\u5c06\u5728\u8282\u70b9 ${record.ip} \u4e0a\u5b89\u88c5 Edge\uff08${record.edge_install_path || record.edge_path}\uff09\uff0c\u786e\u8ba4\u5f00\u59cb\uff1f`,
    '\u786e\u8ba4\u5b89\u88c5',
    async () => {
      execTargetNode.value = record
      execDrawerTitle.value = `\u5b89\u88c5 Edge - ${record.ip}`
      execDrawerVisible.value = true
      execLogs.value = []
      execProgress.percent = 0
      execProgress.status = 'active'
      const prefix = record.edge_install_path || record.edge_path || '/work/uap-edge'
      const pendingCommand = buildInstallCommand(record, 'install_edge', { prefix })
      execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null as any }
      startElapsedTimer()

      installStream.start(
        `/clusters/${record.cluster_id}/nodes/${record.id}/install-edge`,
        { prefix },
        {
          onLine: (line: string) => { execLogs.value = [...execLogs.value, line] },
          onProgress: (percent: number) => { if (percent > execProgress.percent) execProgress.percent = percent },
          onComplete: (rc: number, _status: string) => {
            stopElapsedTimer()
            execProgress.status = rc === 0 ? 'success' : 'exception'
            execProgress.percent = 100
            const prevCmd = execResult.value?.command || ''
            execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
          },
          onError: (err: string) => {
            execLogs.value = [...execLogs.value, `\u274c ${err}`]
          },
        },
      )
    },
  )
}

function handleCancelInstall() {
  const record = execTargetNode.value
  if (!record || cancelling.value) return

  showConfirm(
    '确认取消安装',
    `即将取消节点 ${record.ip} 的安装操作，终止正在编译的进程。确认？`,
    '确认取消',
    async () => {
      cancelling.value = true
      try {
        execLogs.value.push(`[${new Date().toLocaleTimeString()}] 正在取消安装...`)
        execProgress.percent = 60
        execProgress.status = 'active'

        const res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/cancel-install`)
        const data = res.data

        execLogs.value.push('')
        execLogs.value.push('═══════════════════════════════════════════')
        execLogs.value.push('取消安装结果:')

        for (const step of data.steps) {
          const icon = step.status === 'success' ? '✓' : step.status === 'skipped' ? '−' : '✗'
          execLogs.value.push('')
          execLogs.value.push(` ${icon} ${step.command}`)
          if (step.stdout) {
            for (const line of step.stdout.split('\n')) {
              execLogs.value.push(`   ${line}`)
            }
          }
          if (step.stderr) {
            execLogs.value.push(`   stderr: ${step.stderr}`)
          }
        }

        const allOk = data.steps.every((s: any) => s.status === 'success' || s.status === 'skipped')
        execLogs.value.push('')
        execLogs.value.push('═══════════════════════════════════════════')
        execLogs.value.push(
          data.status === 'skipped'
            ? '⚠️ 没有运行中的安装进程'
            : allOk
              ? '✅ 安装已取消'
              : '⚠️ 取消过程部分异常'
        )

        execProgress.percent = 100
        execProgress.status = 'success'

        execResult.value = {
          stdout: execLogs.value.join('\n'),
          stderr: '',
          command: data.steps.map((s: any) => `# ${s.command}\n${s.stdout || ''}`).join('\n\n'),
          rc: 0,
        }
      } catch (error: any) {
        const err = error as { response?: { data?: { detail?: string } }; message?: string }
        const detail = err.response?.data?.detail || err.message || '取消失败'
        execLogs.value.push(`❌ ${detail}`)
        execProgress.percent = 100
        execProgress.status = 'exception'
        execResult.value = { stdout: execLogs.value.join('\n'), stderr: detail, command: '', rc: -1 }
      } finally {
        cancelling.value = false
        installStream.cancel()
      }
    },
  )
}

// ── Custom Confirm ──

function showConfirm(title: string, content: string, confirmText: string, onConfirm: () => Promise<void>) {
  confirmState.title = title
  confirmState.content = content
  confirmState.confirmText = confirmText
  confirmState.loading = false
  confirmState.onConfirm = onConfirm
  confirmState.visible = true
}

async function executeConfirm() {
  if (!confirmState.onConfirm) return
  confirmState.visible = false
  try {
    await confirmState.onConfirm()
  } finally {
    confirmState.loading = false
  }
}

// ── Delete ──

function handleDelete(record: any) {
  showConfirm(
    '确认删除',
    `确定要删除节点 ${record.ip}（${record.cluster_name || ''}）吗？`,
    '确认删除',
    async () => {
      await deleteNode(record.cluster_id, record.id, { delete_db: true, delete_edge: false })
      message.success('节点已删除')
      loadNodes()
    }
  )
}

// ── Diff ──

function handleDiff(record: any) {
  diffClusterId.value = record.cluster_id
  diffNodeId.value = record.id
  diffDrawerVisible.value = true
}

// ── Utils ──

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try { return new Date(dateStr).toLocaleString('zh-CN') } catch { return dateStr }
}

function nginxRunning(node: any): boolean {
  const sd = node.status_detail
  if (sd?.nginx?.nginx_running !== undefined) return sd.nginx.nginx_running
  return node.status === 1
}

// ── Lifecycle ──

onMounted(() => {
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  loadClusters()
  loadNodes()
})

onUnmounted(() => {
  cancelSearch()
})
</script>

<style scoped>
.node-list { padding: 20px 24px; }

.node-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}

.text-mono { font-family: var(--font-mono); }
.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }

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
.node-table :deep(.ant-table-thead > tr > th) {
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
.node-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}

/* ── 行分割线 ── */
.node-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 16px !important;
  font-size: 13px !important;
  white-space: nowrap !important;
  background: transparent !important;
  border-bottom: 1px solid var(--border);
}
.node-table :deep(.ant-table-tbody > tr:hover > td) {
  background: oklch(97% 0.005 250 / 60%) !important;
}

/* ── 分页脚注 ── */
.node-table :deep(.ant-table-pagination) {
  background: var(--bg) !important;
  margin: 0 !important;
  padding: 12px 16px !important;
  border-top: 1px solid var(--border) !important;
}

.node-actions-wrap {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: nowrap;
}

.action-trigger-btn {
  border: none !important;
  background: transparent !important;
  font-size: 16px !important;
  color: var(--muted) !important;
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

/* ── Modal ── */
.modal-overlay {
  position: fixed; inset: 0; background: oklch(0% 0 0 / 40%);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.modal {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  width: 100%; max-width: 600px; max-height: 80vh;
  display: flex; flex-direction: column;
}
.modal-wide { max-width: 700px; }

.form-row { display: flex; gap: 16px; }
.form-group { flex: 1; margin-bottom: 16px; }
.form-label { display: block; margin-bottom: 6px; font-size: 13px; color: var(--muted); font-weight: 500; }
.required { color: var(--danger); }
.checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); cursor: pointer; }
.checkbox-label input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent); }
.form-hint { font-size: 11px; color: var(--muted); margin-top: 4px; }

/* Detail */
.node-detail-grid { display: grid; grid-template-columns: 140px 1fr; gap: 6px 16px; font-size: 13px; margin-bottom: 16px; }
.node-detail-grid .nd-label { color: var(--muted); font-weight: 500; }
.node-detail-grid .nd-value { font-family: var(--font-mono); word-break: break-all; }
.node-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.node-stat-card { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 10px; text-align: center; }
.node-stat-card .ns-value { font-family: var(--font-mono); font-size: 18px; font-weight: 700; }
.node-stat-card .ns-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
</style>
