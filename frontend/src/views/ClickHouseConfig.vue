<template>
  <div class="clickhouse-config">
    <PageHeader
      title="ClickHouse 配置"
      description="管理指标查询使用的 ClickHouse 连接：支持多条命名连接，激活其中一条。此处切换仅影响监控/指标数据源，与平台数据库（「数据库管理」页）无关。"
    >
      <template #actions>
        <router-link v-if="canViewAudit" to="/audit-log" class="btn btn-secondary">操作日志</router-link>
        <button class="btn btn-primary" @click="openCreateModal">+ 新建连接</button>
      </template>
    </PageHeader>

    <!-- 当前数据源健康卡：状态只绑定实测连通性（可达/不可达/检测中/未配置） -->
    <div class="card">
      <div class="card-header"><h3>当前数据源</h3></div>
      <div class="card-body">
        <a-empty v-if="!activeConnection" description="未配置活动连接" />
        <div v-else class="status-body">
          <span class="status-dot" :class="healthDotClass"></span>
          <div class="active-info">
            <div class="active-name">
              <a-tag color="blue">ClickHouse</a-tag>
              <span class="name">{{ activeConnection.name }}</span>
              <span class="health-verdict" :class="health.state">
                {{ healthVerdictText }}
              </span>
            </div>
            <div class="active-address">
              {{ activeConnection.host }}:{{ activeConnection.port }}/{{ activeConnection.database }}
            </div>
            <div v-if="health.state === 'fail' && health.error" class="health-error">
              <span>{{ health.error }}</span>
              <button v-if="health.errorDetail" class="link-btn" @click="health.showDetail = !health.showDetail">
                {{ health.showDetail ? '收起详情' : '查看详情' }}
              </button>
              <div v-if="health.showDetail && health.errorDetail" class="health-error-detail">
                {{ health.errorDetail }}
              </div>
            </div>
            <div class="health-meta">
              {{ lastTestSummary }}
              <span class="health-actions">
                <button class="btn btn-secondary btn-sm" :disabled="health.state === 'testing'" @click="runHealthCheck">
                  {{ health.state === 'testing' ? '检测中…' : '重新检测' }}
                </button>
                <router-link to="/metrics/dashboard" class="btn btn-secondary btn-sm">去指标总览</router-link>
              </span>
            </div>
          </div>
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
          :columns="columns"
          :loading="loading"
          row-key="id"
          :pagination="false"
          class="connection-table"
        >
          <template #bodyCell="{ record, column, index }">
            <template v-if="column.key === 'index'">{{ index + 1 }}</template>
            <template v-else-if="column.key === 'address'">
              <span class="mono">{{ record.host }}:{{ record.port }}</span>
            </template>
            <template v-else-if="column.key === 'password'">
              <span v-if="record.password_set">已设置</span>
              <span v-else class="text-muted">未设置</span>
            </template>
            <template v-else-if="column.key === 'lastTest'">
              <span
                v-if="record.last_test_ok === true"
                class="test-ok"
                :title="`上次测试成功 · ${formatDateTime(record.last_test_at)}`"
                >✓ {{ formatRelativeTime(record.last_test_at) }}</span
              >
              <span v-else-if="record.last_test_ok === false" class="test-fail" :title="record.last_test_error || ''"
                >✗ {{ formatRelativeTime(record.last_test_at) }}</span
              >
              <span v-else class="text-muted">未测试</span>
            </template>
            <template v-else-if="column.key === 'active'">
              <span v-if="record.is_active" class="badge badge-success">当前</span>
              <span v-else class="text-muted">-</span>
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
                <button
                  class="btn btn-sm"
                  :class="record.is_active ? 'btn-secondary' : 'btn-primary'"
                  :disabled="record.is_active"
                  @click="handleActivate(record)"
                >
                  设为当前
                </button>
                <button class="btn btn-secondary btn-sm" @click="openEditModal(record)">编辑</button>
                <button
                  class="btn btn-sm"
                  :class="record.is_active ? 'btn-secondary' : 'btn-danger'"
                  :disabled="record.is_active"
                  :title="record.is_active ? '请先切换到其他连接' : ''"
                  @click="handleDelete(record)"
                >
                  删除
                </button>
              </div>
            </template>
          </template>
          <template #emptyText>
            <div class="ck-empty">
              <p>暂无 ClickHouse 连接；未配置时指标页面按默认参数尝试连接（127.0.0.1）。</p>
              <button class="btn btn-primary btn-sm" @click="openCreateModal">+ 新建连接</button>
            </div>
          </template>
        </a-table>
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
              <input
                id="ck-field-name"
                v-model="modal.form.name"
                type="text"
                class="form-input"
                :class="{ 'input-error': formErr.name }"
                placeholder="生产指标库"
                @blur="validateName"
              />
              <div v-if="formErr.name" class="field-error">{{ formErr.name }}</div>
            </div>
            <div class="form-group field-inline">
              <label class="form-label">主机 <span class="required">*</span></label>
              <input
                id="ck-field-host"
                v-model="modal.form.host"
                type="text"
                class="form-input"
                :class="{ 'input-error': formErr.host }"
                placeholder="192.168.100.42"
                @blur="validateHost"
              />
              <div v-if="formErr.host" class="field-error">{{ formErr.host }}</div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group field-inline">
              <label class="form-label">
                端口
                <a-tooltip title="ClickHouse native TCP 端口，默认 9000；HTTP 端口 8123 不适用于本平台">
                  <span class="port-hint">ⓘ</span>
                </a-tooltip>
              </label>
              <input
                id="ck-field-port"
                v-model.number="modal.form.port"
                type="number"
                class="form-input"
                :class="{ 'input-error': formErr.port }"
                min="1"
                max="65535"
                placeholder="9000"
                @blur="validatePort"
              />
              <div v-if="formErr.port" class="field-error">{{ formErr.port }}</div>
            </div>
            <div class="form-group field-inline">
              <label class="form-label">连接超时(秒)</label>
              <input
                id="ck-field-connect_timeout"
                v-model.number="modal.form.connect_timeout"
                type="number"
                class="form-input"
                :class="{ 'input-error': formErr.connect_timeout }"
                min="1"
                max="60"
                placeholder="5"
                @blur="validateTimeout"
              />
              <div v-if="formErr.connect_timeout" class="field-error">{{ formErr.connect_timeout }}</div>
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
          <div v-if="showActivateCheckbox" class="activate-row">
            <label class="activate-label">
              <input v-model="modal.activateAfterSave" type="checkbox" :disabled="noActiveExists" />
              <span v-if="noActiveExists">保存后自动成为当前连接（当前无激活连接）</span>
              <span v-else>保存后设为当前连接</span>
            </label>
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
import { h, computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { useAuthStore } from '@/stores/auth'
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
import { formatDateTime, formatRelativeTime } from '@/utils/format'

const columns = [
  { title: '#', key: 'index', width: 45 },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '地址', key: 'address' },
  { title: '数据库', dataIndex: 'database', key: 'database' },
  { title: '用户', dataIndex: 'user', key: 'user' },
  { title: '密码', key: 'password' },
  { title: '上次测试', key: 'lastTest' },
  { title: '当前', key: 'active' },
  { title: '操作', key: 'actions' },
]

