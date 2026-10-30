<template>
  <div class="audit-log">
    <PageHeader title="审计日志" description="记录全部增删改操作的审计轨迹，支持筛选、追溯与导出">
      <template #actions>
        <button class="btn btn-secondary" :disabled="exporting" @click="handleExport('csv')">导出 CSV</button>
        <button class="btn btn-secondary" :disabled="exporting" @click="handleExport('xlsx')">导出 Excel</button>
        <span class="action-sep" aria-hidden="true" />
        <button class="btn btn-secondary" @click="archiveHistoryOpen = true">归档历史</button>
        <button class="btn btn-danger-outline" @click="archiveOpen = true">归档清理</button>
      </template>
    </PageHeader>

    <!-- 筛选条（对齐路由管理页 filter-bar 风格） -->
    <div class="audit-filter-bar">
      <a-select
        v-model:value="filters.user"
        class="audit-select"
        style="width: 130px"
        show-search
        :popup-match-select-width="false"
        :options="userOptions"
        @change="onFilterChange"
      />
      <a-select
        v-model:value="filters.resource"
        class="audit-select"
        style="width: 150px"
        show-search
        :popup-match-select-width="false"
        :options="resourceOptions"
        @change="onFilterChange"
      />
      <a-select
        v-model:value="filters.action"
        class="audit-select"
        style="width: 200px"
        show-search
        :popup-match-select-width="false"
        :options="actionOptions"
        @change="onFilterChange"
      />
      <a-select
        v-model:value="filters.ip"
        class="audit-select"
        style="width: 140px"
        show-search
        :popup-match-select-width="false"
        :options="ipOptions"
        @change="onFilterChange"
      />
      <input
        v-model="keyword"
        class="form-input keyword-input"
        style="width: 200px"
        placeholder="搜索详情 / 资源ID"
        @keyup.enter="onKeywordSearch"
      />
      <a-range-picker
        v-model:value="dateRange"
        size="small"
        style="width: 240px"
        :presets="datePresets"
        @change="onFilterChange"
      />
      <span class="text-muted text-sm">
        筛选结果 {{ total }} 条<template v-if="metaTotal !== null">
          · 全库共 {{ metaTotal }} 条<template v-if="metaOldest"
            >（最早 {{ formatDateTimeDash(metaOldest) }}）</template
          ></template
        >
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
            <a-tooltip :title="`${auditActionLabel(record.action)}（${record.action}）`">
              <span class="action-tag" :class="`tone-${auditActionTone(record.action)}`">{{
                auditVerbLabel(record.action)
              }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'resource'">
            <a v-if="auditResourceLink(record.resource, record.resource_id)" href="#" @click.prevent="goto(record)"
              >{{ auditResourceLabel(record.resource) }} #{{ record.resource_id }}</a
            >
            <a-tooltip v-else :title="record.resource">
              <span
                >{{ auditResourceLabel(record.resource)
                }}<template v-if="record.resource_id != null"> #{{ record.resource_id }}</template></span
              >
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
    <!-- 归档历史（批 3）：服务端留存存档的再下载入口，与归档清理相邻 -->
    <a-drawer v-model:open="archiveHistoryOpen" title="归档历史" width="480" placement="right">
      <div v-if="archiveLoading" class="muted">加载中…</div>
      <template v-else>
        <div v-if="!archives.length" class="archive-empty">暂无归档存档 · 执行「归档清理」后存档会保留在这里</div>
        <div v-for="f in archives" :key="f.filename" class="archive-row">
          <div>
            <div class="archive-name">{{ f.filename }}</div>
            <div class="archive-meta">{{ formatFileSize(f.size) }} · 归档于 {{ formatDateTimeDash(f.created_at) }}</div>
          </div>
          <button class="btn btn-secondary" @click="downloadArchive(f)">下载</button>
        </div>
        <p v-if="archives.length" class="muted" style="margin-top: 14px; font-size: 12px">
          存档为归档清理时点的全量 CSV 快照；删除库内记录不影响此处文件。
        </p>
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
import dayjs, { type Dayjs } from 'dayjs'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import {
  archiveAuditLogs,
  downloadAuditArchive,
  downloadExport,
  exportAuditLogs,
  getAuditLogMeta,
  getExportStatus,
  listAuditArchives,
  listAuditLogs,
  previewArchiveAuditLogs,
  type AuditArchiveItem,
  type AuditArchivePreview,
  type AuditLogItem,
  type AuditLogMeta,
} from '@/api/auditLog'
import { downloadBlob } from '@/utils/download'
import { formatDateTimeDash, formatFileSize } from '@/utils/format'
import { paginationProps } from '@/composables/usePagination'
import {
  auditActionLabel,
  auditActionResource,
  auditActionTone,
  auditResourceLabel,
  auditResourceLink,
  auditVerbLabel,
} from '@/config/auditResourceRoutes'

const rows = ref<AuditLogItem[]>([])
const loading = ref(false)
const exporting = ref(false)
const route = useRoute()
const router = useRouter()
/** 深链预选资源（/audit-log?resource=autostart 等，各页「操作日志」入口携带） */
const requestedResource = typeof route.query.resource === 'string' ? route.query.resource : ''
const meta = reactive<AuditLogMeta>({ users: [], actions: [], resources: [], ips: [] })
const filters = reactive<{ user: string; action: string; resource: string; ip: string }>({
  user: '',
  action: '',
  resource: '',
  ip: '',
})

// a-select showSearch 选项（批 2：原生 select 不可搜索，动作 40+ 项时只能滚动找）
const userOptions = computed(() => [
  { label: '全部用户', value: '' },
  ...meta.users.map((u) => ({ label: u, value: u })),
])
const actionOptions = computed(() => {
  const all = meta.actions.map((a) => ({ label: `${auditActionLabel(a)}（${a}）`, value: a }))
  // 资源已选时动作按所属资源段联动（2026-10-29 用户验收反馈）；无法解析资源段的动作只在「全部操作」出现
  if (!filters.resource) return [{ label: '全部操作', value: '' }, ...all]
  return [{ label: '全部操作', value: '' }, ...all.filter((o) => auditActionResource(o.value) === filters.resource)]
})
const resourceOptions = computed(() => [
  { label: '全部资源', value: '' },
  ...meta.resources.map((r) => ({ label: auditResourceLabel(r), value: r })),
])
const ipOptions = computed(() => [{ label: '全部 IP', value: '' }, ...meta.ips.map((i) => ({ label: i, value: i }))])
// 默认近 7 天（主 spec「Default time range is last 7 days」的漂移修复；含当天）
const dateRange = ref<[Dayjs, Dayjs] | null>([dayjs().subtract(6, 'day'), dayjs()])
/** 时间快捷项（design §4）：今天 / 近 7 天 / 近 30 天 */
const datePresets = [
  { label: '今天', value: (): [Dayjs, Dayjs] => [dayjs(), dayjs()] },
  { label: '近 7 天', value: (): [Dayjs, Dayjs] => [dayjs().subtract(6, 'day'), dayjs()] },
  { label: '近 30 天', value: (): [Dayjs, Dayjs] => [dayjs().subtract(29, 'day'), dayjs()] },
]
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
    message.error('归档预览失败，请稍后重试；持续失败请检查后端服务')
  }
})

