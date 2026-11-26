<template>
  <div class="database-management">
    <PageHeader
      title="数据库管理"
      description="管理当前系统使用的数据库连接，支持 SQLite / PostgreSQL，提供连接测试、切换与单向快照迁移。"
    >
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal"><StrokeIcon name="plus" :size="13" /> 新建连接</button>
      </template>
    </PageHeader>

    <!-- 当前数据库（hero：判定胶囊 + 技术身份 + 注册表规模；切换需重启生效） -->
    <div class="l5-card">
      <div class="dbm-cardhead">
        <h3>当前数据库</h3>
        <span class="dbm-sub">切换写入配置后需重启后端服务才生效；期间页面数据仍来自旧库</span>
      </div>
      <div v-if="!status?.active" class="dbm-hero dbm-hero-empty">
        <a-empty description="未配置活动数据库" />
      </div>
      <div v-else class="dbm-hero">
        <span class="dbm-verdict">
          <span class="pill" :class="verdictPillClass"><span class="dot"></span>{{ verdictText }}</span>
        </span>
        <div class="dbm-info">
          <div class="dbm-name-row">
            <span class="lp-tag tech">{{ typeLabel(status.active.type) }}</span>
            <span class="dbm-name">{{ status.active.name }}</span>
            <span v-if="status.pending_restart" class="ph-lite lite-warn pending-restart-badge">待重启生效</span>
          </div>
          <span class="dbm-addr">{{ status.active.display_address || status.active.host }}</span>
          <div v-if="status.pending_restart" class="dbm-pending pending-restart-hint">
            <b>切换待重启生效</b>：当前页面数据仍来自旧库。请按提示完成后端重启——开发环境运行
            <code>develop/linux/start.sh</code>；生产环境执行
            <code>sh stop.sh; sh start.sh</code>。重启前页面上的连接增删改只写配置，运行中的引擎仍是旧库。
          </div>
          <div class="dbm-meta">
            <span
              >连接注册表 <b>{{ status.connections_count }}</b> 条</span
            >
            <span class="sep">·</span>
            <span
              >配置版本 <b>v{{ status.version }}</b></span
            >
            <span class="sep">·</span>
            <span>切换后 JWT 会话保持不变；目标库为空时仅保留 admin 账号</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 连接列表（grid-table 解剖；操作层级：设为当前 = 行内主操作 accent） -->
    <div class="table-container l5-card">
      <div class="dbm-cardhead">
        <h3>连接列表</h3>
        <span class="dbm-sub">连通性为页面内「测试」结果（刷新后重置）；当前连接不可删除，需先切换</span>
      </div>
      <div class="card-body table-body">
        <a-table
          :data-source="connections"
          :columns="connectionColumns"
          row-key="id"
          :pagination="false"
          :scroll="{ x: 1072 }"
          :table-layout="'fixed'"
          :row-class-name="rowClassName"
          class="connection-table grid-table"
        >
          <template #bodyCell="{ record, column, index }">
            <template v-if="column.key === 'index'">
              <span class="text-muted">{{ index + 1 }}</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <span class="pill conn-status-pill" :class="statusPillClass(record)" :title="statusTitle(record)">
                <span class="dot"></span>{{ statusText(record) }}
              </span>
            </template>
            <template v-else-if="column.key === 'name'">
              <span class="cell-ellipsis name-cell" :title="record.name">{{ record.name }}</span>
            </template>
            <template v-else-if="column.key === 'type'">
              <span class="lp-tag" :class="{ tech: isActive(record) }">{{ typeLabel(record.type) }}</span>
            </template>
            <template v-else-if="column.key === 'address'">
              <span class="mono cell-ellipsis" :title="record.display_address || ''">{{
                record.display_address || '-'
              }}</span>
            </template>
            <template v-else-if="column.key === 'username'">
              <span class="mono text-muted cell-ellipsis" :title="record.username || ''">{{
                record.username || '-'
              }}</span>
            </template>
            <template v-else-if="column.key === 'current'">
              <span v-if="isActive(record)" class="pill pill-run"><span class="dot"></span>当前</span>
              <span v-else class="text-muted">-</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <div class="ops">
                <button
                  class="op-btn test-conn-btn"
                  title="测试该连接（结果仅保留到页面刷新）"
                  @click="handleTest(record)"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  测试
                </button>
                <button
                  class="op-pub set-current"
                  :disabled="isActive(record)"
                  :title="isActive(record) ? '当前连接无需切换' : '写入配置；重启后端服务后生效'"
                  @click="openSwitchModal(record)"
                >
                  设为当前
                </button>
                <button class="op-btn" title="编辑连接（密码留空表示不修改）" @click="openEditModal(record)">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="3" y="4" width="4" height="16" rx="1" />
                    <rect x="10" y="4" width="4" height="16" rx="1" />
                    <rect x="17" y="4" width="4" height="16" rx="1" />
                  </svg>
                  编辑
                </button>
                <span class="tip-host" :title="isActive(record) ? '当前连接不可删除，请先切换到其他连接' : ''">
                  <button
                    class="op-btn op-danger delete-conn-btn"
                    :disabled="isActive(record)"
                    title="删除连接（仅删配置，不触碰数据库本身）"
                    @click="handleDelete(record)"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
                    </svg>
                    删除
                  </button>
                </span>
              </div>
            </template>
          </template>
        </a-table>
      </div>
    </div>

    <!-- 摘要双卡：备份与容灾 / 数据迁移（纯导航入口，均不就地执行；窄屏回落单列） -->
    <div class="dbm-two">
      <!-- SQLite 备份与容灾摘要卡（完整管理在备份与容灾页）：需 db_backup 权限且功能开关开启，
           任一不满足整卡不渲染（避免无权限 403 / 功能未注册路由的死入口） -->
      <DbBackupSummaryCard v-if="authStore.hasPermission('db_backup') && featuresStore.has('db_backup')" />

      <!-- 数据迁移摘要卡：纯导航入口（完整迁移 UI 在独立页 /db-migration）。
           需 db_migration 权限且功能开关开启：门控对齐目标页（权限/路由注册均按 db_migration），
           只持 database_management 或功能关闭的用户不渲染入口卡，避免点击后被拦截 403/404。 -->
      <DbMigrationSummaryCard v-if="authStore.hasPermission('db_migration') && featuresStore.has('db_migration')" />
    </div>

    <!-- 连接编辑 Modal（新增/编辑 4.3） -->
    <div class="modal-overlay" :style="{ display: connModal.open ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ connModal.editing ? '编辑连接' : '新建连接' }}</h2>
          <button class="modal-close" @click="connModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">类型 <span class="required">*</span></label>
              <select v-model="connModal.form.type" class="form-input">
                <option value="sqlite">SQLite</option>
                <option value="postgres">PostgreSQL</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">名称 <span class="required">*</span></label>
              <input
                v-model="connModal.form.name"
                type="text"
                class="form-input"
                placeholder="如：生产 PG / 本机 SQLite"
              />
            </div>
          </div>
          <template v-if="connModal.form.type === 'sqlite'">
            <div class="form-group">
              <label class="form-label">数据库文件路径</label>
              <input v-model="connModal.form.path" type="text" class="form-input" placeholder="/path/to/panshi.db" />
            </div>
          </template>
          <template v-else>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">主机 <span class="required">*</span></label>
                <input
                  v-model="connModal.form.host"
                  type="text"
                  class="form-input"
                  placeholder="localhost"
                  @input="clearHostError"
                />
                <p v-if="connErrors.host" class="field-error">{{ connErrors.host }}</p>
              </div>
              <div class="form-group">
                <label class="form-label">端口</label>
                <input
                  v-model.number="connModal.form.port"
                  type="number"
                  class="form-input"
                  placeholder="5432"
                  min="1"
                  max="65535"
                />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">数据库名 <span class="required">*</span></label>
                <input
                  v-model="connModal.form.database"
                  type="text"
                  class="form-input"
                  placeholder="panshi"
                  @input="clearDatabaseError"
                />
                <p v-if="connErrors.database" class="field-error">{{ connErrors.database }}</p>
              </div>
              <div class="form-group">
                <label class="form-label">用户名</label>
                <input v-model="connModal.form.username" type="text" class="form-input" placeholder="postgres" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">密码</label>
              <input
                v-model="connModal.form.password"
                type="password"
                class="form-input"
                placeholder="如需修改请输入"
                autocomplete="new-password"
              />
            </div>
            <div class="form-group">
              <label class="form-check">
                <input v-model="connModal.form.ssl" type="checkbox" />
                启用 SSL 连接
              </label>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="connModal.open = false">取消</button>
          <button class="btn btn-primary save-conn-btn" @click="handleSaveConnection">保存</button>
        </div>
      </div>
    </div>

    <!-- 切换确认 Modal（db-migration-ux-optimization 9.1：提取为共享组件 SwitchConnectionModal，
         供迁移页复用；切换成功后关闭、失败保持打开由页面 handleSwitch 控制） -->
    <SwitchConnectionModal
      v-model:open="switchModal.open"
      :connection="switchModal.connection"
      :active-name="status?.active?.name"
      @confirm="handleSwitch"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import DbBackupSummaryCard from '@/components/DbBackupSummaryCard.vue'
