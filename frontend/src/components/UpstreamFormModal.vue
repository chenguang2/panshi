<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:800px;">
      <div class="modal-header">
        <h2>{{ editingUpstream ? '编辑上游' : '添加上游' }}</h2>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>

      <!-- Tab Bar -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基础配置</button>
        <button class="tab-btn" :class="{ active: activeTab === 'advanced' }" @click="activeTab = 'advanced'">高级配置</button>
      </div>

      <div class="modal-body">
        <!-- ── 基础配置 ── -->
        <div v-show="activeTab === 'basic'">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">名称 <span class="required">*</span></label>
              <input v-model="form.name" type="text" class="form-input" placeholder="请输入上游名称">
              <div v-if="formErrors.name" class="form-error">{{ formErrors.name }}</div>
            </div>
            <div class="form-group">
              <label class="form-label">所属集群 <span class="required">*</span></label>
              <select v-model="form.cluster_id" class="form-input" :disabled="!!editingUpstream">
                <option value="">请选择集群</option>
                <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
              </select>
              <div v-if="formErrors.cluster_id" class="form-error">{{ formErrors.cluster_id }}</div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">负载均衡 <span class="required">*</span></label>
              <select v-model="form.load_balance" class="form-input">
                <option value="weighted_roundrobin">加权轮询</option>
                <option value="chash">一致性哈希</option>
                <option value="ewma">延迟最小</option>
                <option value="least_conn">最少连接</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">描述</label>
              <input v-model="form.description" type="text" class="form-input" placeholder="描述信息">
            </div>
          </div>

          <template v-if="form.load_balance === 'chash'">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">哈希位置 <span class="required">*</span></label>
                <select v-model="form.hash_on" class="form-input">
                  <option value="header">HTTP请求头</option>
                  <option value="cookie">Cookie</option>
                  <option value="vars">内置变量</option>
                  <option value="vars_combinations">自定义变量组合</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Key <span class="required">*</span></label>
                <input v-model="form.key" type="text" class="form-input" placeholder="请输入哈希 Key">
              </div>
            </div>
          </template>

          <!-- 节点列表 -->
          <div class="form-group">
            <label class="form-label">节点列表</label>
            <div class="inline-table-wrap">
              <table class="inline-table">
                <thead>
                  <tr>
                    <th>IP 地址</th>
                    <th>端口</th>
                    <th>权重</th>
                    <th style="width:60px;">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(t, i) in form.targets" :key="t.key">
                    <td>
                      <input v-model="t.ip" type="text" class="form-input" placeholder="IP地址" style="height:30px;font-size:12px;">
                      <div v-if="targetValidation[i]?.ip" class="form-error">{{ targetValidation[i].ip }}</div>
                    </td>
                    <td>
                      <input v-model.number="t.port" type="number" class="form-input" min="1" max="65535" placeholder="端口" style="height:30px;font-size:12px;">
                      <div v-if="targetValidation[i]?.port" class="form-error">{{ targetValidation[i].port }}</div>
                    </td>
                    <td>
                      <input v-model.number="t.weight" type="number" class="form-input" min="1" max="100" placeholder="权重" style="height:30px;font-size:12px;">
                      <div v-if="targetValidation[i]?.weight" class="form-error">{{ targetValidation[i].weight }}</div>
                    </td>
                    <td>
                      <button class="btn btn-sm btn-danger" @click="removeTarget(i)">删除</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="formErrors.targets" class="form-error" style="margin-top:8px;">{{ formErrors.targets }}</div>
            <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px;border:1px dashed var(--border);" @click="addTarget">+ 添加节点</button>
          </div>
        </div>

        <!-- ── 高级配置 ── -->
        <div v-show="activeTab === 'advanced'" class="advanced-sections">
          <!-- 健康检查 -->
          <div class="advanced-section">
            <label class="checkbox-label section-toggle">
              <input type="checkbox" v-model="toggleChecks">
              <span>健康检查</span>
            </label>
            <textarea v-model="checksJson" class="form-input" rows="6"
              style="font-family:var(--font-mono);font-size:12px;resize:vertical;"
              :disabled="!toggleChecks">
            </textarea>
            <div v-if="formErrors.checks" class="form-error" style="margin-top:6px;">{{ formErrors.checks }}</div>
          </div>

          <!-- 超时配置 -->
          <div class="advanced-section">
            <label class="checkbox-label section-toggle">
              <input type="checkbox" v-model="toggleTimeout">
              <span>超时配置（秒）</span>
            </label>
            <div class="form-row-sm">
              <div class="form-sub-group">
                <div class="form-sub-label">连接</div>
                <input :value="form.timeout.connect ?? ''" @input="e => { const v = (e.target as HTMLInputElement).value; form.timeout.connect = v === '' ? undefined : parseFloat(v) }" type="number" class="form-input" min="0" placeholder="connect" style="height:30px;" :disabled="!toggleTimeout">
              </div>
              <div class="form-sub-group">
                <div class="form-sub-label">发送</div>
                <input :value="form.timeout.send ?? ''" @input="e => { const v = (e.target as HTMLInputElement).value; form.timeout.send = v === '' ? undefined : parseFloat(v) }" type="number" class="form-input" min="0" placeholder="send" style="height:30px;" :disabled="!toggleTimeout">
              </div>
              <div class="form-sub-group">
                <div class="form-sub-label">读取</div>
                <input :value="form.timeout.read ?? ''" @input="e => { const v = (e.target as HTMLInputElement).value; form.timeout.read = v === '' ? undefined : parseFloat(v) }" type="number" class="form-input" min="0" placeholder="read" style="height:30px;" :disabled="!toggleTimeout">
              </div>
            </div>
            <div v-if="formErrors.timeout" class="form-error" style="margin-top:6px;">{{ formErrors.timeout }}</div>
          </div>

          <!-- 连接池 -->
          <div class="advanced-section">
            <label class="checkbox-label section-toggle">
              <input type="checkbox" v-model="togglePool">
              <span>连接池</span>
            </label>
            <div class="form-row-sm">
              <div class="form-sub-group">
                <div class="form-sub-label">大小</div>
                <input :value="form.keepalive_pool.size ?? ''" @input="e => { const v = (e.target as HTMLInputElement).value; form.keepalive_pool.size = v === '' ? undefined : parseFloat(v) }" type="number" class="form-input" min="1" placeholder="大小" style="height:30px;" :disabled="!togglePool">
              </div>
              <div class="form-sub-group">
                <div class="form-sub-label">空闲超时（秒）</div>
                <input :value="form.keepalive_pool.idle_timeout ?? ''" @input="e => { const v = (e.target as HTMLInputElement).value; form.keepalive_pool.idle_timeout = v === '' ? undefined : parseFloat(v) }" type="number" class="form-input" min="0" placeholder="空闲超时" style="height:30px;" :disabled="!togglePool">
              </div>
              <div class="form-sub-group">
                <div class="form-sub-label">最大请求数</div>
                <input :value="form.keepalive_pool.requests ?? ''" @input="e => { const v = (e.target as HTMLInputElement).value; form.keepalive_pool.requests = v === '' ? undefined : parseFloat(v) }" type="number" class="form-input" min="1" placeholder="最大请求" style="height:30px;" :disabled="!togglePool">
              </div>
            </div>
            <div v-if="formErrors.keepalive_pool" class="form-error" style="margin-top:6px;">{{ formErrors.keepalive_pool }}</div>
          </div>

          <!-- 重试次数 -->
          <div class="advanced-section">
            <label class="checkbox-label section-toggle">
              <input type="checkbox" v-model="toggleRetries">
              <span>重试次数</span>
            </label>
            <div :style="{ opacity: toggleRetries ? 1 : 0.45 }">
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="auto" v-model="retriesRadio" :disabled="!toggleRetries">
                  <span>自动（使用可用节点数）</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="custom" v-model="retriesRadio" :disabled="!toggleRetries">
                  <span>指定重试次数</span>
                </label>
                <template v-if="retriesRadio === 'custom'">
                  <input :value="form.retriesInput ?? ''" @input="e => { const v = (e.target as HTMLInputElement).value; form.retriesInput = v === '' ? undefined : parseFloat(v) }" type="number" class="form-input" min="0" placeholder="次数" style="height:30px;width:120px;margin-left:24px;" :disabled="!toggleRetries">
                </template>
                <label class="radio-label">
                  <input type="radio" value="disabled" v-model="retriesRadio" :disabled="!toggleRetries">
                  <span>禁用重试</span>
                </label>
              </div>
              <div v-if="formErrors.retries" class="form-error" style="margin-top:4px;">{{ formErrors.retries }}</div>
              <div class="form-hint">自动 = 使用后端可用节点数作为重试次数</div>
            </div>
          </div>

          <!-- 重试超时 -->
          <div class="advanced-section">
            <label class="checkbox-label section-toggle">
              <input type="checkbox" v-model="toggleRetryTimeout">
              <span>重试超时（秒）</span>
            </label>
            <input :value="form.retry_timeout ?? ''" @input="e => { const v = (e.target as HTMLInputElement).value; form.retry_timeout = v === '' ? undefined : parseFloat(v) }" type="number" class="form-input" min="0" placeholder="秒" style="max-width:200px;" :disabled="!toggleRetryTimeout">
            <div v-if="formErrors.retry_timeout" class="form-error" style="margin-top:4px;">{{ formErrors.retry_timeout }}</div>
            <div class="form-hint">0 = 不限制重试时间</div>
          </div>

          <!-- Host 策略 -->
          <div class="advanced-section">
            <label class="checkbox-label section-toggle">
              <input type="checkbox" v-model="toggleHost">
              <span>Host 策略</span>
            </label>
            <div class="form-row-sm">
              <div class="form-sub-group" style="max-width:260px;">
                <div class="form-sub-label">Host 策略</div>
                <select v-model="form.pass_host" class="form-input" :disabled="!toggleHost">
                  <option value="pass">pass（透传客户端 Host）</option>
                  <option value="node">node（使用节点 Host）</option>
                  <option value="rewrite">rewrite（自定义 Host）</option>
                </select>
              </div>
              <div v-if="form.pass_host === 'rewrite'" class="form-sub-group">
                <div class="form-sub-label">上游 Host</div>
                <input v-model="form.upstream_host" type="text" class="form-input" placeholder="指定上游请求的Host" :disabled="!toggleHost">
              </div>
            </div>
            <div v-if="formErrors.pass_host" class="form-error" style="margin-top:6px;">{{ formErrors.pass_host }}</div>
          </div>

          <!-- 通信协议 -->
          <div class="advanced-section">
            <label class="checkbox-label section-toggle">
              <input type="checkbox" v-model="toggleScheme">
              <span>通信协议</span>
            </label>
            <select v-model="form.scheme" class="form-input" style="max-width:200px;" :disabled="!toggleScheme">
              <option value="http">http</option>
              <option value="https">https</option>
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
            </select>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">{{ submitting ? '提交中...' : '保存' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
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

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
const isValidIP = (ip: string): boolean => IP_PATTERN.test(ip)

