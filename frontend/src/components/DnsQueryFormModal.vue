<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:860px;">
      <div class="modal-header">
        <h2>{{ editingRoute ? '编辑 DNS 查询路由' : '新建 DNS 查询路由' }}</h2>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>

      <!-- Tab Bar -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基础配置</button>
        <button class="tab-btn" :class="{ active: activeTab === 'domains' }" @click="activeTab = 'domains'">域名配置</button>
      </div>

      <div class="modal-body">
        <!-- ═══ Basic Config Tab ═══ -->
        <div v-show="activeTab === 'basic'">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">名称 <span class="required">*</span></label>
              <input v-model="form.name" type="text" class="form-input" placeholder="例如：内网 DNS 查询">
              <div v-if="formErrors.name" class="form-error">{{ formErrors.name }}</div>
            </div>
            <div class="form-group">
              <label class="form-label">所属集群 <span class="required">*</span></label>
              <select v-model="form.cluster_id" class="form-input" :disabled="!!editingRoute">
                <option value="">请选择集群</option>
                <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
              </select>
              <div v-if="formErrors.cluster_id" class="form-error">{{ formErrors.cluster_id }}</div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">URI <span class="required">*</span></label>
            <input v-model="form.uri" type="text" class="form-input" placeholder="/dns-query">
            <div v-if="formErrors.uri" class="form-error">{{ formErrors.uri }}</div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">状态</label>
              <select v-model="form.status" class="form-input">
                <option :value="1">启用</option>
                <option :value="0">禁用</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">描述</label>
              <input v-model="form.description" type="text" class="form-input" placeholder="描述信息（可选）">
            </div>
          </div>
        </div>

        <!-- ═══ Domain Config Tab ═══ -->
        <div v-show="activeTab === 'domains'">
          <div class="dns-hint">配置域名到 DNS 上游服务器的映射关系。每个域名可独立设置负载均衡算法、TTL 和目标节点。</div>

          <div v-for="(dom, di) in form.domains" :key="dom.key" class="domain-card">
            <!-- Domain Card Header -->
            <div class="domain-card-header" @click="toggleDomainExpand(di)">
              <div class="domain-card-title">
                <span class="domain-expand-icon">{{ dom.expanded ? '▾' : '▸' }}</span>
                <span class="domain-name-label">{{ dom.domain || '新域名' }}</span>
              </div>
              <div class="domain-card-actions">
                <span class="domain-node-count">{{ dom.nodes.length }} 个节点</span>
                <button class="btn btn-ghost btn-sm" style="color:var(--danger);" @click.stop="removeDomain(di)">删除</button>
              </div>
            </div>

            <!-- Domain Card Body -->
            <div v-show="dom.expanded" class="domain-card-body">
              <!-- Domain + LB + TTL in one row -->
              <div class="form-row" style="align-items:flex-start;">
                <div class="form-group" style="flex:2;">
                  <label class="form-label">域名 <span class="required">*</span></label>
                  <input v-model="dom.domain" type="text" class="form-input" placeholder="例如：qcg.com" :class="{ 'input-error': domainErrors[`${di}.domain`] }" @input="validateDomain(di)">
                  <span v-if="domainErrors[`${di}.domain`]" class="form-error">{{ domainErrors[`${di}.domain`] }}</span>
                </div>
                <div class="form-group" style="flex:1.2;">
                  <label class="form-label">负载均衡 <span class="required">*</span></label>
                  <select v-model="dom.lb_type" class="form-input">
                    <option value="roundrobin">轮询</option>
                    <option value="chash">一致性哈希</option>
                    <option value="ewma">EWMA</option>
                    <option value="least_conn">最少连接</option>
                  </select>
                </div>
                <div class="form-group" style="width:90px;flex:none;">
                  <label class="form-label">TTL(秒)</label>
                  <input v-model.number="dom.ttl" type="number" class="form-input" min="0" placeholder="10">
                </div>
              </div>

              <!-- Nodes Table -->
              <div class="form-group">
                <label class="form-label">目标节点 <span class="required">*</span></label>
                <div class="nodes-table-box">
                  <div class="nodes-table-header">
                    <span class="nodes-th-cell" style="flex:1.5;">IP 地址</span>
                    <span class="nodes-th-cell" style="width:90px;">端口</span>
                    <span class="nodes-th-cell" style="flex:1.5;">客户端 CIDR（可选）</span>
                    <span class="nodes-th-cell" style="width:50px;">操作</span>
                  </div>
                  <div v-for="(node, ni) in dom.nodes" :key="node.key" class="nodes-table-row">
                    <div style="flex:1.5;display:flex;flex-direction:column;">
                      <input v-model="node.ip" type="text" class="form-input" placeholder="192.168.100.114" :class="{ 'input-error': domainErrors[`${di}.n${ni}.ip`] }" @input="validateNode(di, ni)">
                      <span v-if="domainErrors[`${di}.n${ni}.ip`]" class="form-error" style="font-size:10px;margin-top:2px;">{{ domainErrors[`${di}.n${ni}.ip`] }}</span>
                    </div>
                    <div style="width:90px;display:flex;flex-direction:column;">
                      <input v-model.number="node.port" type="number" class="form-input" min="1" max="65535" placeholder="16610" :class="{ 'input-error': domainErrors[`${di}.n${ni}.port`] }" @input="validateNode(di, ni)">
                      <span v-if="domainErrors[`${di}.n${ni}.port`]" class="form-error" style="font-size:10px;margin-top:2px;">{{ domainErrors[`${di}.n${ni}.port`] }}</span>
                    </div>
                    <div style="flex:1.5;">
                      <input v-model="node.cidrs" type="text" class="form-input" placeholder="192.168.0.0/16（多个用逗号分隔）">
                    </div>
                    <button class="btn btn-ghost btn-sm" style="width:50px;color:var(--danger);" @click="removeNode(di, ni)">删除</button>
                  </div>
                  <button class="btn btn-ghost btn-sm nodes-add-btn" @click="addNode(di)">+ 添加节点</button>
                </div>
                <span v-if="domainErrors[`${di}.nodes`]" class="form-error">{{ domainErrors[`${di}.nodes`] }}</span>
              </div>

              <!-- Health Checks -->
              <div style="margin-top:6px;">
                <label class="checkbox-label" style="font-size:12px;">
                  <input type="checkbox" v-model="dom.enableChecks">
                  <span>健康检查</span>
                </label>
                <div v-if="dom.enableChecks" style="margin-top:6px;">
                  <textarea v-model="dom.checksJson" class="form-input code-input" rows="4" placeholder='{"type":"https","active":{},"passive":{}}'></textarea>
                </div>
              </div>
            </div>
          </div>

          <button class="btn btn-ghost btn-sm" style="width:100%;border:1px dashed var(--border);border-radius:var(--radius-md);padding:8px;font-size:13px;" @click="addDomain">
            + 添加域名
          </button>
          <div v-if="formErrors.domains" class="form-error" style="margin-top:8px;">{{ formErrors.domains }}</div>
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
  editingRoute: any | null
  clusters: { id: number; name: string; display_name?: string }[]
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const ALL_METHODS = 'GET,POST,PUT,DELETE,PATCH,HEAD,OPTIONS,CONNECT,TRACE'

