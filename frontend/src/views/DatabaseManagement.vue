<template>
  <div class="database-management">
    <div class="page-header">
      <h2 class="page-title">数据库管理</h2>
      <span class="page-desc">管理当前系统使用的数据库连接，支持 SQLite / PostgreSQL，提供连接测试、切换与单向快照迁移。</span>
    </div>

    <!-- 当前数据库状态卡片 -->
    <a-card class="status-card" :bordered="false">
      <template #title>
        <span class="card-title">当前数据库</span>
      </template>
      <div class="status-body">
        <template v-if="status?.active">
          <span class="status-dot" :class="{ green: true }"></span>
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
    </a-card>

    <!-- 连接列表 -->
    <a-card class="connections-card" :bordered="false">
      <template #title>
        <span class="card-title">连接列表</span>
      </template>
      <template #extra>
        <a-button type="primary" class="add-conn-btn" @click="openCreateModal">添加连接</a-button>
      </template>
      <a-table
        :data-source="connections"
        :columns="connectionColumns"
        row-key="id"
        :pagination="false"
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
            <a-tag v-if="isActive(record)" color="green">当前</a-tag>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button size="small" class="test-conn-btn" @click="handleTest(record)">测试</a-button>
              <a-button
                size="small"
                class="set-current"
                :disabled="isActive(record)"
                :type="isActive(record) ? 'default' : 'primary'"
                @click="openSwitchModal(record)"
              >设为当前</a-button>
              <a-button size="small" @click="openEditModal(record)">编辑</a-button>
              <a-button size="small" danger class="delete-conn-btn" @click="handleDelete(record)">删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 数据迁移 -->
    <a-card class="migration-card" :bordered="false">
      <template #title>
        <span class="card-title">数据迁移</span>
      </template>
      <div class="migration-body">
        <a-alert
          class="static-notice"
          type="info"
          show-icon
          message="静态资源文件存储于服务器磁盘，仅部署该文件的本机可访问；迁移/切换数据库不影响静态资源文件。"
        />
        <div class="migrate-form">
          <div class="form-row">
            <label>源数据库</label>
            <a-select v-model:value="migrateForm.sourceId" class="migrate-select" placeholder="选择源数据库">
              <a-select-option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
            </a-select>
          </div>
          <div class="form-row">
            <label>目标数据库</label>
            <a-select v-model:value="migrateForm.targetId" class="migrate-select" placeholder="选择目标数据库">
              <a-select-option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
            </a-select>
          </div>
          <div class="form-row">
            <label>模式</label>
            <a-select v-model:value="migrateForm.mode" class="migrate-select">
              <a-select-option value="replace">替换（清空目标库）</a-select-option>
              <a-select-option value="merge">合并</a-select-option>
            </a-select>
          </div>
          <div class="form-row form-row-checkbox">
            <label>包含日志数据</label>
            <input type="checkbox" v-model="migrateForm.includeLogs" />
          </div>
          <a-button type="primary" class="migrate-btn" :loading="migrating" @click="handleMigrate">开始迁移</a-button>
        </div>

        <div v-if="migrating" class="migrate-progress">
          <a-progress :percent="95" status="active" />
          <span class="progress-text">正在迁移数据，请稍候…</span>
        </div>
        <a-alert v-if="migrateResult" class="migrate-result" type="success" :message="migrateResult" />
      </div>
    </a-card>

    <!-- 连接编辑 Modal（新增/编辑 4.3） -->
    <a-modal
      v-model:open="connModal.open"
      :title="connModal.editing ? '编辑连接' : '添加连接'"
    >
      <a-form layout="vertical">
        <a-form-item label="类型">
          <a-select v-model:value="connModal.form.type">
            <a-select-option value="sqlite">SQLite</a-select-option>
            <a-select-option value="postgres">PostgreSQL</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="名称" required>
          <a-input v-model:value="connModal.form.name" placeholder="连接名称" />
        </a-form-item>
        <template v-if="connModal.form.type === 'sqlite'">
          <a-form-item label="数据库文件路径">
            <a-input v-model:value="connModal.form.path" placeholder="/path/to/panshi.db" />
          </a-form-item>
        </template>
        <template v-else>
          <a-form-item label="主机">
            <a-input v-model:value="connModal.form.host" placeholder="localhost" />
          </a-form-item>
          <a-form-item label="端口">
            <a-input-number v-model:value="connModal.form.port" placeholder="5432" />
          </a-form-item>
          <a-form-item label="数据库名">
            <a-input v-model:value="connModal.form.database" placeholder="panshi" />
          </a-form-item>
          <a-form-item label="用户名">
            <a-input v-model:value="connModal.form.username" placeholder="postgres" />
          </a-form-item>
          <a-form-item label="密码">
            <a-input-password v-model:value="connModal.form.password" placeholder="如需修改请输入" />
          </a-form-item>
        </template>
      </a-form>
      <template #footer>
        <a-button @click="connModal.open = false">取消</a-button>
        <a-button @click="handleTestDraft">测试连接</a-button>
        <a-button type="primary" class="save-conn-btn" @click="handleSaveConnection">保存</a-button>
      </template>
    </a-modal>

    <!-- 切换确认 Modal（4.4） -->
    <a-modal
      v-model:open="switchModal.open"
      title="切换数据库"
    >
      <div class="switch-body">
        <a-alert type="warning" show-icon message="切换后需手动重启后端服务方可生效，期间 JWT 会话保持不变。目标库为空时仅保留 admin 账号，其余会话将失效。" />
        <div class="switch-target">
          <span>切换至：</span>
          <strong>{{ switchModal.connection?.name }}</strong>
          <span class="muted">{{ switchModal.connection?.display_address }}</span>
        </div>
      </div>
      <template #footer>
        <a-button @click="switchModal.open = false">取消</a-button>
        <a-button type="primary" class="switch-confirm-btn" @click="handleSwitch">确认切换</a-button>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
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
})

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
      port: connModal.form.type === 'postgres' ? connModal.form.port : null,
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
      port: connModal.form.type === 'postgres' ? connModal.form.port : null,
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
  await deleteConnection(record.id)
  message.success('连接已删除')
  await loadData()
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
  migrating.value = true
  migrateResult.value = ''
  try {
    const res = await migrateDatabase(migrateForm.sourceId, migrateForm.targetId, {
      mode: migrateForm.mode,
      include_logs: migrateForm.includeLogs,
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
.page-header .page-title {
  margin: 0 0 4px;
}
.page-desc {
  color: var(--muted);
  font-size: 13px;
}
.status-card .status-body {
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
.status-dot.green {
  background: var(--success, #52c41a);
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
.migrate-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 480px;
}
.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.form-row label {
  width: 100px;
  flex-shrink: 0;
  color: var(--muted);
}
.form-row-checkbox {
  gap: 4px;
}
.migrate-select {
  flex: 1;
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
</style>
