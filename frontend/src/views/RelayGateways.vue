<template>
  <div class="relay-gateways">
    <PageHeader
      title="中继区域管理"
      description="维护跨中心中继网关的区域注册表：每个路局一条区域记录（网关 HTTP 腿 + SSH 跳板）。区域路由为空的集群按直连执行；首次装机点「初始化网关」写入 8443 配置并启动服务，节点白名单变更点「下发配置」同步。"
    >
      <template #actions>
        <button class="btn btn-primary" @click="openCreate">+ 新建区域</button>
      </template>
    </PageHeader>

    <div class="card">
      <div class="card-header"><h3>区域列表</h3></div>
      <div class="card-body">
        <a-table
          :columns="columns"
          :data-source="regions"
          :loading="loading"
          row-key="id"
          :pagination="false"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'code'">
              <a-tag color="blue">{{ record.code }}</a-tag>
            </template>
            <template v-else-if="column.key === 'http_base_url'">
              {{ record.http_base_url || '—' }}
            </template>
            <template v-else-if="column.key === 'ssh_jump'">
              {{ record.ssh_jump || '—' }}
            </template>
            <template v-else-if="column.key === 'openresty_prefix'">
              {{ record.openresty_prefix || '—' }}
            </template>
            <template v-else-if="column.key === 'status'">
              <a-tag :color="record.status === 'enabled' ? 'green' : 'default'">
                {{ record.status === 'enabled' ? '启用' : '禁用（直连回退）' }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <div class="row-actions">
                <button class="btn btn-sm" :disabled="busy" @click="openEdit(record)">编辑</button>
                <button class="btn btn-sm" :disabled="busy" @click="handleToggle(record)">
                  {{ record.status === 'enabled' ? '禁用' : '启用' }}
                </button>
                <button class="btn btn-sm" :disabled="busy || testing" @click="handleTest(record)">
                  {{ testingId === record.id ? '测试中...' : '连通性测试' }}
                </button>
                <button class="btn btn-sm" :disabled="busy || initializing" @click="handleInit(record)">
                  {{ initializingId === record.id ? '初始化中...' : '初始化网关' }}
                </button>
                <button class="btn btn-sm btn-primary" :disabled="busy" @click="handlePush(record)">
                  {{ pushingId === record.id ? '下发中...' : '下发配置' }}
                </button>
                <button class="btn btn-sm btn-danger" :disabled="busy" @click="handleDelete(record)">删除</button>
              </div>
            </template>
          </template>
        </a-table>
        <div v-if="!loading && regions.length === 0" class="empty-hint">
          暂无区域。未配置任何区域时，全部集群按现状直连执行。
        </div>
      </div>
    </div>

    <!-- 新建 / 编辑弹窗（视图级内联弹窗，约定 #25） -->
    <div v-if="modal.open" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card">
        <h2>{{ modal.editing ? '编辑区域' : '新建区域' }}</h2>
        <div class="form-group">
          <label class="form-label">区域码 <span class="required">*</span></label>
          <input
            type="text"
            class="form-input"
            :class="{ 'has-error': formErrors.code }"
            v-model="form.code"
            :disabled="modal.editing"
            placeholder="小写字母开头，小写字母/数字/中划线，如 luju"
          />
          <span class="form-error" v-if="formErrors.code">{{ formErrors.code }}</span>
          <span class="form-hint" v-else>创建后不可修改；用于集群挂接与网关配置渲染</span>
        </div>
        <div class="form-group">
          <label class="form-label">展示名 <span class="required">*</span></label>
          <input type="text" class="form-input" v-model="form.name" placeholder="如：路局A" />
        </div>
        <div class="form-group">
          <label class="form-label">网关 HTTP 腿</label>
          <input
            type="text"
            class="form-input"
            v-model="form.http_base_url"
            placeholder="如 http://10.10.1.1:8443（留空 = 直连）"
          />
          <span class="form-hint">该局网关的 HTTP 反向代理地址；留空表示该区域直连</span>
        </div>
        <div class="form-group">
          <label class="form-label">SSH 跳板</label>
          <input
            type="text"
            class="form-input"
            v-model="form.ssh_jump"
            placeholder="如 tunnel@10.10.1.1:22（留空 = 直连）"
          />
          <span class="form-hint">跳板专用账号与网关地址；留空表示该区域 SSH 直连</span>
        </div>
        <div class="form-group">
          <label class="form-label">OpenResty 前缀</label>
          <input
            type="text"
            class="form-input"
            v-model="form.openresty_prefix"
            placeholder="如 /work/jboss/tunnel/openresty-1.21.4.1/nginx"
          />
          <span class="form-hint">网关机 OpenResty 安装前缀（含 conf/sbin/logs）；「初始化网关」必填</span>
        </div>
        <div class="form-group">
          <label class="form-label">状态</label>
          <select class="form-input" v-model="form.status">
            <option value="enabled">启用</option>
            <option value="disabled">禁用（该区域回退直连）</option>
          </select>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">
            {{ submitting ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { h } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import {
  createRelayGateway,
  deleteRelayGateway,
  initRelayGateway,
  listRelayGateways,
  pushRelayGatewayConfig,
  relayHealthCheck,
  updateRelayGateway,
  type RelayGateway,
  type RelayHealthResult,
} from '@/api/relay'
import { getApiErrorMessage } from '@/utils/error'

const CODE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/

const regions = ref<RelayGateway[]>([])
const loading = ref(false)
const busy = ref(false)
const testing = ref(false)
const testingId = ref<number | null>(null)
const pushingId = ref<number | null>(null)
const initializing = ref(false)
const initializingId = ref<number | null>(null)

const columns = [
  { title: '区域码', key: 'code' },
  { title: '展示名', dataIndex: 'name', key: 'name' },
  { title: '网关 HTTP 腿', key: 'http_base_url' },
  { title: 'SSH 跳板', key: 'ssh_jump' },
  { title: 'OpenResty 前缀', key: 'openresty_prefix' },
  { title: '状态', key: 'status' },
  { title: '操作', key: 'actions', width: 400 },
]

const modal = reactive({ open: false, editing: false })
const submitting = ref(false)
const form = reactive({
  id: 0,
  code: '',
  name: '',
  http_base_url: '',
  ssh_jump: '',
  openresty_prefix: '',
  status: 'enabled',
})
const formErrors = reactive({ code: '' })

async function load() {
  loading.value = true
  try {
    const res = await listRelayGateways()
    regions.value = res.data
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  modal.editing = false
  modal.open = true
  form.id = 0
  form.code = ''
  form.name = ''
  form.http_base_url = ''
  form.ssh_jump = ''
  form.openresty_prefix = ''
  form.status = 'enabled'
  formErrors.code = ''
}

function openEdit(record: RelayGateway) {
  modal.editing = true
  modal.open = true
  form.id = record.id
  form.code = record.code
  form.name = record.name
  form.http_base_url = record.http_base_url || ''
  form.ssh_jump = record.ssh_jump || ''
  form.openresty_prefix = record.openresty_prefix || ''
  form.status = record.status
  formErrors.code = ''
}

function closeModal() {
  modal.open = false
}

function validateCode(): boolean {
  if (!CODE_PATTERN.test(form.code)) {
    formErrors.code = '区域码格式错误：小写字母开头，仅含小写字母/数字/中划线，长度 2-32'
    return false
  }
  formErrors.code = ''
  return true
}

async function handleSubmit() {
  if (!validateCode()) return
  if (!form.name) {
    message.error('请输入展示名')
    return
  }
  submitting.value = true
  try {
    if (modal.editing) {
      await updateRelayGateway(form.id, {
        name: form.name,
        http_base_url: form.http_base_url || null,
        ssh_jump: form.ssh_jump || null,
        openresty_prefix: form.openresty_prefix || null,
        status: form.status,
      })
      message.success('区域已更新')
    } else {
      await createRelayGateway({
        code: form.code,
        name: form.name,
        http_base_url: form.http_base_url || null,
        ssh_jump: form.ssh_jump || null,
        openresty_prefix: form.openresty_prefix || null,
        status: form.status,
      })
      message.success('区域已创建')
    }
    modal.open = false
    await load()
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    submitting.value = false
  }
}

function handleToggle(record: RelayGateway) {
  const next = record.status === 'enabled' ? 'disabled' : 'enabled'
  showOverlayModal({
    title: next === 'disabled' ? '禁用区域' : '启用区域',
    content: h(
      'p',
      null,
      next === 'disabled'
        ? `禁用后「${record.name}」的节点将回退直连执行（直连通常不可达，操作会失败并附提示）。确认禁用？`
        : `启用后「${record.name}」的节点将按网关路由执行。确认启用？`,
    ),
    okText: '确认',
    onOk: async () => {
      try {
        await updateRelayGateway(record.id, { status: next })
        message.success(next === 'disabled' ? '区域已禁用' : '区域已启用')
        await load()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
  })
}

async function handleTest(record: RelayGateway) {
  testing.value = true
  testingId.value = record.id
  try {
    const res = await relayHealthCheck(record.code)
    const result = res.data as RelayHealthResult
    const lines = result.segments.map((s) => `${s.name}：${s.ok ? '✓ 可达' : `✗ ${s.error || '不可达'}`}`).join('\n')
    if (result.ok) {
      message.success(`「${record.name}」连通性测试通过\n${lines}`)
    } else {
      message.warning(`「${record.name}」连通性异常\n${lines}`)
    }
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    testing.value = false
    testingId.value = null
  }
}

function handleInit(record: RelayGateway) {
  showOverlayModal({
    title: '初始化网关',
    content: h('div', null, [
      h(
        'p',
        null,
        `将 8443 监听 server 块与当前白名单写入「${record.name}」网关机（OpenResty 前缀：${record.openresty_prefix || '未配置'}），校验后启动/重载。`,
      ),
      h(
        'p',
        { style: 'color: var(--muted); font-size: 12px' },
        '幂等可重复执行；首次装机必做，后续白名单变更走「下发配置」。',
      ),
    ]),
    okText: '开始初始化',
    onOk: async () => {
      if (!record.openresty_prefix) {
        message.error('区域未配置 OpenResty 前缀，请先编辑区域填写')
        return
      }
      initializing.value = true
      initializingId.value = record.id
      busy.value = true
      try {
        const res = await initRelayGateway(record.id)
        if (res.data.ok) {
          message.success(
            `初始化完成（${res.data.hosts_pattern || record.code}，监听 ${res.data.listen_port || 8443}）`,
          )
        } else {
          message.error(`初始化失败：${res.data.status || '未知状态'}`)
        }
        await load()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      } finally {
        initializing.value = false
        initializingId.value = null
        busy.value = false
      }
    },
  })
}

function handlePush(record: RelayGateway) {
  showOverlayModal({
    title: '下发网关配置',
    content: h('div', null, [
      h('p', null, `将「${record.name}」的节点白名单（nginx map + sshd PermitOpen）推送到该局全部网关机。`),
      h('p', { style: 'color: var(--muted); font-size: 12px' }, '双机全部成功才算成功；单机失败请修复后重新下发。'),
    ]),
    okText: '开始下发',
    onOk: async () => {
      pushingId.value = record.id
      busy.value = true
      try {
        const res = await pushRelayGatewayConfig(record.id)
        if (res.data.ok) {
          message.success(`配置已下发（${res.data.hosts_pattern || record.code}）`)
        } else {
          message.error(`下发失败：${res.data.status || '未知状态'}`)
        }
        await load()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      } finally {
        pushingId.value = null
        busy.value = false
      }
    },
  })
}

function handleDelete(record: RelayGateway) {
  showOverlayModal({
    title: '删除区域',
    content: h('p', null, `确认删除区域「${record.name}」（${record.code}）？仍被集群挂接时将拒绝删除。`),
    okText: '确认删除',
    okDanger: true,
    onOk: async () => {
      try {
        await deleteRelayGateway(record.id)
        message.success('区域已删除')
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
.relay-gateways {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.row-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.empty-hint {
  color: var(--muted);
  font-size: 13px;
  padding: 12px 0;
}
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
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  padding: 20px;
  width: 480px;
  max-height: 85vh;
  overflow: auto;
}
.modal-card h2 {
  margin: 0 0 16px;
  font-size: 16px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.btn-danger {
  color: #cf1322;
  border-color: #ffa39e;
}
.btn-danger:hover {
  background: #fff1f0;
}
</style>
