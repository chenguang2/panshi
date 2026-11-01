<template>
  <div class="ntd">
    <PageHeader :title="headerTitle" :description="headerDescription">
      <template #actions>
        <button class="btn btn-secondary" data-test="back-to-list" @click="goBackToList">返回列表</button>
        <button class="btn btn-secondary" data-test="export-logs" @click="exportLogs">导出日志</button>
        <button v-if="isActive" class="btn btn-danger-outline" data-test="cancel-task" @click="confirmCancel">
          取消
        </button>
        <button v-if="canRetry" class="btn btn-primary" data-test="retry-task" @click="confirmRetry">
          重试失败节点
        </button>
        <a-dropdown :trigger="['click']">
          <button type="button" class="action-trigger-btn" aria-label="更多操作">⋯</button>
          <template #overlay>
            <a-menu>
              <a-menu-item danger @click="confirmDelete">删除任务</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </template>
    </PageHeader>

    <div v-if="loading && !task" class="ntd-loading">加载中…</div>
    <div v-else-if="!task" class="ntd-loading">任务不存在或已删除</div>

    <template v-else>
      <!-- 结论区：成没成 / 为什么 / 下一步 -->
      <section class="ntd-card ntd-verdict">
        <div class="ntd-verdict-line">
          <TaskStatusTag :status="task.status" :cancel-requested="task.cancel_requested === true" />
          <span class="ntd-counts">{{ counts }}</span>
          <TaskProgressBar
            class="ntd-bar"
            :success="task.success_nodes"
            :failed="task.failed_nodes"
            :skipped="task.skipped_nodes"
            :cancelled="task.cancelled_nodes"
            :total="task.total_nodes"
            :running="task.status === 'running'"
            :show-text="false"
          />
        </div>
        <p v-if="task.failure_summary" class="ntd-cause">{{ task.failure_summary }}</p>
        <p v-if="suggestion" class="ntd-suggestion">{{ suggestion }}</p>
      </section>

      <!-- 上下文行 -->
      <section class="ntd-card ntd-context">
        <div v-for="c in contextItems" :key="c.label" class="ntd-ctx">
          <span class="ntd-ctx-label">{{ c.label }}</span>
          <span class="ntd-ctx-value" :class="{ 'ntd-mono': c.mono }">{{ c.value }}</span>
        </div>
      </section>

      <!-- 节点结果 -->
      <section class="ntd-card">
        <h2 class="ntd-card-title">节点结果</h2>
        <a-table
          :data-source="task.items || []"
          :columns="nodeColumns"
          row-key="node_id"
          :pagination="false"
          size="middle"
          class="ntd-node-table"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'node'">
              <span class="ntd-node-ip">{{ record.ip }}</span>
              <span v-if="record.node_name" class="ntd-node-name">· {{ record.node_name }}</span>
              <span v-if="record.attempt > 0" class="ntd-attempt-tag">已重试 {{ record.attempt }} 次</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <TaskStatusTag :status="itemOf(record).status" />
            </template>
            <template v-else-if="column.key === 'result'">
              <span
                v-if="itemOf(record).failure_reason"
                class="ntd-reason"
                :title="String(itemOf(record).failure_reason)"
                >{{ itemOf(record).failure_reason }}</span
              >
              <span v-else class="ntd-rc">{{ itemOf(record).rc ?? '—' }}</span>
            </template>
            <template v-else-if="column.key === 'duration'">
              <span class="ntd-duration">{{ itemDuration(record) }}</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <button type="button" class="link-action" @click="openLog(record)">查看日志</button>
            </template>
          </template>
          <template #emptyText>
            <span class="ntd-node-empty">该任务没有节点记录</span>
          </template>
        </a-table>

        <!-- software_check：软件矩阵原样迁移 -->
        <div v-if="task.task_type === 'software_check'" class="ntd-software">
          <h3 class="ntd-software-title">软件查询结果</h3>
          <table>
            <thead>
              <tr>
                <th>软件</th>
                <th v-for="item in task.items || []" :key="'h' + item.node_id">{{ item.ip }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="soft in softwareRows" :key="soft">
                <td>{{ soft }}</td>
                <td v-for="item in task.items || []" :key="'c' + item.node_id + soft" class="ntd-software-cell">
                  <template v-if="softwareCell(item, soft)">
                    <span
                      v-if="softwareCell(item, soft)!.status === 'installed'"
                      class="ntd-sw-ok"
                      :title="swTitle(item, soft)"
                      >✓ {{ softwareCell(item, soft)!.pkg }}</span
                    >
                    <span v-else-if="softwareCell(item, soft)!.status === 'missing'" class="ntd-sw-missing"
                      >✗ 未安装</span
                    >
                    <span v-else class="ntd-muted">检测失败</span>
                  </template>
                  <span v-else class="ntd-muted">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 参数区 -->
      <section class="ntd-card">
        <h2 class="ntd-card-title">任务参数</h2>
        <div v-if="paramList.length > 0" class="ntd-params">
          <div v-for="p in paramList" :key="p.label" class="ntd-param">
            <span class="ntd-param-label">{{ p.label }}</span>
            <span class="ntd-param-value">{{ p.value }}</span>
          </div>
        </div>
        <p v-else class="ntd-muted">该任务类型没有额外参数</p>

        <button type="button" class="ntd-raw-toggle" :aria-expanded="rawOpen" @click="rawOpen = !rawOpen">
          {{ rawOpen ? '收起原始参数' : '原始参数' }}
        </button>
        <div v-if="rawOpen" class="ntd-raw-wrap">
          <pre class="ntd-raw">{{ rawParamsJson }}</pre>
          <button type="button" class="btn btn-secondary btn-sm" @click="copyRaw">复制</button>
        </div>
      </section>

      <!-- 操作记录 -->
      <section class="ntd-card ntd-audit">
        <h2 class="ntd-card-title">操作记录</h2>
        <p v-if="auditEntries.length === 0" class="ntd-muted">暂无操作记录</p>
        <div v-else class="ntd-audit-list">
          <div v-for="a in auditEntries" :key="a.id" class="ntd-audit-row">
            <span class="ntd-audit-time">{{ formatDateTime(a.created_at) }}</span>
            <span class="ntd-audit-user">{{ a.username || '—' }}</span>
            <span class="ntd-audit-action">{{ auditActionLabel(a.action) }}</span>
            <span class="ntd-audit-detail">{{ a.detail || '—' }}</span>
          </div>
        </div>
      </section>

      <NodeTaskLogDrawer
        :open="logOpen"
        :task-id="taskId"
        :item="logItem"
        :active="isActive"
        :live-lines="logLines"
        :task-type-label="typeLabel"
        @close="logOpen = false"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import TaskStatusTag from '@/components/TaskStatusTag.vue'
import TaskProgressBar from '@/components/TaskProgressBar.vue'
import NodeTaskLogDrawer from '@/components/NodeTaskLogDrawer.vue'
import {
  cancelNodeTask,
  deleteNodeTask,
  downloadTaskLogsArchive,
  getNodeTask,
  getNodeTaskAudit,
  retryNodeTask,
  type NodeTaskAuditEntry,
  type NodeTaskData,
  type NodeTaskItemData,
} from '@/composables/useNodeTasks'
import { useNodeTaskStream } from '@/composables/useNodeTaskStream'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { durationSeconds, formatDateTime, formatDurationCompact } from '@/utils/format'
import { buildSuggestion, countsLine, paramEntries } from '@/utils/nodeTaskDetail'

/**
 * 节点任务详情（node-task-ux-optimization D8 / 7.2 / 7.3）
 *
 * 独立路由页替代原 900px 详情弹窗：结论在上、证据（节点/参数/日志）在下，
 * 日志进 720px 可拖拽抽屉（不再挤在窄列里长出「展开 / 完整日志」套娃）。
 */
const route = useRoute()
const router = useRouter()

const taskId = computed(() => Number(route.params.id) || 0)
const task = ref<NodeTaskData | null>(null)
const loading = ref(false)
const rawOpen = ref(false)
const logOpen = ref(false)
const logNodeId = ref<number | null>(null)
const auditEntries = ref<NodeTaskAuditEntry[]>([])

const TASK_TYPES: Array<{ value: string; label: string }> = [
  { value: 'install_openresty', label: '安装 OpenResty' },
  { value: 'install_edge', label: '安装 Edge' },
  { value: 'associate_new_openresty', label: '关联新 OpenResty' },
  { value: 'edge_pack_add', label: '升级 Edge(传包)' },
  { value: 'edge_pack_rebase', label: '升级 Edge(切版本)' },
  { value: 'start', label: '启动' },
  { value: 'stop', label: '停止' },
  { value: 'reload', label: 'Reload' },
  { value: 'statistic', label: '状态查询' },
  { value: 'software_check', label: '软件查询' },
  { value: 'cmd_exec', label: '命令执行' },
  { value: 'distribute_file', label: '分发文件' },
]

const typeLabel = computed(
  () => TASK_TYPES.find((t) => t.value === task.value?.task_type)?.label || task.value?.task_type || '',
)
const headerTitle = computed(() =>
  task.value ? `任务 #${taskId.value} · ${typeLabel.value}` : `任务 #${taskId.value}`,
)
const headerDescription = computed(() => {
  if (!task.value) return '加载任务详情与节点执行结果'
  return task.value.cluster_name
    ? `集群 ${task.value.cluster_name} · 共 ${task.value.total_nodes ?? 0} 个节点`
    : `集群已删除 · 共 ${task.value.total_nodes ?? 0} 个节点`
})

const isActive = computed(() => ['pending', 'running'].includes(task.value?.status || ''))
const canRetry = computed(() => {
  if (!task.value) return false
  const terminal = ['success', 'failed', 'partial', 'cancelled', 'skipped'].includes(task.value.status)
  return terminal && (task.value.failed_nodes ?? 0) + (task.value.cancelled_nodes ?? 0) > 0
})

const counts = computed(() => (task.value ? countsLine(task.value) : ''))
const suggestion = computed(() =>
  task.value
    ? buildSuggestion({
        status: task.value.status,
        failed_nodes: task.value.failed_nodes,
        cancelled_nodes: task.value.cancelled_nodes,
        failure_summary: task.value.failure_summary,
        reasons: (task.value.items || []).map((i) => i.failure_reason),
      })
    : '',
)

// ── 实时流（唯一实现见 useNodeTaskStream） ──
const stream = useNodeTaskStream({
  onTaskUpdate: (ev) => {
    if (!task.value) return
    task.value = {
      ...task.value,
      status: ev.status || task.value.status,
      success_nodes: ev.success_nodes ?? task.value.success_nodes,
      failed_nodes: ev.failed_nodes ?? task.value.failed_nodes,
      cancelled_nodes: ev.cancelled_nodes ?? task.value.cancelled_nodes,
    }
  },
  onFinished: () => {
    // done = 流结束，增量已无意义：先清掉过期 overlay（如连接建立时回放的
    // node_update{pending, rc:null}，分发批量腿之后不再有增量覆盖它）再重拉，
    // 否则旧增量会盖住重拉回的终态记录——行状态钉死「待执行」、rc 钉死空。
    stream.resetItems()
    void loadTask()
  },
  onPoll: (fresh) => {
    task.value = fresh
  },
})

const itemOf = (record: NodeTaskItemData): NodeTaskItemData => stream.itemOf(record)

function itemDuration(item: NodeTaskItemData): string {
  const seconds = durationSeconds(item.started_at, item.finished_at)
  return seconds == null ? '—' : formatDurationCompact(seconds)
}

const nodeColumns = [
  { title: '节点', key: 'node', width: 260 },
  { title: '状态', key: 'status', width: 120 },
  { title: '返回码 / 原因', key: 'result' },
  { title: '耗时', key: 'duration', width: 100 },
  { title: '操作', key: 'actions', width: 110, align: 'right' as const },
]

// ── 上下文行 ──
const contextItems = computed(() => {
  const t = task.value
  if (!t) return []
  const items = [
    { label: '集群', value: t.cluster_name || `已删除（ID ${t.cluster_id}）`, mono: false },
    { label: '发起人', value: t.created_by_name || '—', mono: false },
    { label: '创建时间', value: formatDateTime(t.created_at), mono: true },
    { label: '开始时间', value: formatDateTime(t.started_at), mono: true },
    { label: '结束时间', value: isActive.value ? '进行中' : formatDateTime(t.finished_at), mono: true },
    { label: '耗时', value: taskDuration(), mono: true },
  ]
  if (t.cancel_requested_at) {
    items.push({ label: '取消请求', value: formatDateTime(t.cancel_requested_at), mono: true })
  }
  return items
})

function taskDuration(): string {
  const t = task.value
  if (!t) return '—'
  const seconds = durationSeconds(t.started_at || t.created_at, t.finished_at || new Date().toISOString())
  return seconds == null ? '—' : formatDurationCompact(seconds)
}

// ── 参数区 ──
const paramList = computed(() => (task.value ? paramEntries(task.value) : []))
const rawParamsJson = computed(() => JSON.stringify(task.value?.params || {}, null, 2))

async function copyRaw() {
  try {
    await navigator.clipboard.writeText(rawParamsJson.value)
    message.success('已复制原始参数')
  } catch {
    message.warning('复制失败：请手动选择文本复制')
  }
}

// ── 软件矩阵（software_check 专用，逻辑自详情弹窗原样迁移） ──
interface SoftwareCell {
  status: 'installed' | 'missing' | 'failed'
  pkg: string
  ver: string
}

function softwarePayload(item: NodeTaskItemData): Record<string, { installed?: boolean; pkg?: string; ver?: string }> {
  try {
    const data = typeof item.stdout === 'string' ? JSON.parse(item.stdout) : item.stdout || {}
    return data as Record<string, { installed?: boolean; pkg?: string; ver?: string }>
  } catch {
    return {}
  }
}

const softwareRows = computed(() => {
  const rows = new Set<string>()
  for (const item of task.value?.items || []) {
    for (const key of Object.keys(softwarePayload(item))) rows.add(key)
  }
  return Array.from(rows)
})

function softwareCell(item: NodeTaskItemData, soft: string): SoftwareCell | null {
  const entry = softwarePayload(item)[soft]
  if (!entry) return null
  if (item.status !== 'success' && entry.installed === undefined) {
    return { status: 'failed', pkg: '', ver: '' }
  }
  return { status: entry.installed ? 'installed' : 'missing', pkg: entry.pkg || '', ver: entry.ver || '' }
}

function swTitle(item: NodeTaskItemData, soft: string): string {
  const cell = softwareCell(item, soft)
  if (!cell) return ''
  return `包: ${cell.pkg}${cell.ver ? `\n版本: ${cell.ver}` : ''}`
}

// ── 日志抽屉 ──
const logItem = computed(() => (task.value?.items || []).find((i) => i.node_id === logNodeId.value) || null)
const logLines = computed(() => (logItem.value ? stream.linesOf(logItem.value) : []))

function openLog(record: NodeTaskItemData) {
  logNodeId.value = record.node_id
  logOpen.value = true
}

// ── 操作记录 ──
const AUDIT_ACTION_LABELS: Record<string, string> = {
  node_task_create: '创建任务',
  node_task_cancel: '取消任务',
  node_task_retry: '重试失败节点',
}

function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] || action
}

