<template>
  <div class="database-management">
    <PageHeader title="数据库管理" description="管理当前系统使用的数据库连接，支持 SQLite / PostgreSQL，提供连接测试、切换与单向快照迁移。">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 添加连接</button>
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
                <a-tag :color="status.active.type === 'postgres' ? 'blue' : 'orange'">{{ status.active.type === 'postgres' ? 'PostgreSQL' : 'SQLite' }}</a-tag>
                <span class="name">{{ status.active.name }}</span>
              </div>
              <div class="active-address">{{ status.active.display_address || status.active.host }}</div>
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
        <button class="btn btn-primary btn-sm" @click="openCreateModal">+ 添加连接</button>
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
            <template v-if="column.key === 'type'">
              <a-tag :color="record.type === 'postgres' ? 'blue' : 'orange'">{{ record.type === 'postgres' ? 'PostgreSQL' : 'SQLite' }}</a-tag>
            </template>
            <template v-else-if="column.key === 'address'">
              <span>{{ record.display_address || '-' }}</span>
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
                  class="btn btn-sm set-current"
                  :class="isActive(record) ? 'btn-secondary' : 'btn-primary'"
                  :disabled="isActive(record)"
                  @click="openSwitchModal(record)"
                >设为当前</button>
                <button class="btn btn-secondary btn-sm" @click="openEditModal(record)">编辑</button>
                <button class="btn btn-danger btn-sm delete-conn-btn" @click="handleDelete(record)">删除</button>
              </div>
            </template>
          </template>
        </a-table>
      </div>
    </div>

    <!-- 数据迁移 -->
    <div class="card">
      <div class="card-header"><h3>数据迁移</h3></div>
      <div class="card-body">
        <a-alert
          class="static-notice"
          type="info"
          show-icon
          message="静态资源文件存储于服务器磁盘，仅部署该文件的本机可访问；迁移/切换数据库不影响静态资源文件。"
        />
        <div class="migrate-form">
          <div class="form-group">
            <label class="form-label">源数据库</label>
            <select v-model="migrateForm.sourceId" class="form-input">
              <option value="" disabled>选择源数据库</option>
              <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">目标数据库</label>
            <select v-model="migrateForm.targetId" class="form-input">
              <option value="" disabled>选择目标数据库</option>
              <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">模式</label>
            <select v-model="migrateForm.mode" class="form-input">
              <option value="replace">替换（清空目标库）</option>
            </select>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="migrateForm.includeLogs" />
              <span>包含日志数据</span>
            </label>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="migrateForm.confirmed_clear" />
              <span>我了解将清空目标库</span>
            </label>
          </div>
            <button class="btn btn-primary migrate-btn" :disabled="migrating || !migrateForm.confirmed_clear" :title="migrateForm.confirmed_clear ? '' : '请先勾选「我了解将清空目标库」'" @click="handleMigrate">{{ migrating ? '迁移中…' : '开始迁移' }}</button>
        </div>

        <div v-if="migrating" class="migrate-progress">
          <a-progress :percent="95" status="active" />
          <span class="progress-text">正在迁移数据，请稍候…</span>
        </div>
        <div v-if="migrateResult" class="migrate-result">
          <a-alert type="success" show-icon :message="migrateResult" />
          <div class="next-steps">
            <div class="next-steps-title">迁移成功，按以下步骤启用新数据库：</div>
            <ol class="next-steps-list">
              <li>在上方「连接列表」中找到 <strong>{{ migrateTargetName }}</strong>，点击「设为当前」</li>
              <li>在确认弹窗中点击「确认切换」，然后手动重启后端服务生效</li>
              <li>重启后刷新页面，「当前数据库」卡片应显示新数据库</li>
            </ol>
          </div>
        </div>
      </div>
    </div>

    <!-- 连接编辑 Modal（新增/编辑 4.3） -->
    <div class="modal-overlay" :style="{ display: connModal.open ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ connModal.editing ? '编辑连接' : '添加连接' }}</h2>
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
              <input v-model="connModal.form.name" type="text" class="form-input" placeholder="连接名称">
            </div>
          </div>
          <template v-if="connModal.form.type === 'sqlite'">
            <div class="form-group">
              <label class="form-label">数据库文件路径</label>
              <input v-model="connModal.form.path" type="text" class="form-input" placeholder="/path/to/panshi.db">
            </div>
          </template>
          <template v-else>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">主机 <span class="required">*</span></label>
                <input v-model="connModal.form.host" type="text" class="form-input" placeholder="localhost">
              </div>
              <div class="form-group">
                <label class="form-label">端口</label>
                <input v-model.number="connModal.form.port" type="number" class="form-input" placeholder="5432" min="1" max="65535">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">数据库名 <span class="required">*</span></label>
                <input v-model="connModal.form.database" type="text" class="form-input" placeholder="panshi">
              </div>
              <div class="form-group">
                <label class="form-label">用户名</label>
                <input v-model="connModal.form.username" type="text" class="form-input" placeholder="postgres">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">密码</label>
              <input v-model="connModal.form.password" type="password" class="form-input" placeholder="如需修改请输入" autocomplete="new-password">
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="connModal.open = false">取消</button>
          <button class="btn btn-secondary" @click="handleTestDraft">测试连接</button>
          <button class="btn btn-primary save-conn-btn" @click="handleSaveConnection">保存</button>
        </div>
      </div>
    </div>

    <!-- 切换确认 Modal（4.4） -->
    <div class="modal-overlay" :style="{ display: switchModal.open ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 480px;">
        <div class="modal-header">
          <h2>切换数据库</h2>
          <button class="modal-close" @click="switchModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="switch-body">
            <a-alert type="warning" show-icon message="切换后需手动重启后端服务方可生效，期间 JWT 会话保持不变。目标库为空时仅保留 admin 账号，其余会话将失效。" />
            <div class="switch-restart-hint">
              重启方式：开发环境运行 <code>develop/linux/start.sh</code>；生产环境执行 <code>sh stop.sh; sh start.sh</code>。
            </div>
            <div class="switch-target">
              <span>切换至：</span>
              <strong>{{ switchModal.connection?.name }}</strong>
              <span class="muted">{{ switchModal.connection?.display_address }}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="switchModal.open = false">取消</button>
          <button class="btn btn-primary switch-confirm-btn" @click="handleSwitch">确认切换</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import {
  getDatabaseStatus,
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  switchDatabase,
  migrateDatabase,
  getMigrationHistory,
} from '@/api/database'
import type { DbConnection, DbStatus } from '@/types/database'

