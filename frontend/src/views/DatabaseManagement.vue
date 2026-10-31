<template>
  <div class="database-management">
    <PageHeader
      title="数据库管理"
      description="管理当前系统使用的数据库连接，支持 SQLite / PostgreSQL，提供连接测试、切换与单向快照迁移。"
    >
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 新建连接</button>
      </template>
    </PageHeader>

    <!-- 当前数据库状态卡片 -->
    <div class="card">
      <div class="card-header"><h3>当前数据库</h3></div>
      <div class="card-body">
        <div class="status-body">
          <template v-if="status?.active">
            <span class="status-dot online"></span>
            <div class="active-info">
              <div class="active-name">
                <a-tag :color="status.active.type === 'postgres' ? 'blue' : 'orange'">{{
                  status.active.type === 'postgres' ? 'PostgreSQL' : 'SQLite'
                }}</a-tag>
                <span class="name">{{ status.active.name }}</span>
                <a-tag v-if="status.pending_restart" color="warning" class="pending-restart-badge">待重启生效</a-tag>
              </div>
              <div class="active-address">{{ status.active.display_address || status.active.host }}</div>
              <div v-if="status.pending_restart" class="pending-restart-hint">
                切换待重启生效，当前页面数据仍来自旧库；请按提示完成后端重启（开发环境运行
                <code>develop/linux/start.sh</code>，生产环境执行 <code>sh stop.sh; sh start.sh</code>）。
              </div>
            </div>
          </template>
          <a-empty v-else description="未配置活动数据库" />
        </div>
      </div>
    </div>

    <!-- 连接列表 -->
    <div class="card">
      <div class="card-header">
        <h3>连接列表</h3>
      </div>
      <div class="card-body table-body">
        <a-table
          :data-source="connections"
          :columns="connectionColumns"
          row-key="id"
          :pagination="false"
          class="connection-table"
        >
          <template #bodyCell="{ record, column }">
            <template v-if="column.key === 'status'">
              <a-tag class="conn-status-tag" :color="statusColor(record)" :title="statusTitle(record)">
                {{ statusText(record) }}
              </a-tag>
            </template>
            <template v-if="column.key === 'type'">
              <a-tag :color="record.type === 'postgres' ? 'blue' : 'orange'">{{
                record.type === 'postgres' ? 'PostgreSQL' : 'SQLite'
              }}</a-tag>
            </template>
            <template v-else-if="column.key === 'address'">
              <span class="addr-cell" :title="record.display_address || ''">{{ record.display_address || '-' }}</span>
            </template>
            <template v-else-if="column.key === 'username'">
              <span>{{ record.username || '-' }}</span>
            </template>
            <template v-else-if="column.key === 'current'">
              <span v-if="isActive(record)" class="badge badge-success">当前</span>
              <span v-else class="text-muted">-</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <div class="table-actions">
                <button class="btn btn-secondary btn-sm test-conn-btn" @click="handleTest(record)">测试</button>
                <button
                  class="btn btn-sm btn-secondary set-current"
                  :disabled="isActive(record)"
                  @click="openSwitchModal(record)"
                >
                  设为当前
                </button>
                <button class="btn btn-secondary btn-sm" @click="openEditModal(record)">编辑</button>
                <span class="tip-host" :title="isActive(record) ? '当前连接不可删除，请先切换到其他连接' : ''">
                  <button
                    class="btn btn-danger btn-sm delete-conn-btn"
                    :disabled="isActive(record)"
                    @click="handleDelete(record)"
                  >
                    删除
                  </button>
                </span>
              </div>
            </template>
          </template>
        </a-table>
      </div>
    </div>

    <!-- SQLite 备份与容灾摘要卡（完整管理在备份与容灾页）：需 db_backup 权限且功能开关开启，
         任一不满足整卡不渲染（避免无权限 403 / 功能未注册路由的死入口） -->
    <DbBackupSummaryCard v-if="authStore.hasPermission('db_backup') && featuresStore.has('db_backup')" />

    <!-- 数据迁移摘要卡：纯导航入口（完整迁移 UI 在独立页 /db-migration）。
         需 db_migration 权限且功能开关开启：门控对齐目标页（权限/路由注册均按 db_migration），
         只持 database_management 或功能关闭的用户不渲染入口卡，避免点击后被拦截 403/404。 -->
    <DbMigrationSummaryCard v-if="authStore.hasPermission('db_migration') && featuresStore.has('db_migration')" />

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
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
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

const connectionColumns = [
  { title: '状态', key: 'status', width: 84 },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '类型', key: 'type' },
  { title: '地址', key: 'address' },
  { title: '用户名', key: 'username' },
  { title: '当前', key: 'current' },
  { title: '操作', key: 'actions' },
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

function statusColor(record: DbConnection): string {
  const r = testResults.value[record.id]
  if (r === 'ok') return 'success'
  if (r === 'fail') return 'error'
  return 'default'
}

function statusTitle(record: DbConnection): string {
  const r = testResults.value[record.id]
  const base = r === 'ok' ? '已验证连通' : r === 'fail' ? '验证失败' : '尚未测试'
  return `${base}；测试结果仅保留到页面刷新`
}

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

/* ── 连接行状态列三态 tag（db-migration-ux-optimization 8.3，圆点升级文字 tag） ── */
.status-dot.online {
  background: #52c41a;
}
/* 8.1 字段级标错（PG 主机/数据库名必填前置） */
.field-error {
  margin: 4px 0 0;
  font-size: 12px;
  color: #ff4d4f;
}
/* 地址列省略（2.2） */
.addr-cell {
  display: inline-block;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
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

/* ── 当前数据库 ── */
.status-body {
  display: flex;
  align-items: center;
  gap: 12px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.active-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
.active-name .name {
  font-size: 14px;
  font-weight: 600;
}
.active-address {
  color: var(--muted);
  font-size: 13px;
  margin-top: 2px;
}
/* 切换待重启生效警示（与切换弹窗内的重启指引同一套文案口径） */
.pending-restart-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #ad6800;
  background: rgba(250, 173, 20, 0.12);
  border: 1px solid rgba(250, 173, 20, 0.45);
  border-radius: var(--radius-md);
  padding: 8px 10px;
}
.pending-restart-hint code {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 12px;
}

/* ── 连接列表表格（与列表页 table-container 口径一致） ── */
.table-body {
  padding: 0;
}
.connection-table :deep(.ant-table) {
  background: transparent;
}
/* 表头/行：保留品牌色底（配置类页面标识），其余机械属性对齐列表页契约（style.css） */
.connection-table :deep(.ant-table-thead > tr > th) {
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
.connection-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}
.connection-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 8px;
  border-bottom: 1px solid var(--border) !important;
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
}
.connection-table :deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: none !important;
}
.connection-table :deep(.ant-table-tbody > tr:hover > td) {
  background: var(--bg);
}
.table-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