// ── 数据加载 ──
/** 操作记录随任务并行加载；404（任务不存在）/接口异常一律置空，绝不影响页面主体渲染 */
async function loadAudit() {
  try {
    auditEntries.value = await getNodeTaskAudit(taskId.value)
  } catch {
    auditEntries.value = []
  }
}

async function loadTask() {
  if (!taskId.value) return
  loading.value = true
  try {
    const [fresh] = await Promise.all([getNodeTask(taskId.value), loadAudit()])
    task.value = fresh
    if (isActive.value) stream.start(taskId.value)
    else stream.stop()
  } catch {
    message.error('任务详情加载失败')
  } finally {
    loading.value = false
  }
}

watch(taskId, () => {
  task.value = null
  void loadTask()
})

void loadTask()

// 任务转为终态后停止流（done 事件之外的兜底：轮询/操作后状态已终态）
watch(
  () => task.value?.status,
  (status) => {
    if (status && !['pending', 'running'].includes(status)) stream.stop()
  },
)

// ── 动作 ──
function goBackToList() {
  void router.push({ name: 'NodeTaskCenter', query: route.query })
}

async function exportLogs() {
  try {
    await downloadTaskLogsArchive(taskId.value)
    message.success('日志已开始下载')
  } catch {
    message.error('导出日志失败')
  }
}