const status = ref<DbStatus | null>(null)
const connections = ref<DbConnection[]>([])
const migrating = ref(false)
const migrateResult = ref('')

const connectionColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '类型', key: 'type' },
  { title: '地址', key: 'address' },
  { title: '用户名', key: 'username' },
  { title: '当前', key: 'current' },
  { title: '操作', key: 'actions' },
]

const migrateForm = reactive({
  sourceId: '',
  targetId: '',
  mode: 'replace',
  includeLogs: true,
  confirmed_clear: false,
})

const migrateTargetName = computed(
  () => connections.value.find((c) => c.id === migrateForm.targetId)?.name || '目标数据库',
)

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

function emptyForm(): ConnForm {
  return {
    type: 'sqlite', name: '', path: '', host: '', port: 5432,
    database: '', username: '', password: '', ssl: false,
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
  connModal.open = true
}

async function handleTestDraft() {
  // Test the draft connection using its raw fields is not supported by API (test needs a saved id).
  // Validate name before allowing persistence.
  if (!connModal.form.name.trim()) {
    message.error('请输入连接名称')
    return
  }
  message.info('请先保存连接，再点击「测试」验证连接可用性')
}

async function handleSaveConnection() {
  if (!connModal.form.name.trim()) {
    message.error('请输入连接名称')
    return
  }
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
    message.success('连接已添加')
  }
  connModal.open = false
  await loadData()
}

async function handleTest(record: DbConnection) {
  const res = await testConnection(record.id)
  if (res.data.success) {
    message.success(res.data.detail)
  } else {
    message.error(res.data.detail)
  }
}

function openSwitchModal(record: DbConnection) {
  switchModal.connection = record
  switchModal.open = true
}

async function handleSwitch() {
  const target = switchModal.connection!
  const res = await switchDatabase(target.id)
  message.success(res.data?.message || '已切换，请手动重启后端服务')
  switchModal.open = false
  await loadData()
}

async function handleDelete(record: DbConnection) {
  showOverlayModal({
    title: '删除连接',
    content: `确定删除数据库连接「${record.name}」？该操作仅删除配置，不影响数据库本身。`,
    okText: '删除',
    okDanger: true,
    onOk: async () => {
      await deleteConnection(record.id)
      message.success('连接已删除')
      await loadData()
    },
  })
}

async function handleMigrate() {
  if (!migrateForm.sourceId || !migrateForm.targetId) {
    message.error('请选择源数据库与目标数据库')
    return
  }
  if (migrateForm.sourceId === migrateForm.targetId) {
    message.error('源数据库与目标数据库不能相同')
    return
  }
  if (!migrateForm.confirmed_clear) {
    message.error('请先勾选「我了解将清空目标库」')
    return
  }
  migrating.value = true
  migrateResult.value = ''
  try {
    const res = await migrateDatabase(migrateForm.sourceId, migrateForm.targetId, {
      mode: migrateForm.mode,
      include_logs: migrateForm.includeLogs,
      confirmed_clear: migrateForm.confirmed_clear,
    })
    migrateResult.value = res.data.message
    message.success(res.data.message)
    await getMigrationHistory()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '迁移失败')
  } finally {
    migrating.value = false
  }
}

onMounted(() => {
  loadData()
})

defineExpose({
  migrateForm,
  migrateResult,
  migrating,
  connModal,
  switchModal,
  openCreateModal,
  handleMigrate,
  handleSaveConnection,
  handleTestDraft,
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
  font-size: 15px;
  font-weight: 600;
}
.active-address {
  color: var(--muted);
  font-size: 13px;
  margin-top: 2px;
}

/* ── 连接列表表格（与列表页 table-container 口径一致） ── */
.table-body {
  padding: 0;
}
.connection-table :deep(.ant-table) {
  background: transparent;
}
.connection-table :deep(.ant-table-thead > tr > th) {
  background: oklch(56% 0.16 210 / 10%);
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 8px 14px;
}
.connection-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}
.connection-table :deep(.ant-table-tbody > tr > td) {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 13px;
}
.connection-table :deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: none;
}
.connection-table :deep(.ant-table-tbody > tr:hover > td) {
  background: var(--bg);
}
.table-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── 数据迁移 ── */
.migrate-form {
  display: flex;
  flex-direction: column;
  max-width: 480px;
}
.migrate-form .form-group {
  margin-bottom: 12px;
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
.migrate-progress {
  margin-top: 16px;
  max-width: 480px;
}
.progress-text {
  font-size: 13px;
  color: var(--muted);
}
.static-notice {
  margin-bottom: 16px;
}
.migrate-result {
  margin-top: 16px;
  max-width: 480px;
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

/* ── 切换确认弹窗内容 ── */
.switch-restart-hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
}
.switch-restart-hint code {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 12px;
}
.switch-target {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.switch-target .muted {
  color: var(--muted);
}
</style>
