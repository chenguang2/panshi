<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width: 860px">
      <div class="modal-header">
        <h2>{{ editingRoute ? '编辑 DNS 代理路由' : '新建 DNS 代理路由' }}</h2>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>

      <!-- Tab Bar -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">
          基础配置<span v-if="tabBadge.basic" class="tab-err-badge">{{ tabBadge.basic }}</span>
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'domains' }" @click="activeTab = 'domains'">
          域名配置<span v-if="tabBadge.domains" class="tab-err-badge">{{ tabBadge.domains }}</span>
        </button>
      </div>

      <div class="modal-body">
        <!-- ═══ Basic Config Tab ═══ -->
        <div v-show="activeTab === 'basic'">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">名称 <span class="required">*</span></label>
              <input v-model="form.name" type="text" class="form-input" placeholder="例如：内网 DNS 代理" />
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
            <input v-model="form.uri" type="text" class="form-input" placeholder="/dns-query" />
            <div class="form-hint">DoH 请求入口路径（DNS over HTTP 客户端访问的路径），通常保持默认</div>
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
              <input v-model="form.description" type="text" class="form-input" placeholder="描述信息（可选）" />
            </div>
          </div>
        </div>

        <!-- ═══ Domain Config Tab ═══ -->
        <div v-show="activeTab === 'domains'">
          <div class="dns-hint">
            配置域名到 DNS 上游服务器的映射关系。每个域名可独立设置负载均衡算法、TTL 和上游服务器。
          </div>

          <div v-for="(dom, di) in form.domains" :key="dom.key" class="domain-card">
            <!-- Domain Card Header -->
            <div class="domain-card-header" @click="toggleDomainExpand(di)">
              <div class="domain-card-title">
                <span class="domain-expand-icon">{{ dom.expanded ? '▾' : '▸' }}</span>
                <span class="domain-name-label">{{ dom.domain || '新域名' }}</span>
                <span v-if="domainHasError(di)" class="domain-err-mark">!</span>
              </div>
              <div class="domain-card-actions">
                <span class="domain-node-count">{{ dom.nodes.length }} 个上游</span>
                <button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click.stop="removeDomain(di)">
                  删除
                </button>
              </div>
            </div>

            <!-- Domain Card Body -->
            <div v-show="dom.expanded" class="domain-card-body">
              <!-- Domain + LB + TTL in one row -->
              <div class="form-row" style="align-items: flex-start">
                <div class="form-group" style="flex: 2">
                  <label class="form-label">域名 <span class="required">*</span></label>
                  <input
                    v-model="dom.domain"
                    type="text"
                    class="form-input"
                    placeholder="例如：qcg.com"
                    :class="{ 'input-error': domainErrors[`${di}.domain`] }"
                    @input="validateDomain(di)"
                  />
                  <span v-if="domainErrors[`${di}.domain`]" class="form-error">{{ domainErrors[`${di}.domain`] }}</span>
                </div>
                <div class="form-group" style="flex: 1.2">
                  <label class="form-label">负载均衡 <span class="required">*</span></label>
                  <select v-model="dom.lb_type" class="form-input">
                    <option value="roundrobin">轮询</option>
                    <option value="chash">一致性哈希</option>
                    <option value="ewma">EWMA</option>
                    <option value="least_conn">最少连接</option>
                  </select>
                </div>
                <div class="form-group" style="width: 90px; flex: none">
                  <label class="form-label">TTL(秒)</label>
                  <input v-model.number="dom.ttl" type="number" class="form-input" min="0" placeholder="10" />
                </div>
              </div>

              <!-- Upstream Servers Table -->
              <div class="form-group">
                <label class="form-label">DNS 上游服务器 <span class="required">*</span></label>
                <div class="nodes-table-box">
                  <div class="nodes-table-header">
                    <span class="nodes-th-cell" style="flex: 1.5">上游 IP 地址</span>
                    <span class="nodes-th-cell" style="width: 90px">上游端口</span>
                    <span class="nodes-th-cell" style="flex: 1.5">客户端 CIDR（可选）</span>
                    <span class="nodes-th-cell" style="width: 50px">操作</span>
                  </div>
                  <div v-for="(node, ni) in dom.nodes" :key="node.key" class="nodes-table-row">
                    <div style="flex: 1.5; display: flex; flex-direction: column">
                      <input
                        v-model="node.ip"
                        type="text"
                        class="form-input"
                        placeholder="192.168.100.114"
                        :class="{ 'input-error': domainErrors[`${di}.n${ni}.ip`] }"
                        @input="validateNode(di, ni)"
                      />
                      <span
                        v-if="domainErrors[`${di}.n${ni}.ip`]"
                        class="form-error"
                        style="font-size: 10px; margin-top: 2px"
                        >{{ domainErrors[`${di}.n${ni}.ip`] }}</span
                      >
                    </div>
                    <div style="width: 90px; display: flex; flex-direction: column">
                      <input
                        v-model.number="node.port"
                        type="number"
                        class="form-input"
                        min="1"
                        max="65535"
                        placeholder="16610"
                        :class="{ 'input-error': domainErrors[`${di}.n${ni}.port`] }"
                        @input="validateNode(di, ni)"
                      />
                      <span
                        v-if="domainErrors[`${di}.n${ni}.port`]"
                        class="form-error"
                        style="font-size: 10px; margin-top: 2px"
                        >{{ domainErrors[`${di}.n${ni}.port`] }}</span
                      >
                    </div>
                    <div style="flex: 1.5">
                      <input
                        v-model="node.cidrs"
                        type="text"
                        class="form-input"
                        placeholder="192.168.0.0/16（多个用逗号分隔）"
                      />
                    </div>
                    <button
                      class="btn btn-ghost btn-sm"
                      style="width: 50px; color: var(--danger)"
                      @click="removeNode(di, ni)"
                    >
                      删除
                    </button>
                  </div>
                  <button class="btn btn-ghost btn-sm nodes-add-btn" @click="addNode(di)">+ 添加上游</button>
                </div>
                <span v-if="domainErrors[`${di}.nodes`]" class="form-error">{{ domainErrors[`${di}.nodes`] }}</span>
              </div>

              <!-- Health Checks（半结构化：类型下拉 + 主动/被动折叠高级 JSON） -->
              <div style="margin-top: 6px">
                <label class="checkbox-label" style="font-size: 12px">
                  <input type="checkbox" v-model="dom.enableChecks" />
                  <span>健康检查</span>
                </label>
                <div v-if="dom.enableChecks" style="margin-top: 6px">
                  <div class="form-row">
                    <div class="form-group" style="max-width: 200px">
                      <label class="form-label">检查类型</label>
                      <select v-model="dom.checkType" class="form-input">
                        <option value="https">https</option>
                        <option value="http">http</option>
                      </select>
                    </div>
                  </div>
                  <div class="checks-advanced">
                    <button type="button" class="checks-advanced-toggle" @click="dom.showActive = !dom.showActive">
                      {{ dom.showActive ? '▾' : '▸' }} 主动检查（高级）
                    </button>
                    <textarea
                      v-show="dom.showActive"
                      v-model="dom.activeJson"
                      class="form-input code-input"
                      rows="3"
                      :class="{ 'input-error': domainErrors[`${di}.active`] }"
                      placeholder='{"healthy":{"interval":2,"success":2}}'
                    ></textarea>
                    <span v-if="domainErrors[`${di}.active`]" class="form-error">{{
                      domainErrors[`${di}.active`]
                    }}</span>
                  </div>
                  <div class="checks-advanced">
                    <button type="button" class="checks-advanced-toggle" @click="dom.showPassive = !dom.showPassive">
                      {{ dom.showPassive ? '▾' : '▸' }} 被动检查（高级）
                    </button>
                    <textarea
                      v-show="dom.showPassive"
                      v-model="dom.passiveJson"
                      class="form-input code-input"
                      rows="3"
                      :class="{ 'input-error': domainErrors[`${di}.passive`] }"
                      placeholder='{"unhealthy":{"http_failures":3}}'
                    ></textarea>
                    <span v-if="domainErrors[`${di}.passive`]" class="form-error">{{
                      domainErrors[`${di}.passive`]
                    }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            class="btn btn-ghost btn-sm"
            style="
              width: 100%;
              border: 1px dashed var(--border);
              border-radius: var(--radius-md);
              padding: 8px;
              font-size: 13px;
            "
            @click="addDomain"
          >
            + 添加域名
          </button>
          <div v-if="formErrors.domains" class="form-error" style="margin-top: 8px">{{ formErrors.domains }}</div>
        </div>
      </div>

      <!-- 跨 Tab 错误汇总（批 1：错误必须可见可到达） -->
      <div v-if="otherTabErrorCount > 0" class="form-error-summary">
        还有 {{ otherTabErrorCount }} 项问题在「{{ activeTab === 'basic' ? '域名配置' : '基础配置' }}」
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button v-if="retryVisible" class="btn btn-secondary" :disabled="submitting" @click="retrySavePlugins">
          重试保存域名配置
        </button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
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
  checkType: string
  activeJson: string
  passiveJson: string
  showActive: boolean
  showPassive: boolean
  nodes: DnsNode[]
}

