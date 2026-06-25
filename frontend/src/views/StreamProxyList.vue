<template>
  <div class="sp-page">
    <PageHeader title="四层代理" description="管理集群级的 TCP/UDP 四层代理转发规则，支持多种负载均衡策略。">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateWizard">+ 新建四层代理</button>
      </template>
    </PageHeader>

    <div class="sp-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索四层代理名称..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="clusterFilter" class="form-input" style="width:160px;flex-shrink:0;" @change="loadProxies">
        <option value="">全部集群</option>
        <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ totalCount }} 个四层代理</span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="proxies.length === 0" class="sp-empty">
      <div class="sp-empty-icon">▣</div>
      <div class="sp-empty-text">暂无四层代理</div>
    </div>
    <div v-else class="sp-grid">
      <div v-for="p in proxies" :key="p.id" class="sp-card">
        <div class="sp-card-topbar">{{ p.cluster_name || '-' }}</div>
        <div class="sp-card-header">
          <div class="sp-card-info">
            <div class="sp-card-name">{{ p.name }}</div>
            <div v-if="p.description" class="sp-card-desc">{{ p.description }}</div>
          </div>
          <div class="sp-card-meta">
            <span v-if="p.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
            <span v-else class="badge badge-neutral"><span class="status-dot"></span>未发布</span>
            <div class="sp-version-text">
              <template v-if="p.current_version && p.published_at">v{{ p.current_version }} · {{ formatDate(p.published_at) }}</template>
              <template v-else-if="p.current_version">v{{ p.current_version }} · 未同步</template>
            </div>
          </div>
        </div>
        <div class="sp-card-details">
          <div class="sp-detail-row">
            <span class="sp-detail-label">协议</span>
            <span class="sp-detail-value">{{ schemeLabel(p.scheme) }}</span>
          </div>
          <div class="sp-detail-row">
            <span class="sp-detail-label">监听端口</span>
            <span class="sp-detail-value sp-port">{{ p.listen_port }}</span>
          </div>
          <div class="sp-detail-row">
            <span class="sp-detail-label">负载均衡</span>
            <span class="sp-detail-value">{{ lbLabel(p.load_balance) }}</span>
          </div>
        </div>
        <div class="sp-card-targets">
          <span v-for="(t, i) in p.targets" :key="i" class="sp-target-tag">{{ t.target }}<span class="sp-target-wt">:{{ t.weight }}</span></span>
          <span v-if="!p.targets || p.targets.length === 0" class="sp-no-targets">无目标</span>
        </div>
        <div class="sp-card-actions">
          <button class="btn btn-ghost btn-sm sp-action-btn" @click="viewProxy(p)">查看</button>
          <button class="btn btn-ghost btn-sm sp-action-btn" @click="editProxy(p)">编辑</button>
          <button class="btn btn-ghost btn-sm sp-action-btn" style="color:var(--danger);" @click="deleteProxy(p)">删除</button>
          <span style="flex:1"></span>
          <button class="btn btn-secondary btn-sm" @click="publishProxyAction(p)">发布</button>
          <button class="btn btn-secondary btn-sm" @click="openVersionManagement(p)">版本管理</button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Form Wizard (inline) -->
    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: wizardVisible ? 'flex' : 'none' }">
        <div class="modal modal-wide" style="max-width:700px;">
          <div class="modal-header">
            <h2>{{ editingProxy ? '编辑四层代理' : '新建四层代理' }}</h2>
            <button class="modal-close" @click="wizardVisible = false">&times;</button>
          </div>
          <div class="modal-body">
            <div class="wizard-steps">
              <span :class="['wizard-step', { active: wizardStep === 1 }]">1. 基本信息</span>
              <span class="wizard-arrow">→</span>
              <span :class="['wizard-step', { active: wizardStep === 2 }]">2. 上游配置</span>
              <span class="wizard-arrow">→</span>
              <span :class="['wizard-step', { active: wizardStep === 3 }]">3. 高级选项</span>
            </div>

            <!-- Step 1: Basic Info -->
            <div v-show="wizardStep === 1" class="wizard-panel">
              <div class="form-group">
                <label class="form-label">所属集群 <span class="required">*</span></label>
                <select v-model="formData.cluster_id" class="form-input" :disabled="!!editingProxy">
                  <option value="">请选择集群</option>
                  <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">名称 <span class="required">*</span></label>
                <input v-model="formData.name" type="text" class="form-input" placeholder="四层代理名称">
              </div>
              <div class="form-group">
                <label class="form-label">描述</label>
                <input v-model="formData.description" type="text" class="form-input" placeholder="描述信息（可选）">
              </div>
              <div class="form-row">
                <div class="form-group" style="flex:1;">
                  <label class="form-label">协议 <span class="required">*</span></label>
                  <select v-model="formData.scheme" class="form-input">
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
                <div class="form-group" style="flex:1;">
                  <label class="form-label">监听端口 <span class="required">*</span></label>
                  <input v-model.number="formData.listen_port" type="number" class="form-input" placeholder="例如 8080" min="1" max="65535">
                </div>
              </div>
            </div>

            <!-- Step 2: Upstream Config -->
            <div v-show="wizardStep === 2" class="wizard-panel">
              <div class="form-group">
                <label class="form-label">负载均衡算法 <span class="required">*</span></label>
                <select v-model="formData.load_balance" class="form-input">
                  <option value="roundrobin">轮询 (roundrobin)</option>
                  <option value="chash">一致性哈希 (chash)</option>
                  <option value="ewma">EWMA</option>
                  <option value="least_conn">最少连接 (least_conn)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">上游目标 <span class="required">*</span></label>
                <div class="targets-editor">
                  <div v-for="(t, i) in formData.targets" :key="i" class="target-row">
                    <input v-model="t.target" type="text" class="form-input" placeholder="IP:端口" style="flex:1;">
                    <input v-model.number="t.weight" type="number" class="form-input" placeholder="权重" style="width:100px;" min="1">
                    <button class="btn btn-ghost btn-sm" style="color:var(--danger);" @click="removeTarget(i)">✕</button>
                  </div>
                  <button class="btn btn-ghost btn-sm" style="margin-top:6px;color:var(--accent);" @click="addTarget">+ 添加目标</button>
                </div>
              </div>
            </div>

            <!-- Step 3: Advanced Options -->
            <div v-show="wizardStep === 3" class="wizard-panel">
              <div class="form-row">
                <div class="form-group" style="flex:1;">
                  <label class="form-label">连接超时 (秒)</label>
                  <input v-model.number="formData.timeout.connect" type="number" class="form-input" placeholder="30" min="0">
                </div>
                <div class="form-group" style="flex:1;">
                  <label class="form-label">发送超时 (秒)</label>
                  <input v-model.number="formData.timeout.send" type="number" class="form-input" placeholder="30" min="0">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style="flex:1;">
                  <label class="form-label">接收超时 (秒)</label>
                  <input v-model.number="formData.timeout.read" type="number" class="form-input" placeholder="30" min="0">
                </div>
                <div class="form-group" style="flex:1;">
                  <label class="form-label">空闲超时 (秒)</label>
                  <input v-model.number="formData.timeout.idle" type="number" class="form-input" placeholder="60" min="0">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style="flex:1;">
                  <label class="form-label">Keepalive 池大小</label>
                  <input v-model.number="formData.keepalive_pool.size" type="number" class="form-input" placeholder="32" min="0">
                </div>
                <div class="form-group" style="flex:1;">
                  <label class="form-label">Keepalive 空闲超时 (秒)</label>
                  <input v-model.number="formData.keepalive_pool.idle_timeout" type="number" class="form-input" placeholder="60" min="0">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">远程地址</label>
                <input v-model="formData.remote_addr" type="text" class="form-input" placeholder="可选，代理连接的真实客户端 IP">
              </div>
              <div class="form-group">
                <label class="form-label">SNI</label>
                <input v-model="formData.sni" type="text" class="form-input" placeholder="可选，TLS 服务器名称指示">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="wizardStep > 1 ? wizardStep-- : (wizardVisible = false)">{{ wizardStep > 1 ? '上一步' : '取消' }}</button>
            <button v-if="wizardStep < 3" class="btn btn-primary" @click="wizardStep++">下一步</button>
            <button v-else class="btn btn-primary" @click="saveWizard" :disabled="!formValid">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- View Drawer (inline) -->
    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: viewDrawerVisible ? 'flex' : 'none' }">
        <div class="modal" style="max-width:600px;">
          <div class="modal-header">
            <h2>查看四层代理 - {{ viewingProxy?.name }}</h2>
            <button class="modal-close" @click="viewDrawerVisible = false">&times;</button>
          </div>
          <div class="modal-body">
            <div v-if="viewingProxy">
              <a-descriptions :column="1" bordered :label-style="{ width: '140px' }">
                <a-descriptions-item label="名称">{{ viewingProxy.name }}</a-descriptions-item>
                <a-descriptions-item label="描述">{{ viewingProxy.description || '-' }}</a-descriptions-item>
                <a-descriptions-item label="集群">{{ viewingProxy.cluster_name || '-' }}</a-descriptions-item>
                <a-descriptions-item label="协议">{{ schemeLabel(viewingProxy.scheme) }}</a-descriptions-item>
                <a-descriptions-item label="监听端口">{{ viewingProxy.listen_port }}</a-descriptions-item>
                <a-descriptions-item label="负载均衡算法">{{ lbLabel(viewingProxy.load_balance) }}</a-descriptions-item>
                <a-descriptions-item label="状态">
                  <a-tag v-if="viewingProxy.current_version" color="green">已发布</a-tag>
                  <a-tag v-else color="orange">未发布</a-tag>
                </a-descriptions-item>
                <a-descriptions-item label="版本" v-if="viewingProxy.current_version">v{{ viewingProxy.current_version }}</a-descriptions-item>
                <a-descriptions-item label="上游目标">
                  <span v-if="viewingProxy.targets && viewingProxy.targets.length > 0">
                    <a-tag v-for="(t, i) in viewingProxy.targets" :key="i" style="margin-bottom:4px;">{{ t.target }} (权重: {{ t.weight }})</a-tag>
                  </span>
                  <span v-else>-</span>
                </a-descriptions-item>
              </a-descriptions>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="viewDrawerVisible = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <VersionManagementModal v-model:open="vmVisible" resource-type="stream_proxy" :resource-id="vmId" :cluster-id="vmClusterId" :resource-name="vmName" @version-change="loadProxies" @published="loadProxies" />

    <PublishConfirmModal v-model:visible="publishVisible" title="发布四层代理" :cluster-id="publishClusterId" @confirm="onPublishConfirm" @cancel="publishVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message } from 'ant-design-vue'