const keyword = ref('')
function onKeywordSearch(): void {
  reload(1)
}

// ── 归档历史（批 3）：服务端留存存档的列表与再下载 ─────────────────
const archiveHistoryOpen = ref(false)
const archives = ref<AuditArchiveItem[]>([])
const archiveLoading = ref(false)

watch(archiveHistoryOpen, async (open) => {
  if (open) await loadArchives()
})

async function loadArchives(): Promise<void> {
  archiveLoading.value = true
  try {
    const r = await listAuditArchives()
    archives.value = r.data.items ?? []
  } catch {
    message.error('归档历史加载失败，请稍后重试')
    archives.value = []
  } finally {
    archiveLoading.value = false
  }
}

async function downloadArchive(f: AuditArchiveItem): Promise<void> {
  try {
    const blob = await downloadAuditArchive(f.filename)
    downloadBlob(blob, f.filename)
  } catch {
    message.error('存档下载失败，请重试')
  }
}

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
  { title: '#', key: 'index', width: 45 },
  // 列序 = 自然语序「何时·谁·对哪个资源·做了什么」（2026-10-29 UX 评审批后调整）
  // 排序语义唯一为「时间倒序」（后端 id desc）——本页前端 sorter 只会重排当前页、跨页语义错误（audit-log-ux-review-fixes 批 2）
  { title: '时间', key: 'created_at', dataIndex: 'created_at', width: 165 },
  { title: '用户', key: 'username', dataIndex: 'username', width: 90 },
  { title: '资源', key: 'resource', dataIndex: 'resource', width: 160 },
  { title: '操作', key: 'action', dataIndex: 'action', width: 150 },
  { title: '详情', key: 'detail', dataIndex: 'detail', ellipsis: true },
  { title: 'IP', key: 'ip_address', dataIndex: 'ip_address', width: 130 },
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
  if (link) router.push(link)
}