// ── State ──

const activeTab = ref('basic')
const submitting = ref(false)
const retryVisible = ref(false)
const formErrors = reactive<Record<string, string>>({})
const domainErrors = reactive<Record<string, string>>({})
// 跨 Tab 错误分布（批 1）：页签角标 + 汇总条数据源
const tabBadge = reactive<{ basic: number; domains: number }>({ basic: 0, domains: 0 })

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
    checkType: 'https',
    activeJson: JSON.stringify({ healthy: { interval: 2, success: 2 } }, null, 2),
    passiveJson: JSON.stringify({}, null, 2),
    showActive: false,
    showPassive: false,
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

function domainHasError(di: number): boolean {
  return Object.keys(domainErrors).some((k) => k.startsWith(`${di}.`))
}

// ── Upstream Server Management ──

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

// 健康检查高级 JSON 校验（批 1：失败阻止提交 + 中文错误；绝不静默替换）
function validateChecks(di: number): boolean {
  const dom = form.domains[di]
  if (!dom || !dom.enableChecks) return true
  let valid = true
  for (const part of ['active', 'passive'] as const) {
    const key = `${di}.${part}`
    const raw = (part === 'active' ? dom.activeJson : dom.passiveJson) ?? ''
    const label = part === 'active' ? '主动检查' : '被动检查'
    if (!raw.trim()) {
      delete domainErrors[key]
      continue
    }
    try {
      JSON.parse(raw)
      delete domainErrors[key]
    } catch (e: any) {
      domainErrors[key] = `${label} JSON 格式不合法：${e?.message || '解析失败'}`
      valid = false
    }
  }
  return valid
}

