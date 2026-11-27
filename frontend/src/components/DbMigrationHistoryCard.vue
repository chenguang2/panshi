<template>
  <div class="table-container l5-card db-migration-history-card">
    <div class="mig-cardhead">
      <h3>历史迁移记录</h3>
      <span class="mig-sub">仅当前活动库的记录；切换数据库后从零开始记录</span>
      <div class="mig-head-actions">
        <span class="ph-lite"
          ><b>{{ migrationHistory.length }}</b> 条</span
        >
        <span v-if="historyCapped" class="history-cap-hint">仅显示最近 {{ HISTORY_PAGE_LIMIT }} 条</span>
        <button class="btn btn-secondary btn-sm history-cleanup-btn" @click="openCleanupModal">清理历史</button>
      </div>
    </div>
    <div class="mig-body">
      <a-table
        :data-source="pagedHistory"
        :columns="historyColumns"
        row-key="id"
        :pagination="false"
        :scroll="{ x: 981 }"
        :table-layout="'fixed'"
        size="middle"
        class="migration-history-table grid-table"
        :expanded-row-keys="expandedKeys"
        :custom-row="onRowClick"
        :expand-icon="renderExpandIcon"
      >
        <template #bodyCell="{ record, column, index }">
          <template v-if="column.key === 'index'">
            <span class="text-muted">{{ index + 1 }}</span>
          </template>
          <template v-else-if="column.key === 'direction'">
            <span class="hist-flow">
              <span class="lp-tag" :title="connLabel(record.source_connection)">{{
                connName(record.source_connection)
              }}</span>
              <span class="hist-arrow">→</span>
              <span class="lp-tag" :title="connLabel(record.target_connection)">{{
                connName(record.target_connection)
              }}</span>
            </span>
          </template>
          <template v-else-if="column.key === 'mode'">
            <span class="c-dim">{{ record.mode === 'replace' ? '替换' : record.mode }}</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <span
              class="pill"
              :class="statusPillClass(record.status)"
              :title="record.status === 'failed' ? translateMigrationError(record.error_message) : undefined"
            >
              <span class="dot"></span>{{ historyStatusLabel(record.status) }}
            </span>
          </template>
          <template v-else-if="column.key === 'tables_count'">
            <span class="c-mono">{{ record.tables_count ?? '-' }}</span>
          </template>
          <template v-else-if="column.key === 'duration'">
            <span class="c-mono">{{ formatDuration(record.duration_seconds) }}</span>
          </template>
          <template v-else-if="column.key === 'started_at'">
            <span class="c-mono">{{ formatStartTime(record) }}</span>
          </template>
          <template v-else-if="column.key === 'created_at'">
            <span class="c-mono">{{ record.created_at ? formatDateTime(record.created_at) : '-' }}</span>
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
            <div v-if="record.has_detail" class="history-expand-row">
              <button class="btn btn-secondary btn-sm view-detail-btn" @click="openHistoryDetail(record)">
                查看迁移详情
              </button>
            </div>
          </div>
        </template>
      </a-table>
      <ListPager
        v-if="migrationHistory.length > 0"
        :page="historyPage"
        :page-size="historyPageSize"
        :total="migrationHistory.length"
        unit="条"
        @change="onPagerChange"
      />
    </div>

    <!-- 迁移历史清理弹窗：保留最近 N 条，其余删除（预览数字来自服务端真实总数）；
         影响范围说明为预览附注小字（db-migration-page-restyle：a-alert 退场，文字保全） -->
    <div v-if="cleanupModal.open" class="modal-overlay">
      <div class="modal" style="max-width: 520px">
        <div class="modal-header">
          <h2>清理迁移历史</h2>
          <button class="modal-close" @click="closeCleanupModal">&times;</button>
        </div>
        <div class="modal-body cleanup-modal-body">
          <div class="cleanup-form">
            <span>保留最近</span>
            <input
              v-model.number="cleanupModal.keepLast"
              type="number"
              class="cleanup-input"
              min="1"
              :max="cleanupKeepMax"
              :disabled="cleanupModal.submitting"
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
                <b>{{ cleanupModal.preview.will_keep }}</b> 条（执行中的记录不会被删除）。
              </template>
              <template v-else>
                库内共 {{ cleanupModal.preview.total }} 条，按当前保留条数无需清理（执行中的记录不会被删除）。
              </template>
            </template>
            <span v-else class="text-muted">—</span>
          </div>
          <p class="cleanup-scope-note">
            仅影响当前活动库（{{ activeDbName }}）的迁移历史，不影响业务数据、审计日志与已生成的备份文件。
          </p>
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

    <!-- 历史明细共享抽屉（db-migration-history-detail）：has_detail 行按需拉取，数据取自该条记录 -->
    <DbMigrationDetailDrawer
      v-model:open="historyDetail.open"
      :source-name="historyDetail.sourceName"
      :target-name="historyDetail.targetName"
      :tables-count="historyDetail.tablesCount"
      :duration-text="historyDetail.durationText"
      :backup-path="historyDetail.backupPath"
      :tables="historyDetail.tables"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { message } from 'ant-design-vue'
