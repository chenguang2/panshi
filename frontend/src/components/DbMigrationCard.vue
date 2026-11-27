<template>
  <div class="l5-card db-migration-card">
    <div class="mig-cardhead">
      <h3>迁移任务</h3>
      <span class="mig-sub">单向快照替换：先备份源库，再清空目标库写入</span>
      <div class="mig-head-actions">
        <button class="tool-btn migrate-refresh-btn" @click="loadMigrationState" :disabled="migrationStateLoading">
          <StrokeIcon name="rotate" :size="12" />
          {{ migrationStateLoading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </div>
    <div class="mig-body">
      <!-- 主区两栏（design D9）：左 = 一体化流向面板（方案 A 定稿），右 = 固定风险与说明面板 -->
      <div class="migrate-layout">
        <div class="migrate-form-col">
          <!-- 一体化流向面板：两 select 网格恒等宽、32px 箭头徽章、危险徽签右对齐贴目标列下方、
               超时 + 日志勾选 + 发起按钮合成 36px 等高控制线 -->
          <div class="flow-panel">
            <div class="flow-grid">
              <div class="flow-unit fu-src">
                <label class="unit-label" for="migrate-src-select">源数据库</label>
                <select
                  id="migrate-src-select"
                  v-model="migrateForm.sourceId"
                  class="form-input flow-select"
                  @change="markSourceTouched"
                >
                  <option value="" disabled>选择源数据库</option>
                  <option v-for="c in connections" :key="c.id" :value="c.id">{{ sourceOptionLabel(c) }}</option>
                </select>
              </div>
              <div class="flow-chip" aria-hidden="true">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </div>
              <div class="flow-unit fu-dst">
                <label class="unit-label" for="migrate-dst-select">目标数据库</label>
                <select id="migrate-dst-select" v-model="migrateForm.targetId" class="form-input flow-select">
                  <option value="" disabled>选择目标数据库</option>
                  <option v-for="c in connections" :key="c.id" :value="c.id" :disabled="c.id === activeConnId">
                    {{ targetOptionLabel(c) }}
                  </option>
                </select>
              </div>
              <div class="danger-note flow-danger">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
                替换模式 · 目标库现有数据将被清空覆盖，不可撤销
              </div>
            </div>
            <div class="control-line">
              <label class="unit-label" for="migrate-timeout-select">单阶段超时</label>
              <select
                id="migrate-timeout-select"
                v-model.number="migrateForm.timeout"
                class="form-input flow-select timeout-select"
                :disabled="migrating || !canStartMigration"
              >
                <option :value="60">1 分钟</option>
                <option :value="180">3 分钟</option>
                <option :value="300">5 分钟（默认）</option>
                <option :value="600">10 分钟</option>
                <option :value="1800">30 分钟</option>
              </select>
              <label class="checkbox-label">
                <input type="checkbox" v-model="migrateForm.includeLogs" :disabled="migrating || !canStartMigration" />
                <span>包含日志数据</span>
              </label>
              <button
                class="btn btn-primary migrate-btn"
                :disabled="migrating || !canStartMigration"
                :title="!canStartMigration ? '可用连接不足' : ''"
                @click="handleMigrate"
              >
                {{ migrating ? '迁移中…' : '开始迁移' }}
              </button>
            </div>
          </div>
          <p v-if="!canStartMigration" class="flow-hint migrate-insufficient-hint">
            <span>可用连接不足：发起迁移需要 2 个连接，当前 {{ connections.length }} 个</span>
            <router-link class="btn btn-secondary btn-sm goto-create-conn" to="/database-management?wizard=1">
              去新建连接
            </router-link>
          </p>
        </div>

        <!-- 风险与说明固定面板（design D9；静态资源语境提示并入末条） -->
        <aside class="risk-panel">
          <div class="risk-panel-title">风险与说明</div>
          <ul class="risk-list">
            <li class="risk-danger">替换模式：目标库现有数据将被清空覆盖，不可撤销</li>
            <li>迁移前自动备份源库，备份保留最近 10 份，超量自动清理</li>
            <li>迁移期间所有写操作锁定（503），完成后自动恢复</li>
            <li>静态资源文件存储于服务器磁盘，仅部署该文件的本机可访问；迁移/切换数据库不影响静态资源文件。</li>
          </ul>
        </aside>
      </div>

      <!-- 统一进度面板（db-migration-page-restyle）：SSE 实时态与 API 恢复态同构解剖；
           锁定事实由状态带 lock 段承载，卡片内不再另立锁横幅 -->
      <div v-if="progressView" class="mig-progress">
        <div class="progress-head">
          <span class="phase">{{ progressView.phase === 'backup' ? 'BACKUP' : 'MIGRATING' }}</span>
          <template v-if="progressView.skeleton">
            {{ progressView.live ? '正在准备迁移…' : '迁移进行中…' }}
          </template>
          <template v-else-if="progressView.phase === 'backup'">正在备份源库…</template>
          <template v-else>正在迁移数据 · 表 {{ progressView.tableIndex }} / {{ progressView.totalTables }}</template>
        </div>
        <div v-if="!progressView.skeleton" class="bar" :class="{ ok: progressView.phase === 'backup' }">
          <i :style="{ width: progressView.percent + '%' }"></i>
        </div>
        <div class="progress-meta">
          <template v-if="!progressView.skeleton && progressView.phase === 'backup'">
            <span
              >已备份 <b>{{ progressView.backupDone }}</b> / <b>{{ progressView.backupTotal }}</b> 张表</span
            >
          </template>
          <template v-else-if="!progressView.skeleton">
            <span v-if="progressView.currentTable">
              当前表：<b>{{ progressView.currentTable }}</b
              ><template v-if="progressView.skipped">（跳过：表不存在）</template>
            </span>
            <span v-if="progressView.totalRows > 0">
              已迁移 <b>{{ progressView.copiedRows.toLocaleString() }}</b> /
              <b>{{ progressView.totalRows.toLocaleString() }}</b> 行
            </span>
          </template>
          <template v-else-if="!progressView.live">
            <span>进度暂未上报，可稍后点「刷新」查看最新状态</span>
          </template>
          <span v-if="progressStartedAt" class="mig-time">{{ formatDateTime(progressStartedAt) }} 起</span>
        </div>
        <div v-if="migrating" class="progress-foot">
          <button class="btn btn-danger btn-sm migrate-disconnect-btn" @click="handleCancelMigration">
            断开实时进度
          </button>
        </div>
      </div>

      <!-- 迁移结果摘要条：完成后只占一行，明细收进抽屉（避免 22+ 张表明细把页面撑长） -->
      <div v-if="migrateResult" class="migrate-result-bar">
        <div class="result-main">
          <span class="result-badge">✓</span>
          <span class="result-text">{{ migrateResult.message }}</span>
          <span class="result-meta">
            {{ migrateResult.tables_migrated }} 张表<template v-if="migrateElapsed !== null">
              · 耗时 {{ migrateElapsed }} 秒</template
            ><template v-if="migrateResult.backup_path"> · 已自动备份源库（保留最近 10 份）</template>
          </span>
        </div>
        <div class="result-actions">
          <button class="btn btn-secondary btn-sm" @click="migrateDetailOpen = true">查看迁移详情</button>
          <button v-if="migrateTargetConnection" class="btn btn-primary btn-sm" @click="openSwitchForMigrateTarget">
            去切换数据库
          </button>
        </div>
      </div>
    </div>

    <!-- 迁移详情共享抽屉（db-migration-history-detail D4）：与历史回看共用唯一实现，数据经视图模型传入 -->
    <DbMigrationDetailDrawer
      v-model:open="migrateDetailOpen"
      :source-name="getConnectionName(migrateForm.sourceId)"
      :target-name="migrateTargetName"
      :tables-count="migrateResult?.tables_migrated ?? null"
      :duration-text="migrateElapsed !== null ? migrateElapsed + ' 秒' : '-'"
      :backup-path="migrateResult?.backup_path || ''"
      :tables="migrateResult?.tables || []"
    />
  </div>

  <!-- 确认开始迁移弹窗（design D2：替代勾选框直发；「开始迁移」触发，弹窗内确认后才发起） -->
  <div v-if="confirmModal.open" class="modal-overlay migrate-confirm-modal">
    <div class="modal" style="max-width: 560px">
      <div class="modal-header">
        <h2>确认开始迁移</h2>
        <button class="modal-close" @click="closeConfirmModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="confirm-conn-row">
          <span class="confirm-conn-label">源</span>
          <strong>{{ confirmSourceName }}</strong>
          <span class="confirm-conn-meta">{{ confirmSourceMeta }}</span>
          <span v-if="confirmSourceIsActive" class="badge badge-neutral">当前活动库</span>
        </div>
        <div class="confirm-conn-row">
          <span class="confirm-conn-label">目标</span>
          <strong>{{ confirmTargetName }}</strong>
          <span class="confirm-conn-meta">{{ confirmTargetMeta }}</span>
        </div>
        <!-- 清空覆盖警告（主题 .alert 族；无法判定空库时保守恒显 error，spec 保守恒显契约不变） -->
        <div class="alert" :class="showClearWarning ? 'alert-error' : 'alert-info'">
          <span class="alert-icon"><StrokeIcon name="warning" :size="14" /></span>
          <div class="alert-content">{{ clearWarningText }}</div>
        </div>
        <ul class="confirm-notes">
          <li>迁移前自动备份源库（备份保留最近 10 份，超量自动清理）</li>
          <li>迁移期间所有写操作暂被锁定，完成后自动恢复</li>
          <li>单阶段超时 {{ timeoutLabel }}，超时自动中止</li>
        </ul>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary migrate-confirm-cancel-btn" @click="closeConfirmModal">取消</button>
        <button class="btn btn-danger migrate-confirm-btn" @click="confirmStartMigration">确认开始迁移</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import { formatDateTime } from '@/utils/format'
import StrokeIcon from '@/components/StrokeIcon.vue'
import DbMigrationDetailDrawer from '@/components/DbMigrationDetailDrawer.vue'
import { migrateDatabaseStream, getRunningTasks } from '@/api/database'
import type { DbConnection, MigrateResult, MigrationCompleteEvent, MigrationState } from '@/types/database'

// 连接列表/名称解析经 props 传入（不建 store、不复制实现——design D4）；
// 切换确认弹窗归连接注册表域，经 switch-connection 事件交由宿主打开。
// 迁移完成经 migrated 事件通知宿主（历史卡 refresh 接线，db-migration-page-restyle）。
const props = withDefaults(
  defineProps<{
    connections: DbConnection[]
    /** 当前活动连接 ID（G8 前置 + 源预选用，取自 GET /database/status 的 active.id） */
    activeConnId?: string
  }>(),
  { activeConnId: '' },
)

const emit = defineEmits<{
  (e: 'switch-connection', connection: DbConnection): void
  (e: 'migrated'): void
}>()

const migrating = ref(false)
const migrateResult = ref<MigrateResult | null>(null)
/** 迁移详情抽屉开关（完成后默认收起，避免页面被明细撑长） */
const migrateDetailOpen = ref(false)
/** 本次迁移的起始时间与耗时（仅前端计时；完成事件本身不含 duration） */
const migrateStartedAt = ref<number | null>(null)
const migrateElapsed = ref<number | null>(null)
const migrationController = ref<AbortController | null>(null)

// Running migration state
const runningMigration = ref<MigrationState>({
  in_progress: false,
  source_id: null,
  target_id: null,
  started_at: null,
  progress: null,
})
const migrationStateLoading = ref(false)

function getConnectionName(connId: string): string {
  return props.connections.find((c) => c.id === connId)?.name || connId
}

const migrateForm = reactive({
  sourceId: '',
  targetId: '',
  includeLogs: true,
  timeout: 300,
})

// ── G8 前置 + 源预选（design D3）：源默认预选当前活动库（标注「当前」），目标下拉禁用活动库
//    （标注「当前活动库，不可作为目标」）；活动库变更后联动刷新。用户手动改过源则尊重用户选择。 ──
const sourceTouchedByUser = ref(false)

function markSourceTouched(): void {
  sourceTouchedByUser.value = true
}

watch(
  () => [props.connections, props.activeConnId] as const,
  ([conns, activeId]) => {
    if (!activeId) return
    if (conns.some((c) => c.id === activeId) && (!migrateForm.sourceId || !sourceTouchedByUser.value)) {
      migrateForm.sourceId = activeId
    }
    if (migrateForm.targetId && migrateForm.targetId === activeId) {
      migrateForm.targetId = ''
    }
  },
  { immediate: true },
)

/** 源下拉选项文案：活动库标注「当前」（spec 活动库约束前置） */
function sourceOptionLabel(c: DbConnection): string {
  return c.id === props.activeConnId ? `${c.name}（当前）` : c.name
}

/** 目标下拉选项文案：活动库标注不可作为目标（G8 前置，选项同时 disabled） */
function targetOptionLabel(c: DbConnection): string {
  return c.id === props.activeConnId ? `${c.name}（当前活动库，不可作为目标）` : c.name
}

// SSE progress state
const migrationProgress = reactive({
  active: false,
  phase: '' as 'backup' | 'migrating' | '',
  backupDone: 0,
  backupTotal: 0,
  tableIndex: 0,
  totalTables: 0,
  currentTable: '',
  copiedRows: 0,
  totalRows: 0,
  skipped: false,
})

const migrateTargetName = computed(
  () => props.connections.find((c) => c.id === migrateForm.targetId)?.name || '目标数据库',
)

/** 本次迁移的目标连接对象（用于结果条上的「去切换数据库」一键操作） */
const migrateTargetConnection = computed(() => props.connections.find((c) => c.id === migrateForm.targetId) || null)
// 空态门控（spec db-migration-page）：迁移需要同时提供源与目标，可用连接不足 2 个时禁用发起
const canStartMigration = computed(() => props.connections.length >= 2)

/** 通知宿主打开既有切换确认弹窗，省掉"去连接列表里找目标 → 点设为当前"两步 */
function openSwitchForMigrateTarget() {
  if (migrateTargetConnection.value) emit('switch-connection', migrateTargetConnection.value)
}

// ── 统一进度面板视图（db-migration-page-restyle）：SSE 实时态优先，其次 API 恢复态；
//    阶段未上报 / 恢复态 progress 缺失 → skeleton 骨架行（不渲染假进度条） ──
interface ProgressViewModel {
  phase: 'backup' | 'migrating'
  /** 骨架行：只渲染阶段徽标 + 提示文案，不渲染进度条 */
  skeleton: boolean
  /** SSE 本地实时流（显示「断开实时进度」） */
  live: boolean
  percent: number
  tableIndex: number
  totalTables: number
  currentTable: string
  copiedRows: number
  totalRows: number
  skipped: boolean
  backupDone: number
  backupTotal: number
}

const EMPTY_VIEW: ProgressViewModel = {
  phase: 'migrating',
  skeleton: true,
  live: false,
  percent: 0,
  tableIndex: 0,
  totalTables: 0,
  currentTable: '',
  copiedRows: 0,
  totalRows: 0,
  skipped: false,
  backupDone: 0,
  backupTotal: 0,
}

const progressView = computed<ProgressViewModel | null>(() => {
  if (migrating.value) {
    const p = migrationProgress
    if (p.phase === 'backup') {
      return {
        ...EMPTY_VIEW,
        phase: 'backup',
        skeleton: false,
        live: true,
        percent: p.backupTotal > 0 ? Math.round((p.backupDone / p.backupTotal) * 100) : 0,
        backupDone: p.backupDone,
        backupTotal: p.backupTotal,
      }
    }
    if (p.phase === 'migrating') {
      return {
        ...EMPTY_VIEW,
        skeleton: false,
        live: true,
        percent: p.totalTables > 0 ? Math.round((p.tableIndex / p.totalTables) * 100) : 0,
        tableIndex: p.tableIndex,
        totalTables: p.totalTables,
        currentTable: p.currentTable,
        copiedRows: p.copiedRows,
        totalRows: p.totalRows,
        skipped: p.skipped,
      }
    }
    // 流已建立、阶段未上报（准备中）：骨架行
    return { ...EMPTY_VIEW, live: true }
  }
  const rm = runningMigration.value
  if (!rm.in_progress) return null
  const p = rm.progress
  if (!p) return { ...EMPTY_VIEW }
  if (p.phase === 'backup') {
    return {
      ...EMPTY_VIEW,
      phase: 'backup',
      skeleton: false,
      percent: p.backup_total > 0 ? Math.round((p.backup_done / p.backup_total) * 100) : 0,
      backupDone: p.backup_done,
      backupTotal: p.backup_total,
    }
  }
  return {
    ...EMPTY_VIEW,
    skeleton: false,
    percent: p.total_tables > 0 ? Math.round((p.table_index / p.total_tables) * 100) : 0,
    tableIndex: p.table_index,
    totalTables: p.total_tables,
    currentTable: p.current_table,
    copiedRows: p.copied_rows,
    totalRows: p.total_rows,
    skipped: p.skipped,
  }
})

/** 进度面板起始时间：SSE 态用本地发起时刻，恢复态用后端 started_at */
const progressStartedAt = computed(() => {
  if (migrating.value) {
    return migrateStartedAt.value === null ? null : new Date(migrateStartedAt.value).toISOString()
  }
  return runningMigration.value.started_at
})

// ── 确认开始迁移弹窗（design D2）：弹窗要素 = 源/目标标识与地址、清空警告（空库降级）、
//    备份源库与 10 份保留、写锁影响、超时摘要；取消不发起 ──
const confirmModal = reactive({ open: false })

const confirmSourceConnection = computed(() => props.connections.find((c) => c.id === migrateForm.sourceId) || null)
const confirmTargetConnection = computed(() => props.connections.find((c) => c.id === migrateForm.targetId) || null)

const confirmSourceName = computed(() => confirmSourceConnection.value?.name || '-')
const confirmTargetName = computed(() => confirmTargetConnection.value?.name || '-')
const confirmSourceIsActive = computed(() => migrateForm.sourceId === props.activeConnId)

function connTypeLabel(c: DbConnection | null): string {
  if (!c) return '-'
  return c.type === 'postgres' ? 'PostgreSQL' : 'SQLite'
}

function connAddress(c: DbConnection | null): string {
  if (!c) return '-'
  return c.display_address || c.path || (c.host ? `${c.host}${c.port ? ':' + c.port : ''}` : '') || '-'
}

const confirmSourceMeta = computed(() => {
  const c = confirmSourceConnection.value
  return c ? `${connTypeLabel(c)} · ${connAddress(c)}` : '-'
})
const confirmTargetMeta = computed(() => {
  const c = confirmTargetConnection.value
  return c ? `${connTypeLabel(c)} · ${connAddress(c)}` : '-'
})

/**
 * 目标库清空警告降级开关（spec：目标库为空时降级为中性说明）。
 * 现状无接口可判定任意目标连接的库内是否为空（后端 target_is_empty 为内部函数、
 * 未暴露为端点，connections 亦无该字段），按「以 connections + 后端行为为准」保守恒显清空
 * 警告（方向安全：宁过勿漏）；后端暴露判定字段后在此接入即可切换降级分支。
 */
const showClearWarning = computed(() => true)

const clearWarningText = computed(() => {
  const target = `${confirmTargetName.value}（${connAddress(confirmTargetConnection.value)}）`
  return showClearWarning.value
    ? `目标库已有数据：本次迁移为替换模式，目标库 ${target} 现有数据将被清空覆盖，不可撤销。`
    : `目标库 ${target} 为空，迁移将直接写入该库。`
})

const TIMEOUT_LABELS: Record<number, string> = {
  60: '1 分钟',
  180: '3 分钟',
  300: '5 分钟',
  600: '10 分钟',
  1800: '30 分钟',
}
const timeoutLabel = computed(() => TIMEOUT_LABELS[migrateForm.timeout] || `${migrateForm.timeout} 秒`)

function openConfirmModal(): void {
  confirmModal.open = true
}

function closeConfirmModal(): void {
  confirmModal.open = false
}

/** 「开始迁移」：校验通过后仅打开确认弹窗，不直发（spec 迁移发起高危确认） */
function handleMigrate(): void {
  if (!migrateForm.sourceId || !migrateForm.targetId) {
    message.error('请选择源数据库与目标数据库')
    return
  }
  if (migrateForm.sourceId === migrateForm.targetId) {
    message.error('源数据库与目标数据库不能相同')
    return
  }
  // G8 兜底（目标下拉已禁用活动库选项，此处防御 prop 错位/绕过 UI 的调用）
  if (migrateForm.targetId === props.activeConnId) {
    message.error('当前活动库不可作为迁移目标，请选择其他目标库')
    return
  }
  if (runningMigration.value.in_progress || migrating.value) {
    message.warning('数据库迁移正在进行中，请等待当前迁移完成后再试')
    return
  }
  openConfirmModal()
}

/** 弹窗内「确认开始迁移」：关闭弹窗并发起（confirmedClear 恒为 true，确认动作即知情确认） */
function confirmStartMigration(): void {
  closeConfirmModal()
  startMigrationStream()
}

/** 迁移失败提示（design 文案表）：超时类带进度与调大超时指引；其余带源库未受影响说明 */
function buildMigrationFailureMessage(rawMsg: string | undefined): string {
  const msg = rawMsg || ''
  if (msg.includes('超时')) {
    const minutes = Math.max(1, Math.round(migrateForm.timeout / 60))
    if (migrationProgress.totalTables > 0) {
      const done = migrationProgress.phase === 'migrating' ? migrationProgress.tableIndex : 0
      return `迁移超时（超过 ${minutes} 分钟），已完成 ${done}/${migrationProgress.totalTables} 张表。可调大「单阶段超时」后重试`
    }
    return `迁移超时（超过 ${minutes} 分钟），表数据尚未开始迁移。可调大「单阶段超时」后重试`
  }
  return `迁移失败：${msg || '未知错误'}。源库数据未受影响；目标库可能已部分写入，可重新迁移覆盖`
}

function startMigrationStream(): void {
  migrating.value = true
  migrateResult.value = null
  migrateDetailOpen.value = false
  migrateStartedAt.value = Date.now()
  migrateElapsed.value = null
  loadMigrationState()

  // Reset progress state
  Object.assign(migrationProgress, {
    active: true,
    phase: '',
    backupDone: 0,
    backupTotal: 0,
    tableIndex: 0,
    totalTables: 0,
    currentTable: '',
    copiedRows: 0,
    totalRows: 0,
    skipped: false,
  })

  const sseController = migrateDatabaseStream(migrateForm.sourceId, migrateForm.targetId, {
    mode: 'replace',
    includeLogs: migrateForm.includeLogs,
    confirmedClear: true,
    timeout: migrateForm.timeout,
    onBackupProgress: (data) => {
      migrationProgress.phase = 'backup'
      migrationProgress.backupDone = data.done
      migrationProgress.backupTotal = data.total
    },
    onBackupComplete: () => {
      migrationProgress.phase = 'migrating'
    },
    onProgress: (data) => {
      migrationProgress.phase = 'migrating'
      migrationProgress.tableIndex = data.table_index
      migrationProgress.totalTables = data.total_tables
      migrationProgress.currentTable = data.table_name || ''
      migrationProgress.copiedRows = data.copied_rows || 0
      migrationProgress.totalRows = data.total_rows || 0
      migrationProgress.skipped = data.skipped || false
    },
    onComplete: (data: MigrationCompleteEvent) => {
      migrateResult.value = {
        message: data.message,
        tables_migrated: data.tables_migrated,
        tables: data.tables,
        backup_path: data.backup_path ?? '',
      }
      // 耗时仅用于摘要条/详情展示；后端完成事件不含 duration，故前端计时
      migrateElapsed.value =
        migrateStartedAt.value === null ? null : Math.round((Date.now() - migrateStartedAt.value) / 1000)
      message.success(`迁移完成，共迁移 ${data.tables_migrated} 张表`)
      // 历史卡刷新改由宿主接线（migrated 事件 → DbMigrationHistoryCard.refresh）
      emit('migrated')
      migrating.value = false
    },
    onError: (msg) => {
      message.error(buildMigrationFailureMessage(msg))
      migrating.value = false
    },
  })

  // Store controller for cancellation
  migrationController.value = sseController
}

async function loadMigrationState() {
  const wasInProgress = runningMigration.value.in_progress
  migrationStateLoading.value = true
  try {
    const res = await getRunningTasks()
    runningMigration.value = res.data.migration
    // 迁移刚结束（轮询检测到进行中 → 空闲翻转）：历史卡刷新经宿主接线
    if (wasInProgress && !res.data.migration.in_progress) {
      emit('migrated')
    }
  } finally {
    migrationStateLoading.value = false
  }
}

function handleCancelMigration() {
  if (migrationController.value) {
    migrationController.value.abort()
    migrationController.value = null
  }
  // 语义（design D1）：仅断开本页 SSE 实时监视，后台迁移继续执行（后端断连不取消），
  // 写锁保持至迁移结束；5s 轮询在下一周期恢复进行中展示。
  migrating.value = false
  migrationProgress.active = false
  message.warning('已断开本页进度显示；迁移在后台继续执行，写操作锁定保持至迁移结束')
}

// Auto-refresh polling for migration state (every 5 seconds)
let _migrationPollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadMigrationState()
  _migrationPollTimer = setInterval(loadMigrationState, 5000)
})