// ── Types ──

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

function isValidPort(port: string): boolean {
  const n = parseInt(port, 10)
  return !isNaN(n) && n >= 1 && n <= 65535 && String(n) === port.trim()
}

interface DnsNode {
  key: number
  ip: string
  port: string
  cidrs: string
}

interface DnsDomain {
  key: number
  expanded: boolean
  domain: string
  lb_type: string
  ttl: number | null
  enableChecks: boolean
  checksJson: string
  nodes: DnsNode[]
}

// ── State ──

const activeTab = ref('basic')
const submitting = ref(false)
const formErrors = reactive<Record<string, string>>({})
const domainErrors = reactive<Record<string, string>>({})

let keyCounter = 0

function nextKey(): number {
  return ++keyCounter
}

function createDefaultDomain(): DnsDomain {
  return {
    key: nextKey(),
    expanded: true,
    domain: '',
    lb_type: 'roundrobin',
    ttl: null,
    enableChecks: true,
    checksJson: JSON.stringify({ type: "https", active: {}, passive: {} }, null, 2),
    nodes: [{ key: nextKey(), ip: '', port: '', cidrs: '' }],
  }
}

const form = reactive({
  name: '',
  uri: '/dns-query',
  cluster_id: '' as number | string,
  description: '',
  status: 1,
  domains: [] as DnsDomain[],
})

// ── Domain Management ──

function addDomain() {
  form.domains.push(createDefaultDomain())
}

function removeDomain(index: number) {
  form.domains.splice(index, 1)
}

function toggleDomainExpand(index: number) {
  form.domains[index].expanded = !form.domains[index].expanded
}

// ── Node Management ──

function addNode(di: number) {
  form.domains[di].nodes.push({ key: nextKey(), ip: '', port: '', cidrs: '' })
}

function removeNode(di: number, ni: number) {
  form.domains[di].nodes.splice(ni, 1)
}

// ── Validation ──

