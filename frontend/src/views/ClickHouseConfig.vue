<template>
  <div class="clickhouse-config">
    <PageHeader
      title="ClickHouse 配置"
      description="管理指标查询使用的 ClickHouse 连接：支持多条命名连接，激活其中一条。此处切换仅影响监控/指标数据源，与平台数据库（「数据库管理」页）无关。"
    >
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 新建连接</button>
      </template>
    </PageHeader>

    <div class="card">
      <div class="card-header"><h3>连接列表</h3></div>
      <div class="card-body table-body">
        <a-table
          :columns="columns"
          :data-source="connections"
          :loading="loading"
          row-key="id"
          :pagination="false"
          size="middle"
        >
          <template #bodyCell="{ record, column }">
            <template v-if="column.key === 'address'">
              <span class="mono">{{ record.host }}:{{ record.port }}</span>
            </template>
            <template v-else-if="column.key === 'password'">
              <a-tag v-if="record.password_set" color="green">已设置</a-tag>
              <a-tag v-else>未设置</a-tag>
            </template>
            <template v-else-if="column.key === 'active'">
              <a-tag v-if="record.is_active" color="blue">当前激活</a-tag>
              <button
                class="btn btn-sm set-active-btn"
                :disabled="testingId === record.id"
                @click="handleActivate(record)"
              >
                设为激活
              </button>
            </template>
            <template v-else-if="column.key === 'actions'">
              <div class="table-actions">
                <button
                  class="btn btn-secondary btn-sm"
                  :disabled="testingId === record.id"
                  @click="handleTestSaved(record)"
                >
                  {{ testingId === record.id ? '测试中…' : '测试' }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="openEditModal(record)">编辑</button>
                <button
                  class="btn btn-danger btn-sm"
                  :disabled="record.is_active"
                  :title="record.is_active ? '请先切换到其他连接' : ''"
                  @click="handleDelete(record)"
                >
                  删除
                </button>
              </div>
            </template>
          </template>
        </a-table>
        <div v-if="!loading && !connections.length" class="empty-hint">
          暂无 ClickHouse 连接，点击右上角「新建连接」添加；未配置时指标页面按默认参数尝试连接（127.0.0.1）。
        </div>
      </div>
    </div>

    <!-- 新建/编辑连接弹窗 -->
    <div class="modal-overlay" :style="{ display: modal.open ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ modal.editing ? '编辑连接' : '新建连接' }}</h2>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group field-inline">
              <label class="form-label">名称 <span class="required">*</span></label>
              <input v-model="modal.form.name" type="text" class="form-input" placeholder="生产指标库" />
            </div>
            <div class="form-group field-inline">
              <label class="form-label">主机 <span class="required">*</span></label>
              <input v-model="modal.form.host" type="text" class="form-input" placeholder="192.168.100.42" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group field-inline">
              <label class="form-label">端口</label>
              <input
                v-model.number="modal.form.port"
                type="number"
                class="form-input"
                min="1"
                max="65535"
                placeholder="9000"
              />
            </div>
            <div class="form-group field-inline">
              <label class="form-label">连接超时(秒)</label>
              <input
                v-model.number="modal.form.connect_timeout"
                type="number"
                class="form-input"
                min="1"
                max="60"
                placeholder="5"
              />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group field-inline">
              <label class="form-label">数据库</label>
              <input v-model="modal.form.database" type="text" class="form-input" placeholder="esapm_metrics" />
            </div>
            <div class="form-group field-inline">
              <label class="form-label">用户</label>
              <input v-model="modal.form.user" type="text" class="form-input" placeholder="default" />
            </div>
          </div>
          <div class="form-group field-inline">
            <label class="form-label">密码</label>
            <input
              v-model="modal.form.password"
              type="password"
              class="form-input"
              autocomplete="new-password"
              :placeholder="modal.editing && modal.editing.password_set ? '已保存，留空不修改' : '可选'"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" :disabled="modal.testing" @click="handleTestForm">
            {{ modal.testing ? '测试中…' : '测试连接' }}
          </button>
          <span class="footer-spacer"></span>
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" :disabled="modal.saving" @click="handleSave">
            {{ modal.saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { h, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import {
  activateConnection,
  createConnection,
  deleteConnection,
  listConnections,
  testConnectionForm,
  testSavedConnection,
  updateConnection,
  type ClickhouseConnectionPayload,
  type ClickhouseConnectionPublic,
} from '@/api/clickhouse'
import { getApiErrorMessage } from '@/utils/error'

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '地址', key: 'address' },
  { title: '数据库', dataIndex: 'database', key: 'database' },
  { title: '用户', dataIndex: 'user', key: 'user' },
  { title: '密码', key: 'password' },
  { title: '激活状态', key: 'active' },
  { title: '操作', key: 'actions' },
]

const connections = ref<ClickhouseConnectionPublic[]>([])
const loading = ref(false)
const testingId = ref<string | null>(null)

const modal = reactive({
  open: false,
  editing: null as ClickhouseConnectionPublic | null,
  saving: false,
  testing: false,
  form: {
    name: '',
    host: '',
    port: 9000,
    database: 'esapm_metrics',
    user: 'default',
    password: '',
    connect_timeout: 5,
  },
})

function buildPayload(): ClickhouseConnectionPayload {
  return {
    name: modal.form.name.trim(),
    host: modal.form.host.trim(),
    port: Number(modal.form.port) || 9000,
    database: modal.form.database.trim() || 'esapm_metrics',
    user: modal.form.user.trim() || 'default',
    password: modal.form.password || null,
    connect_timeout: Number(modal.form.connect_timeout) || 5,
  }
}

async function load() {
  loading.value = true
  try {
    const res = await listConnections()
    connections.value = res.data.items
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  modal.editing = null
  Object.assign(modal.form, {
    name: '',
    host: '',
    port: 9000,
    database: 'esapm_metrics',
    user: 'default',
    password: '',
    connect_timeout: 5,
  })
  modal.open = true
}

function openEditModal(record: ClickhouseConnectionPublic) {
  modal.editing = record
  Object.assign(modal.form, {
    name: record.name,
    host: record.host,
    port: record.port,
    database: record.database,
    user: record.user,
    password: '',
    connect_timeout: record.connect_timeout,
  })
  modal.open = true
}

function closeModal() {
  modal.open = false
  modal.editing = null
}

function validateForm(): boolean {
  if (!modal.form.name.trim()) {
    message.error('请输入连接名称')
    return false
  }
  if (!modal.form.host.trim()) {
    message.error('请输入主机地址')
    return false
  }
  return true
}

async function handleSave() {
  if (!validateForm()) return
  modal.saving = true
  try {
    if (modal.editing) {
      await updateConnection(modal.editing.id, buildPayload())
      message.success('连接已更新，指标查询即时生效')
    } else {
      await createConnection(buildPayload())
      message.success('连接已创建，指标查询即时生效')
    }
    closeModal()
    await load()
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    modal.saving = false
  }
}

async function handleTestForm() {
  if (!validateForm()) return
  modal.testing = true
  try {
    const payload = buildPayload()
    if (modal.editing) payload.id = modal.editing.id
    const res = await testConnectionForm(payload)
    if (res.data.ok) message.success('连接成功')
    else message.error(`连接失败：${res.data.error || '未知原因'}`)
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    modal.testing = false
  }
}

async function handleTestSaved(record: ClickhouseConnectionPublic) {
  testingId.value = record.id
  try {
    const res = await testSavedConnection(record.id)
    if (res.data.ok) message.success(`「${record.name}」连接成功`)
    else message.error(`「${record.name}」连接失败：${res.data.error || '未知原因'}`)
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    testingId.value = null
  }
}

function handleActivate(record: ClickhouseConnectionPublic) {
  showOverlayModal({
    title: '切换激活连接',
    content: h('div', null, [
      h('p', null, `将把指标查询数据源切换到「${record.name}」（${record.host}:${record.port}/${record.database}）。`),
      h('p', { style: 'color: var(--muted); font-size: 12px' }, '仅影响监控/指标页面，不影响平台数据库。'),
    ]),
    okText: '确认切换',
    onOk: async () => {
      try {
        await activateConnection(record.id)
        message.success('已切换激活连接')
        await load()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
  })
}

function handleDelete(record: ClickhouseConnectionPublic) {
  showOverlayModal({
    title: '删除连接',
    content: `确定删除 ClickHouse 连接「${record.name}」？该操作仅删除配置，不触碰 ClickHouse 数据。`,
    okText: '删除',
    okDanger: true,
    onOk: async () => {
      try {
        await deleteConnection(record.id)
        message.success('连接已删除')
        await load()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
  })
}

onMounted(load)
</script>

<style scoped>
.mono {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 13px;
}
.table-body {
  padding: 0;
}
.table-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.set-active-btn {
  background: oklch(94% 0.04 210);
  color: oklch(40% 0.12 210);
  border: 1px solid oklch(80% 0.06 210);
  cursor: pointer;
}
.set-active-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.empty-hint {
  padding: 14px 16px;
  font-size: 13px;
  color: var(--muted);
  border-top: 1px solid var(--border);
}
.footer-spacer {
  flex: 1;
}
.field-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.field-inline .form-label {
  margin-bottom: 0;
  white-space: nowrap;
}
.field-inline .form-input {
  flex: 1 1 140px;
  min-width: 0;
}
</style>