import { formatDateTime, parseBackendDate } from '@/utils/format'
import { PAGE_SIZE_TABLE } from '@/constants'
import ListPager from '@/components/ListPager.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import DbMigrationDetailDrawer from '@/components/DbMigrationDetailDrawer.vue'
import {
  cleanupMigrationHistory,
  getMigrationHistory,
  getMigrationHistoryCleanupPreview,
  getMigrationHistoryDetail,
} from '@/api/database'
import type {
  DbConnection,
  MigrationHistoryCleanupPreview,
  MigrationHistoryItem,
  MigrateTableDetail,
} from '@/types/database'

/**
 * 历史迁移记录卡（db-migration-page-restyle：自 DbMigrationCard 拆出为独立卡片）。
 * 自持历史加载 / 外置分页 / 清理弹窗 / 行展开；迁移完成后由宿主调用 expose 的 refresh()
 * 重拉（DbMigrationCard 发出 migrated 事件，页面接线）。数据流与拆分前一致：
 * GET /database/history 全量（后端 LIMIT 100）+ 客户端分页。
 */
const props = withDefaults(
  defineProps<{
    connections: DbConnection[]
    /** 当前活动库名（清理弹窗 scope 提示用） */
    activeDbName?: string
  }>(),
  { activeDbName: '未配置' },
)

// ── 历史 ──
const migrationHistory = ref<MigrationHistoryItem[]>([])
const historyLoading = ref(false)
/** 后端列表单页上限（GET /database/history 固定 limit=100）：达上限时提示"仅显示最近 100 条" */
const HISTORY_PAGE_LIMIT = 100
const historyCapped = computed(() => migrationHistory.value.length >= HISTORY_PAGE_LIMIT)

// ── 分页（外置 ListPager；客户端本地切片） ──
const historyPage = ref(1)
const historyPageSize = ref(PAGE_SIZE_TABLE)
const pagedHistory = computed(() =>
  migrationHistory.value.slice(
    (historyPage.value - 1) * historyPageSize.value,
    historyPage.value * historyPageSize.value,
  ),
)

function onPagerChange(page: number, pageSize: number): void {
  historyPage.value = page
  historyPageSize.value = pageSize
}

/**
 * 展开/收起触达（db-migration-history-expand-affordance，交互裁决 2026-11-27）：
 * ① 整行可点——受控展开键（expandedKeys）+ customRow 行点击自管切换。实测本版 antd-vue 的
 *    原生 expandRowByClick 在 expandedRowRender 场景下首次切换后即失效（浏览器 capture-phase
 *    实证，见变更 design D1a），受控自管绕开内部状态路径，且展开区（独立 tr、无 customRow）
 *    天然不受行点击影响；② 触发器为 chevron 纯指示形态——自身不绑 click（避免与行点击双重切换），
 *    muted、行悬停转 accent、展开态旋转 180°（样式在 scoped :deep 段）。
 */
const expandedKeys = ref<Array<number>>([])

