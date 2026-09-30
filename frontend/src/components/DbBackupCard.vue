<template>
  <div class="card db-backup-card">
    <div class="card-header">
      <h3>SQLite 备份与容灾</h3>
      <button class="btn btn-secondary btn-sm" :disabled="configLoading" @click="refreshAll">
        {{ configLoading ? '刷新中…' : '刷新' }}
      </button>
    </div>
    <div class="card-body">
      <!-- 适用性空态：注册表中无 SQLite 连接时整卡不适用 -->
      <div v-if="loaded && !applicable" class="empty-state">
        <div class="empty-state-icon">&#128190;</div>
        <p>
          不适用（无已注册的 SQLite 数据库）<template v-if="statusReason">——{{ statusReason }}</template>
        </p>
      </div>

      <template v-else>
        <!-- ═══ 状态区 ═══ -->
        <div class="dbb-stats">
          <div class="dbb-stat">
            <div class="dbb-stat-label">最近成功备份</div>
            <div class="dbb-stat-value" :class="{ 'dbb-muted': !lastSuccessAt }">
              {{ lastSuccessAt ? formatDateTime(lastSuccessAt) : '从未备份' }}
            </div>
          </div>
          <div class="dbb-stat">
            <div class="dbb-stat-label">下一轮预计</div>
            <div class="dbb-stat-value" :class="{ 'dbb-muted': !nextRunText }">{{ nextRunText }}</div>
          </div>
          <div class="dbb-stat">
            <div class="dbb-stat-label">最近状态</div>
            <div class="dbb-stat-value">
              <span v-if="inProgress" class="badge badge-warning"><span class="dbb-spin"></span>备份进行中</span>
              <span v-else-if="lastStatus" :class="statusBadgeClass(lastStatus)">{{
                statusBadgeText(lastStatus)
              }}</span>
              <span v-else class="dbb-muted">尚未运行</span>
            </div>
          </div>
          <div class="dbb-stat">
            <div class="dbb-stat-label">定时调度</div>
            <div class="dbb-stat-value">
              <span :class="enabled ? 'badge badge-success' : 'badge badge-neutral'">{{
                enabled ? '已启用' : '未启用'
              }}</span>
            </div>
          </div>
        </div>
        <div v-if="statusHint" class="dbb-status-hint">{{ statusHint }}</div>

        <!-- 上次错误（可折叠） -->
        <div v-if="config?.last_error" class="dbb-error" :class="{ expanded: errorExpanded }">
          <div class="dbb-error-head" @click="toggleError">
            <span class="dbb-error-flag">&#9888;</span>
            <span class="dbb-error-line">{{ errorHead }}</span>
            <span class="dbb-error-toggle">{{ errorExpanded ? '收起' : '展开' }}</span>
          </div>
          <pre v-if="errorExpanded" class="dbb-error-detail">{{ config.last_error }}</pre>
        </div>

        <!-- ═══ 配置区 ═══ -->
        <div class="dbb-section-title">备份配置</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">目标主机</label>
            <input v-model="form.host" type="text" class="form-input" placeholder="如 192.168.1.20" />
          </div>
          <div class="form-group">
            <label class="form-label">端口</label>
            <input v-model.number="form.port" type="number" class="form-input" min="1" max="65535" placeholder="22" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input v-model="form.username" type="text" class="form-input" placeholder="如 root" />
          </div>
          <div class="form-group">
            <label class="form-label">认证方式</label>
            <select v-model="form.auth_type" class="form-input">
              <option value="password">密码认证</option>
              <option value="key">密钥认证</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <template v-if="form.auth_type === 'password'">
              <label class="form-label">密码</label>
              <a-input-password
                v-model:value="form.password"
                :placeholder="hasPassword ? '已设置，留空表示不修改' : '请输入 SSH 密码'"
                autocomplete="new-password"
              />
            </template>
            <template v-else>
              <label class="form-label">私钥路径</label>
              <input v-model="form.key_path" type="text" class="form-input" placeholder="/root/.ssh/id_ed25519" />
            </template>
          </div>
          <div class="form-group">
            <label class="form-label">远端目录</label>
            <input v-model="form.remote_dir" type="text" class="form-input" placeholder="/srv/panshi-dr" />
            <div class="form-hint">备份包推送到该目录并按保留份数滚动清理</div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">备份间隔（分钟）</label>
            <input v-model.number="form.interval_minutes" type="number" class="form-input" min="1" placeholder="5" />
          </div>
          <div class="form-group">
            <label class="form-label">保留份数</label>
            <input v-model.number="form.retain_count" type="number" class="form-input" min="1" placeholder="7" />
          </div>
        </div>

        <div class="dbb-segments">
          <label class="checkbox-label dbb-segment-check">
            <input type="checkbox" v-model="form.include_static" />
            <span>静态资源</span>
          </label>
          <label class="checkbox-label dbb-segment-check">
            <input type="checkbox" v-model="form.include_task_scripts" />
            <span>任务脚本</span>
          </label>
          <label class="checkbox-label dbb-segment-check">
            <input type="checkbox" v-model="form.include_task_logs" />
            <span>任务日志</span>
          </label>
          <span class="form-hint dbb-segments-hint"
            >附加数据段（默认不勾选；勾选后一并打包，恢复时将覆盖本机对应目录）</span
          >
        </div>

        <div class="dbb-enabled-row">
          <label class="toggle dbb-toggle">
            <input type="checkbox" v-model="form.enabled" />
            <span class="toggle-slider"></span>
          </label>
          <span class="dbb-enabled-text">{{ form.enabled ? '启用定时备份' : '停用定时备份' }}</span>
          <span class="form-hint">启用后按间隔自动备份；「立即备份」不依赖此开关</span>
        </div>

        <div class="dbb-actions">
          <button class="btn btn-primary" :disabled="saving || configLoading" @click="handleSave">
            {{ saving ? '保存中…' : '保存配置' }}
          </button>
          <button class="btn btn-secondary" :disabled="testing || configLoading" @click="handleTest">
            {{ testing ? '测试中…' : '测试连接' }}
          </button>
          <button class="btn btn-secondary" :disabled="runDisabled" @click="handleRunNow">
            {{ running ? '备份中…' : '立即备份' }}
          </button>
          <button class="btn btn-danger-outline" @click="openWizard">恢复向导…</button>
        </div>

        <!-- ═══ 历史区 ═══ -->
        <div class="dbb-history">
          <div class="dbb-history-header">
            <h4>备份历史</h4>
            <span class="dbb-history-count">{{ history.total }} 条</span>
          </div>
          <a-table
            :data-source="history.items"
            :columns="historyColumns"
            row-key="id"
            size="middle"
            :loading="historyLoading"
            :pagination="{
              total: history.total,
              current: historyPage,
              pageSize: historyPageSize,
              showTotal: (total: number) => `共 ${total} 条记录`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showQuickJumper: true,
            }"
            class="dbb-history-table"
            @change="handleHistoryChange"
          >
            <template #bodyCell="{ record, column }">
              <template v-if="column.key === 'started_at'">
                <span class="dbb-time">{{ formatDateTime(record.started_at) }}</span>
              </template>
              <template v-else-if="column.key === 'finished_at'">
                <span class="dbb-time">{{ record.finished_at ? formatDateTime(record.finished_at) : '-' }}</span>
              </template>
              <template v-else-if="column.key === 'trigger'">
                <span class="dbb-trigger">{{ record.trigger === 'scheduled' ? '定时' : '手动' }}</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <span :class="statusBadgeClass(record.status)">{{ statusBadgeText(record.status) }}</span>
              </template>
              <template v-else-if="column.key === 'package_name'">
                <span class="dbb-pkgname" :title="record.package_name || ''">{{ record.package_name || '-' }}</span>
              </template>
              <template v-else-if="column.key === 'file_size'">
                <span class="dbb-num">{{ record.file_size != null ? formatFileSize(record.file_size) : '-' }}</span>
              </template>
              <template v-else-if="column.key === 'duration_ms'">
                <span class="dbb-num">{{ formatDurationMs(record.duration_ms) }}</span>
              </template>
              <template v-else-if="column.key === 'error'">
                <span class="dbb-err-cell" :title="record.error || ''">{{ record.error || '-' }}</span>
              </template>
            </template>
          </a-table>
        </div>
      </template>
    </div>
  </div>

  <DbBackupRestoreWizard v-model:visible="wizardOpen" @restored="handleRestored" />
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { message } from 'ant-design-vue'
import DbBackupRestoreWizard from '@/components/DbBackupRestoreWizard.vue'
import { formatDateTime, formatFileSize } from '@/utils/format'
import {
  getDbBackupConfig,
  updateDbBackupConfig,
  runDbBackupNow,
  getDbBackupHistory,
  testDbBackupTarget,
} from '@/api/dbBackup'
import type { DbBackupConfig, DbBackupHistoryPage, DbBackupStatusInfo } from '@/types/dbBackup'