import type { StreamProxy } from '@/types'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'

// ── State ──

const proxies = ref<StreamProxy[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const searchText = ref('')
const clusterFilter = ref<string | number>('')
const page = ref(1)
const pageSize = ref(20)

// Wizard state
const wizardVisible = ref(false)
const wizardStep = ref(1)
const editingProxy = ref<StreamProxy | null>(null)
const formData = ref<{
  cluster_id: number | null
  name: string
  description: string
  scheme: string
  listen_port: number | null
  load_balance: string
  targets: { target: string; weight: number }[]
  timeout: Record<string, number>
  keepalive_pool: Record<string, number>
  remote_addr: string
  sni: string
}>({
  cluster_id: null,
  name: '',
  description: '',
  scheme: 'tcp',
  listen_port: null,
  load_balance: 'roundrobin',
  targets: [],
  timeout: {},
  keepalive_pool: {},
  remote_addr: '',
  sni: '',
})

// View drawer state
const viewDrawerVisible = ref(false)
const viewingProxy = ref<StreamProxy | null>(null)

// Version management state
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')

// Publish state
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingProxy = ref<StreamProxy | null>(null)

// ── Helpers ──

function schemeLabel(scheme: string | undefined): string {
  if (scheme === 'tcp') return 'TCP'
  if (scheme === 'udp') return 'UDP'
  return scheme || 'TCP'
}

function lbLabel(algo: string | undefined): string {
  const map: Record<string, string> = {
    roundrobin: '轮询',
    chash: '一致性哈希',
    ewma: 'EWMA',
    least_conn: '最少连接',
  }
  return map[algo || ''] || algo || '-'
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return d }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    loadProxies()
  }, 300)
}