const activeTab = ref('basic')
const submitting = ref(false)
const formErrors = reactive<Record<string, string>>({})
const targetValidation = ref<Record<string, { ip?: string; port?: string; weight?: string }>>({})
let targetKey = 0

// ── Individual toggle states ──
const toggleChecks = ref(false)
const toggleTimeout = ref(false)
const togglePool = ref(false)
const toggleRetries = ref(false)
const toggleRetryTimeout = ref(false)
const toggleHost = ref(false)
const toggleScheme = ref(false)

// ── Retries radio ──
const retriesRadio = ref<'auto' | 'custom' | 'disabled'>('auto')

// computed submit value for retries
const retriesSubmitValue = computed<number | null>(() => {
  switch (retriesRadio.value) {
    case 'auto': return null
    case 'custom': return form.retriesInput ?? null
    case 'disabled': return 0
  }
})

const defaultChecksJson = JSON.stringify({ passive: {}, active: { unhealthy: {} } }, null, 2)
const defaultTimeout = { connect: 6, send: 6, read: 6 }

const form = reactive({
  name: '',
  cluster_id: '' as number | string,
  load_balance: 'weighted_roundrobin',
  hash_on: 'vars',
  key: '',
  description: '',
  targets: [] as { key: number; ip: string; port: number; weight: number }[],
  retriesInput: undefined as number | undefined,
  retry_timeout: 0,
  timeout: { ...defaultTimeout },
  pass_host: 'pass',
  upstream_host: '',
  scheme: 'http',
  keepalive_pool: { size: undefined as number | undefined, idle_timeout: undefined as number | undefined, requests: undefined as number | undefined },
  checks: null as Record<string, unknown> | null,
})

