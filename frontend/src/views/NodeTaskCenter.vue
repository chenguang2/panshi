<template>
  <div class="page-container">
    <PageHeader title="节点任务" description="查看和管理节点运维操作任务（安装/升级/启动/停止等），支持取消与重试">
      <template #actions>
        <button class="btn btn-primary btn-sm" @click="openCreateModal">＋ 新建任务</button>
      </template>
    </PageHeader>

    <div class="filter-bar" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
      <select v-model="filterStatus" class="filter-select" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);background:var(--card-bg,#fff);">
        <option value="">全部状态</option>
        <option value="pending">待执行</option>
        <option value="running">执行中</option>
        <option value="success">成功</option>
        <option value="partial">部分成功</option>
        <option value="failed">失败</option>
        <option value="cancelled">已取消</option>
      </select>
      <select v-model="filterType" class="filter-select" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);background:var(--card-bg,#fff);">
        <option value="">全部类型</option>
        <option v-for="t in taskTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
      <button class="btn btn-secondary btn-sm" @click="loadTasks(1)">刷新</button>
    </div>

    <a-table
      :data-source="tasks"
      :loading="loading"
      row-key="id"
      :pagination="{ pageSize: pageSize, total: total, current: page, showSizeChanger: false }"
      size="middle"
      @change="onTableChange"
    >
      <a-table-column title="ID" data-index="id" :width="60" />
      <a-table-column title="任务类型" key="task_type">
        <template #bodyCell="{ record }">
          {{ typeLabel(record.task_type) }}
        </template>
      </a-table-column>
      <a-table-column title="状态" key="status">
        <template #bodyCell="{ record }">
          <span :class="'status-tag status-' + record.status">{{ statusLabel(record.status) }}</span>
        </template>
      </a-table-column>
      <a-table-column title="节点" key="nodes">
        <template #bodyCell="{ record }">
          {{ record.success_nodes }}/{{ record.total_nodes }} 成功
        </template>
      </a-table-column>
      <a-table-column title="进度" key="progress">
        <template #bodyCell="{ record }">
          <div class="progress-bar-wrap" style="min-width:120px;">
            <div class="progress-bar" :class="'progress-' + progressStatus(record)" :style="{ width: progressPercent(record) + '%' }"></div>
          </div>
        </template>
      </a-table-column>
      <a-table-column title="创建时间" key="created_at">
        <template #bodyCell="{ record }">
          {{ formatTime(record.created_at) }}
        </template>
      </a-table-column>
      <a-table-column title="操作" key="actions" :width="180">
        <template #bodyCell="{ record }">
          <button class="btn btn-ghost btn-sm" @click="openDetail(record)">详情</button>
          <button
            v-if="record.status === 'running' || record.status === 'pending'"
            class="btn btn-danger btn-sm"
            @click="handleCancel(record)"
          >取消</button>
          <button
            v-if="['failed', 'partial', 'cancelled'].includes(record.status)"
            class="btn btn-secondary btn-sm"
            @click="handleRetry(record)"
          >重试</button>
        </template>
      </a-table-column>
    </a-table>

    <!-- Detail drawer -->
    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: detailVisible ? 'flex' : 'none' }">
        <div class="modal modal-wide" style="max-width:900px;">
          <div class="modal-header">
            <h2>任务详情 #{{ detail?.id }}</h2>
            <button class="modal-close" @click="detailVisible = false">&times;</button>
          </div>
          <div class="modal-body" style="max-height:80vh;overflow-y:auto;">
            <div v-if="detail" style="margin-bottom:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:13px;">
              <div><strong>类型:</strong> {{ typeLabel(detail.task_type) }}</div>
              <div><strong>状态:</strong> {{ statusLabel(detail.status) }}</div>
              <div><strong>节点:</strong> {{ detail.success_nodes }}/{{ detail.total_nodes }} 成功</div>
              <div><strong>失败:</strong> {{ detail.failed_nodes }}，<strong>取消:</strong> {{ detail.cancelled_nodes }}</div>
              <div v-if="detail.params && Object.keys(detail.params).length > 0" style="grid-column:1/-1;">
                <strong>参数:</strong> <code style="white-space:pre-wrap;">{{ JSON.stringify(detail.params, null, 2) }}</code>
              </div>
            </div>

            <table class="ner-table" style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="text-align:left;color:var(--muted,#888);">
                  <th style="padding:6px 8px;border-bottom:1px solid #eee;">节点</th>
                  <th style="padding:6px 8px;border-bottom:1px solid #eee;">状态</th>
                  <th style="padding:6px 8px;border-bottom:1px solid #eee;">rc</th>
                  <th style="padding:6px 8px;border-bottom:1px solid #eee;">耗时</th>
                  <th style="padding:6px 8px;border-bottom:1px solid #eee;">日志</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in detail?.items || []" :key="item.id">
                  <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">{{ item.ip }}<span v-if="item.node_name" style="color:var(--muted,#999);margin-left:6px;">{{ item.node_name }}</span></td>
                  <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">
                    <span :class="'status-tag status-' + item.status">{{ statusLabel(item.status) }}</span>
                  </td>
                  <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">{{ item.rc ?? '-' }}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">{{ durationText(item) }}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">
                    <button class="btn btn-ghost btn-sm" @click="expandedIp = expandedIp === item.ip ? null : item.ip">
                      {{ expandedIp === item.ip ? '收起' : '展开' }}
                    </button>
                  </td>
                </tr>
                <tr v-if="expandedItem">
                  <td colspan="5" style="padding:8px;">
                    <NodeTaskLogViewer
                      :logs="expandedItem.logs.map((l) => l.line)"
                      :stdout="expandedItem.stdout || ''"
                      :stderr="expandedItem.stderr || ''"
                      :command="expandedItem.command || ''"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="modal-footer">
            <button v-if="detail && (detail.status === 'running' || detail.status === 'pending')" class="btn btn-danger" @click="handleCancel(detail)">取消任务</button>
            <button v-if="detail && ['failed','partial','cancelled'].includes(detail.status)" class="btn btn-secondary" @click="handleRetry(detail)">重试失败节点</button>
            <button class="btn btn-secondary" @click="detailVisible = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Create task modal -->
    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: createVisible ? 'flex' : 'none' }">
        <div class="modal modal-wide" style="max-width:640px;">
          <div class="modal-header">
            <h2>创建节点任务</h2>
            <button class="modal-close" @click="createVisible = false">&times;</button>
          </div>
          <div class="modal-body" style="max-height:80vh;overflow-y:auto;">
            <div style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:4px;">集群</label>
              <select v-model="createClusterId" class="filter-select" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);" @change="loadCreateNodes">
                <option :value="0" disabled>请选择集群</option>
                <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
              </select>
            </div>
            <div style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:4px;">节点（{{ createNodeIds.length }} 已选）</label>
              <div style="border:1px solid var(--border,#e5e5e5);border-radius:6px;padding:8px;max-height:180px;overflow-y:auto;">
                <label v-for="n in createNodes" :key="n.id" style="display:block;padding:4px 6px;font-size:13px;cursor:pointer;">
                  <input type="checkbox" :value="n.id" v-model="createNodeIds" style="margin-right:6px;" />
                  {{ n.ip }} <span v-if="n.edge_path" style="color:var(--muted,#999);font-size:12px;">({{ n.edge_path }})</span>
                </label>
                <div v-if="createNodes.length === 0" style="color:var(--muted,#999);font-size:12px;padding:4px;">请先选择集群</div>
              </div>
            </div>
            <div style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:4px;">任务类型</label>
              <select v-model="createTaskType" data-test="task-type" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);">
                <option value="" disabled>请选择操作类型</option>
                <option v-for="t in taskTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
            <div v-if="createTaskType === 'install_openresty'" style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:4px;">安装包</label>
              <select v-model="createOpenrestyFile" data-test="openresty-file" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);">
                <option value="" disabled>请选择 OpenResty 安装包</option>
                <option v-for="f in openrestyFiles" :key="f.name" :value="f.name">{{ f.name }} <template v-if="f.size_display">({{ f.size_display }})</template></option>
              </select>
            </div>
            <div style="color:var(--muted,#999);font-size:12px;line-height:1.6;">
              任务参数将从节点记录自动读取（安装路径/管理端口等），无需手动填写。
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="createVisible = false">取消</button>
            <button
              class="btn btn-primary"
              :disabled="!createClusterId || createNodeIds.length === 0 || !createTaskType || (createTaskType === 'install_openresty' && !createOpenrestyFile)"
              @click="submitCreateTask"
            >创建</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import NodeTaskLogViewer from '@/components/NodeTaskLogViewer.vue'