const authStore = useAuthStore()
const canViewAudit = computed(() => authStore.hasPermission('audit_logs'))

const connections = ref<ClickhouseConnectionPublic[]>([])
const loading = ref(false)
const testingId = ref<string | null>(null)

const activeConnection = computed(() => connections.value.find((c) => c.is_active) || null)

// 健康卡状态机：idle/testing/ok/fail——颜色只绑定实测结果
const health = reactive({
  state: 'idle' as 'idle' | 'testing' | 'ok' | 'fail',
  error: '',
  errorDetail: '',
  showDetail: false,
})

const healthDotClass = computed(() =>
  health.state === 'ok' ? 'online' : health.state === 'fail' ? 'offline' : 'testing-dot',
)

const healthVerdictText = computed(() => {
  if (health.state === 'testing' || health.state === 'idle') return '检测中…'
  if (health.state === 'ok') return '可达'
  return '不可达'
})

const lastTestSummary = computed(() => {
  const a = activeConnection.value
  if (!a) return ''
  if (a.last_test_ok === true) return `上次测试：✓ ${formatRelativeTime(a.last_test_at)}`
  if (a.last_test_ok === false) return `上次测试：✗ ${formatRelativeTime(a.last_test_at)}`
  return '上次测试：未测试'
})

const modal = reactive({
  open: false,
  editing: null as ClickhouseConnectionPublic | null,
  saving: false,
  testing: false,
  activateAfterSave: false,
  form: {
    name: '',
    host: '',
    port: 9000 as number | '',
    database: 'esapm_metrics',
    user: 'default',
    password: '',
    connect_timeout: 5 as number | '',
  },
})

