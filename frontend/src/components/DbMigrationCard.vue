<template>
  <div class="card db-migration-card">
    <div class="card-header">
      <button
        class="btn btn-secondary btn-sm migrate-refresh-btn"
        @click="loadMigrationState"
        :disabled="migrationStateLoading"
      >
        {{ migrationStateLoading ? '刷新中…' : '刷新' }}
      </button>
    </div>
    <div class="card-body">
      <!-- 迁移进行中横幅（API 恢复；断开实时进度后由 5s 轮询恢复展示） -->
      <a-alert
        v-if="runningMigration.in_progress"
        type="warning"
        show-icon
        class="migration-lock-alert"
        :message="`数据库迁移进行中${runningMigration.source_id && runningMigration.target_id ? '：' + getConnectionName(runningMigration.source_id) + ' → ' + getConnectionName(runningMigration.target_id) : ''}`"
        :description="runningMigration.started_at ? '开始时间：' + formatTime(runningMigration.started_at) : ''"
      />
      <!-- 迁移进度（从 API 恢复，非 SSE 实时） -->
      <div
        v-if="runningMigration.in_progress && !migrating && runningMigration.progress"
        class="migration-progress-detail"
      >
        <div v-if="runningMigration.progress.phase === 'backup'" class="progress-phase">
          <span class="phase-label">📦 备份中</span>
          <a-progress
            :percent="
              runningMigration.progress.backup_total > 0
                ? Math.round((runningMigration.progress.backup_done / runningMigration.progress.backup_total) * 100)
                : 0
            "
            :stroke-color="'#1890ff'"
          />
          <span class="progress-text"
            >{{ runningMigration.progress.backup_done }} / {{ runningMigration.progress.backup_total }} 张表</span
          >
        </div>
        <div v-else-if="runningMigration.progress.phase === 'migrating'" class="progress-phase">
          <span class="phase-label">🔄 迁移中</span>
          <a-progress
            :percent="
              runningMigration.progress.total_tables > 0
                ? Math.round((runningMigration.progress.table_index / runningMigration.progress.total_tables) * 100)
                : 0
            "
            :stroke-color="'#52c41a'"
          />
          <span class="progress-text">
            表 {{ runningMigration.progress.table_index }} / {{ runningMigration.progress.total_tables }}
            <span v-if="runningMigration.progress.current_table">：{{ runningMigration.progress.current_table }}</span>
            <span v-if="runningMigration.progress.total_rows > 0"
              >（{{ runningMigration.progress.copied_rows?.toLocaleString() }} /
              {{ runningMigration.progress.total_rows?.toLocaleString() }} 行）</span
            >
            <a-tag v-if="runningMigration.progress.skipped" color="orange" style="margin-left: 4px">已跳过</a-tag>
          </span>
        </div>
      </div>

      <!-- 主区两栏（design D9）：左 = 流向表单，右 = 固定风险与说明面板 -->
      <div class="migrate-layout">
        <div class="migrate-form-col">
          <!-- 源 → 目标 可视化流转 -->
          <div class="flow-cards">
            <div class="flow-card">
              <div class="flow-card-label">源数据库</div>
              <select v-model="migrateForm.sourceId" class="form-input flow-select" @change="markSourceTouched">
                <option value="" disabled>选择源数据库</option>
                <option v-for="c in connections" :key="c.id" :value="c.id">{{ sourceOptionLabel(c) }}</option>
              </select>
            </div>
            <div class="flow-arrow">
              <svg
                width="32"
                height="32"
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
            <div class="flow-card">
              <div class="flow-card-label">目标数据库</div>
              <select v-model="migrateForm.targetId" class="form-input flow-select">
                <option value="" disabled>选择目标数据库</option>
                <option v-for="c in connections" :key="c.id" :value="c.id" :disabled="c.id === activeConnId">
                  {{ targetOptionLabel(c) }}
                </option>
              </select>
            </div>
          </div>

          <!-- 替换模式危险标签（design 文案表：模式下拉移除，替换语义以危险标签陈述） -->
          <div class="mode-danger-row">
            <span class="mode-danger-tag">替换模式 · 目标库现有数据将被清空覆盖，不可撤销</span>
          </div>

          <div class="migrate-action-row">
            <div class="flow-card flow-card-timeout">
              <div class="flow-card-label">单阶段超时</div>
              <select v-model.number="migrateForm.timeout" class="form-input flow-select" :disabled="migrating">
                <option :value="60">1 分钟</option>
                <option :value="180">3 分钟</option>
                <option :value="300">5 分钟（默认）</option>
                <option :value="600">10 分钟</option>
                <option :value="1800">30 分钟</option>
              </select>
            </div>
            <label class="checkbox-label">
              <input type="checkbox" v-model="migrateForm.includeLogs" />
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

      <div v-if="migrating" class="migrate-progress">
        <div v-if="migrationProgress.phase === 'backup'" class="progress-section">
          <div class="progress-header">正在备份源库…</div>
          <a-progress
            :percent="
              migrationProgress.backupTotal > 0
                ? Math.round((migrationProgress.backupDone / migrationProgress.backupTotal) * 100)
                : 0
            "
            status="active"
          />
          <span class="progress-text">表 {{ migrationProgress.backupDone }} / {{ migrationProgress.backupTotal }}</span>
        </div>
        <div v-else-if="migrationProgress.phase === 'migrating'" class="progress-section">
          <div class="progress-header">
            正在迁移数据… 表 {{ migrationProgress.tableIndex }} / {{ migrationProgress.totalTables }}
          </div>
          <a-progress
            :percent="
              migrationProgress.totalTables > 0
                ? Math.round((migrationProgress.tableIndex / migrationProgress.totalTables) * 100)
                : 0
            "
            status="active"
          />
          <div class="progress-detail">
            <span v-if="migrationProgress.currentTable" class="progress-table">
              当前表：<strong>{{ migrationProgress.currentTable }}</strong>
              <template v-if="migrationProgress.skipped">（跳过：表不存在）</template>
            </span>
            <span v-if="migrationProgress.totalRows > 0" class="progress-rows">
              已迁移 {{ migrationProgress.copiedRows.toLocaleString() }} /
              {{ migrationProgress.totalRows.toLocaleString() }} 行
            </span>
          </div>
        </div>
        <div v-else class="progress-section">
          <a-progress :percent="0" status="active" />
          <span class="progress-text">正在准备迁移…</span>
        </div>
        <div class="migrate-cancel">
          <a-button danger size="small" @click="handleCancelMigration"> 断开实时进度 </a-button>
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

      <!-- 迁移详情抽屉：表明细在抽屉内滚动，不再撑长主页面 -->
      <a-drawer v-model:open="migrateDetailOpen" title="迁移详情" placement="right" :width="760">
        <a-descriptions :column="2" size="small" bordered class="migrate-desc">
          <a-descriptions-item label="源数据库">{{ getConnectionName(migrateForm.sourceId) }}</a-descriptions-item>
          <a-descriptions-item label="目标数据库">{{ migrateTargetName }}</a-descriptions-item>
          <a-descriptions-item label="迁移表数">{{ migrateResult?.tables_migrated ?? '-' }}</a-descriptions-item>
          <a-descriptions-item label="耗时">{{
            migrateElapsed !== null ? migrateElapsed + ' 秒' : '-'
          }}</a-descriptions-item>
          <a-descriptions-item label="备份路径" :span="2">
            <span class="backup-path">{{ migrateResult?.backup_path || '未生成备份' }}</span>
          </a-descriptions-item>
        </a-descriptions>

        <div v-if="migrateResult?.tables?.length" class="migrate-table-detail">
          <div class="next-steps-title">
            表明细（共 {{ migrateResult.tables.length }} 张：业务表 {{ businessTables.length }} · 审计与导入日志
            {{ auditLogTables.length }} · 任务日志 {{ taskLogTables.length }}）
          </div>
          <div class="migrate-table-group">
            <div class="group-label">业务表（{{ businessTables.length }}）</div>
            <a-table
              :data-source="businessTables"
              :columns="migrateTableColumns"
              row-key="name"
              :pagination="false"
              :scroll="{ y: 320 }"
              size="small"
              class="migrate-detail-table"
            />
          </div>
          <div v-if="auditLogTables.length" class="migrate-table-group">
            <div class="group-label">审计与导入日志（{{ auditLogTables.length }}）</div>
            <a-table
              :data-source="auditLogTables"
              :columns="migrateTableColumns"
              row-key="name"
              :pagination="false"
              :scroll="{ y: 200 }"
              size="small"
              class="migrate-detail-table"
            />
          </div>
          <div v-if="taskLogTables.length" class="migrate-table-group">
            <div class="group-label">任务日志（{{ taskLogTables.length }}）</div>
            <a-table
              :data-source="taskLogTables"
              :columns="migrateTableColumns"
              row-key="name"
              :pagination="false"
              :scroll="{ y: 200 }"
              size="small"
              class="migrate-detail-table"
            />
          </div>
          <div v-if="!auditLogTables.length && !taskLogTables.length" class="migrate-log-hint">
            本次迁移未包含日志表（如需一并迁移日志数据，请勾选「包含日志数据」后重新执行）
          </div>
        </div>

        <div class="next-steps">
          <div class="next-steps-title">迁移成功，按以下步骤启用新数据库：</div>
          <ol class="next-steps-list">
            <li>
              在「连接列表」中找到 <strong>{{ migrateTargetName }}</strong
              >，点击「设为当前」
            </li>
            <li>在确认弹窗中点击「确认切换」，然后手动重启后端服务生效</li>
            <li>重启后刷新页面，「当前数据库」卡片应显示新数据库</li>
          </ol>
        </div>
      </a-drawer>
      <!-- 迁移历史 -->
      <div v-if="migrationHistory.length > 0" class="migration-history-section">
        <div class="history-header">
          <h4>历史迁移记录</h4>
          <span class="history-count">{{ migrationHistory.length }} 条</span>
          <span v-if="historyCapped" class="history-cap-hint">仅显示最近 {{ HISTORY_PAGE_LIMIT }} 条</span>
          <button class="btn btn-secondary btn-sm history-cleanup-btn" @click="openCleanupModal">清理历史</button>
        </div>
        <a-table
          :data-source="pagedHistory"
          :columns="historyColumns"
          row-key="id"
          :pagination="historyPagination"
          :scroll="{ x: 'max-content' }"
          @change="handleHistoryTableChange"
          size="middle"
          class="migration-history-table"
        >
          <template #bodyCell="{ record, column }">
            <template v-if="column.key === 'direction'">
              <span class="history-flow">
                <span class="flow-node flow-source" :title="connLabel(record.source_connection)">{{
                  connLabel(record.source_connection)
                }}</span>
                <span class="flow-arrow">→</span>
                <span class="flow-node flow-target" :title="connLabel(record.target_connection)">{{
                  connLabel(record.target_connection)
                }}</span>
              </span>
            </template>
            <template v-else-if="column.key === 'mode'">
              <span class="history-mode">{{ record.mode === 'replace' ? '替换' : record.mode }}</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <a-tag :color="record.status === 'success' ? 'green' : record.status === 'failed' ? 'red' : 'default'">
                {{ historyStatusLabel(record.status) }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'tables_count'">
              <span class="history-tables">{{ record.tables_count ?? '-' }}</span>
            </template>
            <template v-else-if="column.key === 'duration'">
              <span class="history-time">{{ formatDuration(record.duration_seconds) }}</span>
            </template>
            <template v-else-if="column.key === 'started_at'">
              <span class="history-time">{{ formatStartTime(record) }}</span>
            </template>
            <template v-else-if="column.key === 'created_at'">
              <span class="history-time">{{ record.created_at ? formatDateTime(record.created_at) : '-' }}</span>
            </template>
          </template>
          <template #expandedRowRender="{ record }">
            <div class="history-expand">
              <!-- 失败原因仅失败行展示（spec：成功行展开无失败原因段落）；备份路径恒占位（行高一致） -->
              <div v-if="record.status === 'failed'" class="history-expand-row">
                <span class="history-expand-label">失败原因：</span>
                <span class="history-error-text">{{ translateMigrationError(record.error_message) || '-' }}</span>
              </div>
              <div class="history-expand-row">
                <span class="history-expand-label">备份路径：</span>
                <code class="history-backup-path">{{ record.backup_path || '-' }}</code>
                <button
                  v-if="record.backup_path"
                  class="btn btn-secondary btn-sm copy-path-btn"
                  @click="copyBackupPath(record.backup_path)"
                >
                  复制
                </button>
              </div>
            </div>
          </template>
        </a-table>
      </div>
    </div>
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
        <a-alert :type="showClearWarning ? 'error' : 'info'" show-icon :message="clearWarningText" />
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

  <!-- 迁移历史清理 Modal：保留最近 N 条，其余删除（预览数字来自服务端真实总数） -->
  <div class="modal-overlay" :style="{ display: cleanupModal.open ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 520px">
      <div class="modal-header">
        <h2>清理迁移历史</h2>
        <button class="modal-close" @click="closeCleanupModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="cleanup-form">
          <span>保留最近</span>
          <a-input-number
            v-model:value="cleanupModal.keepLast"
            :min="1"
            :max="cleanupKeepMax"
            :disabled="cleanupModal.submitting"
            style="width: 120px"
            @change="refreshCleanupPreview"
          />
          <span>条记录，其余全部删除</span>
        </div>
        <div class="cleanup-preview">
          <span v-if="cleanupModal.previewing">正在计算影响范围…</span>
          <template v-else-if="cleanupModal.preview">
            <template v-if="cleanupModal.preview.will_delete > 0">
              库内共 <b>{{ cleanupModal.preview.total }}</b> 条，将删除
              <b class="cleanup-danger">{{ cleanupModal.preview.will_delete }}</b> 条，保留
              <b>{{ cleanupModal.preview.will_keep }}</b> 条
            </template>
            <template v-else> 库内共 {{ cleanupModal.preview.total }} 条，按当前保留条数无需清理 </template>
          </template>
          <span v-else class="text-muted">—</span>
        </div>
        <a-alert
          type="warning"
          show-icon
          message="删除不可撤销"
          :description="`仅影响当前活动库（${activeDbName}）的迁移历史，不影响业务数据、审计日志与已生成的备份文件。`"
        />
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" :disabled="cleanupModal.submitting" @click="closeCleanupModal">取消</button>
        <button
          class="btn btn-danger cleanup-confirm-btn"
          :disabled="cleanupModal.submitting || !cleanupModal.preview || cleanupModal.preview.will_delete === 0"
          @click="handleCleanup"
        >
          {{ cleanupModal.submitting ? '清理中…' : '确认清理' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import type { TablePaginationConfig } from 'ant-design-vue'
import { formatDateTime, parseBackendDate } from '@/utils/format'
import { paginationProps } from '@/composables/usePagination'
import { PAGE_SIZE_TABLE } from '@/constants'
import {
  migrateDatabaseStream,
  cleanupMigrationHistory,
  getMigrationHistory,
  getMigrationHistoryCleanupPreview,
  getRunningTasks,
} from '@/api/database'
import type {
  DbConnection,
  MigrateResult,
  MigrationCompleteEvent,
  MigrationHistoryCleanupPreview,
  MigrationHistoryItem,
  MigrationState,
} from '@/types/database'

// 连接列表/名称解析经 props 传入（不建 store、不复制实现——design D4）；
// 切换确认弹窗归连接注册表域，经 switch-connection 事件交由宿主打开。
const props = withDefaults(
  defineProps<{
    connections: DbConnection[]
    /** 当前活动库名（清理弹窗提示用），由宿主页面传入避免重复拉取 status */
    activeDbName?: string
    /** 当前活动连接 ID（G8 前置 + 源预选用，取自 GET /database/status 的 active.id） */
    activeConnId?: string
  }>(),
  { activeDbName: '未配置', activeConnId: '' },
)

const emit = defineEmits<{
  (e: 'switch-connection', connection: DbConnection): void
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

// Migration history
const migrationHistory = ref<MigrationHistoryItem[]>([])
const historyLoading = ref(false)
/** 后端列表单页上限（GET /database/history 固定 limit=100）：达上限时提示"仅显示最近 100 条" */
const HISTORY_PAGE_LIMIT = 100
const historyCapped = computed(() => migrationHistory.value.length >= HISTORY_PAGE_LIMIT)

// ── 迁移历史分页（客户端全量数组本地切片，参照 UserList 的 page/pageSize refs + change 写回模式；
//    分页配置统一走 paginationProps 工厂，默认每页 PAGE_SIZE_TABLE） ──
const historyPage = ref(1)
const historyPageSize = ref(PAGE_SIZE_TABLE)
const pagedHistory = computed(() =>
  migrationHistory.value.slice(
    (historyPage.value - 1) * historyPageSize.value,
    historyPage.value * historyPageSize.value,
  ),
)
const historyPagination = computed(() =>
  paginationProps({ page: historyPage.value, pageSize: historyPageSize.value, total: migrationHistory.value.length }),
)

function handleHistoryTableChange(pagination: TablePaginationConfig): void {
  historyPage.value = pagination.current || 1
  if (pagination.pageSize) historyPageSize.value = pagination.pageSize
}

/** 清理弹窗：保留最近 N 条，其余删除（预览数字由服务端按库内真实总数计算） */
const CLEANUP_DEFAULT_KEEP = 10
const cleanupModal = reactive<{
  open: boolean
  keepLast: number
  preview: MigrationHistoryCleanupPreview | null
  previewing: boolean
  submitting: boolean
}>({
  open: false,
  keepLast: CLEANUP_DEFAULT_KEEP,
  preview: null,
  previewing: false,
  submitting: false,
})

const cleanupKeepMax = computed(() => Math.max(cleanupModal.preview?.total ?? 1, 1))

/** 取后端 detail（如迁移期间的 503 写锁提示），取不到时用 fallback。 */
function errDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.trim() ? detail : fallback
}

function openCleanupModal(): void {
  cleanupModal.keepLast = CLEANUP_DEFAULT_KEEP
  cleanupModal.preview = null
  cleanupModal.open = true
  void refreshCleanupPreview()
}

function closeCleanupModal(): void {
  if (cleanupModal.submitting) return
  cleanupModal.open = false
}

async function refreshCleanupPreview(): Promise<void> {
  if (!Number.isFinite(cleanupModal.keepLast) || cleanupModal.keepLast < 1) {
    cleanupModal.preview = null
    return
  }
  cleanupModal.previewing = true
  try {
    const res = await getMigrationHistoryCleanupPreview(cleanupModal.keepLast)
    cleanupModal.preview = res.data
  } catch (err: unknown) {
    cleanupModal.preview = null
    message.error(errDetail(err, '计算清理影响失败'))
  } finally {
    cleanupModal.previewing = false
  }
}

async function handleCleanup(): Promise<void> {
  if (!cleanupModal.preview || cleanupModal.preview.will_delete === 0) return
  cleanupModal.submitting = true
  try {
    const res = await cleanupMigrationHistory(cleanupModal.keepLast)
    message.success(`已清理 ${res.data.deleted} 条迁移历史`)
    cleanupModal.open = false
    await loadMigrationHistory()
  } catch (err: unknown) {
    message.error(errDetail(err, '清理失败，请稍后重试'))
  } finally {
    cleanupModal.submitting = false
  }
}

function getConnectionName(connId: string): string {
  return props.connections.find((c) => c.id === connId)?.name || connId
}

// 迁移历史用友好标签：连接名（SQLite 文件名 / PG 地址），连接已删除时回退原始 ID
function connLabel(connId: string): string {
  const c = props.connections.find((x) => x.id === connId)
  if (!c) return connId
  const detail =
    c.type === 'sqlite'
      ? (c.path || '').split('/').pop() || ''
      : c.display_address || (c.host ? `${c.host}${c.port ? ':' + c.port : ''}` : '')
  return detail ? `${c.name}（${detail}）` : c.name
}

const historyColumns = [
  { title: '迁移方向', key: 'direction' },
  { title: '模式', key: 'mode', width: 90 },
  { title: '状态', key: 'status', width: 90 },
  { title: '表数量', key: 'tables_count', width: 90, align: 'right' as const },
  { title: '时长', key: 'duration', width: 100, align: 'right' as const },
  { title: '开始时间', key: 'started_at', width: 160 },
  { title: '完成时间', key: 'created_at', width: 160 },
]

// 后端仅产 success/failed（design D1：删除永不命中的 cancelled 死映射）
function historyStatusLabel(status: string): string {
  const labels: Record<string, string> = { success: '成功', failed: '失败' }
  return labels[status] || status
}

/**
 * 迁移失败原因中文分类转译（design D4 / 文案表，复用连接测试分类器思路）：
 * 可识别的英文异常转中文短语，无法分类的原始错误加「迁移失败：」前缀。
 */
function translateMigrationError(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return ''
  const low = raw.toLowerCase()
  if (low.includes('connection refused')) return '连接被拒绝（数据库服务未启动或端口错误）'
  if (low.includes('authentication') || (low.includes('password') && low.includes('failed'))) return '用户名或密码错误'
  if (low.includes('does not exist') && low.includes('database')) return '数据库不存在'
  if (low.includes('timeout') || low.includes('timed out')) return '连接超时'
  return `迁移失败：${raw}`
}

/** 历史行展开的备份路径复制（navigator.clipboard + 轻提示） */
async function copyBackupPath(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path)
    message.success('已复制')
  } catch {
    message.error('复制失败，请手动复制')
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '-'
  if (seconds < 60) return `${seconds} 秒`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`
  const h = Math.floor(m / 60)
  return `${h} 时 ${m % 60} 分`
}

// 开始时间：优先后端记录值；旧记录无 started_at 时回退「完成时间 − 时长」推导，均无则 '-'
function formatStartTime(record: MigrationHistoryItem): string {
  if (record.started_at) return formatDateTime(record.started_at)
  if (record.created_at && record.duration_seconds != null) {
    const end = parseBackendDate(record.created_at).getTime()
    if (!Number.isNaN(end)) {
      return formatDateTime(new Date(end - record.duration_seconds * 1000).toISOString())
    }
  }
  return '-'
}

function formatTime(iso: string): string {
  return formatDateTime(iso)
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
    ? `目标库 ${target} 现有数据将被清空覆盖，不可撤销。`
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
      getMigrationHistory()
      loadMigrationHistory()
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

const migrateTableColumns = [
  { title: '表名', dataIndex: 'name', key: 'name' },
  { title: '字段数', dataIndex: 'columns', key: 'columns' },
  { title: '迁移行数', dataIndex: 'rows', key: 'rows' },
]

/** 迁移明细按表类型分三组（kind 由后端标记），让用户分清业务表与两类日志表 */
const businessTables = computed(() =>
  (migrateResult.value?.tables || []).filter((t) => t.kind !== 'audit_log' && t.kind !== 'task_log'),
)
const auditLogTables = computed(() => (migrateResult.value?.tables || []).filter((t) => t.kind === 'audit_log'))
const taskLogTables = computed(() => (migrateResult.value?.tables || []).filter((t) => t.kind === 'task_log'))

async function loadMigrationState() {
  const wasInProgress = runningMigration.value.in_progress
  migrationStateLoading.value = true
  try {
    const res = await getRunningTasks()
    runningMigration.value = res.data.migration
    // 迁移刚结束时自动刷新历史记录
    if (wasInProgress && !res.data.migration.in_progress) {
      loadMigrationHistory()
    }
  } finally {
    migrationStateLoading.value = false
  }
}

async function loadMigrationHistory() {
  historyLoading.value = true
  try {
    const res = await getMigrationHistory()
    migrationHistory.value = res.data
  } finally {
    historyLoading.value = false
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
  loadMigrationHistory()
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
  cleanupModal,
  confirmModal,
  businessTables,
  auditLogTables,
  taskLogTables,
  handleMigrate,
  confirmStartMigration,
  loadMigrationState,
})
</script>

<style scoped>
/* 卡片头仅剩刷新按钮（h3 已移除，与 PageHeader 单标题）：按钮靠右 */
.migrate-refresh-btn {
  margin-left: auto;
}

/* ── 数据迁移 · 两栏布局（design D9：左流向表单 + 右固定风险面板） ── */
.migrate-layout {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding-bottom: 8px;
}
.migrate-form-col {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.flow-cards {
  display: flex;
  align-items: stretch;
  gap: 16px;
  flex-wrap: wrap;
}
.flow-card {
  flex: 1 1 220px;
  min-width: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.flow-card-timeout {
  flex: 0 1 220px;
}
.flow-card-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.flow-select {
  width: 100%;
}
.flow-arrow {
  color: var(--muted);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
  padding-bottom: 10px;
}
.checkbox-label input[type='checkbox'] {
  accent-color: var(--accent);
}
.migrate-action-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.migrate-btn {
  white-space: nowrap;
}
.mode-danger-row {
  display: flex;
}
.mode-danger-tag {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--danger, #ff4d4f);
  background: oklch(62% 0.19 25 / 8%);
  border: 1px solid oklch(62% 0.19 25 / 30%);
  border-radius: 6px;
  padding: 4px 10px;
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

/* 风险与说明固定面板 */
.risk-panel {
  flex: 0 0 320px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  padding: 14px 16px;
}
.risk-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 10px;
}
.risk-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}
.risk-list li {
  position: relative;
  padding-left: 14px;
}
.risk-list li::before {
  content: '·';
  position: absolute;
  left: 2px;
  font-weight: 700;
}
.risk-list .risk-danger {
  color: var(--danger, #ff4d4f);
}

@media (max-width: 900px) {
  .migrate-layout {
    flex-direction: column;
  }
  .risk-panel {
    flex: 1 1 auto;
    width: 100%;
  }
}

.migrate-progress {
  margin-top: 16px;
  max-width: 640px;
}
.migrate-cancel {
  margin-top: 12px;
}
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.progress-header {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
.progress-text {
  font-size: 13px;
  color: var(--muted);
}
.progress-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
.progress-table strong {
  color: var(--text);
}
.progress-rows {
  font-variant-numeric: tabular-nums;
}
/* 迁移结果摘要条：完成后只占一行，明细在抽屉里 */
.migrate-result-bar {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border: 1px solid #b7eb8f;
  border-radius: 6px;
  background: #f6ffed;
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
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #52c41a;
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
}
.result-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.migrate-desc {
  margin-bottom: 16px;
}
.next-steps {
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  background: var(--card-bg, #fff);
}
.next-steps-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
.next-steps-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ── 迁移详情 ── */
.migrate-table-detail {
  margin-top: 12px;
}
.migrate-table-group {
  margin-top: 12px;
}
.group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 6px;
}
.migrate-log-hint {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  font-size: 12px;
  color: var(--muted);
}
.migrate-detail-table {
  margin-top: 6px;
}
.backup-path {
  color: var(--muted);
  font-family: monospace;
  font-size: 12px;
}

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

/* ── 迁移锁警告 ── */
.migration-lock-alert {
  margin-bottom: 12px;
}

/* ── 迁移进度详情（API 恢复） ── */
.migration-progress-detail {
  margin-bottom: 12px;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #f0f0f0;
}
.progress-phase {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.phase-label {
  font-weight: 600;
  font-size: 13px;
}
.migration-progress-detail .progress-text {
  font-size: 12px;
  color: #666;
}

/* ── 迁移历史 ── */
.migration-history-section {
  margin-top: 24px;
}
.history-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-left: 10px;
  border-left: 3px solid oklch(56% 0.16 210);
}
.history-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.history-count {
  font-size: 12px;
  line-height: 1;
  color: var(--muted);
  background: oklch(56% 0.16 210 / 8%);
  border: 1px solid oklch(56% 0.16 210 / 18%);
  border-radius: 999px;
  padding: 3px 9px;
}
.history-cap-hint {
  font-size: 12px;
  color: var(--muted);
}
.history-cleanup-btn {
  margin-left: auto;
}

/* ── 迁移历史清理弹窗 ── */
.cleanup-form {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
}
.cleanup-preview {
  margin: 12px 0;
  font-size: 13px;
  color: var(--muted);
  min-height: 20px;
}
.cleanup-preview b {
  color: var(--fg);
}
.cleanup-preview .cleanup-danger {
  color: var(--danger, #ff4d4f);
}
.history-flow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.flow-node {
  font-family: monospace;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
}
.flow-source {
  background: oklch(55% 0.01 250 / 8%);
  color: var(--muted);
}
.flow-target {
  background: oklch(56% 0.16 210 / 12%);
  color: oklch(45% 0.13 210);
  font-weight: 600;
}
.history-arrow,
.flow-arrow {
  color: var(--muted);
  font-size: 12px;
}
.history-mode {
  font-size: 12px;
  color: var(--muted);
  background: oklch(55% 0.01 250 / 8%);
  border-radius: 4px;
  padding: 2px 8px;
}
.history-tables {
  font-family: monospace;
  font-weight: 600;
}
.history-time {
  font-family: monospace;
  font-size: 12px;
  color: var(--muted);
}

/* ── 历史行展开：失败原因与备份路径（design D4） ── */
.history-expand {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 8px;
}
.history-expand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}
.history-expand-label {
  color: var(--muted);
}
.history-error-text {
  color: var(--danger, #ff4d4f);
  line-height: 1.6;
}
.history-backup-path {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--fg);
  background: oklch(55% 0.01 250 / 6%);
  border-radius: 4px;
  padding: 2px 8px;
  word-break: break-all;
}
.copy-path-btn {
  flex-shrink: 0;
}
.migration-history-table :deep(.ant-table) {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.migration-history-table :deep(.ant-table-thead > tr > th) {
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
.migration-history-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}
.migration-history-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 8px;
  font-size: 13px;
  white-space: nowrap;
  background: transparent !important;
  border-bottom: 1px solid var(--border) !important;
}
.migration-history-table :deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: none !important;
}
.migration-history-table :deep(.ant-table-tbody > tr:hover > td) {
  background: oklch(97% 0.005 250 / 60%) !important;
}
.migration-history-table :deep(.ant-table-pagination) {
  background: var(--bg) !important;
  margin: 0 !important;
  padding: 12px 16px !important;
  border-top: 1px solid var(--border) !important;
}
</style>