import DbMigrationSummaryCard from '@/components/DbMigrationSummaryCard.vue'
import SwitchConnectionModal from '@/components/SwitchConnectionModal.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import {
  getDatabaseStatus,
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  switchDatabase,
} from '@/api/database'
import { useAuthStore } from '@/stores/auth'
import { useFeaturesStore } from '@/stores/features'
import type { DbConnection, DbStatus } from '@/types/database'

const status = ref<DbStatus | null>(null)
const connections = ref<DbConnection[]>([])
const route = useRoute()

// 摘要卡门控：权限 + 功能开关双条件（对齐菜单/路由口径，关掉的功能不留死入口）
const authStore = useAuthStore()
const featuresStore = useFeaturesStore()

// 列宽合计 1072 = :scroll.x（1366 视口零行内滚动）；长内容列单行省略 + title 给全值
const connectionColumns = [
  { title: '#', key: 'index', width: 45 },
  { title: '状态', key: 'status', width: 96 },
  { title: '名称', key: 'name', width: 171 },
  { title: '类型', key: 'type', width: 104 },
  { title: '地址', key: 'address', width: 220 },
  { title: '用户名', key: 'username', width: 96 },
  { title: '当前', key: 'current', width: 74 },
  { title: '操作', key: 'actions', width: 266 },
]