const formValid = computed(() => {
  return formData.value.cluster_id && formData.value.name.trim() && formData.value.listen_port && formData.value.listen_port > 0 && formData.value.listen_port <= 65535
})

function resetForm() {
  formData.value = {
    cluster_id: null,
    name: '',
    description: '',
    scheme: 'tcp',
    listen_port: null,
    load_balance: 'roundrobin',
    targets: [],
    timeout: {},
    keepalive_pool: {},
    remote_addr: '',
    sni: '',
  }
  wizardStep.value = 1
}

function addTarget() {
  formData.value.targets.push({ target: '', weight: 1 })
}

function removeTarget(index: number) {
  formData.value.targets.splice(index, 1)
}

// ── Data Loading ──

async function loadProxies() {
  loading.value = true
  try {
    if (clusterFilter.value) {
      const params: Record<string, any> = { page: page.value, page_size: pageSize.value }
      if (searchText.value) params.search = searchText.value
      const res = await api.get(`/clusters/${clusterFilter.value}/stream-proxies`, { params })
      proxies.value = res.data.items || []
      totalCount.value = res.data.total || 0
    } else {
      const results = await Promise.all(
        clusters.value.map(c =>
          api.get(`/clusters/${c.id}/stream-proxies`, { params: { page_size: 999 } }).then(r => r.data.items || [])
        )
      )
      let allItems = results.flat()
      if (searchText.value) {
        const q = searchText.value.toLowerCase()
        allItems = allItems.filter((p: StreamProxy) => p.name.toLowerCase().includes(q))
      }
      proxies.value = allItems
      totalCount.value = allItems.length
    }
  } catch {
    message.error('加载四层代理列表失败')
  } finally {
    loading.value = false
  }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

// ── CRUD Actions ──

function openCreateWizard() {
  editingProxy.value = null
  resetForm()
  if (clusterFilter.value) {
    formData.value.cluster_id = Number(clusterFilter.value)
  }
  wizardVisible.value = true
}

function editProxy(p: StreamProxy) {
  editingProxy.value = p
  formData.value = {
    cluster_id: p.cluster_id,
    name: p.name,
    description: p.description || '',
    scheme: p.scheme || 'tcp',
    listen_port: p.listen_port,
    load_balance: p.load_balance || 'roundrobin',
    targets: (p.targets || []).map(t => ({ target: t.target, weight: t.weight })),
    timeout: { ...(p.timeout || {}) },
    keepalive_pool: { ...(p.keepalive_pool || {}) },
    remote_addr: p.remote_addr || '',
    sni: p.sni || '',
  }
  wizardStep.value = 1
  wizardVisible.value = true
}

async function saveWizard() {
  if (!formValid.value) return
  const cid = formData.value.cluster_id!
  const payload: Record<string, any> = {
    name: formData.value.name.trim(),
    description: formData.value.description.trim(),
    scheme: formData.value.scheme,
    listen_port: formData.value.listen_port,
    load_balance: formData.value.load_balance,
    targets: formData.value.targets.filter(t => t.target.trim()),
  }
  if (Object.keys(formData.value.timeout).length > 0) payload.timeout = formData.value.timeout
  if (Object.keys(formData.value.keepalive_pool).length > 0) payload.keepalive_pool = formData.value.keepalive_pool
  if (formData.value.remote_addr.trim()) payload.remote_addr = formData.value.remote_addr.trim()
  if (formData.value.sni.trim()) payload.sni = formData.value.sni.trim()

  try {
    if (editingProxy.value) {
      await api.put(`/clusters/${cid}/stream-proxies/${editingProxy.value.id}`, payload)
      message.success('更新成功')
    } else {
      await api.post(`/clusters/${cid}/stream-proxies`, payload)
      message.success('创建成功')
    }
    wizardVisible.value = false
    await loadProxies()
  } catch (e: any) {
    message.error(e.response?.data?.detail || '保存失败')
  }
}

function viewProxy(p: StreamProxy) {
  viewingProxy.value = p
  viewDrawerVisible.value = true
}

async function deleteProxy(p: StreamProxy) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${p.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch { /* ignore */ }

  showDeleteConfirm({
    title: `确定要删除四层代理 "${p.name}" 吗？`,
    apiEndpoint: `/clusters/${p.cluster_id}/stream-proxies/${p.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除四层代理: ${p.name}`,
        apiEndpoint: `/clusters/${p.cluster_id}/stream-proxies/${p.id}`,
        cluster: { id: p.cluster_id, nodes } as any,
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadProxies,
        clearSelectedFn: () => {},
      })
    },
  })
}