onUnmounted(() => {
  if (_migrationPollTimer) {
    clearInterval(_migrationPollTimer)
    _migrationPollTimer = null
  }
  // 离开页面时中止进行中的迁移 SSE 流（范式：RelayGateways.vue / useInstallStream.cancel）
  migrationController.value?.abort()
  migrationController.value = null
})

defineExpose({
  migrateForm,
  migrateResult,
  migrating,
  migrateDetailOpen,
  runningMigration,
  confirmModal,
  handleMigrate,
  confirmStartMigration,
  loadMigrationState,
})
</script>

<style scoped>
/* ── 数据迁移 · 两栏布局（design D9）+ 一体化流向面板（方案 A 定稿） ── */
.migrate-layout {
  display: flex;
  /* 拉伸：风险面板与左栏（流向面板）等高（用户裁决） */
  align-items: stretch;
  gap: 20px;
}
.migrate-form-col {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.flow-panel {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  padding: 14px 16px 16px;
}
/* 两 select 恒等宽（minmax(0,1fr)），长地址由控件自身截断不撑宽 */
.flow-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr);
  column-gap: 12px;
  row-gap: 8px;
  align-items: start;
}
.flow-unit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.flow-unit.fu-src {
  grid-column: 1;
  grid-row: 1;
}
.flow-chip {
  grid-column: 2;
  grid-row: 1;
  /* 与下拉控件行平齐（用户裁决）：贴单元格底边（select 底边），32px 徽章对 36px 控件补 2px */
  align-self: end;
  margin-bottom: 2px;
  justify-self: center;
}
.flow-unit.fu-dst {
  grid-column: 3;
  grid-row: 1;
}
/* 危险徽签：网格第二行右对齐（贴目标 select 正下方）；row-gap 8px + margin 4px = 12px 间距 */
.flow-danger {
  grid-column: 1 / -1;
  grid-row: 2;
  justify-self: end;
  margin-top: 4px;
}
.unit-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.04em;
  line-height: 1.5;
  user-select: none;
}
.flow-select {
  width: 100%;
  /* 设计 .mig-select 密度：32px 高 / 12.5px 字号 / 10-28px 内距（db-migration-page-restyle 量测对齐） */
  height: 32px;
  padding: 0 28px 0 10px;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 箭头徽章：accent 圆片，与控件同尺度（32px）；面板悬停时微移示意流向 */
.flow-chip {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-bg, oklch(56% 0.16 210 / 10%));
  border: 1px solid oklch(56% 0.16 210 / 25%);
  color: var(--accent);
  transition: transform 0.2s;
}
.flow-chip svg {
  transition: transform 0.2s;
  display: block;
}
.flow-panel:hover .flow-chip svg {
  transform: translateX(2px);
}
/* 危险徽签（替换模式语义陈述）：设计为裸警示文本（无底/无边/11.5px/400） */
.danger-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 400;
  color: var(--danger, #ff4d4f);
}
.danger-note svg {
  flex-shrink: 0;
}
/* 控制线：同一行 36px 等高，虚线与流向行分隔；发起按钮右对齐落目标列侧 */
.control-line {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  row-gap: 10px;
  border-top: 1px dashed var(--border);
  margin-top: 12px;
  padding-top: 12px;
}
.control-line .unit-label {
  flex-shrink: 0;
}
.timeout-select {
  width: 132px;
  flex: 0 0 auto;
}
.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
  user-select: none;
}
.checkbox-label input[type='checkbox'] {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
}
.checkbox-label input[type='checkbox']:disabled {
  cursor: not-allowed;
}
.migrate-btn {
  margin-left: auto;
  white-space: nowrap;
}
.migrate-insufficient-hint {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.goto-create-conn {
  text-decoration: none;
}

/* 风险与说明固定面板（设计 .risk-panel/.risk-title/.risk-list 密度：11px 标题、12.5px 列表、
   原生 disc 项目符、行高 1.6） */
.risk-panel {
  flex: 0 0 35%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  padding: 12px 14px 14px;
}
.risk-panel-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.risk-list {
  margin: 0;
  padding-left: 16px;
  list-style: disc;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--muted);
}
.risk-list .risk-danger {
  color: var(--danger, #ff4d4f);
}

/* <900px：双栏 → 单栏竖排，风险面板移到下方（design D9 断点） */
@media (max-width: 899.98px) {
  .migrate-layout {
    flex-direction: column;
  }
  .risk-panel {
    flex: 1 1 auto;
    width: 100%;
  }
}
/* <560px：流向网格纵叠，箭头旋转 90° 居中，任何屏宽不溢出（样稿断点行为） */
@media (max-width: 559.98px) {
  .flow-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .flow-unit.fu-src {
    grid-column: 1;
    grid-row: 1;
  }
  .flow-chip {
    grid-column: 1;
    grid-row: 2;
    justify-self: center;
  }
  .flow-unit.fu-dst {
    grid-column: 1;
    grid-row: 3;
  }
  .flow-danger {
    grid-column: 1;
    grid-row: 4;
    margin-top: 4px;
    justify-self: start;
  }
  .flow-chip svg {
    transform: rotate(90deg);
  }
  .flow-panel:hover .flow-chip svg {
    transform: rotate(90deg) translateX(2px);
  }
  .migrate-btn {
    margin-left: 0;
  }
}

/* 进度面板：解剖单点在 style.css 的 .mig-progress（卡片内只管落位与间距） */
.mig-progress {
  margin-top: 16px;
  max-width: 640px;
}

/* 迁移结果摘要条：success token 化（db-migration-page-restyle，弃 antd 绿硬编码） */
.migrate-result-bar {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border: 1px solid oklch(55% 0.15 145 / 28%);
  border-radius: var(--radius-lg, 8px);
  background: oklch(55% 0.15 145 / 8%);
}
.result-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.result-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--success);
  color: #fff;
  font-size: 12px;
  flex-shrink: 0;
}
.result-text {
  font-size: 13px;
  font-weight: 600;
}
.result-meta {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
}
.result-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* 迁移详情抽屉已提取为共享组件 DbMigrationDetailDrawer（db-migration-history-detail D4），
   抽屉解剖样式随组件走；本卡只保留结果条与确认弹窗。 */

/* ── 确认开始迁移弹窗 ── */
.confirm-conn-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.confirm-conn-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  min-width: 24px;
}
.confirm-conn-meta {
  color: var(--muted);
  font-size: 12px;
}
.confirm-notes {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