// ── 配置与状态 ──
const config = ref<DbBackupConfig | null>(null)
const configLoading = ref(false)
const loaded = ref(false)
const errorExpanded = ref(false)
const wizardOpen = ref(false)

/** 表单（从 config 载入；password 仅写入方向，编辑时留空 = 不修改） */
const form = reactive({
  host: '',
  port: 22 as number | '',
  username: '',
  auth_type: 'password' as 'password' | 'key',
  password: '',
  key_path: '',
  remote_dir: '',
  interval_minutes: 5 as number | '',
  retain_count: 7 as number | '',
  include_static: false,
  include_task_scripts: false,
  include_task_logs: false,
  enabled: false,
})

const applicable = computed(() => status.value?.applicable ?? true)
/** 状态区展示的是已保存的启用状态（表单开关是未保存的编辑值，两者分离） */
const enabled = computed(() => !!config.value?.enabled)
const statusReason = computed(() => status.value?.reason || '')
const inProgress = computed(() => status.value?.in_progress || false)
const lastSuccessAt = computed(() => config.value?.last_success_at || null)
const lastStatus = computed(() => config.value?.last_status || null)
const hasPassword = computed(() => config.value?.has_password || false)
const running = computed(() => runLoading.value || inProgress.value)
const runDisabled = computed(() => running.value || configLoading.value)