function publishProxyAction(p: StreamProxy) {
  publishingProxy.value = p
  publishClusterId.value = p.cluster_id
  publishVisible.value = true
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const p = publishingProxy.value
  if (!p) return
  await executePublish({
    title: `发布四层代理: ${p.name}`,
    apiEndpoint: `/clusters/${p.cluster_id}/stream-proxies/${p.id}/publish`,
    nodeIds,
    refreshFn: loadProxies,
  })
}

function openVersionManagement(p: StreamProxy) {
  vmId.value = p.id
  vmClusterId.value = p.cluster_id
  vmName.value = p.name
  vmVisible.value = true
}

// ── Lifecycle ──

onMounted(() => {
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  loadClusters()
  loadProxies()
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<style scoped>
.sp-page { padding: 20px 24px; }
.sp-header-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: nowrap; }
.loading-state { text-align: center; padding: 60px 0; color: var(--muted); font-size: 14px; }
.sp-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; }
.sp-empty-icon { font-size: 40px; color: var(--muted); margin-bottom: 12px; opacity: 0.4; }
.sp-empty-text { font-size: 14px; color: var(--muted); }
.sp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.sp-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: box-shadow 0.2s; display: flex; flex-direction: column; overflow: hidden; }
.sp-card:hover { box-shadow: var(--shadow-md); }
.sp-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding: 12px 20px 0; }
.sp-card-topbar { padding: 4px 16px; font-size: 11px; font-weight: 500; color: var(--accent); background: oklch(56% 0.16 210 / 8%); border-bottom: 1px solid oklch(56% 0.16 210 / 12%); }
.sp-card-info { flex: 1; }
.sp-card-name { font-size: 15px; font-weight: 600; }
.sp-card-desc { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.5; }
.sp-card-meta { text-align: right; flex-shrink: 0; margin-left: 12px; }
.sp-version-text { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: var(--font-mono); }
.sp-card-details { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-bottom: 10px; padding: 0 20px; }
.sp-detail-row { display: inline-flex; align-items: center; gap: 4px; }
.sp-detail-label { font-size: 11px; color: var(--muted); }
.sp-detail-value { font-size: 12px; font-weight: 500; color: var(--fg); }
.sp-detail-value.sp-port { font-family: var(--font-mono); font-weight: 600; color: var(--accent); }
.sp-card-targets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; padding: 0 20px; }
.sp-target-tag { display: inline-flex; align-items: center; gap: 2px; padding: 2px 10px; border-radius: 10px; font-size: 11px; background: oklch(56% 0.16 210 / 10%); color: var(--accent); border: 1px solid oklch(56% 0.16 210 / 20%); font-family: var(--font-mono); }
.sp-target-wt { color: var(--muted); font-size: 10px; }
.sp-no-targets { font-size: 11px; color: var(--muted); font-style: italic; }
.sp-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: auto; padding: 10px 20px 16px; border-top: 1px solid var(--border); }
.sp-action-btn { background: none !important; background-color: transparent !important; }
.sp-action-btn:hover { background: var(--bg) !important; }