import { listNodeTasks, getNodeTask, cancelNodeTask, retryNodeTask, createNodeTask, type NodeTaskData, type NodeTaskItemData } from '@/composables/useNodeTasks'
import api from '@/api'

const tasks = ref<NodeTaskData[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const filterStatus = ref('')
const filterType = ref('')
const detailVisible = ref(false)
const detail = ref<NodeTaskData | null>(null)
const expandedIp = ref<string | null>(null)

const createVisible = ref(false)
const clusters = ref<Array<{ id: number; name: string; display_name?: string }>>([])
const createClusterId = ref(0)
const createNodes = ref<Array<{ id: number; ip: string; edge_path?: string }>>([])
const createNodeIds = ref<number[]>([])
const createTaskType = ref('')
const createOpenrestyFile = ref('')
const openrestyFiles = ref<Array<{ name: string; size_display?: string }>>([])

const taskTypes = [
  { value: 'install_openresty', label: '安装 OpenResty' },
  { value: 'install_edge', label: '安装 Edge' },
  { value: 'associate_new_openresty', label: '关联新 OpenResty' },
  { value: 'edge_pack_add', label: '升级 Edge(传包)' },
  { value: 'edge_pack_rebase', label: '升级 Edge(切版本)' },
  { value: 'start', label: '启动' },
  { value: 'stop', label: '停止' },
  { value: 'reload', label: 'Reload' },
  { value: 'check', label: '配置检查' },
  { value: 'statistic', label: '状态查询' },
  { value: 'edge_env_deploy', label: 'edge.env 部署' },
]

function typeLabel(t: string): string {
  return taskTypes.find((x) => x.value === t)?.label || t
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: '待执行', running: '执行中', success: '成功', partial: '部分成功',
    failed: '失败', cancelled: '已取消', skipped: '跳过',
  }
  return map[s] || s
}

