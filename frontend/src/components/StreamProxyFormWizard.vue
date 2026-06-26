<template>
  <Teleport to="body">
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width:680px;">
      <div class="modal-header">
        <h2>{{ editingProxy ? '编辑四层代理' : '新建四层代理' }}</h2>
        <button class="modal-close" @click="handleCancel">&times;</button>
      </div>

      <!-- Step Indicator -->
      <div class="spwf-steps">
        <div class="spwf-step" :class="{ active: currentStep === 1, done: currentStep > 1 }">
          <div class="spwf-circle">
            <span v-if="currentStep > 1" class="spwf-check">&#10003;</span>
            <span v-else>1</span>
          </div>
          <span class="spwf-label">端口选择</span>
        </div>
        <div class="spwf-connector" :class="{ done: currentStep > 1 }"></div>
        <div class="spwf-step" :class="{ active: currentStep === 2 }">
          <div class="spwf-circle"><span>2</span></div>
          <span class="spwf-label">配置详情</span>
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
              <span v-if="formErrors.cluster_id" class="form-error">{{ formErrors.cluster_id }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">参考节点 <span class="required">*</span></label>
              <select v-model="form.node_id" class="form-input" :disabled="!form.cluster_id || !!editingProxy">
                <option value="">请选择节点</option>
                <option v-for="n in nodes" :key="n.id" :value="n.id">{{ n.ip }}:{{ n.management_port || n.service_port }}</option>
              </select>
              <span v-if="formErrors.node_id" class="form-error">{{ formErrors.node_id }}</span>
            </div>
          </div>

          <div class="form-group">
            <button class="btn btn-primary" :disabled="!form.cluster_id || !form.node_id || detecting" @click="handleDetectPorts">
              {{ detecting ? '检测中...' : '检测可用端口' }}
            </button>
          </div>

          <!-- SSE Log Panel -->
          <div v-if="logLines.length > 0" class="spwf-log">
            <div v-for="(line, i) in logLines" :key="i" class="spwf-log-line">{{ line }}</div>
          </div>

          <!-- Error -->
          <div v-if="portError" class="form-error" style="margin-bottom:12px;">{{ portError }}</div>

          <!-- Port Grid -->
          <div v-if="ports.length > 0" class="form-group">
            <label class="form-label">可用端口（点击选择可用端口）</label>
            <div class="spwf-port-grid">
              <div
                v-for="p in ports"
                :key="p.port"
                class="spwf-port-card"
                :class="{
                  'spwf-port-available': p.status === 'available',
                  'spwf-port-inuse': p.status === 'in_use',
                  'spwf-port-noconfig': p.status === 'not_in_config',
                  'spwf-port-selected': selectedPort === p.port,
                }"
                @click="selectPort(p)"
              >
                <div class="spwf-port-number">{{ p.port }}</div>
                <div class="spwf-port-status">
                  <span class="spwf-port-badge badge-success" v-if="p.status === 'available'">可用</span>
                  <span class="spwf-port-badge badge-danger" v-else-if="p.status === 'in_use'">占用</span>
                  <span class="spwf-port-badge badge-neutral" v-else>未在配置</span>
                </div>
                <div v-if="p.status === 'in_use' && p.used_by" class="spwf-port-usedby">{{ p.used_by }}</div>
              </div>
            </div>
            <span v-if="formErrors.port" class="form-error">{{ formErrors.port }}</span>
          </div>

          <!-- Manual fallback -->
          <div class="form-group" style="margin-top:12px;">
            <label class="checkbox-label">
              <input type="checkbox" v-model="manualPortEnabled">
              <span>手动输入端口（检测失败或跳过检测时使用）</span>
            </label>
            <input v-if="manualPortEnabled" v-model.number="manualPort" type="number" class="form-input" placeholder="输入端口号 1-65535" min="1" max="65535" style="width:200px;margin-top:6px;">
          </div>

          <!-- No ports after detection -->
          <div v-if="!detecting && ports.length === 0 && hasSearched && !portError" class="empty-state">
            <div class="empty-state-icon">&#9881;</div>
            <p>未检测到端口信息，请确认集群 Stream 模块已启用</p>
          </div>
        </div>

        <!-- ═══ Step 2: Config Details ═══ -->
        <div v-show="currentStep === 2">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">名称 <span class="required">*</span></label>
              <input v-model="form.name" type="text" class="form-input" placeholder="请输入代理名称">
              <span v-if="formErrors.name" class="form-error">{{ formErrors.name }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">监听端口</label>
              <input :value="form.listen_port" type="text" class="form-input" disabled style="background:var(--bg);color:var(--muted);">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">协议 <span class="required">*</span></label>
              <div class="spwf-toggle">
                <button class="spwf-toggle-btn" :class="{ active: form.scheme === 'tcp' }" @click="form.scheme = 'tcp'">TCP</button>
                <button class="spwf-toggle-btn" :class="{ active: form.scheme === 'udp' }" @click="form.scheme = 'udp'">UDP</button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">负载均衡 <span class="required">*</span></label>
              <select v-model="form.load_balance" class="form-input">
                <option value="weighted_roundrobin">加权轮询</option>
                <option value="chash">一致性哈希</option>
                <option value="ewma">EWMA</option>
                <option value="least_conn">最少连接</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">描述</label>
            <input v-model="form.description" type="text" class="form-input" placeholder="描述信息（可选）">
          </div>

          <!-- Targets Table -->
          <div class="form-group">
            <label class="form-label">目标节点 <span class="required">*</span></label>
            <div class="spwf-targets-box">
              <div class="spwf-target-header">
                <span class="spwf-th-cell" style="flex:2;">IP 地址</span>
                <span class="spwf-th-cell" style="flex:1;">端口</span>
                <span class="spwf-th-cell" style="flex:1;">权重</span>
                <span class="spwf-th-cell" style="width:60px;">操作</span>
              </div>
              <div v-for="(t, i) in form.targets" :key="t.key" class="spwf-target-row">
                <input v-model="t.ip" type="text" class="form-input" placeholder="IP 地址" style="flex:2;">
                <input v-model.number="t.port" type="number" class="form-input" placeholder="端口" min="1" max="65535" style="flex:1;">
                <input v-model.number="t.weight" type="number" class="form-input" placeholder="权重" min="1" max="100" style="flex:1;">
                <button class="btn btn-ghost btn-sm" style="width:60px;color:var(--danger);" @click="removeTarget(i)">删除</button>
              </div>
              <div v-if="targetErrors.length > 0" class="spwf-target-errors">
                <div v-for="(err, i) in targetErrors" :key="i" class="form-error">{{ err }}</div>
              </div>
              <button class="btn btn-ghost btn-sm spwf-add-target" @click="addTarget">+ 添加目标</button>
            </div>
            <span v-if="formErrors.targets" class="form-error">{{ formErrors.targets }}</span>
          </div>

          <!-- Advanced Config Toggle -->
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="advancedEnabled">
              <span>高级配置</span>
            </label>
          </div>

          <!-- Advanced Config Section -->
          <div v-if="advancedEnabled" class="spwf-advanced">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">连接超时（秒）</label>
                <input v-model.number="form.timeout.connect" type="number" class="form-input" min="0" placeholder="60">
              </div>
              <div class="form-group">
                <label class="form-label">发送超时（秒）</label>
                <input v-model.number="form.timeout.send" type="number" class="form-input" min="0" placeholder="60">
              </div>
              <div class="form-group">
                <label class="form-label">读取超时（秒）</label>
                <input v-model.number="form.timeout.read" type="number" class="form-input" min="0" placeholder="60">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">连接池大小</label>
                <input v-model.number="form.keepalive_pool.size" type="number" class="form-input" min="1" placeholder="320">
              </div>
              <div class="form-group">
                <label class="form-label">空闲超时（秒）</label>
                <input v-model.number="form.keepalive_pool.idle_timeout" type="number" class="form-input" min="0" placeholder="60">
              </div>
              <div class="form-group">
                <label class="form-label">最大请求数</label>
                <input v-model.number="form.keepalive_pool.requests" type="number" class="form-input" min="1" placeholder="1000">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Remote Addr</label>
                <input v-model="form.remote_addr" type="text" class="form-input" placeholder="可选，如 10.0.0.0/8">
                <div class="form-hint">可选，来源 IP 限制</div>
              </div>
              <div class="form-group">
                <label class="form-label">SNI</label>
                <input v-model="form.sni" type="text" class="form-input" placeholder="可选，如 example.com">
                <div class="form-hint">可选，TLS 服务器名称指示</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer" style="justify-content:space-between;">
        <button class="btn btn-secondary" @click="currentStep === 1 ? handleCancel() : (currentStep = 1)">
          {{ currentStep === 1 ? '取消' : '上一步' }}
        </button>
        <div style="display:flex;gap:8px;">
          <button
            v-if="currentStep === 1"
            class="btn btn-primary"
            :disabled="!canGoNext"
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
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { Cluster, PortItem, StreamProxy } from '@/types'
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

const currentStep = ref(1)

// ── API state ──
const nodes = ref<any[]>([])
const ports = ref<PortItem[]>([])
const detecting = ref(false)
const portError = ref('')
const hasSearched = ref(false)
const selectedPort = ref<number | null>(null)
const logLines = ref<string[]>([])

const submitting = ref(false)
const manualPortEnabled = ref(false)
const manualPort = ref<number | null>(null)

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
const targetErrors = ref<string[]>([])

let targetKey = 0

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

// ── Computed ──

const canGoNext = computed(() => {
  if (manualPortEnabled.value && manualPort.value && manualPort.value >= 1 && manualPort.value <= 65535) return true
  return selectedPort.value !== null
})

// ── Methods ──

function selectPort(p: PortItem) {
  if (p.status !== 'available') return
  selectedPort.value = p.port
  form.listen_port = p.port
  formErrors.port = ''
  manualPortEnabled.value = false
}

async function onClusterChange() {
  form.node_id = ''
  nodes.value = []
  ports.value = []
  selectedPort.value = null
  hasSearched.value = false
  portError.value = ''
  logLines.value = []
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
  logLines.value = ['正在连接远程主机...']

  try {
    const node = nodes.value.find((n: any) => n.id === Number(form.node_id))
    logLines.value.push(`读取 ${node?.ip || ''} edge.env 配置...`)
    logLines.value.push('解析 stream 配置...')

    const excludeId = props.editingProxy?.id
    const res = await streamProxyApi.detectPorts(Number(form.cluster_id), Number(form.node_id), excludeId)
    ports.value = res.data.ports || []
    hasSearched.value = true
    logLines.value.push('查询已用端口...')
    logLines.value.push('✅ 配置读取完成')
  } catch (e: any) {
    portError.value = e.response?.data?.detail || '端口检测失败'
    logLines.value.push('❌ 端口检测失败')
    hasSearched.value = true
  } finally {
    detecting.value = false
  }
}

function goToStep2() {
  formErrors.port = ''
  if (manualPortEnabled.value) {
    if (!manualPort.value || manualPort.value < 1 || manualPort.value > 65535) {
      formErrors.port = '请输入有效的端口号（1-65535）'
      return
    }
    form.listen_port = manualPort.value
  } else if (!selectedPort.value) {
    formErrors.port = '请选择一个可用端口或启用手动输入'
    return
  }
  currentStep.value = 2
}

// ── Targets ──

function addTarget() {
  form.targets.push({ key: ++targetKey, ip: '', port: 80, weight: 100 })
}

function removeTarget(index: number) {
  form.targets.splice(index, 1)
}

// ── Validation ──

function validateForm(): boolean {
  formErrors.name = ''
  formErrors.targets = ''
  targetErrors.value = []

  if (!form.name.trim()) { formErrors.name = '请输入代理名称'; return false }

  if (form.targets.length === 0) {
    formErrors.targets = '请至少添加一个目标节点'
    return false
  }

  let valid = true
  const errors: string[] = []
  const seen = new Set<string>()
  form.targets.forEach((t, i) => {
    if (!t.ip) { errors.push(`第 ${i + 1} 行: IP 不能为空`); valid = false }
    else if (!IP_PATTERN.test(t.ip)) { errors.push(`第 ${i + 1} 行: IP 格式不合法`); valid = false }
    if (!t.port || t.port < 1 || t.port > 65535) { errors.push(`第 ${i + 1} 行: 端口不合法`); valid = false }
    if (!t.weight || t.weight < 1 || t.weight > 100) { errors.push(`第 ${i + 1} 行: 权重不合法`); valid = false }
    if (t.ip && t.port) {
      const key = `${t.ip}:${t.port}`
      if (seen.has(key)) { errors.push(`第 ${i + 1} 行: IP 和端口组合重复`); valid = false }
      seen.add(key)
    }
  })
  targetErrors.value = errors
  return valid
}

// ── Submit ──

async function handleSubmit() {
  if (!validateForm()) return
  submitting.value = true

  try {
    const submitData: Record<string, any> = {
      name: form.name.trim(),
      listen_port: form.listen_port,
      scheme: form.scheme,
      load_balance: form.load_balance,
      description: form.description.trim(),
      ref_node_id: form.node_id || undefined,
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
      if (form.remote_addr.trim()) submitData.remote_addr = form.remote_addr.trim()
      if (form.sni.trim()) submitData.sni = form.sni.trim()
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

// ── Watch ──

watch(() => props.visible, async (v) => {
  if (!v) return
  currentStep.value = 1
  hasSearched.value = false
  portError.value = ''
  logLines.value = []
  manualPortEnabled.value = false
  manualPort.value = null
  formErrors.name = ''
  formErrors.cluster_id = ''
  formErrors.node_id = ''
  formErrors.port = ''
  formErrors.targets = ''
  targetErrors.value = []
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
      return { key: ++targetKey, ip: ip || '', port: port ? parseInt(port) : 80, weight: t.weight || 100 }
    })

    const hasAdvanced = !!(p.remote_addr || p.sni || (p.keepalive_pool && Object.keys(p.keepalive_pool).length > 0))
    advancedEnabled.value = hasAdvanced

    if (p.timeout) {
      const t = typeof p.timeout === 'string' ? JSON.parse(p.timeout) : p.timeout
      form.timeout = { connect: t.connect ?? 60, send: t.send ?? 60, read: t.read ?? 60 }
    } else {
      form.timeout = { connect: 60, send: 60, read: 60 }
    }

    if (p.keepalive_pool && Object.keys(p.keepalive_pool).length > 0) {
      const k = typeof p.keepalive_pool === 'string' ? JSON.parse(p.keepalive_pool) : p.keepalive_pool
      form.keepalive_pool = { size: k.size, idle_timeout: k.idle_timeout, requests: k.requests }
    } else {
      form.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
    }

    form.remote_addr = p.remote_addr || ''
    form.sni = p.sni || ''

    try {
      const res = await api.get(`/clusters/${p.cluster_id}/nodes`, { params: { page_size: 100 } })
      nodes.value = res.data.items || res.data || []
      // 恢复保存的参考节点，否则用第一个
      if (p.ref_node_id) {
        form.node_id = p.ref_node_id
      } else if (nodes.value.length > 0) {
        form.node_id = nodes.value[0].id
      }
    } catch {
      nodes.value = []
    }

    // 编辑模式下加载端口列表（排除自身，自己的端口可选）
    try {
      if (nodes.value.length > 0) {
        const excludeId = props.editingProxy?.id
        const res = await streamProxyApi.detectPorts(p.cluster_id, Number(form.node_id), excludeId)
        ports.value = res.data.ports || []
        hasSearched.value = true
        // 自动选中当前端口
        const currentPort = ports.value.find(p => p.port === form.listen_port)
        if (currentPort) {
          selectedPort.value = currentPort.port
        }
      }
    } catch {
      // non-blocking
    }

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
.spwf-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 20px 0;
  gap: 0;
}
.spwf-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.spwf-circle {
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
.spwf-step.active .spwf-circle {
  border-color: var(--accent);
  color: var(--accent);
  background: oklch(56% 0.16 210 / 10%);
}
.spwf-step.done .spwf-circle {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.spwf-check { font-size: 14px; }
.spwf-label { font-size: 12px; color: var(--muted); font-weight: 500; }
.spwf-step.active .spwf-label { color: var(--fg); }
.spwf-connector {
  width: 80px;
  height: 2px;
  background: var(--border);
  margin: 0 12px;
  margin-bottom: 28px;
  transition: background 0.2s;
}
.spwf-connector.done { background: var(--accent); }

/* ── SSE Log Panel ── */
.spwf-log {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  margin-bottom: 12px;
  max-height: 120px;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  color: var(--muted);
}

/* ── Port Grid ── */
.spwf-port-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.spwf-port-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 8px;
  text-align: center;
  transition: all 0.15s;
  background: var(--surface);
  user-select: none;
}
.spwf-port-available { cursor: pointer; }
.spwf-port-available:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px oklch(56% 0.16 210 / 10%);
}
.spwf-port-inuse {
  background: oklch(55% 0.18 28 / 4%);
  opacity: 0.65;
  cursor: not-allowed;
}
.spwf-port-noconfig {
  background: var(--bg);
  opacity: 0.5;
  cursor: not-allowed;
}
.spwf-port-selected {
  border-color: var(--accent);
  background: oklch(56% 0.16 210 / 8%);
  box-shadow: 0 0 0 2px oklch(56% 0.16 210 / 15%);
}
.spwf-port-number {
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--fg);
  margin-bottom: 4px;
}
.spwf-port-status { margin-bottom: 2px; }
.spwf-port-badge {
  display: inline-flex;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono);
}
.spwf-port-usedby {
  font-size: 10px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Scheme Toggle ── */
.spwf-toggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  width: fit-content;
}
.spwf-toggle-btn {
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
.spwf-toggle-btn:first-child { border-right: 1px solid var(--border); }
.spwf-toggle-btn.active { background: var(--accent); color: #fff; }

/* ── Targets Table ── */
.spwf-targets-box {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.spwf-target-header {
  display: flex;
  gap: 8px;
  padding: 8px 8px;
  background: oklch(97% 0.005 250);
  border-bottom: 1px solid var(--border);
}
.spwf-th-cell {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
}
.spwf-target-row {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  align-items: center;
  border-bottom: 1px solid var(--border);
}
.spwf-target-row:last-child { border-bottom: none; }
.spwf-target-errors {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}
.spwf-add-target {
  width: 100%;
  border: 1px dashed var(--border) !important;
  border-radius: 0 !important;
  padding: 6px !important;
  font-size: 12px !important;
}

/* ── Advanced Config ── */
.spwf-advanced {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  background: var(--surface);
  margin-bottom: 16px;
}

/* ── Checkbox ── */
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

/* ── Form overrides ── */
.form-row { display: flex; gap: 16px; margin-bottom: 0; }
.form-row .form-group { flex: 1; }
</style>