/* ── Wizard ── */
.wizard-steps { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.wizard-step { font-size: 13px; font-weight: 500; color: var(--muted); padding: 4px 12px; border-radius: var(--radius-sm); transition: all 0.15s; }
.wizard-step.active { color: var(--accent); background: oklch(56% 0.16 210 / 10%); }
.wizard-arrow { color: var(--border); font-size: 14px; }
.wizard-panel { min-height: 200px; }

.form-group { margin-bottom: 12px; }
.form-label { display: block; font-size: 12px; font-weight: 500; color: var(--fg); margin-bottom: 4px; }
.form-label .required { color: var(--danger); }
.form-row { display: flex; gap: 12px; }
.form-row .form-group { flex: 1; }

.targets-editor { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px; background: var(--bg); }
.target-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.target-row:last-child { margin-bottom: 0; }

/* ── Buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  font-family: var(--font-body);
  line-height: 1.5;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-secondary { background: var(--surface); color: var(--fg); border-color: var(--border); }
.btn-secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.btn-ghost { background: transparent; color: var(--muted); border-color: transparent; }
.btn-ghost:hover { background: var(--bg); color: var(--fg); }
.btn-sm { padding: 3px 10px; font-size: 11px; }

.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }

@media (max-width: 768px) {
  .sp-grid { grid-template-columns: 1fr; }
}
</style>