function onRowClick(record: MigrationHistoryItem): { onClick: () => void } {
  return {
    onClick: () => {
      expandedKeys.value = expandedKeys.value.includes(record.id)
        ? expandedKeys.value.filter((k) => k !== record.id)
        : [...expandedKeys.value, record.id]
    },
  }
}

function renderExpandIcon({ expanded }: { expanded: boolean }): ReturnType<typeof h> {
  return h('span', { class: ['v-chevron', { open: expanded }] }, [h(StrokeIcon, { name: 'chevronDown', size: 14 })])
}

async function loadMigrationHistory(): Promise<void> {
  historyLoading.value = true
  try {
    const res = await getMigrationHistory()
    migrationHistory.value = res.data
  } finally {
    historyLoading.value = false
  }
}

/** 宿主接线入口：迁移完成后重拉历史 */
async function refresh(): Promise<void> {
  await loadMigrationHistory()
}
defineExpose({ refresh })

// ── 历史明细共享抽屉（db-migration-history-detail）：has_detail 行按需拉取，概要取记录值 ──
const historyDetail = ref<{
  open: boolean
  sourceName: string
  targetName: string
  tablesCount: number | null
  durationText: string
  backupPath: string
  tables: MigrateTableDetail[]
}>({
  open: false,
  sourceName: '-',
  targetName: '-',
  tablesCount: null,
  durationText: '-',
  backupPath: '',
  tables: [],
})

async function openHistoryDetail(record: MigrationHistoryItem): Promise<void> {
  // 先用记录字段装配概要（打开抽屉即时呈现），明细数组按需拉取补齐
  historyDetail.value = {
    open: true,
    sourceName: connName(record.source_connection),
    targetName: connName(record.target_connection),
    tablesCount: record.tables_count ?? null,
    durationText: formatDuration(record.duration_seconds),
    backupPath: record.backup_path || '',
    tables: [],
  }
  try {
    const res = await getMigrationHistoryDetail(record.id)
    historyDetail.value.tables = res.data.tables || []
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
    message.error(typeof detail === 'string' && detail.trim() ? detail : '读取迁移明细失败')
  }
}

// ── 清理弹窗 ──
const CLEANUP_DEFAULT_KEEP = 10
const cleanupModal = ref<{
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

const cleanupKeepMax = computed(() => Math.max(cleanupModal.value.preview?.total ?? 1, 1))

/** 取后端 detail，取不到时用 fallback。 */
function errDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.trim() ? detail : fallback
}

function openCleanupModal(): void {
  cleanupModal.value.keepLast = CLEANUP_DEFAULT_KEEP
  cleanupModal.value.preview = null
  cleanupModal.value.open = true
  void refreshCleanupPreview()
}

function closeCleanupModal(): void {
  if (cleanupModal.value.submitting) return
  cleanupModal.value.open = false
}

async function refreshCleanupPreview(): Promise<void> {
  if (!Number.isFinite(cleanupModal.value.keepLast) || cleanupModal.value.keepLast < 1) {
    cleanupModal.value.preview = null
    return
  }
  cleanupModal.value.previewing = true
  try {
    const res = await getMigrationHistoryCleanupPreview(cleanupModal.value.keepLast)
    cleanupModal.value.preview = res.data
  } catch (err: unknown) {
    cleanupModal.value.preview = null
    message.error(errDetail(err, '计算清理影响失败'))
  } finally {
    cleanupModal.value.previewing = false
  }
}

async function handleCleanup(): Promise<void> {
  if (!cleanupModal.value.preview || cleanupModal.value.preview.will_delete === 0) return
  cleanupModal.value.submitting = true
  try {
    const res = await cleanupMigrationHistory(cleanupModal.value.keepLast)
    message.success(`已清理 ${res.data.deleted} 条迁移历史`)
    cleanupModal.value.open = false
    await loadMigrationHistory()
  } catch (err: unknown) {
    message.error(errDetail(err, '清理失败，请稍后重试'))
  } finally {
    cleanupModal.value.submitting = false
  }
}

// ── 单元格呈现 ──

