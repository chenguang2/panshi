<template>
  <a-modal
    v-model:open="modalOpen"
    :title="editingUpstream ? '编辑上游' : '添加上游'"
    width="750px"
    :confirm-loading="submitting"
    @ok="handleSubmit"
    @cancel="$emit('close')"
  >
    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="basic" tab="基础配置">
        <a-form ref="formRef" :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
          <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入上游名称' }]">
            <a-input v-model:value="form.name" placeholder="请输入上游名称" />
          </a-form-item>
          <a-form-item label="所属集群" name="cluster_id" :rules="[{ required: true, message: '请选择所属集群' }]">
            <a-select v-model:value="form.cluster_id" :disabled="!!editingUpstream">
              <a-select-option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="负载均衡" name="load_balance" :rules="[{ required: true, message: '请选择负载均衡' }]">
            <a-select v-model:value="form.load_balance">
              <a-select-option value="weighted_roundrobin">加权轮询</a-select-option>
              <a-select-option value="chash">一致性哈希</a-select-option>
              <a-select-option value="ewma">延迟最小</a-select-option>
              <a-select-option value="least_conn">最少连接</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item v-if="form.load_balance === 'chash'" label="哈希位置" name="hash_on" :rules="[{ required: true, message: '请选择哈希位置' }]">
            <a-select v-model:value="form.hash_on">
              <a-select-option value="header">HTTP请求头</a-select-option>
              <a-select-option value="cookie">Cookie</a-select-option>
              <a-select-option value="vars">内置变量</a-select-option>
              <a-select-option value="vars_combinations">自定义变量</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item v-if="form.load_balance === 'chash'" label="Key" name="key" :rules="[{ required: true, message: '请输入哈希 Key' }]">
            <a-input v-model:value="form.key" placeholder="请输入哈希 Key" />
          </a-form-item>
          <a-form-item label="描述" name="description">
            <a-textarea v-model:value="form.description" :rows="2" />
          </a-form-item>
          <a-form-item label="节点列表">
            <a-table :columns="targetColumns" :data-source="form.targets" :pagination="false" size="small" row-key="key">
              <template #bodyCell="{ column, record, index }">
                <template v-if="column.key === 'ip'">
                  <a-input v-model:value="record.ip" placeholder="IP地址" />
                  <div v-if="targetValidation[index]?.ip" class="ant-form-item-explain-error">{{ targetValidation[index].ip }}</div>
                </template>
                <template v-else-if="column.key === 'port'">
                  <a-input-number v-model:value="record.port" :min="1" :max="65535" style="width: 100%" placeholder="端口" />
                  <div v-if="targetValidation[index]?.port" class="ant-form-item-explain-error">{{ targetValidation[index].port }}</div>
                </template>
                <template v-else-if="column.key === 'weight'">
                  <a-input-number v-model:value="record.weight" :min="1" :max="100" style="width: 100%" placeholder="权重" />
                  <div v-if="targetValidation[index]?.weight" class="ant-form-item-explain-error">{{ targetValidation[index].weight }}</div>
                </template>
                <template v-else-if="column.key === 'action'">
                  <a-button size="small" danger @click="removeTarget(index)">删除</a-button>
                </template>
              </template>
            </a-table>
            <a-button type="dashed" size="small" style="width: 100%; margin-top: 8px" @click="addTarget">
              <PlusOutlined /> 添加节点
            </a-button>
          </a-form-item>
          <a-form-item label="高级配置">
            <div style="display:flex;align-items:center;gap:8px;">
              <label class="toggle"><input type="checkbox" :checked="form.advancedEnabled" @change="form.advancedEnabled = !form.advancedEnabled" /><span class="toggle-slider"></span></label>
              <span style="color: #999; font-size: 12px;">开启后在"高级配置"页配置健康检查、超时、重试等</span>
            </div>
          </a-form-item>
        </a-form>
      </a-tab-pane>

      <a-tab-pane key="advanced" tab="高级配置">
        <div v-if="form.advancedEnabled">
          <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
            <a-form-item label="健康检查" name="checks">
              <a-textarea v-model:value="checksJson" :rows="6" placeholder="健康检查JSON配置" />
            </a-form-item>
            <a-form-item label="重试次数" name="retries">
              <a-input-number v-model:value="form.retries" :min="0" placeholder="默认等于可用节点数" style="width: 100%" />
              <div style="color: #999; font-size: 11px; margin-top: 2px">0 = 不启用重试，留空 = 自动使用节点数</div>
            </a-form-item>
            <a-form-item label="重试超时(秒)" name="retry_timeout">
              <a-input-number v-model:value="form.retry_timeout" :min="0" placeholder="秒" style="width: 100%" />
              <div style="color: #999; font-size: 11px; margin-top: 2px">0 = 不限制重试时间</div>
            </a-form-item>
            <a-form-item label="超时配置(秒)">
              <div style="display: flex; gap: 8px;">
                <div style="flex: 1"><div style="margin-bottom: 2px; color: #666; font-size: 12px">连接</div><a-input-number v-model:value="form.timeout.connect" :min="0" placeholder="connect" style="width: 100%" /></div>
                <div style="flex: 1"><div style="margin-bottom: 2px; color: #666; font-size: 12px">发送</div><a-input-number v-model:value="form.timeout.send" :min="0" placeholder="send" style="width: 100%" /></div>
                <div style="flex: 1"><div style="margin-bottom: 2px; color: #666; font-size: 12px">读取</div><a-input-number v-model:value="form.timeout.read" :min="0" placeholder="read" style="width: 100%" /></div>
              </div>
            </a-form-item>
            <a-form-item label="Host策略" name="pass_host">
              <a-select v-model:value="form.pass_host">
                <a-select-option value="pass">pass（透传客户端Host）</a-select-option>
                <a-select-option value="node">node（使用节点Host）</a-select-option>
                <a-select-option value="rewrite">rewrite（自定义Host）</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item v-if="form.pass_host === 'rewrite'" label="上游Host" name="upstream_host">
              <a-input v-model:value="form.upstream_host" placeholder="指定上游请求的Host" />
            </a-form-item>
            <a-form-item label="通信协议" name="scheme">
              <a-select v-model:value="form.scheme">
                <a-select-option value="http">http</a-select-option>
                <a-select-option value="https">https</a-select-option>
                <a-select-option value="tcp">tcp</a-select-option>
                <a-select-option value="udp">udp</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item label="连接池">
              <div style="display: flex; gap: 8px;">
                <div style="flex: 1"><div style="margin-bottom: 2px; color: #666; font-size: 12px">大小</div><a-input-number v-model:value="form.keepalive_pool.size" :min="1" placeholder="size" style="width: 100%" /></div>
                <div style="flex: 1"><div style="margin-bottom: 2px; color: #666; font-size: 12px">空闲超时(秒)</div><a-input-number v-model:value="form.keepalive_pool.idle_timeout" :min="0" placeholder="idle_timeout" style="width: 100%" /></div>
                <div style="flex: 1"><div style="margin-bottom: 2px; color: #666; font-size: 12px">最大请求数</div><a-input-number v-model:value="form.keepalive_pool.requests" :min="1" placeholder="requests" style="width: 100%" /></div>
              </div>
            </a-form-item>
          </a-form>
        </div>
        <div v-else class="advanced-disabled-hint">
          <WarningOutlined style="color: #faad14; margin-right: 8px;" />
          高级配置未启用，请在"基础配置"中开启
        </div>
      </a-tab-pane>
    </a-tabs>
    <template #footer>
      <a-button @click="$emit('close')">取消</a-button>
      <a-button type="primary" :loading="submitting" @click="handleSubmit">保存</a-button>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined, WarningOutlined } from '@ant-design/icons-vue'