function confirmCancel() {
  showOverlayModal({
    title: '确认取消任务',
    content:
      '取消会立即中断正在执行的节点进程，已成功的节点不受影响。\n' +
      '已产生的改动不会回滚——安装/升级/启停等改动型任务，请确认后续是否需要手工处理。',
    okText: '确认取消',
    okDanger: true,
    onOk: async () => {
      try {
        await cancelNodeTask(taskId.value)
        message.success('任务取消已发起')
        await loadTask()
      } catch {
        message.error('取消失败')
      }
    },
  })
}

function confirmRetry() {
  const t = task.value
  if (!t) return
  showOverlayModal({
    title: '确认重试任务',
    content: `将重新执行该任务的失败/取消节点：失败 ${t.failed_nodes} 个、取消 ${t.cancelled_nodes} 个。已成功的节点不会被重复执行。`,
    okText: '确认重试',
    okDanger: true,
    onOk: async () => {
      try {
        await retryNodeTask(t.id)
        message.success('任务重试已发起')
        await loadTask()
      } catch {
        message.error('重试失败')
      }
    },
  })
}

function confirmDelete() {
  const t = task.value
  if (!t) return
  showOverlayModal({
    title: '确认删除任务',
    content: `确定删除任务 #${t.id}（${typeLabel.value}）？删除后任务记录与执行日志不可恢复。`,
    okText: '确认删除',
    okDanger: true,
    onOk: async () => {
      try {
        await deleteNodeTask(t.id)
        message.success('任务已删除')
        goBackToList()
      } catch {
        message.error('删除任务失败')
      }
    },
  })
}
</script>