interface ErrorDistribution {
  basic: number
  domains: number
}

function validateForm(): ErrorDistribution {
  Object.keys(formErrors).forEach((k) => delete formErrors[k])
  Object.keys(domainErrors).forEach((k) => delete domainErrors[k])
  tabBadge.basic = 0
  tabBadge.domains = 0

  const dist: ErrorDistribution = { basic: 0, domains: 0 }

  if (!form.name.trim()) {
    formErrors.name = '请输入路由名称'
    dist.basic++
  }

  if (!form.uri.trim()) {
    formErrors.uri = '请输入 URI'
    dist.basic++
  } else if (!form.uri.startsWith('/')) {
    formErrors.uri = 'URI 必须以 / 开头'
    dist.basic++
  }

  if (!form.cluster_id) {
    formErrors.cluster_id = '请选择所属集群'
    dist.basic++
  }

  if (form.domains.length === 0) {
    formErrors.domains = '请至少添加一个域名'
    dist.domains++
  }

  for (let di = 0; di < form.domains.length; di++) {
    const dom = form.domains[di]
    if (!dom.domain.trim()) {
      domainErrors[`${di}.domain`] = '域名不能为空'
      dist.domains++
    }
    if (dom.nodes.length === 0) {
      domainErrors[`${di}.nodes`] = '至少需要一个上游服务器'
      dist.domains++
    }
    for (let ni = 0; ni < dom.nodes.length; ni++) {
      if (!dom.nodes[ni].ip.trim() || !String(dom.nodes[ni].port ?? '').trim()) {
        domainErrors[`${di}.nodes`] = '每个上游需填写 IP 和端口'
        dist.domains++
      }
      if (!validateNode(di, ni)) {
        dist.domains++
      }
    }
    if (!validateChecks(di)) {
      dist.domains++
    }
  }

  tabBadge.basic = dist.basic
  tabBadge.domains = dist.domains
  return dist
}