function progressStatus(record: NodeTaskData): 'active' | 'success' | 'exception' {
  if (record.status === 'success') return 'success'
  if (record.status === 'running' || record.status === 'pending') return 'active'
  return 'exception'
}

function progressPercent(record: NodeTaskData): number {
  if (record.total_nodes === 0) return 0
  return Math.round((record.success_nodes / record.total_nodes) * 100)
}

function formatTime(t?: string | null): string {
  if (!t) return '-'
  return new Date(t).toLocaleString()
}

function durationText(item: NodeTaskItemData): string {
  if (!item.started_at || !item.finished_at) return '-'
  const ms = new Date(item.finished_at).getTime() - new Date(item.started_at).getTime()
  return `${Math.max(0, Math.round(ms / 1000))}s`
}

const expandedItem = computed(() => {
  if (!detail.value || !expandedIp.value) return null
  return detail.value.items?.find((i) => i.ip === expandedIp.value) || null
})

async function loadTasks(targetPage = 1) {
  loading.value = true
  page.value = targetPage
  try {
    const res = await listNodeTasks({
      status: filterStatus.value || undefined,
      task_type: filterType.value || undefined,
      page: page.value,
      page_size: pageSize.value,
    })
    tasks.value = res.items
    total.value = res.total
  } finally {
    loading.value = false
  }
}

