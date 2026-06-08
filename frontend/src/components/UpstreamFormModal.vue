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
                  <option value="vars_combinations">自定义变量</option>
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
            <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px;border:1px dashed var(--border);" @click="addTarget">+ 添加节点</button>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.advancedEnabled">
              <span>开启高级配置</span>
            </label>
            <div class="form-hint">开启后在"高级配置"页配置健康检查、超时、重试等</div>
          </div>
        </div>

        <!-- ── 高级配置 ── -->
        <div v-show="activeTab === 'advanced'">
          <template v-if="form.advancedEnabled">
            <div class="form-group">
              <label class="form-label">健康检查</label>
              <textarea v-model="checksJson" class="form-input" rows="6" style="font-family:var(--font-mono);font-size:12px;resize:vertical;"></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">重试次数</label>
                <input v-model.number="form.retries" type="number" class="form-input" min="0" placeholder="默认等于可用节点数">
                <div class="form-hint">0 = 不启用重试，留空 = 自动使用节点数</div>
              </div>
              <div class="form-group">
                <label class="form-label">重试超时（秒）</label>
                <input v-model.number="form.retry_timeout" type="number" class="form-input" min="0" placeholder="秒">
                <div class="form-hint">0 = 不限制重试时间</div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">超时配置（秒）</label>
              <div class="form-row-sm">
                <div class="form-sub-group">
                  <div class="form-sub-label">连接</div>
                  <input v-model.number="form.timeout.connect" type="number" class="form-input" min="0" placeholder="connect" style="height:30px;">
                </div>
                <div class="form-sub-group">
                  <div class="form-sub-label">发送</div>
                  <input v-model.number="form.timeout.send" type="number" class="form-input" min="0" placeholder="send" style="height:30px;">
                </div>
                <div class="form-sub-group">
                  <div class="form-sub-label">读取</div>
                  <input v-model.number="form.timeout.read" type="number" class="form-input" min="0" placeholder="read" style="height:30px;">
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Host 策略</label>
                <select v-model="form.pass_host" class="form-input">
                  <option value="pass">pass（透传客户端 Host）</option>
                  <option value="node">node（使用节点 Host）</option>
                  <option value="rewrite">rewrite（自定义 Host）</option>
                </select>
              </div>
              <div class="form-group" v-if="form.pass_host === 'rewrite'">
                <label class="form-label">上游 Host</label>
                <input v-model="form.upstream_host" type="text" class="form-input" placeholder="指定上游请求的Host">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">通信协议</label>
                <select v-model="form.scheme" class="form-input">
                  <option value="http">http</option>
                  <option value="https">https</option>
                  <option value="tcp">tcp</option>
                  <option value="udp">udp</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">连接池</label>
                <div class="form-row-sm">
                  <div class="form-sub-group">
                    <div class="form-sub-label">大小</div>
                    <input v-model.number="form.keepalive_pool.size" type="number" class="form-input" min="1" placeholder="size" style="height:30px;">
                  </div>
                  <div class="form-sub-group">
                    <div class="form-sub-label">空闲超时（秒）</div>
                    <input v-model.number="form.keepalive_pool.idle_timeout" type="number" class="form-input" min="0" placeholder="idle" style="height:30px;">
                  </div>
                  <div class="form-sub-group">
                    <div class="form-sub-label">最大请求数</div>
                    <input v-model.number="form.keepalive_pool.requests" type="number" class="form-input" min="1" placeholder="requests" style="height:30px;">
                  </div>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="advanced-disabled-hint">
            <span class="hint-icon">&#x26A0;</span>
            高级配置未启用，请在"基础配置"中开启
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
import { ref, reactive, watch } from 'vue'
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
  formErrors.name = ''
  formErrors.cluster_id = ''
  targetValidation.value = {}
  activeTab.value = 'basic'

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
    form.cluster_id = ''
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
})

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

  // Validate targets
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
  if (!validateForm()) return

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

<style scoped>
/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 40%);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.modal-wide { max-width: 800px; }

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: oklch(56% 0.16 210 / 10%);
}
.modal-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fg);
}

.modal-close {
  width: 28px; height: 28px;
  border: none; background: transparent;
  font-size: 20px; cursor: pointer;
  color: var(--muted); border-radius: var(--radius-sm);
}
.modal-close:hover { background: var(--bg); color: var(--fg); }

/* ── Tab Bar ── */
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

/* ── Modal Body ── */
.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}

.form-row { display: flex; gap: 16px; margin-bottom: 0; }
.form-row-sm { display: flex; gap: 8px; }
.form-group { flex: 1; margin-bottom: 16px; }
.form-sub-group { flex: 1; }

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

/* ── Advanced disabled hint ── */
.advanced-disabled-hint {
  text-align: center;
  padding: 40px 20px;
  color: var(--muted);
  font-size: 13px;
}
.hint-icon { font-size: 18px; margin-right: 8px; }
</style>
