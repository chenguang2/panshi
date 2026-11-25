<template>
  <div class="clickhouse-config">
    <PageHeader
      title="ClickHouse 配置"
      description="管理指标查询使用的 ClickHouse 连接：支持多条命名连接，激活其中一条。此处切换仅影响监控/指标数据源，与平台数据库（「数据库管理」页）无关。"
    >
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <router-link v-if="canViewAudit" to="/audit-log" class="btn btn-secondary">操作日志</router-link>
        <button class="btn btn-primary" @click="openCreateModal"><StrokeIcon name="plus" :size="13" /> 新建连接</button>
      </template>
    </PageHeader>

    <!-- 当前数据源健康卡：状态只绑定实测连通性（可达/不可达/检测中/未配置） -->
    <div class="l5-card ck-card">
      <div class="ck-cardhead">
        <h3>当前数据源</h3>
        <span class="ck-sub">进入页面自动检测；状态只绑定实测连通性</span>
      </div>
      <div v-if="!activeConnection" class="ck-empty-wrap">
        <EmptyState title="未配置活动连接" description="未配置时指标页面按默认参数尝试连接（127.0.0.1）。">
          <button class="btn btn-primary btn-sm" @click="openCreateModal">新建连接</button>
        </EmptyState>
      </div>
      <div v-else class="ck-hero">
        <span class="ck-verdict">
          <span class="pill health-verdict" :class="verdictPillClass">
            <span class="dot status-dot" :class="healthDotClass"></span>{{ healthVerdictText }}
          </span>
        </span>
        <div class="ck-info">
          <div class="ck-name-row">
            <span class="lp-tag tech">ClickHouse</span>
            <span class="ck-name">{{ activeConnection.name }}</span>
          </div>
          <span class="ck-addr"
            >{{ activeConnection.host }}:{{ activeConnection.port }}/{{ activeConnection.database }}</span
          >
          <div v-if="health.state === 'fail' && health.error" class="health-error">
            <span>{{ health.error }}</span>
            <button v-if="health.errorDetail" class="link-btn" @click="health.showDetail = !health.showDetail">
              {{ health.showDetail ? '收起详情' : '查看详情' }}
            </button>
            <div v-if="health.showDetail && health.errorDetail" class="health-error-detail">
              {{ health.errorDetail }}
            </div>
          </div>
          <div class="ck-meta">
            <span>{{ lastTestSummary }}</span>
            <span class="ck-actions">
              <button class="tool-btn" :disabled="health.state === 'testing'" @click="runHealthCheck">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 12a9 9 0 11-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
                {{ health.state === 'testing' ? '检测中…' : '重新检测' }}
              </button>
              <router-link to="/metrics/dashboard" class="tool-btn">去指标总览</router-link>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 连接列表（grid-table 解剖；操作层级：设为当前 = 行内主操作 accent） -->
    <div class="table-container l5-card ck-card">
      <div class="ck-cardhead">
        <h3>连接列表</h3>
        <span class="ck-sub">激活连接即时生效于指标查询；激活与删除有保护</span>
      </div>
      <div class="card-body table-body">
        <a-table
          :data-source="connections"
          :columns="columns"
          :loading="loading"
          row-key="id"
          :pagination="false"
          :scroll="{ x: 1235 }"
          :table-layout="'fixed'"
          class="ck-table grid-table"
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
              <span v-if="record.is_active" class="pill pill-run"><span class="dot"></span>当前</span>
              <span v-else class="text-muted">-</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <div class="ops">
                <button
                  class="op-btn"
                  :disabled="testingId === record.id"
                  :title="testingId === record.id ? '测试中…' : '测试该连接'"
                  @click="handleTestSaved(record)"
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
                  {{ testingId === record.id ? '测试中…' : '测试' }}
                </button>
                <button
                  class="op-pub"
                  :disabled="record.is_active"
                  :title="record.is_active ? '当前连接无需切换' : '将指标查询数据源切换到该连接'"
                  @click="handleActivate(record)"
                >
                  设为当前
                </button>
                <button class="op-btn" title="编辑连接" @click="openEditModal(record)">
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
                <button
                  class="op-btn op-danger"
                  :disabled="record.is_active"
                  :title="record.is_active ? '请先切换到其他连接' : '删除连接（仅删配置，不触碰 ClickHouse 数据）'"
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
              </div>
            </template>
          </template>
          <template #emptyText>
            <div class="mock-empty">
              <EmptyState title="暂无 ClickHouse 连接" description="未配置时指标页面按默认参数尝试连接（127.0.0.1）。">
                <button class="btn btn-primary btn-sm" @click="openCreateModal">新建连接</button>
              </EmptyState>
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
import StrokeIcon from '@/components/StrokeIcon.vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import EmptyState from '@/components/EmptyState.vue'
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
  { title: '名称', dataIndex: 'name', key: 'name', width: 140 },
  { title: '地址', key: 'address', width: 180 },
  { title: '数据库', dataIndex: 'database', key: 'database', width: 150 },
  { title: '用户', dataIndex: 'user', key: 'user', width: 100 },
  { title: '密码', key: 'password', width: 90 },
  { title: '上次测试', key: 'lastTest', width: 140 },
  { title: '当前', key: 'active', width: 90 },
  { title: '操作', key: 'actions', width: 300 },
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

/** 判定胶囊变体（可达绿 / 不可达红 / 检测中·未配置灰）；文案与色点语义见 healthDotClass */
const verdictPillClass = computed(() =>
  health.state === 'ok' ? 'pill-run' : health.state === 'fail' ? 'pill-stop' : 'pill-unknown',
)

/** 页头统计徽标（补充维度）：连接总数 + 上次测试失败数，均取当前已加载数据集 */
const headerStatItems = computed(() => {
  const failed = connections.value.filter((c) => c.last_test_ok === false).length
  return [
    { value: connections.value.length, label: '条连接' },
    { value: failed, label: '条测试失败', tone: 'bad' as const },
  ]
})

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

/* ── 当前数据源健康卡（ck-cardhead + ck-hero，设计页 clickhouse-config.html 同名类）── */
.ck-cardhead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.ck-cardhead h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}
.ck-cardhead .ck-sub {
  font-size: 11.5px;
  color: var(--muted);
}
.ck-empty-wrap {
  padding: 12px 0;
}
.ck-hero {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 20px 18px;
}
.ck-verdict {
  flex-shrink: 0;
}
/* 判定胶囊 24px 大号；色点复用 .status-dot 全局色，尺寸收为胶囊内 6px */
.ck-verdict .pill {
  height: 24px;
  font-size: 12px;
}
.ck-verdict .pill .dot.status-dot {
  width: 6px;
  height: 6px;
  margin: 0;
}
.ck-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ck-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ck-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
}
.ck-addr {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--muted);
}
.ck-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
}
.ck-meta .ok {
  color: var(--success);
}
.ck-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.ck-actions .tool-btn svg {
  width: 12px;
  height: 12px;
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

/* ── 连接列表表格（grid-table 全局解剖接管表头/悬停/密度；本页仅留语义色）── */
.mono {
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.table-body {
  padding: 0;
}
.ops {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ops .op-btn.op-danger {
  color: var(--danger);
}
.ops .op-btn.op-danger:disabled:hover {
  color: var(--danger);
}
.test-ok {
  color: var(--success);
  font-size: 12px;
}
.test-fail {
  color: var(--danger);
  font-size: 12px;
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