function onTableChange(pagination: { current?: number }) {
  if (pagination.current) loadTasks(pagination.current)
}

async function openDetail(record: NodeTaskData) {
  detailVisible.value = true
  expandedIp.value = null
  detail.value = await getNodeTask(record.id)
}

async function handleCancel(record: NodeTaskData) {
  await cancelNodeTask(record.id)
  message.success('任务取消已发起')
  if (detailVisible.value && detail.value?.id === record.id) {
    detail.value = await getNodeTask(record.id)
  }
  loadTasks(page.value)
}

async function handleRetry(record: NodeTaskData) {
  await retryNodeTask(record.id)
  message.success('任务重试已发起')
  if (detailVisible.value && detail.value?.id === record.id) {
    detail.value = await getNodeTask(record.id)
  }
  loadTasks(page.value)
}

async function openCreateModal() {
  createVisible.value = true
  createClusterId.value = 0
  createNodeIds.value = []
  createTaskType.value = ''
  createOpenrestyFile.value = ''
  openrestyFiles.value = []
  createNodes.value = []
  if (clusters.value.length === 0) {
    const res = await api.get('/clusters', { params: { page_size: 100 } })
    clusters.value = res.data.items || res.data || []
  }
}

async function onTaskTypeChange() {
  createOpenrestyFile.value = ''
  openrestyFiles.value = []
  if (createTaskType.value === 'install_openresty' && createClusterId.value) {
    const res = await api.get(`/clusters/${createClusterId.value}/nodes/openresty-files`)
    openrestyFiles.value = res.data?.files || res.data || []
  }
}

watch(createTaskType, () => onTaskTypeChange())
watch(createClusterId, () => {
  createOpenrestyFile.value = ''
  openrestyFiles.value = []
})

async function loadCreateNodes() {
  createNodeIds.value = []
  createNodes.value = []
  if (!createClusterId.value) return
  const res = await api.get(`/clusters/${createClusterId.value}/nodes`, { params: { page_size: 100 } })
  createNodes.value = res.data.items || []
}

async function submitCreateTask() {
  if (!createClusterId.value || createNodeIds.value.length === 0 || !createTaskType.value) {
    message.warning('请选择集群、节点和操作类型')
    return
  }
  if (createTaskType.value === 'install_openresty' && !createOpenrestyFile.value) {
    message.warning('请选择 OpenResty 安装包')
    return
  }
  const params: Record<string, unknown> = {}
  if (createTaskType.value === 'install_openresty') {
    params.openresty_file = createOpenrestyFile.value
  }
  try {
    await createNodeTask(createClusterId.value, createTaskType.value, createNodeIds.value, params)
    message.success('任务已创建')
    createVisible.value = false
    loadTasks(1)
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '创建任务失败')
  }
}

onMounted(() => loadTasks(1))
</script>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}
.status-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
}
.status-success { background: oklch(70% 0.14 145 / 15%); color: var(--success, #16a34a); }
.status-failed { background: oklch(55% 0.18 28 / 12%); color: var(--danger, #dc2626); }
.status-running { background: oklch(56% 0.16 210 / 12%); color: var(--accent, #2563eb); }
.status-pending { background: oklch(55% 0.05 260 / 10%); color: var(--muted, #888); }
.status-partial { background: oklch(75% 0.14 85 / 15%); color: #b45309; }
.status-cancelled, .status-skipped { background: oklch(55% 0.05 260 / 10%); color: var(--muted, #888); }
.progress-bar-wrap {
  background: #f0f0f0;
  border-radius: 4px;
  height: 8px;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}
.progress-active { background: var(--accent, #2563eb); }
.progress-success { background: var(--success, #16a34a); }
.progress-exception { background: var(--danger, #dc2626); }
</style>
