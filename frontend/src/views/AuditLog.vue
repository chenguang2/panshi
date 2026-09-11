<template>
  <div class="audit-log">
    <PageHeader title="审计日志" description="记录全部增删改操作的审计轨迹，支持筛选、追溯与导出">
      <template #actions>
        <button class="btn btn-primary" :disabled="exporting" @click="handleExport('csv')">导出 CSV</button>
        <button class="btn btn-primary" :disabled="exporting" @click="handleExport('xlsx')">导出 Excel</button>
        <span class="action-sep" aria-hidden="true" />
        <button class="btn btn-danger-outline" @click="archiveOpen = true">归档清理</button>
      </template>
    </PageHeader>

    <!-- 筛选条（对齐路由管理页 filter-bar 风格） -->
    <div class="audit-filter-bar">
      <select v-model="filters.user" class="form-input" style="width: 130px" @change="onFilterChange">
        <option value="">全部用户</option>
        <option v-for="u in meta.users" :key="u" :value="u">{{ u }}</option>
      </select>
      <select v-model="filters.action" class="form-input" style="width: 190px" @change="onFilterChange">
        <option value="">全部操作</option>
        <option v-for="a in meta.actions" :key="a" :value="a">{{ auditActionLabel(a) }}（{{ a }}）</option>
      </select>
      <select v-model="filters.resource" class="form-input" style="width: 150px" @change="onFilterChange">
        <option value="">全部资源</option>
        <option v-for="r in meta.resources" :key="r" :value="r">{{ auditResourceLabel(r) }}</option>
      </select>
      <a-range-picker v-model:value="dateRange" size="small" style="width: 240px" @change="onFilterChange" />
      <span class="text-muted text-sm">
        共 {{ total }} 条记录
        <template v-if="metaTotal !== null">
          · 库内累计 {{ metaTotal }} 条<template v-if="metaOldest"
            >（最早 {{ formatDateTimeDash(metaOldest) }}）</template
          >
        </template>
      </span>
      <span v-if="archiveHint" class="archive-hint">记录量较大，建议归档历史数据</span>
    </div>

    <div class="table-container">
      <a-table
        :data-source="rows"
        :columns="columns"
        :row-key="(record: AuditLogItem) => record.id"
        :pagination="paginationProps({ page, pageSize, total }, '条记录')"
        :loading="loading"
        :custom-row="rowProps"
        size="middle"
        class="audit-table"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'index'">
            <span class="text-muted">{{ (page - 1) * pageSize + index + 1 }}</span>
          </template>
          <template v-else-if="column.key === 'created_at'">
            <span class="text-mono">{{ formatDateTimeDash(record.created_at) }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-tooltip :title="record.action">
              {{ auditActionLabel(record.action) }}
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'resource'">
            <a v-if="auditResourceLink(record.resource, record.resource_id)" href="#" @click.prevent="goto(record)">{{
              auditResourceLabel(record.resource)
            }}</a>
            <a-tooltip v-else :title="record.resource">
              {{ auditResourceLabel(record.resource) }}
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'detail'">
            <a-tooltip v-if="!isDefaultDetail(record)" :title="record.detail">
              <span class="detail-cell">{{ truncate(record.detail, 50) }}</span>
            </a-tooltip>
            <span v-else class="text-muted">—</span>
          </template>
        </template>
      </a-table>
    </div>

    <a-drawer v-model:open="drawerOpen" title="操作详情" width="480" placement="right">
      <template v-if="current">
        <div class="drawer-row">
          <span class="k">时间</span><span>{{ formatDateTimeDash(current.created_at) }}</span>
        </div>
        <div class="drawer-row">
          <span class="k">用户</span><span>{{ current.username || '-' }}</span>
        </div>
        <div class="drawer-row">
          <span class="k">操作</span>
          <span
            >{{ auditActionLabel(current.action) }} <span class="muted">({{ current.action }})</span></span
          >
        </div>
        <div class="drawer-row">
          <span class="k">资源</span>
          <span>{{ auditResourceLabel(current.resource) }} #{{ current.resource_id ?? '-' }}</span>
        </div>
        <div class="drawer-row">
          <span class="k">IP</span><span>{{ current.ip_address || '-' }}</span>
        </div>
        <div class="drawer-detail">
          <div class="k detail-head">
            详情
            <a-button size="small" type="link" @click="copyDetail">复制</a-button>
          </div>
          <pre class="detail-body">{{ current.detail || '-' }}</pre>
        </div>
      </template>
    </a-drawer>
    <!-- 归档清理弹窗（视图级内联，先存档后删除 + tombstone 审计） -->
    <div v-if="archiveOpen" class="modal-overlay" @click.self="archiveOpen = false">
      <div class="modal-card">
        <div class="modal-title">归档清理审计日志</div>
        <p class="modal-desc">
          先将截止日期之前的记录导出为 CSV 存档（服务端留存于 data/archives/ 并提供下载），随后从库中删除，
          并自动写入一条归档审计记录。删除不可撤销，请谨慎选择截止日期。
        </p>
        <div class="modal-row">
          <span class="k">截止日期</span>
          <a-date-picker v-model:value="archiveDate" placeholder="选择日期" style="width: 160px" />
        </div>
        <p v-if="archivePreview" class="modal-preview">
          <template v-if="archivePreview.count > 0">
            将归档 <b>{{ archivePreview.count }}</b> 条
            <template v-if="archivePreview.oldest">
              （{{ formatDateTimeDash(archivePreview.oldest) }} ~
              {{ formatDateTimeDash(archivePreview.newest || '') }}）
            </template>
          </template>
          <template v-else>该日期之前没有可归档的记录</template>
        </p>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="archiveOpen = false">取消</button>
          <button
            class="btn btn-primary"
            :disabled="!canArchive || executing"
            style="background: var(--danger); border-color: var(--danger)"
            @click="doArchive"
          >
            {{ executing ? '归档中…' : '确认归档' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { TablePaginationConfig } from 'ant-design-vue'
import type { Dayjs } from 'dayjs'
import PageHeader from '@/components/PageHeader.vue'
import {
  archiveAuditLogs,
  downloadExport,
  exportAuditLogs,
  getAuditLogMeta,
  getExportStatus,
  listAuditLogs,
  previewArchiveAuditLogs,
  type AuditArchivePreview,
  type AuditLogItem,
  type AuditLogMeta,
} from '@/api/auditLog'
import { downloadBlob } from '@/utils/download'
import { exportToCsv } from '@/utils/export'
import { formatDateTimeDash } from '@/utils/format'
import { paginationProps } from '@/composables/usePagination'
import { auditActionLabel, auditResourceLabel, auditResourceLink } from '@/config/auditResourceRoutes'

const rows = ref<AuditLogItem[]>([])
const loading = ref(false)
const exporting = ref(false)
const meta = reactive<AuditLogMeta>({ users: [], actions: [], resources: [] })
const filters = reactive<{ user: string; action: string; resource: string }>({ user: '', action: '', resource: '' })
const dateRange = ref<[Dayjs, Dayjs] | null>(null)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const drawerOpen = ref(false)
const current = ref<AuditLogItem | null>(null)

// ── 库内统计（D：用量提示）与归档清理（B）──────────────────────────
const metaTotal = ref<number | null>(null)
const metaOldest = ref<string | null>(null)
/** 与后端导出上限一致：超过 5 万条提示归档 */
const ARCHIVE_HINT_THRESHOLD = 50000
const archiveHint = computed(() => metaTotal.value !== null && metaTotal.value >= ARCHIVE_HINT_THRESHOLD)

const archiveOpen = ref(false)
const archiveDate = ref<Dayjs | null>(null)
const archivePreview = ref<AuditArchivePreview | null>(null)
const executing = ref(false)

const canArchive = computed(() => !!archiveDate.value && (archivePreview.value?.count ?? 0) > 0)

watch(archiveDate, async (d) => {
  archivePreview.value = null
  if (!d) return
  try {
    const r = await previewArchiveAuditLogs(d.format('YYYY-MM-DD'))
    archivePreview.value = r.data
  } catch {
    message.error('归档预览失败')
  }
})

async function doArchive(): Promise<void> {
  if (!archiveDate.value || !canArchive.value) return
  executing.value = true
  try {
    const r = await archiveAuditLogs(archiveDate.value.format('YYYY-MM-DD'))
    if (r.data.archived === 0 || !r.data.task_id) {
      message.info('该日期之前没有可归档的记录')
      return
    }
    // 走 axios blob 下载（带 Authorization），顶层导航会被 401 拒绝
    const blob = await downloadExport(r.data.task_id)
    downloadBlob(blob, r.data.file || `audit-archive-${Date.now()}.csv`)
    message.success(`已归档 ${r.data.archived} 条记录，存档开始下载`)
    archiveOpen.value = false
    archiveDate.value = null
    archivePreview.value = null
    await Promise.all([loadMeta(), reload(1)])
  } finally {
    executing.value = false
  }
}

const columns = [
  { title: '#', key: 'index', width: 56 },
  {
    title: '时间',
    key: 'created_at',
    dataIndex: 'created_at',
    width: 165,
    sorter: (a: AuditLogItem, b: AuditLogItem) => (a.created_at || '').localeCompare(b.created_at || ''),
  },
  {
    title: '用户',
    key: 'username',
    dataIndex: 'username',
    width: 90,
    sorter: (a: AuditLogItem, b: AuditLogItem) => (a.username || '').localeCompare(b.username || ''),
  },
  {
    title: '操作',
    key: 'action',
    dataIndex: 'action',
    width: 130,
    sorter: (a: AuditLogItem, b: AuditLogItem) => (a.action || '').localeCompare(b.action || ''),
  },
  {
    title: '资源',
    key: 'resource',
    dataIndex: 'resource',
    width: 100,
    sorter: (a: AuditLogItem, b: AuditLogItem) => (a.resource || '').localeCompare(b.resource || ''),
  },
  {
    title: '资源ID',
    key: 'resource_id',
    dataIndex: 'resource_id',
    width: 80,
    sorter: (a: AuditLogItem, b: AuditLogItem) => (a.resource_id || 0) - (b.resource_id || 0),
  },
  { title: '详情', key: 'detail', dataIndex: 'detail', ellipsis: true },
  {
    title: 'IP',
    key: 'ip_address',
    dataIndex: 'ip_address',
    width: 130,
    sorter: (a: AuditLogItem, b: AuditLogItem) => (a.ip_address || '').localeCompare(b.ip_address || ''),
  },
]

/** 默认模板（后端兜底生成）与操作/资源/ID 三列语义完全重复 → 详情列显示 '—' */
function isDefaultDetail(record: AuditLogItem): boolean {
  const d = record.detail || ''
  if (!d) return true
  return (
    d === `${record.resource} ${record.action} (batch)` ||
    d === `${record.resource} ${record.action} (id=${record.resource_id})`
  )
}

function truncate(s: string | null, n: number): string {
  const v = s || '-'
  return v.length > n ? `${v.slice(0, n)}…` : v
}

function goto(record: AuditLogItem): void {
  const link = auditResourceLink(record.resource, record.resource_id)
  if (link) window.location.href = link
}

async function loadMeta(): Promise<void> {
  const r = await getAuditLogMeta()
  meta.users = r.data.users
  meta.actions = r.data.actions
  meta.resources = r.data.resources
  metaTotal.value = r.data.total ?? null
  metaOldest.value = r.data.oldest ?? null
}

async function reload(targetPage = page.value): Promise<void> {
  loading.value = true
  try {
    page.value = targetPage
    const params: Record<string, unknown> = {
      page: targetPage,
      page_size: pageSize.value,
      user: filters.user || undefined,
      action: filters.action || undefined,
      resource: filters.resource || undefined,
    }
    if (dateRange.value) {
      params.start = dateRange.value[0].startOf('day').toISOString()
      params.end = dateRange.value[1].endOf('day').toISOString()
    }
    const r = await listAuditLogs(params)
    rows.value = r.data.items
    total.value = r.data.total
  } finally {
    loading.value = false
  }
}

function onFilterChange(): void {
  reload(1)
}

/** 点击行打开详情抽屉；行内链接（资源跳转）不触发行打开 */
function rowProps(record: AuditLogItem) {
  return {
    style: 'cursor: pointer',
    onClick: (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('a')) return
      current.value = record
      drawerOpen.value = true
    },
  }
}

function handleTableChange(pagination: TablePaginationConfig): void {
  pageSize.value = pagination.pageSize ?? pageSize.value
  reload(pagination.current ?? 1)
}

async function handleExport(format: 'csv' | 'xlsx'): Promise<void> {
  exporting.value = true
  try {
    if (format === 'csv' && total.value <= 5000) {
      // 小数据量：前端分页拉全量后直出 CSV（spec：复用共享导出工具）
      const all: AuditLogItem[] = []
      const base: Record<string, unknown> = {
        page_size: 200,
        user: filters.user || undefined,
        action: filters.action || undefined,
        resource: filters.resource || undefined,
      }
      if (dateRange.value) {
        base.start = dateRange.value[0].startOf('day').toISOString()
        base.end = dateRange.value[1].endOf('day').toISOString()
      }
      const pages = Math.max(1, Math.ceil(total.value / 200))
      for (let p = 1; p <= pages; p++) {
        const r = await listAuditLogs({ ...base, page: p } as never)
        all.push(...r.data.items)
      }
      const rowsForCsv = all.map((x) => ({
        时间: formatDateTimeDash(x.created_at),
        用户: x.username ?? '',
        操作: auditActionLabel(x.action),
        原始操作: x.action,
        资源: auditResourceLabel(x.resource),
        资源ID: x.resource_id ?? '',
        详情: x.detail ?? '',
        IP: x.ip_address ?? '',
      }))
      exportToCsv(rowsForCsv, `audit-log-${Date.now()}.csv`)
      message.success('已开始下载 CSV')
      return
    }
    // 大数据量（Excel / CSV >5000 行）：后端生成文件后 blob 下载（带 Authorization）
    const payload = { format, user: filters.user, action: filters.action, resource: filters.resource }
    const r = await exportAuditLogs(payload)
    const taskId = r.data.task_id
    const st = await getExportStatus(taskId)
    if (st.data.status !== 'ready') {
      message.warning('导出尚未就绪，请稍后重试')
      return
    }
    const blob = await downloadExport(taskId)
    downloadBlob(blob, `audit-log-${Date.now()}.${format === 'xlsx' ? 'xlsx' : 'csv'}`)
    message.success(format === 'csv' ? '已开始下载 CSV' : '已开始下载 Excel')
  } finally {
    exporting.value = false
  }
}

async function copyDetail(): Promise<void> {
  if (!current.value?.detail) return
  try {
    await navigator.clipboard.writeText(current.value.detail)
    message.success('已复制')
  } catch {
    message.error('复制失败')
  }
}

onMounted(async () => {
  await loadMeta()
  await reload(1)
})
</script>

<style scoped>
.audit-log {
  min-height: 100px;
  padding: 20px 24px;
}

.audit-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.audit-filter-bar :deep(.ant-picker) {
  height: 36px;
}

.text-muted {
  color: var(--muted);
}
.text-sm {
  font-size: 12px;
}
.text-mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.detail-cell {
  cursor: default;
}

/* 分页脚注（对齐路由管理页） */
.table-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.audit-table :deep(.ant-table) {
  background: transparent !important;
  border: none !important;
}

.audit-table :deep(.ant-table-pagination) {
  background: var(--bg) !important;
  margin: 0 !important;
  padding: 12px 16px !important;
  border-top: 1px solid var(--border) !important;
}

.drawer-row {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}

.drawer-row .k {
  min-width: 48px;
  color: var(--muted);
  flex-shrink: 0;
}

.muted {
  color: var(--muted);
  font-size: 12px;
}

.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-body {
  max-height: 400px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--bg);
  padding: 10px;
  border-radius: 6px;
  font-size: 12px;
}

/* 归档清理弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  width: 440px;
  max-width: calc(100vw - 48px);
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  box-shadow: var(--shadow-lg, 0 8px 30px rgba(0, 0, 0, 0.2));
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 10px;
}

.modal-desc {
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.6;
  margin-bottom: 14px;
}

.modal-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.modal-row .k {
  color: var(--muted);
  font-size: 13px;
  flex-shrink: 0;
}

.modal-preview {
  font-size: 13px;
  margin-bottom: 14px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.archive-hint {
  font-size: 12px;
  color: var(--danger);
}

/* 操作区分隔线：常规导出组与破坏性归档清理分区 */
.action-sep {
  width: 1px;
  height: 22px;
  background: var(--border);
  align-self: center;
}
</style>