const historyColumns = [
  { title: '#', key: 'index', width: 45 },
  { title: '迁移方向', key: 'direction', width: 276 },
  { title: '模式', key: 'mode', width: 84 },
  { title: '状态', key: 'status', width: 96 },
  { title: '表数量', key: 'tables_count', width: 88 },
  { title: '时长', key: 'duration', width: 92 },
  { title: '开始时间', key: 'started_at', width: 150 },
  { title: '完成时间', key: 'created_at', width: 150 },
]

/** 方向列展示名（连接已删除时回退原始 ID） */
function connName(connId: string): string {
  return props.connections.find((c) => c.id === connId)?.name || connId
}

/** 方向列 tooltip：连接名（SQLite 文件名 / PG 地址） */
function connLabel(connId: string): string {
  const c = props.connections.find((x) => x.id === connId)
  if (!c) return connId
  const detail =
    c.type === 'sqlite'
      ? (c.path || '').split('/').pop() || ''
      : c.display_address || (c.host ? `${c.host}${c.port ? ':' + c.port : ''}` : '')
  return detail ? `${c.name}（${detail}）` : c.name
}

// 后端仅产 success/failed（design D1：删除永不命中的 cancelled 死映射）
function historyStatusLabel(status: string): string {
  const labels: Record<string, string> = { success: '成功', failed: '失败' }
  return labels[status] || status
}

function statusPillClass(status: string): string {
  if (status === 'success') return 'pill-run'
  if (status === 'failed') return 'pill-stop'
  return ''
}

/**
 * 迁移失败原因中文分类转译（design D4 / 文案表）：
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

onMounted(() => {
  void loadMigrationHistory()
})
</script>

<style scoped>
.mig-head-actions .ph-lite b {
  font-weight: 600;
}
.history-cap-hint {
  font-size: 12px;
  color: var(--muted);
}
/* 历史表：解剖由全局 grid-table 接管（accent 大写表头旧样式已删，db-migration-page-restyle）；
   单元格裁剪同设计 .l5-table td（overflow+ellipsis）：时间列 mono 内容超出列宽时不顶出横向滚动 */
.migration-history-table :deep(.ant-table-tbody > tr > td) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 展开 chevron 纯指示器（db-migration-history-expand-affordance）：整行可点（行 cursor），
   指示器自身不带 click；muted → 行悬停转 accent → 展开态旋转 */
.migration-history-table :deep(.ant-table-tbody > tr.ant-table-row) {
  cursor: pointer;
}
.migration-history-table :deep(.v-chevron) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border-radius: var(--radius-sm);
  color: var(--muted);
  cursor: pointer;
  transition:
    color 0.12s,
    background 0.12s;
}
.migration-history-table :deep(.ant-table-tbody > tr:hover .v-chevron) {
  color: var(--accent);
  background: var(--accent-bg);
}
.migration-history-table :deep(.v-chevron.open) {
  color: var(--accent);
}
.migration-history-table :deep(.v-chevron.open svg) {
  transform: rotate(180deg);
}
.hist-flow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.hist-arrow {
  color: var(--muted);
  font-family: var(--font-mono);
}
/* 行展开：失败原因与备份路径（语义保留，样式随历史卡迁移） */
.history-expand {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 2px;
}
.history-expand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  flex-wrap: wrap;
}
.history-expand-label {
  color: var(--muted);
}
.history-error-text {
  color: var(--danger);
  line-height: 1.6;
}
.history-backup-path {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--fg);
  background: oklch(55% 0.01 250 / 6%);
  border-radius: 4px;
  padding: 2px 8px;
  word-break: break-all;
}
.copy-path-btn {
  flex-shrink: 0;
}
/* 清理弹窗：原生数字输入（mono 居中）+ 附注小字（a-alert 退场） */
.cleanup-form {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
}
.cleanup-input {
  width: 120px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--fg);
  text-align: center;
}
.cleanup-preview {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.7;
  min-height: 20px;
}
.cleanup-preview b {
  color: var(--fg);
}
.cleanup-preview .cleanup-danger {
  color: var(--danger);
}
.cleanup-scope-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