function validateDomain(di: number): boolean {
  const dom = form.domains[di]
  if (!dom) return false
  const key = `${di}.domain`
  if (!dom.domain.trim()) {
    domainErrors[key] = '域名不能为空'
    return false
  }
  delete domainErrors[key]
  return true
}

function validateNode(di: number, ni: number): boolean {
  const node = form.domains[di]?.nodes[ni]
  if (!node) return false
  let valid = true

  const ipKey = `${di}.n${ni}.ip`
  if (!node.ip.trim()) {
    domainErrors[ipKey] = 'IP 不能为空'
    valid = false
  } else if (!IP_PATTERN.test(node.ip.trim())) {
    domainErrors[ipKey] = 'IP 格式不合法'
    valid = false
  } else {
    delete domainErrors[ipKey]
  }

  const portKey = `${di}.n${ni}.port`
  const portStr = String(node.port ?? '')
  if (!portStr.trim()) {
    domainErrors[portKey] = '端口不能为空'
    valid = false
  } else if (!isValidPort(portStr.trim())) {
    domainErrors[portKey] = '端口需为 1-65535'
    valid = false
  } else {
    delete domainErrors[portKey]
  }

  return valid
}

function validateForm(): boolean {
  Object.keys(formErrors).forEach(k => delete formErrors[k])
  Object.keys(domainErrors).forEach(k => delete domainErrors[k])

  let valid = true

  if (!form.name.trim()) {
    formErrors.name = '请输入路由名称'
    valid = false
  }

  if (!form.uri.trim()) {
    formErrors.uri = '请输入 URI'
    valid = false
  } else if (!form.uri.startsWith('/')) {
    formErrors.uri = 'URI 必须以 / 开头'
    valid = false
  }

  if (!form.cluster_id) {
    formErrors.cluster_id = '请选择所属集群'
    valid = false
  }

  if (form.domains.length === 0) {
    formErrors.domains = '请至少添加一个域名'
    valid = false
  }

  for (let di = 0; di < form.domains.length; di++) {
    const dom = form.domains[di]
    if (!dom.domain.trim()) {
      domainErrors[`${di}.domain`] = '域名不能为空'
      valid = false
    }
    if (dom.nodes.length === 0) {
      domainErrors[`${di}.nodes`] = '至少需要一个节点'
      valid = false
    }
    for (let ni = 0; ni < dom.nodes.length; ni++) {
      if (!dom.nodes[ni].ip.trim() || !String(dom.nodes[ni].port ?? '').trim()) {
        domainErrors[`${di}.nodes`] = '每个节点需填写 IP 和端口'
        valid = false
      }
      if (!validateNode(di, ni)) {
        valid = false
      }
    }
  }

  return valid
}

// ── Edge Config Conversion ──

function buildPluginsPayload(): { plugin_name: string; config: string }[] {
  const hosts: Record<string, any> = {}

  for (const dom of form.domains) {
    if (!dom.domain.trim()) continue

    const nodes: Record<string, string[]> = {}
    for (const node of dom.nodes) {
      if (!node.ip.trim() || !String(node.port ?? '').trim()) continue
      const address = `${node.ip.trim()}:${node.port}`
      const cidrList = node.cidrs.trim()
        ? node.cidrs.split(',').map(s => s.trim()).filter(Boolean)
        : []
      nodes[address] = cidrList
    }

    const domainCfg: Record<string, any> = { nodes, type: dom.lb_type }

    if (dom.ttl !== undefined && dom.ttl !== null && dom.ttl >= 0) {
      domainCfg.ttl_valid = dom.ttl
    }

    if (dom.enableChecks) {
      try {
        domainCfg.checks = JSON.parse(dom.checksJson || '{}')
      } catch {
        domainCfg.checks = { active: {}, passive: {} }
      }
    }

    hosts[dom.domain.trim()] = domainCfg
  }

  return [{
    plugin_name: 'dns_upstream',
    config: JSON.stringify({ hosts }),
  }]
}

function parseDnsConfig(config: string) {
  try {
    const parsed = JSON.parse(config)
    const hosts = parsed.hosts || {}
    for (const [domain, cfg] of Object.entries(hosts) as [string, any][]) {
      const nodes: DnsNode[] = Object.entries(cfg.nodes || {}).map(([address, cidrs]) => {
        const sep = address.lastIndexOf(':')
        const ip = sep > 0 ? address.slice(0, sep) : address
        const port = sep > 0 ? address.slice(sep + 1) : ''
        return { key: nextKey(), ip, port, cidrs: Array.isArray(cidrs) ? cidrs.join(', ') : '' }
      })

      const checks = cfg.checks || {}
      const enableChecks = !!(checks && (checks.active || checks.passive || checks.type))

      form.domains.push({
        key: nextKey(),
        expanded: false,
        domain,
        lb_type: cfg.type || 'roundrobin',
        ttl: cfg.ttl_valid ?? null,
        enableChecks,
        checksJson: checks ? JSON.stringify(checks, null, 2) : '{}',
        nodes,
      })
    }
  } catch {
    // Invalid config, start with empty domains
  }
}

