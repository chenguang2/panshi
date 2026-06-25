<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:860px;">
      <div class="modal-header">
        <h2>{{ editingProxy ? '编辑四层代理' : '新建四层代理' }}</h2>
        <button class="modal-close" @click="handleCancel">&times;</button>
      </div>

      <!-- Step Indicator -->
      <div class="step-indicator">
        <div class="step-item" :class="{ active: currentStep === 1, done: currentStep > 1 }">
          <div class="step-circle">
            <span v-if="currentStep > 1" class="step-check">&#10003;</span>
            <span v-else>1</span>
          </div>
          <span class="step-label">端口选择</span>
        </div>
        <div class="step-line" :class="{ done: currentStep > 1 }"></div>
        <div class="step-item" :class="{ active: currentStep === 2, done: currentStep > 2 }">
          <div class="step-circle">
            <span>2</span>
          </div>
          <span class="step-label">配置详情</span>
        </div>
      </div>

      <div class="modal-body">
        <!-- ═══ Step 1: Port Selection ═══ -->
        <div v-show="currentStep === 1">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">所属集群 <span class="required">*</span></label>
              <select v-model="form.cluster_id" class="form-input" :disabled="!!editingProxy" @change="onClusterChange">
                <option value="">请选择集群</option>
                <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
              </select>
              <div v-if="formErrors.cluster_id" class="form-error">{{ formErrors.cluster_id }}</div>
            </div>
            <div class="form-group">
              <label class="form-label">参考节点 <span class="required">*</span></label>
              <select v-model="form.node_id" class="form-input" :disabled="!form.cluster_id || !!editingProxy">
                <option value="">请先选择集群</option>
                <option v-for="n in nodes" :key="n.id" :value="n.id">{{ n.ip }}:{{ n.management_port || n.service_port }}</option>
              </select>
              <div v-if="formErrors.node_id" class="form-error">{{ formErrors.node_id }}</div>
            </div>
          </div>

          <div class="form-group">
            <button
              class="btn btn-primary"
              :disabled="!form.cluster_id || !form.node_id || detecting"
              @click="handleDetectPorts"
            >
              {{ detecting ? '检测中...' : '检测可用端口' }}
            </button>
          </div>

          <!-- Port List -->
          <div v-if="portError" class="form-error" style="margin-bottom:12px;">{{ portError }}</div>

          <div v-if="ports.length > 0" class="form-group">
            <label class="form-label">可用端口（点击选择）</label>
            <div class="port-grid">
              <div
                v-for="p in ports"
                :key="p.port"
                class="port-card"
                :class="{
                  available: p.status === 'available',
                  'in-use': p.status === 'in_use',
                  'not-in-config': p.status === 'not_in_config',
                  selected: selectedPort === p.port,
                }"
                :style="p.status === 'available' ? { cursor: 'pointer' } : { cursor: 'not-allowed' }"
                @click="selectPort(p)"
              >
                <div class="port-number">{{ p.port }}</div>
                <div class="port-status-row">
                  <span class="port-badge" :class="portBadgeClass(p)">{{ portBadgeText(p) }}</span>
                  <span v-if="p.status === 'in_use' && p.used_by" class="port-used-by">{{ p.used_by }}</span>
                </div>
              </div>
            </div>
            <div v-if="formErrors.port" class="form-error" style="margin-top:8px;">{{ formErrors.port }}</div>
          </div>

          <div v-if="!detecting && ports.length === 0 && hasSearched" class="empty-state">
            <div class="empty-state-icon">&#128269;</div>
            <p>未检测到端口信息，请确认集群和节点选择是否正确</p>
          </div>
        </div>

        <!-- ═══ Step 2: Configuration ═══ -->
        <div v-show="currentStep === 2">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">名称 <span class="required">*</span></label>
              <input v-model="form.name" type="text" class="form-input" placeholder="请输入代理名称">
              <div v-if="formErrors.name" class="form-error">{{ formErrors.name }}</div>
            </div>
            <div class="form-group">
              <label class="form-label">监听端口</label>
              <input :value="form.listen_port" type="text" class="form-input" disabled style="background:var(--bg);color:var(--muted);">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">协议 <span class="required">*</span></label>
              <div class="scheme-toggle">
                <button
                  class="scheme-btn"
                  :class="{ active: form.scheme === 'tcp' }"
                  @click="form.scheme = 'tcp'"
                >TCP</button>
                <button
                  class="scheme-btn"
                  :class="{ active: form.scheme === 'udp' }"
                  @click="form.scheme = 'udp'"
                >UDP</button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">负载均衡 <span class="required">*</span></label>
              <select v-model="form.load_balance" class="form-input">
                <option value="weighted_roundrobin">加权轮询</option>
                <option value="chash">一致性哈希</option>
                <option value="ewma">延迟最小</option>
                <option value="least_conn">最少连接</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">描述</label>
            <input v-model="form.description" type="text" class="form-input" placeholder="描述信息">
          </div>

          <!-- Targets Table -->
          <div class="form-group">
            <label class="form-label">目标节点 <span class="required">*</span></label>
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
            <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px;border:1px dashed var(--border);" @click="addTarget">+ 添加目标</button>
          </div>

          <!-- Advanced Config Toggle -->
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="advancedEnabled">
              <span>高级配置</span>
            </label>
          </div>

          <!-- Advanced Config Section -->
          <div v-if="advancedEnabled" class="advanced-section">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">连接超时（秒）</label>
                <input v-model.number="form.timeout.connect" type="number" class="form-input" min="0" placeholder="connect">
              </div>
              <div class="form-group">
                <label class="form-label">发送超时（秒）</label>
                <input v-model.number="form.timeout.send" type="number" class="form-input" min="0" placeholder="send">
              </div>
              <div class="form-group">
                <label class="form-label">读取超时（秒）</label>
                <input v-model.number="form.timeout.read" type="number" class="form-input" min="0" placeholder="read">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">连接池大小</label>
                <input v-model.number="form.keepalive_pool.size" type="number" class="form-input" min="1" placeholder="size">
              </div>
              <div class="form-group">
                <label class="form-label">空闲超时（秒）</label>
                <input v-model.number="form.keepalive_pool.idle_timeout" type="number" class="form-input" min="0" placeholder="idle_timeout">
              </div>
              <div class="form-group">
                <label class="form-label">最大请求数</label>
                <input v-model.number="form.keepalive_pool.requests" type="number" class="form-input" min="1" placeholder="requests">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Remote Addr</label>
                <input v-model="form.remote_addr" type="text" class="form-input" placeholder="如: 10.0.0.0/8">
                <div class="form-hint">可选，代理透传客户端地址</div>
              </div>
              <div class="form-group">
                <label class="form-label">SNI</label>
                <input v-model="form.sni" type="text" class="form-input" placeholder="如: example.com">
                <div class="form-hint">可选，TLS 服务器名称指示</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="currentStep === 1 ? handleCancel() : (currentStep = 1)">
          {{ currentStep === 1 ? '取消' : '上一步' }}
        </button>
        <div class="footer-right">
          <button
            v-if="currentStep === 1"
            class="btn btn-primary"
            :disabled="!selectedPort"
            @click="goToStep2"
          >下一步</button>
          <button
            v-if="currentStep === 2"
            class="btn btn-primary"
            :disabled="submitting"
            @click="handleSubmit"
          >{{ submitting ? '提交中...' : (editingProxy ? '保存' : '创建') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { Cluster, Node, PortItem, StreamProxy } from '@/types'
import * as streamProxyApi from '@/api/streamProxy'
import api from '@/api'

const props = defineProps<{
  visible: boolean
  clusters: Cluster[]
  editingProxy?: StreamProxy | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

// ── Step state ──
const currentStep = ref(1)

// ── API state ──
const nodes = ref<Node[]>([])
const ports = ref<PortItem[]>([])
const detecting = ref(false)
const portError = ref('')
const hasSearched = ref(false)
const selectedPort = ref<number | null>(null)

// ── Submit state ──
const submitting = ref(false)

// ── Form ──
const form = reactive({
  cluster_id: '' as number | string,
  node_id: '' as number | string,
  listen_port: 0,
  name: '',
  description: '',
  scheme: 'tcp',
  load_balance: 'weighted_roundrobin',
  targets: [] as { key: number; ip: string; port: number; weight: number }[],
  timeout: { connect: 60, send: 60, read: 60 },
  keepalive_pool: {
    size: undefined as number | undefined,
    idle_timeout: undefined as number | undefined,
    requests: undefined as number | undefined,
  },
  remote_addr: '',
  sni: '',
})

const advancedEnabled = ref(false)

const formErrors = reactive<Record<string, string>>({})
const targetValidation = ref<Record<string, { ip?: string; port?: string; weight?: string }>>({})

let targetKey = 0

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

// ── Methods ──

function portBadgeClass(p: PortItem): string {
  if (p.status === 'available') return 'badge-success'
  if (p.status === 'in_use') return 'badge-danger'
  return 'badge-neutral'
}

function portBadgeText(p: PortItem): string {
  if (p.status === 'available') return '可用'
  if (p.status === 'in_use') return '占用'
  return '未在配置'
}

function selectPort(p: PortItem) {
  if (p.status !== 'available') return
  selectedPort.value = p.port
  form.listen_port = p.port
  formErrors.port = ''
}

async function onClusterChange() {
  form.node_id = ''
  nodes.value = []
  ports.value = []
  selectedPort.value = null
  hasSearched.value = false
  portError.value = ''

  if (!form.cluster_id) return
  try {
    const res = await api.get(`/clusters/${form.cluster_id}/nodes`, { params: { page_size: 100 } })
    nodes.value = res.data.items || res.data || []
  } catch {
    nodes.value = []
  }
}

async function handleDetectPorts() {
  if (!form.cluster_id || !form.node_id) return
  detecting.value = true
  portError.value = ''
  ports.value = []
  selectedPort.value = null
  hasSearched.value = false

  try {
    const res = await streamProxyApi.detectPorts(Number(form.cluster_id), Number(form.node_id))
    ports.value = res.data.ports || []
    hasSearched.value = true
  } catch (e: any) {
    portError.value = e.response?.data?.detail || '端口检测失败'
    hasSearched.value = true
  } finally {
    detecting.value = false
  }
}

function goToStep2() {
  formErrors.port = ''
  if (!selectedPort.value) {
    formErrors.port = '请选择一个可用端口'
    return
  }
  currentStep.value = 2
}

// ── Targets management ──

function addTarget() {
  form.targets.push({ key: ++targetKey, ip: '', port: 80, weight: 100 })
}

function removeTarget(index: number) {
  form.targets.splice(index, 1)
}

// ── Validation ──

function validateStep1(): boolean {
  formErrors.cluster_id = ''
  formErrors.node_id = ''
  formErrors.port = ''
  if (!form.cluster_id) { formErrors.cluster_id = '请选择集群'; return false }
  if (!form.node_id) { formErrors.node_id = '请选择参考节点'; return false }
  return true
}

function validateForm(): boolean {
  formErrors.name = ''
  formErrors.targets = ''
  targetValidation.value = {}

  if (!form.name.trim()) { formErrors.name = '请输入代理名称'; return false }

  let valid = true
  if (form.targets.length === 0) {
    formErrors.targets = '请至少添加一个目标节点'
    valid = false
  }
  const seen = new Set<string>()
  form.targets.forEach((t, i) => {
    const errors: Record<string, string> = {}
    if (!t.ip) { errors.ip = 'IP不能为空'; valid = false }
    else if (!IP_PATTERN.test(t.ip)) { errors.ip = 'IP不合法'; valid = false }
    if (!t.port || t.port < 1 || t.port > 65535) { errors.port = '端口不合法'; valid = false }
    if (!t.weight || t.weight < 1 || t.weight > 100) { errors.weight = '权重不合法'; valid = false }
    if (t.ip && t.port) {
      const key = `${t.ip}:${t.port}`
      if (seen.has(key)) { errors.ip = 'IP和端口组合重复'; valid = false }
      seen.add(key)
    }
    targetValidation.value[`${i}`] = errors
  })

  return valid
}

// ── Submit ──

async function handleSubmit() {
  if (!validateForm()) return
  submitting.value = true

  try {
    const submitData: Record<string, any> = {
      name: form.name,
      listen_port: form.listen_port,
      scheme: form.scheme,
      load_balance: form.load_balance,
      description: form.description,
      targets: form.targets.map(t => ({ target: `${t.ip}:${t.port}`, weight: t.weight })),
      timeout: form.timeout,
    }

    if (advancedEnabled.value) {
      const kp = form.keepalive_pool
      if (kp.size !== undefined || kp.idle_timeout !== undefined || kp.requests !== undefined) {
        const pool: Record<string, number> = {}
        if (kp.size !== undefined) pool.size = kp.size
        if (kp.idle_timeout !== undefined) pool.idle_timeout = kp.idle_timeout
        if (kp.requests !== undefined) pool.requests = kp.requests
        submitData.keepalive_pool = pool
      }
      if (form.remote_addr) submitData.remote_addr = form.remote_addr
      if (form.sni) submitData.sni = form.sni
    }

    const cid = Number(form.cluster_id)
    if (props.editingProxy) {
      await streamProxyApi.updateStreamProxy(cid, props.editingProxy.id, submitData)
      message.success('四层代理已更新')
    } else {
      await streamProxyApi.createStreamProxy(cid, submitData)
      message.success('四层代理已创建')
    }
    emit('saved')
    emit('close')
  } catch (e: any) {
    const detail = e.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '操作失败')
  } finally {
    submitting.value = false
  }
}

function handleCancel() {
  emit('close')
}

// ── Watch for editing / visibility ──

watch(() => props.visible, async (v) => {
  if (!v) return
  currentStep.value = 1
  hasSearched.value = false
  portError.value = ''
  formErrors.name = ''
  formErrors.cluster_id = ''
  formErrors.node_id = ''
  formErrors.port = ''
  formErrors.targets = ''
  targetValidation.value = {}
  selectedPort.value = null

  if (props.editingProxy) {
    const p = props.editingProxy
    form.cluster_id = p.cluster_id
    form.listen_port = p.listen_port
    form.name = p.name
    form.description = p.description || ''
    form.scheme = p.scheme || 'tcp'
    form.load_balance = p.load_balance || 'weighted_roundrobin'
    form.targets = (p.targets || []).map((t: any) => {
      const [ip, port] = t.target.split(':')
      return { key: ++targetKey, ip: ip || '', port: port ? parseInt(port) : 80, weight: t.weight }
    })

    // Advanced config
    const hasAdvanced = !!(p.remote_addr || p.sni || (p.keepalive_pool && JSON.stringify(p.keepalive_pool) !== '{}'))
    advancedEnabled.value = hasAdvanced

    if (p.timeout) {
      const t = typeof p.timeout === 'string' ? JSON.parse(p.timeout) : p.timeout
      form.timeout = { connect: t.connect ?? 60, send: t.send ?? 60, read: t.read ?? 60 }
    } else {
      form.timeout = { connect: 60, send: 60, read: 60 }
    }

    if (p.keepalive_pool && JSON.stringify(p.keepalive_pool) !== '{}') {
      const k = typeof p.keepalive_pool === 'string' ? JSON.parse(p.keepalive_pool) : p.keepalive_pool
      form.keepalive_pool = { size: k.size, idle_timeout: k.idle_timeout, requests: k.requests }
    } else {
      form.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
    }

    form.remote_addr = p.remote_addr || ''
    form.sni = p.sni || ''

    // Load nodes for this cluster
    try {
      const res = await api.get(`/clusters/${p.cluster_id}/nodes`, { params: { page_size: 100 } })
      nodes.value = res.data.items || res.data || []
    } catch {
      nodes.value = []
    }

    // Detect ports to show the port status (skip step 1)
    try {
      if (nodes.value.length > 0) {
        const res = await streamProxyApi.detectPorts(p.cluster_id, nodes.value[0].id)
        ports.value = res.data.ports || []
        hasSearched.value = true
      }
    } catch {
      // non-blocking
    }

    // Go directly to step 2 for editing
    currentStep.value = 2
  } else {
    form.cluster_id = ''
    form.node_id = ''
    form.listen_port = 0
    form.name = ''
    form.description = ''
    form.scheme = 'tcp'
    form.load_balance = 'weighted_roundrobin'
    form.targets = [{ key: ++targetKey, ip: '', port: 80, weight: 100 }]
    form.timeout = { connect: 60, send: 60, read: 60 }
    form.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
    form.remote_addr = ''
    form.sni = ''
    advancedEnabled.value = false
    nodes.value = []
    ports.value = []
  }
})
</script>

<style scoped>
/* ── Step Indicator ── */
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 20px 0;
  gap: 0;
}
.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.step-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-mono);
  border: 2px solid var(--border);
  color: var(--muted);
  background: var(--surface);
  transition: all 0.2s;
}
.step-item.active .step-circle {
  border-color: var(--accent);
  color: var(--accent);
  background: oklch(56% 0.16 210 / 10%);
}
.step-item.done .step-circle {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.step-check {
  font-size: 14px;
}
.step-label {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}
.step-item.active .step-label {
  color: var(--fg);
}
.step-line {
  width: 80px;
  height: 2px;
  background: var(--border);
  margin: 0 12px;
  margin-bottom: 28px;
  transition: background 0.2s;
}
.step-line.done {
  background: var(--accent);
}

/* ── Port Grid ── */
.port-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.port-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  text-align: center;
  transition: all 0.15s;
  background: var(--surface);
  user-select: none;
}
.port-card.available:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px oklch(56% 0.16 210 / 10%);
}
.port-card.in-use {
  background: oklch(55% 0.18 28 / 4%);
  opacity: 0.65;
}
.port-card.not-in-config {
  background: var(--bg);
  opacity: 0.5;
}
.port-card.selected {
  border-color: var(--accent);
  background: oklch(56% 0.16 210 / 8%);
  box-shadow: 0 0 0 2px oklch(56% 0.16 210 / 15%);
}
.port-number {
  font-size: 18px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--fg);
  margin-bottom: 4px;
}
.port-status-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-wrap: wrap;
}
.port-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono);
}
.port-badge.badge-success {
  background: oklch(55% 0.15 145 / 10%);
  color: var(--success);
}
.port-badge.badge-danger {
  background: oklch(55% 0.18 28 / 10%);
  color: var(--danger);
}
.port-badge.badge-neutral {
  background: oklch(50% 0.018 240 / 8%);
  color: var(--muted);
}
.port-used-by {
  font-size: 10px;
  color: var(--muted);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Scheme Toggle ── */
.scheme-toggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  width: fit-content;
}
.scheme-btn {
  padding: 6px 18px;
  border: none;
  background: var(--surface);
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  font-family: var(--font-body);
}
.scheme-btn:first-child {
  border-right: 1px solid var(--border);
}
.scheme-btn.active {
  background: var(--accent);
  color: #fff;
}

/* ── Advanced Section ── */
.advanced-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  background: var(--surface);
  margin-bottom: 16px;
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

/* ── Empty State ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--muted);
  text-align: center;
}
.empty-state-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.3; }
.empty-state p { font-size: 13px; max-width: 300px; }

/* ── Footer layout ── */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}
.footer-right {
  display: flex;
  gap: 8px;
}

/* ── Form overrides ── */
.form-row { display: flex; gap: 16px; margin-bottom: 0; }
.form-group { flex: 1; margin-bottom: 16px; }
.form-label {
  display: block; margin-bottom: 6px; font-size: 13px;
  color: var(--muted); font-weight: 500;
}
.required { color: var(--danger); }
.form-error { font-size: 12px; color: var(--danger); margin-top: 2px; }
.form-hint { font-size: 11px; color: var(--muted); margin-top: 4px; }
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
</style>