// 跨 Tab 引导：自动切到第一个含错 Tab
function guideToFirstErrorTab(dist: ErrorDistribution) {
  if (dist.basic > 0) {
    activeTab.value = 'basic'
  } else if (dist.domains > 0) {
    activeTab.value = 'domains'
  }
}

const otherTabErrorCount = computed(() => {
  if (activeTab.value === 'basic') return tabBadge.domains
  return tabBadge.basic
})

// ── Edge Config Conversion ──

function parseChecksPart(raw: string): any {
  if (!raw || !raw.trim()) return {}
  return JSON.parse(raw)
}

function buildPluginsPayload(): { plugin_name: string; config: string }[] {
  const hosts: Record<string, any> = {}

  for (const dom of form.domains) {
    if (!dom.domain.trim()) continue

    const nodes: Record<string, string[]> = {}
    for (const node of dom.nodes) {
      if (!node.ip.trim() || !String(node.port ?? '').trim()) continue
      const address = `${node.ip.trim()}:${node.port}`
      const cidrList = node.cidrs.trim()
        ? node.cidrs
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
      nodes[address] = cidrList
    }

    const domainCfg: Record<string, any> = { nodes, type: dom.lb_type }

    if (dom.ttl !== undefined && dom.ttl !== null && dom.ttl >= 0) {
      domainCfg.ttl_valid = dom.ttl
    }

    if (dom.enableChecks) {
      // 校验已在 validateChecks 完成（失败会阻止提交），此处仅组装；绝不静默替换
      const checks: any = { type: dom.checkType || 'https' }
      const active = parseChecksPart(dom.activeJson)
      if (Object.keys(active).length) checks.active = active
      const passive = parseChecksPart(dom.passiveJson)
      if (Object.keys(passive).length) checks.passive = passive
      domainCfg.checks = checks
    }

    hosts[dom.domain.trim()] = domainCfg
  }

  return [
    {
      plugin_name: 'dns_upstream',
      config: JSON.stringify({ hosts }),
    },
  ]
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
        expanded: form.domains.length === 0,
        domain,
        lb_type: cfg.type || 'roundrobin',
        ttl: cfg.ttl_valid ?? null,
        enableChecks,
        checkType: checks.type || 'https',
        activeJson: JSON.stringify(checks.active ?? {}, null, 2),
        passiveJson: JSON.stringify(checks.passive ?? {}, null, 2),
        showActive: false,
        showPassive: false,
        nodes,
      })
    }
  } catch {
    // Invalid config, start with empty domains
  }
}

// ── Submit（批 1：原子性 + 分步如实报告） ──

function errReason(e: any): string {
  const detail = e?.response?.data?.detail
  return typeof detail === 'string' ? detail : e?.message || '未知错误'
}

async function savePlugins(cid: number, routeId: number): Promise<boolean> {
  await api.put(`/clusters/${cid}/routes/${routeId}/plugins`, { plugins: buildPluginsPayload() })
  return true
}