interface ConnForm {
  type: 'sqlite' | 'postgres'
  name: string
  path: string
  host: string
  port: number | null
  database: string
  username: string
  password: string
  ssl: boolean
}

const connModal = reactive<{
  open: boolean
  editing: boolean
  editingId: string | null
  form: ConnForm
}>({
  open: false,
  editing: false,
  editingId: null,
  form: emptyForm(),
})

const switchModal = reactive<{ open: boolean; connection: DbConnection | null }>({
  open: false,
  connection: null,
})

// 8.1 必填校验前置：PG 主机/数据库名为空在客户端阻断提交，不发请求、不触发后端 422
const connErrors = reactive<{ host: string; database: string }>({ host: '', database: '' })

// #25：模板内多语句 handler 有 prettier 重排陷阱，清错逻辑提取为 script 函数
function clearHostError() {
  connErrors.host = ''
}

function clearDatabaseError() {
  connErrors.database = ''
}

function resetConnErrors() {
  connErrors.host = ''
  connErrors.database = ''
}

/** PG 必填前置校验：返回 false 时已字段级标错，调用方阻断提交 */
function validatePgRequired(): boolean {
  if (connModal.form.type !== 'postgres') return true
  connErrors.host = connModal.form.host.trim() ? '' : '请输入主机'
  connErrors.database = connModal.form.database.trim() ? '' : '请输入数据库名'
  return !connErrors.host && !connErrors.database
}

// 8.2/D8 写操作错误统一分类：axios 拦截器仅全局处理 401，此处是这些错误唯一的用户可见出口。
// 有 response：4xx/5xx detail 中文直出（503 迁移锁补出口指引）；无 response：网络异常。
function extractWriteError(err: unknown): string {
  const resp = (err as { response?: { status?: number; data?: { detail?: unknown } } } | null)?.response
  if (!resp) return '网络异常，请检查连接后重试'
  const detail = resp.data?.detail
  if (typeof detail === 'string' && detail.trim()) {
    if (resp.status === 503 && detail.includes('迁移')) {
      // 兼容后端新旧锁文案：新文案已含「数据迁移」页指引则直出，旧文案补一条出口指引
      return detail.includes('数据迁移') ? detail : `${detail}；迁移完成后自动恢复，进度可前往「数据迁移」页查看`
    }
    return detail
  }
  return `请求失败（HTTP ${resp.status ?? ''}）`
}

function emptyForm(): ConnForm {
  return {
    type: 'sqlite',
    name: '',
    path: '',
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
    ssl: false,
  }
}