<style scoped>
.ntd {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ntd-loading {
  padding: 48px 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

.ntd-card {
  padding: 16px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.ntd-card-title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}

/* ── 结论区：视觉重心，字号与留白都比其它卡片重 ── */
.ntd-verdict-line {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ntd-counts {
  font-family: var(--font-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--fg);
}

.ntd-bar {
  flex: 1;
  min-width: 200px;
  /* 限宽：整行拉满的长条会把「结论」读成一条告警横幅 */
  max-width: 420px;
}

.ntd-bar :deep(.tpb) {
  min-width: 0;
  width: 100%;
}

.ntd-cause {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.ntd-suggestion {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--accent);
}

/* ── 上下文行 ── */
.ntd-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 28px;
  padding-top: 12px;
  padding-bottom: 12px;
}

.ntd-ctx {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
}

.ntd-ctx-label {
  color: var(--muted);
}

.ntd-ctx-value {
  color: var(--fg);
}

.ntd-mono {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* ── 节点表 ── */
.ntd-node-ip {
  font-family: var(--font-mono);
  font-size: 12px;
}

.ntd-node-name,
.ntd-attempt-tag {
  margin-left: 8px;
  font-size: 12px;
  color: var(--muted);
}

/* 原因正文用常规文字色：整句染红 = 满屏告警感，红色只留给状态 chip */
.ntd-reason {
  display: inline-block;
  max-width: 520px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  font-size: 12px;
  color: var(--fg);
}

.ntd-rc,
.ntd-duration {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

/* ── 软件矩阵 ── */
.ntd-software {
  margin-top: 16px;
}

.ntd-software-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.ntd-software table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.ntd-software th,
.ntd-software td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}

.ntd-software-cell {
  text-align: center !important;
}

.ntd-sw-ok {
  color: var(--success);
}

.ntd-sw-missing {
  color: var(--danger);
}

/* ── 参数区 ── */
.ntd-params {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px 24px;
  margin-bottom: 12px;
}

.ntd-param {
  display: flex;
  gap: 10px;
  font-size: 13px;
  min-width: 0;
}

.ntd-param-label {
  flex: 0 0 auto;
  color: var(--muted);
}

.ntd-param-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg);
}

.ntd-raw-toggle {
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
}

.ntd-raw-toggle:hover {
  text-decoration: underline;
}

.ntd-raw-wrap {
  margin-top: 10px;
}

.ntd-raw {
  margin: 0 0 8px;
  padding: 12px 14px;
  max-height: 320px;
  overflow: auto;
  border-radius: var(--radius-md);
  background: oklch(20% 0.02 240);
  color: oklch(92% 0.01 240);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}

/* ── 操作记录 ── */
.ntd-audit-list {
  display: flex;
  flex-direction: column;
}

.ntd-audit-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.ntd-audit-row:last-child {
  border-bottom: none;
}

.ntd-audit-time {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.ntd-audit-user {
  flex: 0 0 72px;
  color: var(--fg);
}

.ntd-audit-action {
  flex: 0 0 auto;
  font-weight: 500;
  color: var(--fg);
}

.ntd-audit-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
}

.ntd-muted {
  color: var(--muted);
  font-size: 13px;
}

.link-action {
  padding: 2px 6px;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--accent);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.link-action:hover {
  color: var(--accent-hover);
  text-decoration: underline;
}

.action-trigger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 16px;
  line-height: 1;
  color: var(--muted);
  cursor: pointer;
}

.action-trigger-btn:hover {
  background: var(--accent-bg);
  color: var(--accent);
}
</style>