async function loadMeta(): Promise<void> {
  const r = await getAuditLogMeta()
  meta.users = r.data.users ?? []
  meta.actions = r.data.actions ?? []
  meta.resources = r.data.resources ?? []
  meta.ips = r.data.ips ?? []
  metaTotal.value = r.data.total ?? null
  metaOldest.value = r.data.oldest ?? null
  // 深链预选（/audit-log?resource=autostart 等，各页「操作日志」入口）：资源下拉来自库内去重，
  // 目标资源可能尚无记录——补进 options 防止原生 select 值不在 options 时整块空白
  if (requestedResource) {
    if (!meta.resources.includes(requestedResource)) {
      meta.resources = [...meta.resources, requestedResource].sort()
    }
    filters.resource = requestedResource
  }
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
      ip: filters.ip || undefined,
      keyword: keyword.value.trim() || undefined,
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
  // 资源切换后，已选动作若不再属于该资源则清掉（a-select 会显示悬空原始值）
  if (filters.resource && filters.action && auditActionResource(filters.action) !== filters.resource) {
    filters.action = ''
  }
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
    // 范围感知（audit-log-ux-review-fixes 批 2）：后端上限 50000，超出部分静默截断 → 明示
    if (total.value > 50000) message.warning('筛选结果超过 50000 条，仅导出最近 50000 条')
    message.info(`将导出当前筛选结果 ${total.value} 条`)
    const payload = {
      format,
      user: filters.user,
      action: filters.action,
      resource: filters.resource,
      ip: filters.ip,
      ...(dateRange.value
        ? { start: dateRange.value[0].startOf('day').toISOString(), end: dateRange.value[1].endOf('day').toISOString() }
        : {}),
    }
    const r = await exportAuditLogs(payload)
    const taskId = r.data.task_id
    const st = await getExportStatus(taskId)
    if (st.data.status !== 'ready') {
      message.warning(`导出任务未完成（状态：${st.data.status}），请重新点击导出`)
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
    message.error('复制失败：浏览器未授权剪贴板，请手动选择详情文本复制')
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
}

.audit-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  /* 与上游管理/节点任务一致：单行排列，避免筛选器换行导致筛选条忽高忽低 */
  flex-wrap: nowrap;
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

/* 操作标签三态（design §7）：删除系 danger / 创建系 success / 其余中性——仅删除系用警示红 */
.action-tag {
  display: inline-block;
  padding: 1px 10px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}
.tone-danger {
  color: var(--danger);
  background: var(--danger-bg, #fdf1f0);
  border: 1px solid #f0d2ce;
}
.tone-success {
  color: var(--success, #2e8b57);
  background: var(--success-bg, #eef7f1);
  border: 1px solid #cfe6d8;
}
.tone-neutral {
  color: #5a6472;
  background: transparent;
  border: 1px solid #d6dae0;
}

.audit-table :deep(.ant-table) {
  background: transparent !important;
  border: none !important;
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

/* 归档历史抽屉（批 3） */
.archive-empty {
  color: var(--muted);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}

.archive-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.archive-name {
  font-size: 13px;
  word-break: break-all;
}

.archive-meta {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}

/* 操作区分隔线：常规导出组与破坏性归档清理分区 */
.action-sep {
  width: 1px;
  height: 22px;
  background: var(--border);
  align-self: center;
}
</style>