/** status.reason 同时承载「不适用原因」与「启用但配置不完整」两种语义，均作为提示展示 */
const statusHint = computed(() => {
  if (!status.value || !applicable.value) return ''
  const reason = status.value.reason
  return reason || ''
})

const nextRunText = computed(() => {
  if (!form.enabled) return '—'
  const next = status.value?.next_run_at
  if (next) return formatDateTime(next)
  return '启用后 30 秒内首备'
})

const errorHead = computed(() => {
  const err = config.value?.last_error || ''
  return err.length > 120 ? err.slice(0, 120) + '…' : err
})

// ── 备份历史（服务端分页） ──
const history = ref<DbBackupHistoryPage>({ total: 0, page: 1, page_size: 10, items: [] })
const historyLoading = ref(false)
const historyPage = ref(1)
const historyPageSize = ref(10)

const historyColumns = [
  { title: '开始时间', key: 'started_at', width: 150 },
  { title: '结束时间', key: 'finished_at', width: 150 },
  { title: '触发', key: 'trigger', width: 70 },
  { title: '状态', key: 'status', width: 86 },
  { title: '包名', key: 'package_name' },
  { title: '大小', key: 'file_size', width: 90, align: 'right' as const },
  { title: '耗时', key: 'duration_ms', width: 90, align: 'right' as const },
  { title: '错误', key: 'error', width: 180 },
]

// ── 操作进行中标记 ──
const saving = ref(false)
const testing = ref(false)
const runLoading = ref(false)

const status = ref<DbBackupStatusInfo | null>(null)

/** 取后端 detail（422 校验/409 冲突），取不到时用 fallback */
function errDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.trim() ? detail : fallback
}