const formErr = reactive({ name: '', host: '', port: '', connect_timeout: '' })

const noActiveExists = computed(() => !connections.value.some((c) => c.is_active))
// 新建恒显示；编辑仅非当前连接显示。无激活连接时勾选锁定（首条自动激活语义）
const showActivateCheckbox = computed(() => !modal.editing || !modal.editing.is_active)

function buildPayload(): ClickhouseConnectionPayload {
  return {
    name: modal.form.name.trim(),
    host: modal.form.host.trim(),
    port: Number(modal.form.port),
    database: modal.form.database.trim() || 'esapm_metrics',
    user: modal.form.user.trim() || 'default',
    password: modal.form.password || null,
    connect_timeout: Number(modal.form.connect_timeout),
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
  modal.activateAfterSave = false
  Object.assign(formErr, { name: '', host: '', port: '', connect_timeout: '' })
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
  modal.activateAfterSave = false
  Object.assign(formErr, { name: '', host: '', port: '', connect_timeout: '' })
  modal.open = true
}

function closeModal() {
  modal.open = false
  modal.editing = null
}

// ── 行内校验（定位到字段；非法值不静默改写） ──

function validateName(): boolean {
  const n = modal.form.name.trim()
  if (!n) {
    formErr.name = '请输入连接名称'
    return false
  }
  const dup = connections.value.some((c) => c.id !== (modal.editing?.id ?? '') && (c.name || '').trim() === n)
  if (dup) {
    formErr.name = `连接名称「${n}」已存在`
    return false
  }
  formErr.name = ''
  return true
}

function validateHost(): boolean {
  const s = modal.form.host.trim()
  if (!s) {
    formErr.host = '请输入主机地址'
    return false
  }
  if (/^(\d{1,3})(\.\d{1,3}){3}$/.test(s)) {
    const ok = s.split('.').every((p) => Number(p) <= 255)
    formErr.host = ok ? '' : 'IP 地址格式不正确'
    return ok
  }
  if (s.includes(':')) {
    const ok = /^[0-9a-fA-F:]{2,45}$/.test(s)
    formErr.host = ok ? '' : 'IPv6 地址格式不正确'
    return ok
  }
  const ok = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(s)
  formErr.host = ok ? '' : '主机格式不正确（应为 IP 或主机名）'
  return ok
}

function validatePort(): boolean {
  const v = modal.form.port
  const ok = typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535
  formErr.port = ok ? '' : '端口需为 1–65535 的整数'
  return ok
}

function validateTimeout(): boolean {
  const v = modal.form.connect_timeout
  const ok = typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 60
  formErr.connect_timeout = ok ? '' : '超时需为 1–60 的整数'
  return ok
}

function validateAll(): boolean {
  const results = [validateName(), validateHost(), validatePort(), validateTimeout()]
  if (results.includes(false)) {
    const firstBad = (['name', 'host', 'port', 'connect_timeout'] as const).find((f) => formErr[f])
    if (firstBad) document.getElementById(`ck-field-${firstBad}`)?.focus()
    return false
  }
  return true
}

async function handleSave() {
  if (!validateAll()) return
  modal.saving = true
  try {
    let savedId = ''
    let savedIsActive = false
    const editingWasActive = !!modal.editing?.is_active
    if (modal.editing) {
      const res = await updateConnection(modal.editing.id, buildPayload())
      savedId = res.data.id
      savedIsActive = res.data.is_active
    } else {
      const res = await createConnection(buildPayload())
      savedId = res.data.id
      savedIsActive = res.data.is_active
    }
    // 「保存后设为当前连接」：保存成功后再激活；激活失败如实分步提示，不回滚保存
    const wantActivate = showActivateCheckbox.value && (modal.activateAfterSave || noActiveExists.value)
    let activated = savedIsActive
    if (wantActivate && savedId && !savedIsActive) {
      try {
        await activateConnection(savedId)
        activated = true
      } catch (e) {
        message.warning(`连接已保存，但切换激活失败：${getApiErrorMessage(e)}；可在列表中手动设为当前`)
      }
    }
    const verb = modal.editing ? '更新' : '创建'
    message.success(activated ? `连接已${verb}并设为当前连接，指标查询即时生效` : `连接已${verb}，指标查询即时生效`)
    closeModal()
    await load()
    // 激活对象变化（或激活连接参数被编辑）后立即重检健康卡，避免残留旧连接的判定
    if (activated || editingWasActive) void runHealthCheck()
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    modal.saving = false
  }
}

function handleTestForm() {
  void doTestForm()
}

async function doTestForm() {
  if (!validateAll()) return
  modal.testing = true
  try {
    const payload = buildPayload()
    if (modal.editing) payload.id = modal.editing.id
    const res = await testConnectionForm(payload)
    if (res.data.ok) message.success('连接成功')
    else message.error(`连接失败：${res.data.error || '未知原因'}`)
    // 留痕只发生在编辑模式（带已存 id）；响应回传最新留痕，就地补行
    if (res.data.last_test_at && modal.editing)
      patchTrace(modal.editing.id, res.data.last_test_ok, res.data.last_test_at)
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    modal.testing = false
  }
}

function patchTrace(id: string, ok: boolean | null | undefined, at: string | null | undefined) {
  if (!id || !at) return
  const row = connections.value.find((c) => c.id === id)
  if (row) {
    row.last_test_ok = ok ?? null
    row.last_test_at = at
  }
}

function handleTestSaved(record: ClickhouseConnectionPublic) {
  void doTestSaved(record)
}

async function doTestSaved(record: ClickhouseConnectionPublic) {
  testingId.value = record.id
  try {
    const res = await testSavedConnection(record.id)
    if (res.data.ok) message.success(`「${record.name}」连接成功`)
    else message.error(`「${record.name}」连接失败：${res.data.error || '未知原因'}`)
    patchTrace(record.id, res.data.last_test_ok, res.data.last_test_at)
    if (record.is_active) runHealthCheck()
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    testingId.value = null
  }
}

async function runHealthCheck() {
  const active = activeConnection.value
  if (!active) return
  health.state = 'testing'
  health.showDetail = false
  try {
    const res = await testSavedConnection(active.id)
    const ok = !!res.data.ok
    health.state = ok ? 'ok' : 'fail'
    health.error = res.data.error || ''
    health.errorDetail = res.data.error_detail || ''
    patchTrace(active.id, res.data.last_test_ok, res.data.last_test_at)
  } catch (e) {
    health.state = 'fail'
    health.error = getApiErrorMessage(e)
    health.errorDetail = ''
  }
}

function lastTestInfo(r: ClickhouseConnectionPublic) {
  if (r.last_test_ok === true)
    return { ok: true, text: `上次测试：✓ ${formatRelativeTime(r.last_test_at)}`, detail: '' }
  if (r.last_test_ok === false)
    return { ok: false, text: `上次测试：✗ ${formatRelativeTime(r.last_test_at)}`, detail: r.last_test_error || '' }
  return { ok: null, text: '该连接尚未测试', detail: '' }
}

function handleActivate(record: ClickhouseConnectionPublic) {
  const info = lastTestInfo(record)
  const children = [
    h('p', null, `将把指标查询数据源切换到「${record.name}」（${record.host}:${record.port}/${record.database}）。`),
    h('p', { style: 'color: var(--muted); font-size: 12px' }, '仅影响监控/指标页面，不影响平台数据库。'),
    h(
      'p',
      { style: `font-size: 12px;color:${info.ok === false ? 'var(--danger-text, #b91c1c)' : 'var(--muted)'}` },
      info.text,
    ),
  ]
  if (info.ok !== true) {
    children.push(
      h(
        'div',
        { class: 'activate-warning' },
        info.ok === false
          ? `该连接上次测试失败（${info.detail || '原因未知'}），切换后指标查询可能不可用，建议先测试。`
          : '切换后指标查询可能不可用，建议先测试再切换。',
      ),
    )
  }
  showOverlayModal({
    title: '切换激活连接',
    content: h('div', null, children),
    okText: '确认切换',
    onOk: async () => {
      try {
        await activateConnection(record.id)
        message.success('已切换激活连接')
        await load()
        runHealthCheck()
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

onMounted(async () => {
  await load()
  if (activeConnection.value) runHealthCheck()
})
</script>

<style scoped>
.clickhouse-config {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 当前数据源健康卡 ── */
.status-body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}
.status-dot.online {
  background: oklch(65% 0.19 145);
}
.status-dot.offline {
  background: oklch(62% 0.21 25);
}
.status-dot.testing-dot {
  background: var(--muted);
  opacity: 0.6;
}
.active-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
.health-verdict {
  font-size: 12px;
  font-weight: 600;
}
.health-verdict.ok {
  color: oklch(58% 0.16 150);
}
.health-verdict.fail {
  color: oklch(58% 0.2 25);
}
.health-verdict.testing,
.health-verdict.idle {
  color: var(--muted);
}
.active-address {
  color: var(--muted);
  font-size: 13px;
}
.health-error {
  font-size: 12px;
  color: oklch(55% 0.19 25);
  max-width: 720px;
}
.health-error-detail {
  margin-top: 4px;
  padding: 8px 10px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  word-break: break-all;
  white-space: pre-wrap;
}
.health-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--muted);
}
.health-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.link-btn {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
}
.link-btn:hover {
  text-decoration: underline;
}

/* ── 连接列表表格 ── */
.mono {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 13px;
}
.table-body {
  padding: 0;
}
.connection-table :deep(.ant-table) {
  background: transparent;
}
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
.test-ok {
  color: oklch(58% 0.16 150);
  font-size: 12px;
}
.test-fail {
  color: oklch(58% 0.2 25);
  font-size: 12px;
}
.ck-empty {
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 13px;
}

/* ── 弹窗 ── */
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
.input-error {
  border-color: oklch(58% 0.2 25) !important;
}
.field-error {
  flex-basis: 100%;
  font-size: 12px;
  color: oklch(55% 0.19 25);
}
.port-hint {
  color: var(--muted);
  cursor: help;
  margin-left: 2px;
}
.activate-row {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}
.activate-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--fg, inherit);
  cursor: pointer;
}
.activate-warning {
  margin-top: 8px;
  padding: 8px 10px;
  font-size: 12px;
  border-radius: 6px;
  background: oklch(85% 0.12 85 / 25%);
  border: 1px solid oklch(70% 0.14 80 / 60%);
  color: oklch(50% 0.12 70);
}
</style>
