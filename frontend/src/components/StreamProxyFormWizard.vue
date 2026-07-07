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
              <select v-model="form.node_id" class="form-input" :disabled="!form.cluster_id">
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

          <!-- Proxy Type -->
          <div class="form-group" style="margin-top:12px;">
            <label class="form-label">代理类型 <span class="required">*</span></label>
            <div class="spwf-toggle">
              <button class="spwf-toggle-btn" :class="{ active: form.proxy_type === 'normal' }" @click="form.proxy_type = 'normal'">普通四层代理</button>
              <button class="spwf-toggle-btn" :class="{ active: form.proxy_type === 'dns' }" @click="form.proxy_type = 'dns'">DNS 服务器</button>
            </div>
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

          <div class="form-row" style="margin-bottom:8px;">
            <div class="form-group">
              <label class="form-label">协议</label>
              <div>
                <span class="spwf-protocol-badge">{{ form.proxy_type === 'dns' ? 'UDP' : 'TCP' }}</span>
              </div>
            </div>
          </div>

          <!-- Normal Mode Content -->
          <template v-if="form.proxy_type !== 'dns'">
            <div class="form-row">
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
            <!-- chash: show hash key info -->
            <template v-if="form.load_balance === 'chash'">
              <div class="form-row" style="margin-bottom:16px;">
                <div class="form-group">
                  <label class="form-label">Hash Key</label>
                  <input :value="'remote_addr'" type="text" class="form-input" disabled style="background:var(--bg);color:var(--accent);font-weight:600;">
                  <div class="form-hint">一致性哈希使用来源 IP（remote_addr）作为哈希键</div>
                </div>
              </div>
            </template>

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
          </template>

          <!-- DNS Mode Content -->
          <template v-if="form.proxy_type === 'dns'">
            <div class="form-group" style="margin-bottom:12px;padding:12px;background:var(--bg);border-radius:6px;border:1px solid var(--border);">
              <div style="font-size:12px;color:var(--muted);">DNS 模式下，请求将使用 dns_upstream 插件进行域名解析，不配置标准上游节点。</div>
            </div>

            <!-- Domain List -->
            <div class="form-group">
              <label class="form-label">域名映射 <span class="required">*</span></label>
              <div v-for="(dom, di) in form.dns_domains" :key="dom.key" class="spwf-dns-domain" style="margin-bottom:12px;">
                <div class="spwf-target-header">
                  <span class="spwf-th-cell" style="flex:2;">域名</span>
                  <span class="spwf-th-cell" style="flex:1;">负载均衡</span>
                  <span class="spwf-th-cell" style="width:60px;">操作</span>
                </div>
                <div class="spwf-target-row">
                  <input v-model="dom.domain" type="text" class="form-input" placeholder="test.local" style="flex:2;">
                  <select v-model="dom.lb_type" class="form-input" style="flex:1;">
                    <option value="roundrobin">轮询</option>
                    <option value="chash">一致性哈希</option>
                    <option value="least_conn">最少连接</option>
                  </select>
                  <button class="btn btn-ghost btn-sm" style="width:60px;color:var(--danger);" @click="removeDnsDomain(di)">删除</button>
                </div>
                <div style="margin:4px 8px 0;">
                  <div class="spwf-target-header" style="font-size:10px;">
                    <span style="flex:2;">目标 IP:端口</span>
                    <span style="flex:1;">客户端 CIDR（可选）</span>
                    <span style="width:60px;">操作</span>
                  </div>
                  <div v-for="(dt, dti) in dom.targets" :key="dt.key" class="spwf-target-row">
                    <input v-model="dt.ip_port" type="text" class="form-input" placeholder="10.0.0.1:53" style="flex:2;">
                    <input v-model="dt.cidr" type="text" class="form-input" placeholder="192.168.0.0/16 或留空" style="flex:1;">
                    <button class="btn btn-ghost btn-sm" style="width:60px;color:var(--danger);" @click="removeDnsTarget(di, dti)">删除</button>
                  </div>
                  <button class="btn btn-ghost btn-sm" style="width:100%;border:1px dashed var(--border);font-size:11px;" @click="addDnsTarget(di)">+ 添加目标节点</button>
                </div>
              </div>
              <button class="btn btn-ghost btn-sm" @click="addDnsDomain">+ 添加域名</button>
              <span v-if="formErrors.dns" class="form-error">{{ formErrors.dns }}</span>
            </div>
          </template>

          <!-- Advanced Config Toggle -->
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="advancedEnabled">
              <span>高级配置</span>
            </label>
          </div>

          <!-- Advanced Config Section -->
          <div v-if="advancedEnabled" class="spwf-advanced">
            <div class="form-group">
              <label class="form-label">健康检查（JSON）</label>
              <textarea v-model="checksJson" class="form-input" rows="6" style="font-family:var(--font-mono);font-size:12px;resize:vertical;"></textarea>
            </div>

            <template v-if="form.proxy_type !== 'dns'">
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
            </template>
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
import { PAGE_SIZE_DROPDOWN } from '@/constants'

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
interface DnsTarget { key: number; ip_port: string; cidr: string }
interface DnsDomain { key: number; domain: string; lb_type: string; targets: DnsTarget[] }