async function handleSubmit() {
  const dist = validateForm()
  if (dist.basic + dist.domains > 0) {
    guideToFirstErrorTab(dist)
    return
  }
  submitting.value = true
  const cid = Number(form.cluster_id)

  try {
    const routeData: Record<string, any> = {
      name: form.name.trim(),
      uri: form.uri.trim(),
      methods: ALL_METHODS,
      priority: 0,
      status: form.status,
      description: form.description.trim(),
    }

    if (props.editingRoute) {
      const rid = props.editingRoute.id
      try {
        await api.put(`/clusters/${cid}/routes/${rid}`, routeData)
      } catch (e: any) {
        message.error(`保存失败：${errReason(e)}`)
        return
      }
      try {
        await savePlugins(cid, rid)
      } catch (e: any) {
        // 编辑分步如实报告：基础信息已保存，域名配置失败可重试（不回滚合法变更）
        retryVisible.value = true
        message.error(`路由基础信息已保存，但域名配置保存失败：${errReason(e)}。可点击「重试保存域名配置」重试`)
        return
      }
      message.success('DNS 代理路由已更新')
    } else {
      let routeId: number
      try {
        const res = await api.post(`/clusters/${cid}/routes`, routeData)
        routeId = res.data.id
      } catch (e: any) {
        message.error(`保存失败：${errReason(e)}`)
        return
      }
      try {
        await savePlugins(cid, routeId)
      } catch (e: any) {
        // 创建原子性：补偿回滚已创建的路由，失败即无痕
        let rolledBack = false
        try {
          await api.delete(`/clusters/${cid}/routes/${routeId}`)
          rolledBack = true
        } catch {
          /* 补偿删除失败：如实提示残留 */
        }
        if (rolledBack) {
          message.error(`保存失败：路由已回滚（${errReason(e)}）。请调整后重试`)
        } else {
          message.error(`保存失败：${errReason(e)}；警告：残留了一条空路由「${form.name.trim()}」，请手动删除`)
        }
        return
      }
      message.success('DNS 代理路由已创建')
    }

    retryVisible.value = false
    emit('saved')
    emit('close')
  } finally {
    submitting.value = false
  }
}

async function retrySavePlugins() {
  if (!props.editingRoute) return
  submitting.value = true
  try {
    await savePlugins(Number(props.editingRoute.cluster_id), props.editingRoute.id)
    retryVisible.value = false
    message.success('DNS 代理路由已更新')
    emit('saved')
    emit('close')
  } catch (e: any) {
    message.error(`域名配置保存失败：${errReason(e)}。请稍后重试`)
  } finally {
    submitting.value = false
  }
}

// ── Watch ──

watch(
  () => props.visible,
  async (v) => {
    if (!v) return

    activeTab.value = 'basic'
    retryVisible.value = false
    formErrors.name = ''
    formErrors.uri = ''
    formErrors.cluster_id = ''
    formErrors.domains = ''
    Object.keys(domainErrors).forEach((k) => delete domainErrors[k])
    tabBadge.basic = 0
    tabBadge.domains = 0

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
            const configStr =
              typeof dnsPlugin.config === 'string' ? dnsPlugin.config : JSON.stringify(dnsPlugin.config || {})
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
  },
)
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
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-btn:hover {
  color: var(--fg);
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* Tab 错误角标（批 1） */
.tab-err-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  color: var(--danger);
  border: 1px solid var(--danger);
  background: oklch(55% 0.2 25 / 10%);
}

/* 跨 Tab 错误汇总条（批 1） */
.form-error-summary {
  margin: 0 20px;
  padding: 8px 14px;
  font-size: 12px;
  color: var(--danger);
  background: oklch(55% 0.2 25 / 8%);
  border: 1px solid oklch(55% 0.2 25 / 30%);
  border-radius: var(--radius-md);
}

/* ── Form Overrides ── */
.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 0;
}
.form-row .form-group {
  flex: 1;
}

.input-error {
  border-color: var(--danger) !important;
}

.form-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  line-height: 1.5;
}

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

/* 域名卡错误标识（批 1） */
.domain-err-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: var(--danger);
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

/* ── Health Check Advanced（批 1 半结构化） ── */
.checks-advanced {
  margin-top: 6px;
}

.checks-advanced-toggle {
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
  padding: 4px 0;
  font-family: var(--font-body);
}

.checks-advanced-toggle:hover {
  color: var(--fg);
}

.checks-advanced .code-input {
  margin-top: 4px;
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

.nodes-table-row:last-child {
  border-bottom: none;
}

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

.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
</style>