const checksJson = ref(defaultChecksJson)

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

// Populate form when visible changes
watch(() => props.visible, (v) => {
  if (!v) return
  populateForm()
}, { immediate: true })

function populateForm() {
  formErrors.name = ''
  formErrors.cluster_id = ''
  formErrors.targets = ''
  targetValidation.value = {}
  activeTab.value = 'basic'

  // Reset all toggles to OFF
  toggleChecks.value = false
  toggleTimeout.value = false
  togglePool.value = false
  toggleRetries.value = false
  toggleRetryTimeout.value = false
  toggleHost.value = false
  toggleScheme.value = false
  retriesRadio.value = 'auto'

  if (props.editingUpstream) {
    const u = props.editingUpstream
    form.cluster_id = u.cluster_id
    form.name = u.name
    form.load_balance = u.load_balance || 'weighted_roundrobin'
    form.hash_on = u.hash_on || 'vars'
    form.key = u.key || ''
    form.description = u.description || ''

    // Individual toggle from DB values
    toggleChecks.value = u.checks !== null && u.checks !== undefined && u.checks !== '{}'
    if (u.checks) {
      const c = typeof u.checks === 'string' ? JSON.parse(u.checks) : u.checks
      form.checks = c
      checksJson.value = JSON.stringify(c, null, 2)
    } else {
      const defaultParsed = JSON.parse(defaultChecksJson) as Record<string, unknown>
      form.checks = defaultParsed
      checksJson.value = defaultChecksJson
    }

    toggleTimeout.value = u.timeout !== null && u.timeout !== undefined
    const t = u.timeout ? (typeof u.timeout === 'string' ? JSON.parse(u.timeout) : u.timeout) : null
    form.timeout = t || { connect: 6, send: 6, read: 6 }

    toggleRetries.value = u.retries !== null && u.retries !== undefined
    if (u.retries !== null && u.retries !== undefined) {
      if (u.retries === 0) {
        retriesRadio.value = 'disabled'
        form.retriesInput = undefined
      } else {
        retriesRadio.value = 'custom'
        form.retriesInput = u.retries
      }
    } else {
      retriesRadio.value = 'auto'
      form.retriesInput = undefined
    }

    toggleRetryTimeout.value = u.retry_timeout !== null && u.retry_timeout !== undefined
    form.retry_timeout = u.retry_timeout ?? 0

    toggleHost.value = u.pass_host !== null && u.pass_host !== undefined
    form.pass_host = u.pass_host || 'pass'
    form.upstream_host = u.upstream_host || ''

    toggleScheme.value = u.scheme !== null && u.scheme !== undefined
    form.scheme = u.scheme || 'http'

    togglePool.value = u.keepalive_pool !== null && u.keepalive_pool !== undefined && u.keepalive_pool !== '{}'
    if (u.keepalive_pool && u.keepalive_pool !== '{}') {
      const k = typeof u.keepalive_pool === 'string' ? JSON.parse(u.keepalive_pool) : u.keepalive_pool
      form.keepalive_pool = { size: k.size ?? 10, idle_timeout: k.idle_timeout ?? 60, requests: k.requests ?? 100 }
    } else {
      form.keepalive_pool = { size: 10, idle_timeout: 60, requests: 100 }
    }

    form.targets = (u.targets || []).map((t: any) => {
      const [ip, port] = t.target.split(':')
      return { key: ++targetKey, ip: ip || '', port: port ? parseInt(port) : 80, weight: t.weight }
    })
  } else {
    form.cluster_id = ''
    form.name = ''
    form.load_balance = 'weighted_roundrobin'
    form.hash_on = 'vars'
    form.key = ''
    form.description = ''
    form.targets = [{ key: ++targetKey, ip: '', port: 80, weight: 100 }]
    form.retriesInput = undefined
    form.retry_timeout = 0
    form.timeout = { ...defaultTimeout }
    form.pass_host = 'pass'
    form.upstream_host = ''
    form.scheme = 'http'
    form.keepalive_pool = { size: 10, idle_timeout: 60, requests: 100 }
    const defaultParsed = JSON.parse(defaultChecksJson) as Record<string, unknown>
    form.checks = defaultParsed
    checksJson.value = defaultChecksJson
  }
}