// ── Submit ──

async function handleSubmit() {
  if (!validateForm()) return
  submitting.value = true

  try {
    const cid = Number(form.cluster_id)
    const routeData: Record<string, any> = {
      name: form.name.trim(),
      uri: form.uri.trim(),
      methods: ALL_METHODS,
      priority: 0,
      status: form.status,
      description: form.description.trim(),
    }

    const plugins = buildPluginsPayload()

    if (props.editingRoute) {
      await api.put(`/clusters/${cid}/routes/${props.editingRoute.id}`, routeData)
      await api.put(`/clusters/${cid}/routes/${props.editingRoute.id}/plugins`, { plugins })
      message.success('DNS 查询路由已更新')
    } else {
      const res = await api.post(`/clusters/${cid}/routes`, routeData)
      const routeId = res.data.id
      await api.put(`/clusters/${cid}/routes/${routeId}/plugins`, { plugins })
      message.success('DNS 查询路由已创建')
    }

    emit('saved')
    emit('close')
  } catch (e: any) {
    const detail = e?.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '保存失败')
  } finally {
    submitting.value = false
  }
}

// ── Watch ──

watch(() => props.visible, async (v) => {
  if (!v) return

  activeTab.value = 'basic'
  formErrors.name = ''
  formErrors.uri = ''
  formErrors.cluster_id = ''
  formErrors.domains = ''
  Object.keys(domainErrors).forEach(k => delete domainErrors[k])

  if (props.editingRoute) {
    const r = props.editingRoute
    form.name = r.name
    form.uri = r.uri || '/dns-query'
    form.cluster_id = r.cluster_id
    form.description = r.description || ''
    form.status = r.status ?? 1
    form.domains = []

    if (r.id && r.cluster_id) {
      try {
        const res = await api.get(`/clusters/${r.cluster_id}/routes/${r.id}/plugins`)
        const pluginsList: any[] = res.data.plugins || []
        const dnsPlugin = pluginsList.find((p: any) => p.plugin_name === 'dns_upstream')
        if (dnsPlugin) {
          const configStr = typeof dnsPlugin.config === 'string' ? dnsPlugin.config : JSON.stringify(dnsPlugin.config || {})
          parseDnsConfig(configStr)
        }
      } catch {
        form.domains = []
      }
    }
  } else {
    form.name = ''
    form.uri = '/dns-query'
    form.cluster_id = ''
    form.description = ''
    form.status = 1
    form.domains = [createDefaultDomain()]
  }
})
</script>

<style scoped>
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

/* ── Form Overrides ── */
.form-row { display: flex; gap: 16px; margin-bottom: 0; }
.form-row .form-group { flex: 1; }

.input-error { border-color: var(--danger) !important; }

/* ── Hint Text ── */
.dns-hint {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 16px;
  padding: 10px 14px;
  background: var(--bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  line-height: 1.5;
}

/* ── Domain Cards ── */
.domain-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: 12px;
  background: var(--surface);
  overflow: hidden;
  transition: box-shadow 0.15s;
}

.domain-card:hover {
  box-shadow: var(--shadow-sm);
}

.domain-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.domain-card-header:hover {
  background: oklch(97% 0.005 250);
}

.domain-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.domain-expand-icon {
  font-size: 11px;
  color: var(--muted);
  width: 14px;
  text-align: center;
}

.domain-name-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}

.domain-card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.domain-node-count {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
}

.domain-card-body {
  padding: 16px;
  border-top: 1px solid var(--border);
  background: var(--bg);
}

/* ── Nodes Table ── */
.nodes-table-box {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.nodes-table-header {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: oklch(97% 0.005 250);
  border-bottom: 1px solid var(--border);
}

.nodes-th-cell {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
}

.nodes-table-row {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  align-items: center;
  border-bottom: 1px solid var(--border);
}

.nodes-table-row:last-child { border-bottom: none; }

.nodes-add-btn {
  width: 100%;
  border: 1px dashed var(--border) !important;
  border-radius: 0 !important;
  padding: 6px !important;
  font-size: 12px !important;
}

.code-input {
  font-family: var(--font-mono) !important;
  font-size: 12px !important;
  resize: vertical;
  min-height: 72px;
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
</style>