function toInt(v: number | string | null | undefined, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function statusBadgeClass(s: string): string {
  if (s === 'success') return 'badge badge-success'
  if (s === 'failed') return 'badge badge-danger'
  if (s === 'running') return 'badge badge-info'
  return 'badge badge-neutral'
}

function statusBadgeText(s: string): string {
  const labels: Record<string, string> = { success: '成功', failed: '失败', running: '进行中' }
  return labels[s] || s
}

/** 耗时（毫秒）人类可读：<1s 显示 ms，<60s 显示秒，否则分秒 */
function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m} 分 ${String(s).padStart(2, '0')} 秒` : `${m} 分`
}

function toggleError(): void {
  errorExpanded.value = !errorExpanded.value
}

async function loadConfig(): Promise<void> {
  configLoading.value = true
  try {
    const res = await getDbBackupConfig()
    config.value = res.data.config
    status.value = res.data.status
    applyConfigToForm(res.data.config)
  } catch (err: unknown) {
    message.error(errDetail(err, '读取备份配置失败'))
  } finally {
    configLoading.value = false
    loaded.value = true
  }
}

function applyConfigToForm(cfg: DbBackupConfig): void {
  form.host = cfg.host || ''
  form.port = cfg.port ?? 22
  form.username = cfg.username || ''
  form.auth_type = cfg.auth_type === 'key' ? 'key' : 'password'
  form.password = ''
  form.key_path = cfg.key_path || ''
  form.remote_dir = cfg.remote_dir || ''
  form.interval_minutes = cfg.interval_minutes ?? 5
  form.retain_count = cfg.retain_count ?? 7
  form.include_static = !!cfg.include_static
  form.include_task_scripts = !!cfg.include_task_scripts
  form.include_task_logs = !!cfg.include_task_logs
  form.enabled = !!cfg.enabled
}

async function loadHistory(): Promise<void> {
  historyLoading.value = true
  try {
    const res = await getDbBackupHistory(historyPage.value, historyPageSize.value)
    history.value = res.data
  } catch (err: unknown) {
    message.error(errDetail(err, '读取备份历史失败'))
  } finally {
    historyLoading.value = false
  }
}

function refreshAll(): void {
  void loadConfig()
  void loadHistory()
}

/** a-table 服务端分页：页码与每页条数变化统一走这里 */
function handleHistoryChange(pag: { current?: number; pageSize?: number }): void {
  const size = pag.pageSize ?? historyPageSize.value
  if (size !== historyPageSize.value) {
    historyPageSize.value = size
    historyPage.value = 1
  } else {
    historyPage.value = pag.current ?? historyPage.value
  }
  void loadHistory()
}

async function handleSave(): Promise<void> {
  const interval = toInt(form.interval_minutes, 0)
  const retain = toInt(form.retain_count, 0)
  if (interval < 1) {
    message.error('备份间隔必须为不小于 1 的分钟数')
    return
  }
  if (retain < 1) {
    message.error('保留份数必须不小于 1')
    return
  }
  saving.value = true
  try {
    const payload = {
      enabled: form.enabled,
      host: form.host.trim() || null,
      port: toInt(form.port, 22),
      username: form.username.trim() || null,
      auth_type: form.auth_type,
      key_path: form.auth_type === 'key' ? form.key_path.trim() || null : null,
      remote_dir: form.remote_dir.trim() || null,
      interval_minutes: interval,
      retain_count: retain,
      include_static: form.include_static,
      include_task_scripts: form.include_task_scripts,
      include_task_logs: form.include_task_logs,
      // 密码留空 = 不修改（省略键，后端保留原值）
      ...(form.auth_type === 'password' && form.password ? { password: form.password } : {}),
    }
    const res = await updateDbBackupConfig(payload)
    config.value = res.data.config
    status.value = res.data.status
    applyConfigToForm(res.data.config)
    message.success('备份配置已保存')
    if (res.data.config.enabled && !res.data.config.last_success_at) {
      message.info('已启用，30 秒内将自动执行首次备份')
    }
  } catch (err: unknown) {
    message.error(errDetail(err, '保存失败，请检查配置'))
  } finally {
    saving.value = false
  }
}

async function handleTest(): Promise<void> {
  testing.value = true
  try {
    const payload = {
      host: form.host.trim() || null,
      port: toInt(form.port, 22),
      username: form.username.trim() || null,
      auth_type: form.auth_type,
      ...(form.auth_type === 'password' && form.password ? { password: form.password } : {}),
      ...(form.auth_type === 'key' && form.key_path.trim() ? { key_path: form.key_path.trim() } : {}),
    }
    const res = await testDbBackupTarget(payload)
    if (res.data.ok) {
      message.success(res.data.message || '连接成功')
    } else {
      message.error(res.data.message || '连接失败')
    }
  } catch (err: unknown) {
    message.error(errDetail(err, '测试失败'))
  } finally {
    testing.value = false
  }
}

async function handleRunNow(): Promise<void> {
  runLoading.value = true
  try {
    const res = await runDbBackupNow()
    const sizeText = res.data.file_size != null ? formatFileSize(res.data.file_size) : ''
    message.success(
      `备份完成${res.data.package_name ? `：${res.data.package_name}` : ''}${sizeText ? `（${sizeText}，耗时 ${formatDurationMs(res.data.duration_ms)}）` : ''}`,
    )
    await loadConfig()
    await loadHistory()
  } catch (err: unknown) {
    message.error(errDetail(err, '备份失败'))
    await loadConfig()
  } finally {
    runLoading.value = false
  }
}

function openWizard(): void {
  wizardOpen.value = true
}

/** 恢复成功后：本页数据已整体变化，刷新可见状态并提示刷新页面 */
function handleRestored(): void {
  void loadConfig()
  void loadHistory()
}

// ── 进行中轮询：备份运行期间每 5s 刷新状态，结束时补刷历史 ──
let pollTimer: ReturnType<typeof setInterval> | null = null

function startPolling(): void {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    await loadConfig()
    if (!inProgress.value) {
      await loadHistory()
    }
  }, 5000)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(inProgress, (busy) => {
  if (busy) {
    startPolling()
  } else {
    stopPolling()
  }
})

onMounted(() => {
  refreshAll()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
/* ── 状态区：四格统计条 ── */
.dbb-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  background: var(--bg);
  overflow: hidden;
}
.dbb-stat {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-right: 1px solid var(--border);
}
.dbb-stat:last-child {
  border-right: none;
}
.dbb-stat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dbb-stat-value {
  font-size: 13px;
  color: var(--fg);
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}
.dbb-muted {
  color: var(--muted);
}
.dbb-spin {
  width: 10px;
  height: 10px;
  border: 2px solid var(--border);
  border-top-color: var(--warning);
  border-radius: 50%;
  animation: dbb-rotate 0.8s linear infinite;
  display: inline-block;
}
@keyframes dbb-rotate {
  to {
    transform: rotate(360deg);
  }
}
.dbb-status-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--warning);
}

/* ── 上次错误（可折叠） ── */
.dbb-error {
  margin-top: 12px;
  border: 1px solid oklch(55% 0.18 28 / 30%);
  border-radius: 8px;
  background: oklch(55% 0.18 28 / 5%);
  overflow: hidden;
}
.dbb-error-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--danger);
}
.dbb-error-flag {
  flex-shrink: 0;
}
.dbb-error-line {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dbb-error-toggle {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted);
}
.dbb-error-detail {
  margin: 0;
  padding: 10px 12px;
  border-top: 1px solid oklch(55% 0.18 28 / 20%);
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--fg);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 180px;
  overflow-y: auto;
}

/* ── 配置区 ── */
.dbb-section-title {
  margin: 20px 0 12px;
  padding-left: 10px;
  border-left: 3px solid oklch(56% 0.16 210);
  font-size: 14px;
  font-weight: 600;
}
.dbb-segments {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}
.dbb-segment-check {
  margin-bottom: 0;
}
.dbb-segments-hint {
  margin-top: 0;
}
.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  accent-color: var(--accent);
}
.dbb-enabled-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 0 4px;
  border-top: 1px solid var(--border);
}
.dbb-enabled-text {
  font-size: 13px;
  font-weight: 500;
}
.dbb-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 16px 0 4px;
}

/* ── 历史区 ── */
.dbb-history {
  margin-top: 24px;
}
.dbb-history-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-left: 10px;
  border-left: 3px solid oklch(56% 0.16 210);
}
.dbb-history-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.dbb-history-count {
  font-size: 12px;
  line-height: 1;
  color: var(--muted);
  background: oklch(56% 0.16 210 / 8%);
  border: 1px solid oklch(56% 0.16 210 / 18%);
  border-radius: 999px;
  padding: 3px 9px;
}
.dbb-time {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.dbb-trigger {
  font-size: 12px;
  color: var(--muted);
  background: oklch(55% 0.01 250 / 8%);
  border-radius: 4px;
  padding: 2px 8px;
}
.dbb-pkgname {
  font-family: var(--font-mono);
  font-size: 12px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: middle;
}
.dbb-num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.dbb-err-cell {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  font-size: 12px;
  color: var(--danger);
}

/* ── 历史表格（品牌色表头，对齐页面迁移历史表格口径） ── */
.dbb-history-table :deep(.ant-table) {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.dbb-history-table :deep(.ant-table-thead > tr > th) {
  background: oklch(56% 0.16 210 / 10%);
  border-bottom: 2px solid var(--accent);
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 8px;
  white-space: nowrap;
}
.dbb-history-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}
.dbb-history-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 8px;
  font-size: 13px;
  white-space: nowrap;
  background: transparent !important;
  border-bottom: 1px solid var(--border) !important;
}
.dbb-history-table :deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: none !important;
}
.dbb-history-table :deep(.ant-table-tbody > tr:hover > td) {
  background: oklch(97% 0.005 250 / 60%) !important;
}
.dbb-history-table :deep(.ant-table-pagination) {
  background: var(--bg) !important;
  margin: 0 !important;
  padding: 12px 16px !important;
  border-top: 1px solid var(--border) !important;
}

/* 窄屏时统计条退化为两列 */
@media (max-width: 900px) {
  .dbb-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .dbb-stat:nth-child(2) {
    border-right: none;
  }
  .dbb-stat:nth-child(-n + 2) {
    border-bottom: 1px solid var(--border);
  }
}
</style>