function addTarget() {
  form.targets.push({ key: ++targetKey, ip: '', port: 80, weight: 100 })
}

function removeTarget(index: number) {
  form.targets.splice(index, 1)
}

function validateForm(): boolean {
  formErrors.name = ''
  formErrors.cluster_id = ''
  targetValidation.value = {}

  if (!form.name.trim()) { formErrors.name = '请输入上游名称'; return false }
  if (!form.cluster_id) { formErrors.cluster_id = '请选择所属集群'; return false }

  let valid = true
  formErrors.targets = ''
  if (form.targets.length === 0) {
    formErrors.targets = '请至少添加一个节点'
    valid = false
  }
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

  // Validate advanced fields when toggled ON
  formErrors.checks = ''
  formErrors.timeout = ''
  formErrors.keepalive_pool = ''
  formErrors.retries = ''
  formErrors.retry_timeout = ''
  formErrors.pass_host = ''
  if (toggleChecks.value) {
    try {
      JSON.parse(checksJson.value)
    } catch {
      formErrors.checks = 'JSON 格式不正确，请检查'
      valid = false
    }
  }
  if (toggleTimeout.value) {
    const t = form.timeout
    if (t.connect === undefined || t.connect === null || isNaN(t.connect) ||
        t.send === undefined || t.send === null || isNaN(t.send) ||
        t.read === undefined || t.read === null || isNaN(t.read)) {
      formErrors.timeout = '请填写完整的超时配置（连接、发送、读取）'
      valid = false
    }
  }
  if (togglePool.value) {
    const k = form.keepalive_pool
    if (k.size === undefined || k.idle_timeout === undefined || k.requests === undefined) {
      formErrors.keepalive_pool = '请填写完整的连接池配置（大小、空闲超时、最大请求数）'
      valid = false
    }
  }
  if (toggleRetryTimeout.value) {
    if (form.retry_timeout === undefined || form.retry_timeout === null || isNaN(form.retry_timeout)) {
      formErrors.retry_timeout = '请填写重试超时（0 = 不限制）'
      valid = false
    }
  }
  if (toggleRetries.value && retriesRadio.value === 'custom') {
    if (form.retriesInput === undefined || form.retriesInput < 1) {
      formErrors.retries = '请输入大于 0 的重试次数'
      valid = false
    }
  }
  if (toggleHost.value && form.pass_host === 'rewrite' && !form.upstream_host) {
    formErrors.pass_host = '请填写上游 Host'
    valid = false
  }

  return valid
}