// 原生 number 输入清空时得到 ''，统一归一化为 null（后端 Optional[int]）
function normalizePort(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function isActive(record: DbConnection): boolean {
  return status.value?.active?.id === record.id
}

async function loadData() {
  const [s, cs] = await Promise.all([getDatabaseStatus(), listConnections()])
  status.value = s.data
  connections.value = cs.data
}

function openCreateModal() {
  connModal.editing = false
  connModal.editingId = null
  connModal.form = emptyForm()
  resetConnErrors()
  connModal.open = true
}

function openEditModal(record: DbConnection) {
  connModal.editing = true
  connModal.editingId = record.id
  connModal.form = {
    type: record.type,
    name: record.name,
    path: record.path || '',
    host: record.host || '',
    port: record.port ?? 5432,
    database: record.database || '',
    username: record.username || '',
    password: '',
    ssl: record.ssl ?? false,
  }
  resetConnErrors()
  connModal.open = true
}

async function handleSaveConnection() {
  if (!connModal.form.name.trim()) {
    message.error('请输入连接名称')
    return
  }
  // 8.1 必填校验前置：为空阻断提交并字段级标错（红字），不发请求
  if (!validatePgRequired()) return
  // 重名软校验（database-mgmt-ux-review-fixes 2.3）：编辑排除自身
  const dup = connections.value.some((c) => c.name === connModal.form.name.trim() && c.id !== connModal.editingId)
  if (dup) {
    message.error('已存在同名连接')
    return
  }
  try {
    if (connModal.editing) {
      await updateConnection(connModal.editingId!, {
        name: connModal.form.name,
        path: connModal.form.type === 'sqlite' ? connModal.form.path : null,
        host: connModal.form.type === 'postgres' ? connModal.form.host : null,
        port: connModal.form.type === 'postgres' ? normalizePort(connModal.form.port) : null,
        database: connModal.form.type === 'postgres' ? connModal.form.database : null,
        username: connModal.form.type === 'postgres' ? connModal.form.username : null,
        password: connModal.form.password || null,
        ssl: connModal.form.type === 'postgres' ? connModal.form.ssl : null,
      })
      message.success('连接已更新')
    } else {
      await createConnection({
        type: connModal.form.type,
        name: connModal.form.name,
        path: connModal.form.type === 'sqlite' ? connModal.form.path : null,
        host: connModal.form.type === 'postgres' ? connModal.form.host : null,
        port: connModal.form.type === 'postgres' ? normalizePort(connModal.form.port) : null,
        database: connModal.form.type === 'postgres' ? connModal.form.database : null,
        username: connModal.form.type === 'postgres' ? connModal.form.username : null,
        password: connModal.form.password || null,
        ssl: connModal.form.type === 'postgres' ? connModal.form.ssl : false,
      })
      message.success('连接已添加，可点击列表中「测试」验证可用性')
    }
  } catch (err) {
    // 8.2：失败时弹窗保持打开，用户修正后可重试
    message.error(extractWriteError(err))
    return
  }
  connModal.open = false
  await loadData()
}

async function handleTest(record: DbConnection) {
  try {
    const res = await testConnection(record.id)
    // 状态列三态 tag（db-migration-ux-optimization 8.3）：内存会话态，刷新重置
    testResults.value[record.id] = res.data.success ? 'ok' : 'fail'
    if (res.data.success) {
      message.success(res.data.detail)
    } else {
      message.error(res.data.detail)
    }
  } catch (err) {
    message.error(extractWriteError(err))
  }
}

const testResults = ref<Record<string, 'ok' | 'fail'>>({})

// 8.3 连通性状态列三态 tag：未验证（默认/灰）· 已连通（success/绿）· 验证失败（error/红）
function statusText(record: DbConnection): string {
  const r = testResults.value[record.id]
  if (r === 'ok') return '已连通'
  if (r === 'fail') return '验证失败'
  return '未验证'
}

// 2026-11-26 database-management-page-restyle D2：三态胶囊取代 a-tag（语义不变，仍是页面内会话态）
function statusPillClass(record: DbConnection): string {
  const r = testResults.value[record.id]
  if (r === 'ok') return 'pill-run'
  if (r === 'fail') return 'pill-stop'
  return 'pill-unknown'
}

function statusTitle(record: DbConnection): string {
  const r = testResults.value[record.id]
  const base = r === 'ok' ? '已验证连通' : r === 'fail' ? '验证失败' : '尚未测试'
  return `${base}；测试结果仅保留到页面刷新`
}

/** 类型显示名（两处复用，避免视图内重复三元） */
function typeLabel(type: DbConnection['type']): string {
  return type === 'postgres' ? 'PostgreSQL' : 'SQLite'
}

/** hero 判定胶囊：待重启 = warning（写库未生效），否则运行中 */
const verdictPillClass = computed(() => (status.value?.pending_restart ? 'pill-warn' : 'pill-run'))
const verdictText = computed(() => (status.value?.pending_restart ? '待重启' : '运行中'))

/** 当前连接行标识（design D6：专用类，不复用多选选中高亮） */
function rowClassName(record: DbConnection): string {
  return isActive(record) ? 'dbm-row-current' : ''
}

/**
 * 页头统计徽标（至多两枚，design D4）：首枚恒为条连接；
 * 第二枚按严重度取「待重启生效」（写库未生效，压过测试失败）或「K 条验证失败」。
 */
const headerStatItems = computed(() => {
  const items: Array<{ value: number | string; label: string; tone?: 'accent' | 'ok' | 'warn' | 'bad' }> = [
    // 与表格同口径：优先取已加载数据集条数（表头数字必须与可见行数一致），列表失败时回落接口计数
    { value: connections.value.length || status.value?.connections_count || 0, label: '条连接' },
  ]
  if (status.value?.pending_restart) {
    items.push({ value: 1, label: '待重启生效', tone: 'warn' })
    return items
  }
  const failed = Object.values(testResults.value).filter((v) => v === 'fail').length
  if (failed > 0) items.push({ value: failed, label: '条验证失败', tone: 'bad' })
  return items
})

function openSwitchModal(record: DbConnection) {
  switchModal.connection = record
  switchModal.open = true
}

async function handleSwitch() {
  const target = switchModal.connection
  if (!target) return
  try {
    const res = await switchDatabase(target.id)
    message.success(res.data?.message || '已切换，请手动重启后端服务')
    switchModal.open = false
    await loadData()
  } catch (err) {
    // 8.2：失败弹窗保持打开，可重试或取消
    message.error(extractWriteError(err))
  }
}

async function handleDelete(record: DbConnection) {
  showOverlayModal({
    title: '删除连接',
    content: `确定删除数据库连接「${record.name}」？该操作仅删除配置，不影响数据库本身。`,
    okText: '删除',
    okDanger: true,
    onOk: async () => {
      try {
        await deleteConnection(record.id)
        message.success('连接已删除')
        await loadData()
      } catch (err) {
        // 8.2：删除失败错误上屏；showOverlayModal 对 rejected onOk 保留弹窗
        message.error(extractWriteError(err))
      }
    },
  })
}

onMounted(() => {
  loadData()
  // db-migration-ux-optimization 10.2 配套：迁移页「去新建连接」深链 /database-management?wizard=1，
  // 挂载即打开新建连接弹窗（消费模式对齐 BackupManagement ?wizard=1）
  if (route.query.wizard === '1' || route.query.wizard === 'true') {
    openCreateModal()
  }
})

defineExpose({
  connModal,
  switchModal,
  openCreateModal,
  handleSaveConnection,
  handleTest,
  handleSwitch,
  handleDelete,
})
</script>

<style scoped>
.database-management {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 8.1 字段级标错（PG 主机/数据库名必填前置） */
.field-error {
  margin: 4px 0 0;
  font-size: 12px;
  color: #ff4d4f;
}

/* 长内容列（名称/地址/用户名）：单行省略，完整值走 title——
   否则真实数据里的长路径与长用户名会折行，行高不再统一（实测 57/77px 混排） */
.cell-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-cell {
  font-weight: 600;
  color: var(--fg);
}
.mono {
  font-family: var(--font-mono);
  font-size: 12.5px;
}

/* SSL 开关（1.3） */
.form-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
}

/* 禁用删除 tooltip 宿主 */
.tip-host {
  display: inline-block;
}

/* 连接列表：表头/悬停/密度由全局 grid-table 接管（旧 accent 大写表头已删，见 database-management-page-restyle） */
.table-body {
  padding: 0;
}
/* 表头在卡头之下（非卡顶），antd 给首末列表头的 8px 圆角会露出缺口——设计页表头为直角 */
.connection-table :deep(.ant-table-thead > tr > th:first-child),
.connection-table :deep(.ant-table-thead > tr > th:last-child) {
  border-start-start-radius: 0 !important;
  border-start-end-radius: 0 !important;
}
.ops {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
}
.ops .op-btn.op-danger {
  color: var(--danger);
}
.ops .op-btn.op-danger:disabled:hover {
  color: var(--danger);
}
</style>