import api from '@/api'

const props = defineProps<{
  visible: boolean
  editingUpstream: any | null
  clusters: { id: number; name: string; display_name?: string }[]
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const modalOpen = computed({
  get: () => props.visible,
  set: (val) => { if (!val) emit('close') },
})

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
const isValidIP = (ip: string): boolean => IP_PATTERN.test(ip)

const formRef = ref()
const activeTab = ref('basic')
const submitting = ref(false)
const targetValidation = ref<Record<string, { ip?: string; port?: string; weight?: string }>>({})
let targetKey = 0

const defaultChecksJson = JSON.stringify({ passive: {}, active: { unhealthy: {} } }, null, 2)
const defaultTimeout = { connect: 6, send: 6, read: 6 }

const form = reactive({
  name: '',
  cluster_id: null as number | null,
  load_balance: 'weighted_roundrobin',
  hash_on: 'vars',
  key: '',
  description: '',
  targets: [] as { key: number; ip: string; port: number; weight: number }[],
  advancedEnabled: false,
  retries: undefined as number | undefined,
  retry_timeout: 0,
  timeout: { connect: 6, send: 6, read: 6 },
  pass_host: 'pass',
  upstream_host: '',
  scheme: 'http',
  keepalive_pool: { size: undefined as number | undefined, idle_timeout: undefined as number | undefined, requests: undefined as number | undefined },
  checks: null as Record<string, unknown> | null,
})

const checksJson = ref(defaultChecksJson)

const targetColumns = [
  { title: 'IP地址', key: 'ip', width: 200 },
  { title: '端口', key: 'port', width: 120 },
  { title: '权重', key: 'weight', width: 100 },
  { title: '操作', key: 'action', width: 80 },
]

// Watch load_balance change - reset hash fields when not chash
watch(() => form.load_balance, (val) => {
  if (val !== 'chash') {
    form.hash_on = 'vars'
    form.key = ''
  }
})

// Watch checksJson -> update form.checks
watch(checksJson, (val) => {
  try { form.checks = JSON.parse(val) as Record<string, unknown> } catch { /* ignore */ }
})

// Watch advancedEnabled - reset advanced fields when disabled
watch(() => form.advancedEnabled, (val) => {
  if (!val) {
    form.checks = JSON.parse(defaultChecksJson) as Record<string, unknown>
    checksJson.value = defaultChecksJson
    form.retries = undefined
    form.retry_timeout = 0
    form.timeout = { ...defaultTimeout }
    form.pass_host = 'pass'
    form.upstream_host = ''
    form.scheme = 'http'
    form.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
  }
})

// Populate form when visible changes
watch(() => props.visible, (v) => {
  if (!v) return
  if (props.editingUpstream) {
    const u = props.editingUpstream
    form.cluster_id = u.cluster_id
    form.name = u.name
    form.load_balance = u.load_balance || 'weighted_roundrobin'
    form.hash_on = u.hash_on || 'vars'
    form.key = u.key || ''
    form.description = u.description || ''

    if (u.checks) {
      const c = typeof u.checks === 'string' ? JSON.parse(u.checks) : u.checks
      form.checks = c
      checksJson.value = JSON.stringify(c, null, 2)
    } else {
      form.checks = JSON.parse(defaultChecksJson) as Record<string, unknown>
      checksJson.value = defaultChecksJson
    }

    const isDefaultChecks = u.checks ? JSON.stringify(form.checks) === JSON.stringify({ passive: {}, active: { unhealthy: {} } }) : true
    const hasTimeout = u.timeout && u.timeout !== '{}'
    const t = hasTimeout ? (typeof u.timeout === 'string' ? JSON.parse(u.timeout) : u.timeout) : null
    const isDefaultTimeout = t ? t.connect === 6 && t.send === 6 && t.read === 6 : true

    form.advancedEnabled = !!(
      (u.retries !== undefined && u.retries !== null) ||
      (u.retry_timeout !== undefined && u.retry_timeout !== 0) ||
      (u.pass_host && u.pass_host !== 'pass') ||
      (u.upstream_host && u.upstream_host !== '') ||
      (u.scheme && u.scheme !== 'http') ||
      !isDefaultChecks ||
      !isDefaultTimeout ||
      (u.keepalive_pool && JSON.stringify(u.keepalive_pool) !== '{}' && u.keepalive_pool !== '{}')
    )

    form.retries = u.retries ?? undefined
    form.retry_timeout = u.retry_timeout ?? 0
    form.timeout = t || { ...defaultTimeout }
    form.pass_host = u.pass_host || 'pass'
    form.upstream_host = u.upstream_host || ''
    form.scheme = u.scheme || 'http'

    if (u.keepalive_pool && u.keepalive_pool !== '{}') {
      const k = typeof u.keepalive_pool === 'string' ? JSON.parse(u.keepalive_pool) : u.keepalive_pool
      form.keepalive_pool = { size: k.size, idle_timeout: k.idle_timeout, requests: k.requests }
    } else {
      form.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
    }

    form.targets = (u.targets || []).map((t: any) => {
      const [ip, port] = t.target.split(':')
      return { key: ++targetKey, ip: ip || '', port: port ? parseInt(port) : 80, weight: t.weight }
    })
  } else {
    form.cluster_id = null
    form.name = ''
    form.load_balance = 'weighted_roundrobin'
    form.hash_on = 'vars'
    form.key = ''
    form.description = ''
    form.targets = [{ key: ++targetKey, ip: '', port: 80, weight: 100 }]
    form.advancedEnabled = false
    form.retries = undefined
    form.retry_timeout = 0
    form.timeout = { ...defaultTimeout }
    form.pass_host = 'pass'
    form.upstream_host = ''
    form.scheme = 'http'
    form.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
    form.checks = JSON.parse(defaultChecksJson) as Record<string, unknown>
    checksJson.value = defaultChecksJson
  }
  targetValidation.value = {}
  activeTab.value = 'basic'
})

function addTarget() {
  form.targets.push({ key: ++targetKey, ip: '', port: 80, weight: 100 })
}

function removeTarget(index: number) {
  form.targets.splice(index, 1)
}

function validateTargets(): boolean {
  targetValidation.value = {}
  let valid = true
  const seen = new Set<string>()
  form.targets.forEach((t, i) => {
    const errors: Record<string, string> = {}
    if (!t.ip) { errors.ip = 'IP不能为空'; valid = false }
    else if (!isValidIP(t.ip)) { errors.ip = 'IP不合法'; valid = false }
    if (!t.port || t.port < 1 || t.port > 65535) { errors.port = '端口不合法'; valid = false }
    if (!t.weight || t.weight < 1 || t.weight > 100) { errors.weight = '权重不合法'; valid = false }
    if (t.ip && t.port) {
      const key = `${t.ip}:${t.port}`
      if (seen.has(key)) { errors.ip = `IP和端口与第 ${[...seen].indexOf(key) + 1} 行重复`; valid = false }
      seen.add(key)
    }
    targetValidation.value[`${i}`] = errors
  })
  return valid
}

async function handleSubmit() {
  try {
    if ((formRef.value as any)?.validate) {
      await (formRef.value as any).validate()
    }
  } catch { return }
  if (!validateTargets()) return

  submitting.value = true
  try {
    const submitData: Record<string, unknown> = {
      name: form.name,
      load_balance: form.load_balance,
      description: form.description,
      targets: form.targets.map(t => ({ target: `${t.ip}:${t.port}`, weight: t.weight })),
      checks: form.checks,
      timeout: form.timeout,
    }
    if (form.load_balance === 'chash') {
      submitData.hash_on = form.hash_on
      submitData.key = form.key
    }
    if (form.advancedEnabled) {
      if (form.retries !== undefined) submitData.retries = form.retries
      if (form.retry_timeout !== undefined) submitData.retry_timeout = form.retry_timeout
      if (form.pass_host) submitData.pass_host = form.pass_host
      if (form.pass_host === 'rewrite' && form.upstream_host) submitData.upstream_host = form.upstream_host
      if (form.scheme && form.scheme !== 'http') submitData.scheme = form.scheme
      const k = form.keepalive_pool
      if (k.size !== undefined || k.idle_timeout !== undefined || k.requests !== undefined) {
        const kp: Record<string, number> = {}
        if (k.size !== undefined) kp.size = k.size
        if (k.idle_timeout !== undefined) kp.idle_timeout = k.idle_timeout
        if (k.requests !== undefined) kp.requests = k.requests
        submitData.keepalive_pool = kp
      }
    }

    const clusterId = form.cluster_id
    if (props.editingUpstream) {
      await api.put(`/clusters/${clusterId}/upstreams/${props.editingUpstream.id}`, submitData)
      message.success('上游已更新')
    } else {
      await api.post(`/clusters/${clusterId}/upstreams`, submitData)
      message.success('上游已创建')
    }
    emit('saved')
    emit('close')
  } catch (error: any) {
    const detail = error?.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '操作失败')
  } finally {
    submitting.value = false
  }
}
</script>