const form = reactive({
  cluster_id: '' as number | string,
  node_id: '' as number | string,
  listen_port: 0,
  name: '',
  description: '',
  proxy_type: 'normal' as 'normal' | 'dns',
  scheme: 'tcp',
  load_balance: 'weighted_roundrobin',
  hash_on: 'vars',
  key: 'remote_addr',
  targets: [] as { key: number; ip: string; port: number; weight: number }[],
  dns_domains: [] as DnsDomain[],
  retries: undefined as number | undefined,
  retry_timeout: 0,
  checks: null as Record<string, unknown> | null,
})

const advancedEnabled = ref(false)
const formErrors = reactive<Record<string, string>>({})
const targetErrors = ref<string[]>([])

const defaultChecksJson = JSON.stringify({ passive: {}, active: { unhealthy: {} } }, null, 2)
const dnsDefaultChecksJson = JSON.stringify({ active: {} }, null, 2)
const checksJson = ref(defaultChecksJson)

let targetKey = 0

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

// ── Watches ──

// When chash is selected, fix hash_on/key to remote_addr
watch(() => form.load_balance, (val) => {
  if (val === 'chash') {
    form.hash_on = 'vars'
    form.key = 'remote_addr'
  }
})

// When proxy_type changes, update scheme and default checks
watch(() => form.proxy_type, (val) => {
  if (val === 'dns') {
    form.scheme = 'udp'
    if (advancedEnabled.value) {
      form.checks = JSON.parse(dnsDefaultChecksJson) as Record<string, unknown>
      checksJson.value = dnsDefaultChecksJson
    }
  } else if (val === 'normal') {
    form.scheme = 'tcp'
    if (advancedEnabled.value) {
      form.checks = JSON.parse(defaultChecksJson) as Record<string, unknown>
      checksJson.value = defaultChecksJson
    }
  }
})

// Sync checksJson textarea → form.checks
watch(checksJson, (val) => {
  try { form.checks = JSON.parse(val) as Record<string, unknown> } catch { /* ignore */ }
})

// Reset advanced fields when toggled off
watch(advancedEnabled, (val) => {
  if (!val) {
    const isDns = form.proxy_type === 'dns'
    form.checks = JSON.parse(isDns ? dnsDefaultChecksJson : defaultChecksJson) as Record<string, unknown>
    checksJson.value = isDns ? dnsDefaultChecksJson : defaultChecksJson
    form.retries = undefined
    form.retry_timeout = 0
  }
})

// ── Computed ──