async function handleSubmit() {
  if (!validateForm()) return

  submitting.value = true
  try {
    const submitData: Record<string, unknown> = {
      name: form.name,
      load_balance: form.load_balance,
      description: form.description,
      targets: form.targets.map(t => ({ target: `${t.ip}:${t.port}`, weight: t.weight })),
    }
    if (form.load_balance === 'chash') {
      submitData.hash_on = form.hash_on
      submitData.key = form.key
    }

    // Each advanced field controlled by its toggle
    submitData.checks = toggleChecks.value ? form.checks : null
    submitData.timeout = toggleTimeout.value ? form.timeout : null

    if (togglePool.value) {
      const k = form.keepalive_pool
      if (k.size !== undefined || k.idle_timeout !== undefined || k.requests !== undefined) {
        const kp: Record<string, number> = {}
        if (k.size !== undefined) kp.size = k.size
        if (k.idle_timeout !== undefined) kp.idle_timeout = k.idle_timeout
        if (k.requests !== undefined) kp.requests = k.requests
        submitData.keepalive_pool = kp
      }
    } else {
      submitData.keepalive_pool = null
    }

    submitData.retries = toggleRetries.value ? retriesSubmitValue.value : null
    submitData.retry_timeout = toggleRetryTimeout.value ? form.retry_timeout : null

    submitData.pass_host = toggleHost.value ? form.pass_host : null
    submitData.upstream_host = toggleHost.value && form.pass_host === 'rewrite' ? (form.upstream_host || null) : null
    submitData.scheme = toggleScheme.value ? form.scheme : null

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

<style scoped>
.form-row { display: flex; gap: 16px; margin-bottom: 0; }
.form-row-sm { display: flex; gap: 8px; }
.form-group { flex: 1; margin-bottom: 16px; }
.form-sub-group { flex: 1; }

/* ── Advanced sections ── */
.advanced-sections {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.advanced-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  background: var(--surface);
}

/* Tab Bar */
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  padding: 0 20px;
  background: var(--surface);
}
.tab-btn {
  padding: 10px 20px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  font-family: var(--font-body);
}
.tab-btn:hover { color: var(--fg); }
.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.form-sub-label {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 4px;
}

.required { color: var(--danger); }

.form-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

.form-error {
  font-size: 12px;
  color: var(--danger);
  margin-top: 2px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
}
.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.section-toggle {
  margin-bottom: 10px;
  font-weight: 600;
}

/* Radio group */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.radio-label input[type="radio"] {
  accent-color: var(--accent);
}

/* ── Inline Table for Targets ── */
.inline-table-wrap {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.inline-table { width: 100%; border-collapse: collapse; }
.inline-table thead th {
  background: oklch(97% 0.005 250);
  padding: 8px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}
.inline-table tbody td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.inline-table tbody tr:last-child td { border-bottom: none; }
</style>