const canGoNext = computed(() => {
  if (manualPortEnabled.value && manualPort.value && manualPort.value >= 1 && manualPort.value <= 65535) return true
  if (selectedPort.value !== null) return true
  // 编辑模式：未选端口也允许下一步（保持原端口不变）
  if (props.editingProxy) return true
  return false
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
    const res = await api.get(`/clusters/${form.cluster_id}/nodes`, { params: { page_size: PAGE_SIZE_DROPDOWN } })
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
    const excludePort = props.editingProxy?.listen_port
    const res = await streamProxyApi.detectPorts(Number(form.cluster_id), Number(form.node_id), excludeId, excludePort)
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
  } else if (selectedPort.value) {
    form.listen_port = selectedPort.value
  } else if (props.editingProxy) {
    // 编辑模式：未选择新端口则保持原端口不变
    form.listen_port = props.editingProxy.listen_port
  } else {
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

// ── DNS Domain Management ──

function addDnsDomain() {
  form.dns_domains.push({ key: ++targetKey, domain: '', lb_type: 'roundrobin', targets: [] })
}

function removeDnsDomain(index: number) {
  form.dns_domains.splice(index, 1)
}

function addDnsTarget(di: number) {
  form.dns_domains[di].targets.push({ key: ++targetKey, ip_port: '', cidr: '' })
}

function removeDnsTarget(di: number, ti: number) {
  form.dns_domains[di].targets.splice(ti, 1)
}

// ── Validation ──

function validateForm(): boolean {
  formErrors.name = ''
  formErrors.targets = ''
  formErrors.dns = ''
  targetErrors.value = []

  if (!form.name.trim()) { formErrors.name = '请输入代理名称'; return false }

  if (form.proxy_type === 'dns') {
    if (form.dns_domains.length === 0) {
      formErrors.dns = '请至少添加一个域名'
      return false
    }
    for (const dom of form.dns_domains) {
      if (!dom.domain.trim()) { formErrors.dns = '域名不能为空'; return false }
      if (dom.targets.length === 0) { formErrors.dns = `域名 ${dom.domain} 至少需要一个目标节点`; return false }
      for (const dt of dom.targets) {
        if (!dt.ip_port.trim()) { formErrors.dns = `域名 ${dom.domain} 的目标 IP:端口不能为空`; return false }
      }
    }
    return true
  }

  // Normal mode validation
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
      proxy_type: form.proxy_type,
      ref_node_id: form.node_id || undefined,
      checks: form.checks,
    }

    if (form.proxy_type === 'dns') {
      // Build dns_config from dns_domains
      const hosts: Record<string, any> = {}
      for (const dom of form.dns_domains) {
        if (!dom.domain.trim()) continue
        const nodes: Record<string, string[]> = {}
        for (const dt of dom.targets) {
          if (!dt.ip_port.trim()) continue
          const cidrList: string[] = dt.cidr.trim() ? [dt.cidr.trim()] : []
          nodes[dt.ip_port.trim()] = cidrList
        }
        hosts[dom.domain.trim()] = { nodes, type: dom.lb_type }
      }
      submitData.dns_config = { hosts }
    } else {
      submitData.load_balance = form.load_balance
      submitData.description = form.description.trim()
      submitData.targets = form.targets.map(t => ({ target: `${t.ip}:${t.port}`, weight: t.weight }))
      if (form.load_balance === 'chash') {
        submitData.hash_on = form.hash_on
        submitData.key = form.key
      }
    }

    if (advancedEnabled.value) {
      if (form.retries !== undefined) submitData.retries = form.retries
      if (form.retry_timeout !== undefined) submitData.retry_timeout = form.retry_timeout
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
  formErrors.dns = ''
  targetErrors.value = []
  selectedPort.value = null

  if (props.editingProxy) {
    const p = props.editingProxy
    form.cluster_id = p.cluster_id
    form.listen_port = p.listen_port
    form.name = p.name
    form.proxy_type = (p as any).proxy_type === 'dns' ? 'dns' : 'normal'
    form.description = p.description || ''
    form.scheme = p.scheme || 'tcp_udp'
    form.load_balance = p.load_balance || 'weighted_roundrobin'
    form.hash_on = p.hash_on || 'vars'
    form.key = p.key || 'remote_addr'

    if (form.proxy_type === 'dns') {
      // Load DNS config
      const dc = (p as any).dns_config
      if (dc && dc.hosts) {
        form.dns_domains = Object.entries(dc.hosts).map(([domain, cfg]: [string, any]) => {
          const domainKey = ++targetKey
          const targets = Object.entries(cfg.nodes || {}).map(([ipPort, cidrs]: [string, any]) => ({
            key: ++targetKey,
            ip_port: ipPort,
            cidr: Array.isArray(cidrs) ? cidrs.join(', ') : '',
          }))
          return { key: domainKey, domain, lb_type: cfg.type || 'roundrobin', targets }
        })
      }
    } else {
      form.targets = (p.targets || []).map((t: any) => {
        const [ip, port] = t.target.split(':')
        return { key: ++targetKey, ip: ip || '', port: port ? parseInt(port) : 80, weight: t.weight || 100 }
      })
    }

    // Detect if proxy has advanced config
    form.retries = p.retries ?? undefined
    form.retry_timeout = p.retry_timeout ?? 0
    const isDns = form.proxy_type === 'dns'
    const dfltCheck = isDns ? dnsDefaultChecksJson : defaultChecksJson
    if (p.checks) {
      const c = typeof p.checks === 'string' ? JSON.parse(p.checks) : p.checks
      form.checks = c
      checksJson.value = JSON.stringify(c, null, 2)
    } else {
      form.checks = JSON.parse(dfltCheck) as Record<string, unknown>
      checksJson.value = dfltCheck
    }
    const hasChecks = p.checks && JSON.stringify(form.checks) !== dfltCheck
    const hasRetries = p.retries !== undefined && p.retries !== null
    const hasRetryTimeout = p.retry_timeout !== undefined && p.retry_timeout !== 0
    advancedEnabled.value = !!(hasChecks || hasRetries || hasRetryTimeout)

    try {
      const res = await api.get(`/clusters/${p.cluster_id}/nodes`, { params: { page_size: PAGE_SIZE_DROPDOWN } })
      nodes.value = res.data.items || res.data || []
      // 恢复保存的参考节点；无记录时保持空让用户手动选择
      if (p.ref_node_id) {
        form.node_id = p.ref_node_id
      } else {
        form.node_id = ''
      }
    } catch {
      nodes.value = []
    }

    // 编辑模式统一先进 step 1
    currentStep.value = 1
  } else {
    form.cluster_id = ''
    form.node_id = ''
    form.listen_port = 0
    form.name = ''
    form.description = ''
    form.proxy_type = 'normal'
    form.scheme = 'tcp'
    form.load_balance = 'weighted_roundrobin'
    form.hash_on = 'vars'
    form.key = 'remote_addr'
    form.targets = [{ key: ++targetKey, ip: '', port: 80, weight: 100 }]
    form.dns_domains = []
    form.retries = undefined
    form.retry_timeout = 0
    form.checks = JSON.parse(defaultChecksJson) as Record<string, unknown>
    checksJson.value = defaultChecksJson
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

/* ── Protocol Badge ── */
.spwf-protocol-badge {
  display: inline-flex;
  padding: 6px 18px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-body);
  border: 1px solid var(--accent);
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
