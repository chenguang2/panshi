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
        <span class="search-icon">&#128269;</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width:140px;flex-shrink:0;" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width:160px;flex-shrink:0;" @change="loadProxies">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ totalCount }} 个四层代理</span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="displayedProxies.length === 0" class="sp-empty">
      <div class="sp-empty-icon">&#9635;</div>
      <div class="sp-empty-text">暂无四层代理</div>
    </div>
    <div v-else class="sp-grid">
      <div v-for="p in displayedProxies" :key="p.id" class="sp-card" :style="getCardBorderStyle(p.cluster_group_name)">
        <div class="sp-card-topbar" :style="getGroupColorStyle(p.cluster_group_name)">
          <span>{{ p.cluster_name || '-' }}</span>
          <span v-if="p.proxy_type === 'dns'" class="dns-badge">DNS</span>
          <span v-if="p.cluster_group_name" class="group-badge">{{ p.cluster_group_name }}</span>
        </div>
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
            <span class="sp-detail-value">UDP</span>
          </div>
          <span class="sp-detail-sep">&middot;</span>
          <div class="sp-detail-row">
            <span class="sp-detail-label">端口</span>
            <span class="sp-detail-value sp-port">{{ p.listen_port }}</span>
          </div>
        </div>

        <!-- Normal mode: load balance + targets -->
        <template v-if="p.proxy_type !== 'dns'">
          <div class="sp-card-details" style="margin-top:-4px;">
            <div class="sp-detail-row">
              <span class="sp-detail-label">负载均衡</span>
              <span class="sp-detail-value">{{ lbLabel(p.load_balance) }}</span>
            </div>
          </div>
          <div class="sp-card-targets">
            <span v-for="(t, i) in p.targets" :key="i" class="sp-target-tag">{{ t.target }}<span class="sp-target-wt">:{{ t.weight }}</span></span>
            <span v-if="!p.targets || p.targets.length === 0" class="sp-no-targets">无目标</span>
          </div>
        </template>

        <!-- DNS mode: show dns_upstream hosts info -->
        <template v-if="p.proxy_type === 'dns'">
          <div class="sp-card-dns" v-if="dnsHosts(p)">
            <div v-for="(host, domain) in dnsHosts(p)" :key="domain" class="sp-dns-domain">
              <div class="sp-dns-domain-name">{{ domain }}</div>
              <div class="sp-dns-domain-lb" style="display:flex;gap:12px;">
                <span>类型: {{ dnsLbLabel(host.type) }}</span>
                <span v-if="host.ttl_valid != null">TTL: {{ host.ttl_valid }}s</span>
              </div>
              <div class="sp-dns-nodes">
                <span v-for="(cidrs, nodeIp) in host.nodes" :key="nodeIp" class="sp-target-tag">{{ nodeIp }}</span>
              </div>
            </div>
          </div>
          <div v-else class="sp-card-targets">
            <span class="sp-no-targets">无 DNS 配置</span>
          </div>
        </template>
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

    <!-- Create/Edit Form Wizard (component) -->
    <StreamProxyFormWizard
      :visible="wizardVisible"
      :clusters="clusters"
      :editing-proxy="editingProxy"
      @close="wizardVisible = false; editingProxy = null"
      @saved="onWizardSaved"
    />

    <!-- View Modal (component) -->
    <StreamProxyViewDrawer v-model:visible="viewDrawerVisible" :proxy="viewingProxy" />

    <!-- Version Management -->
    <VersionManagementModal v-model:open="vmVisible" resource-type="stream_proxy" :resource-id="vmId" :cluster-id="vmClusterId" :resource-name="vmName" @version-change="loadProxies" @published="loadProxies" />

    <!-- Publish -->
    <PublishConfirmModal v-model:visible="publishVisible" title="发布四层代理" :cluster-id="publishClusterId" @confirm="onPublishConfirm" @cancel="publishVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message } from 'ant-design-vue'
import type { StreamProxy } from '@/types'
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import StreamProxyFormWizard from '@/components/StreamProxyFormWizard.vue'
import StreamProxyViewDrawer from '@/components/StreamProxyViewDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'


// ── State ──

const proxies = ref<StreamProxy[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const searchText = ref('')
const clusterFilter = ref<string | number>('')
const groupFilter = ref('__all__')

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map(c => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter(c => !c.group_name)
  return clusters.value.filter(c => c.group_name === groupFilter.value)
})

function onGroupChange() {
  clusterFilter.value = ''
  loadProxies()
}

const displayedProxies = computed(() => {
  return [...proxies.value].sort((a, b) => {
    const ga = a.cluster_group_name || ''
    const gb = b.cluster_group_name || ''
    if (ga && !gb) return 1
    if (!ga && gb) return -1
    return ga.localeCompare(gb)
  })
})

// Wizard
const wizardVisible = ref(false)
const editingProxy = ref<StreamProxy | null>(null)

// View
const viewDrawerVisible = ref(false)
const viewingProxy = ref<StreamProxy | null>(null)

// Version management
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')

// Publish
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
    weighted_roundrobin: '加权轮询',
    roundrobin: '轮询',
    chash: '一致性哈希',
    ewma: 'EWMA',
    least_conn: '最少连接',
  }
  return map[algo || ''] || algo || '-'
}

function dnsLbLabel(algo: string | undefined): string {
  const map: Record<string, string> = { roundrobin: '轮询', chash: '一致性哈希', least_conn: '最少连接' }
  return map[algo || ''] || algo || '轮询'
}

function dnsHosts(p: any): Record<string, { nodes: Record<string, string[]>; type: string; ttl_valid?: number }> | null {
  try {
    const cfg = typeof p.dns_config === 'string' ? JSON.parse(p.dns_config) : p.dns_config
    return cfg?.hosts || null
  } catch { return null }
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return d }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadProxies()
  }, 300)
}

// ── Data Loading ──

async function loadProxies() {
  loading.value = true
  try {
    const params: Record<string, any> = { page_size: PAGE_SIZE_CARD_GRID, group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/stream-proxies', { params })
    proxies.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch (e: any) {
    const detail = e?.response?.data?.detail
    const msg = typeof detail === 'string' ? detail : (e?.message || '加载四层代理列表失败')
    message.error('加载失败: ' + msg)
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
  wizardVisible.value = true
}

function editProxy(p: StreamProxy) {
  editingProxy.value = p
  wizardVisible.value = true
}

function onWizardSaved() {
  wizardVisible.value = false
  editingProxy.value = null
  loadProxies()
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
    handleResult: (data, addLog, progress) => {
      addLog(`状态: ${data.status || '-'}`)
      addLog(`消息: ${data.message || '-'}`)
      if (data.version !== undefined) addLog(`版本: v${data.version}`)

      if (data.results && data.results.length > 0) {
        addLog('')
        addLog('══════ 节点同步结果 ══════')
        for (const r of data.results) {
          const icon = r.status === 'success' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌'
          addLog(`${icon} 节点: ${r.node || r.scope || '-'}`)
          addLog(`   状态: ${r.status}`)
          if (r.message) addLog(`   消息: ${r.message}`)
          if (r.error) addLog(`   错误: ${r.error}`)
          if (r.stdout) {
            for (const line of r.stdout.split('\n')) {
              if (line.trim()) addLog(`   ${line}`)
            }
          }
          addLog('')
        }
      } else {
        addLog('⚠️ 无节点同步结果')
      }

      progress.percent = 100
      if (data.status === 'ok') {
        progress.status = 'success'
        addLog('✅ 发布成功')
      } else if (data.status === 'partial') {
        progress.status = 'exception'
        addLog('⚠️ 部分节点发布失败')
      } else {
        progress.status = 'exception'
        addLog('❌ 发布失败')
      }
    },
  })
}

function openVersionManagement(p: StreamProxy) {
  vmId.value = p.id
  vmClusterId.value = p.cluster_id
  vmName.value = p.name
  vmVisible.value = true
}

// ── Lifecycle ──

onMounted(async () => {
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  await loadClusters()
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

/* ── Card Grid (aligns with PluginConfigList .pc-grid) ── */
.sp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.sp-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: box-shadow 0.2s; display: flex; flex-direction: column; overflow: hidden; }
.sp-card:hover { box-shadow: var(--shadow-md); }
.sp-card-topbar { padding: 4px 16px; font-size: 11px; font-weight: 500; color: var(--accent); background: oklch(56% 0.16 210 / 8%); border-bottom: 1px solid oklch(56% 0.16 210 / 12%); display: flex; align-items: center; gap: 6px; }
.group-badge { display: inline-block; font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 8px; background: var(--badge-bg, oklch(50% 0.12 170 / 15%)); color: var(--badge-fg, oklch(45% 0.12 170)); border: 1px solid var(--badge-border, oklch(50% 0.12 170 / 25%)); line-height: 1.4; flex-shrink: 0; }
.dns-badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: oklch(55% 0.18 280 / 18%); color: oklch(40% 0.18 280); border: 1px solid oklch(55% 0.18 280 / 30%); line-height: 1.4; flex-shrink: 0; }
.sp-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding: 12px 20px 0; }
.sp-card-info { flex: 1; }
.sp-card-name { font-size: 15px; font-weight: 600; }
.sp-card-desc { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.5; }
.sp-card-meta { text-align: right; flex-shrink: 0; margin-left: 12px; }
.sp-version-text { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: var(--font-mono); }
.sp-card-details { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-bottom: 8px; padding: 0 20px; }
.sp-detail-row { display: inline-flex; align-items: center; gap: 4px; }
.sp-detail-sep { color: var(--border); font-size: 12px; }
.sp-detail-label { font-size: 11px; color: var(--muted); }
.sp-detail-value { font-size: 12px; font-weight: 500; color: var(--fg); }
.sp-detail-value.sp-port { font-family: var(--font-mono); font-weight: 600; color: var(--accent); }
.sp-card-targets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; padding: 0 20px; }
.sp-target-tag { display: inline-flex; align-items: center; gap: 2px; padding: 2px 10px; border-radius: 10px; font-size: 11px; background: oklch(56% 0.16 210 / 10%); color: var(--accent); border: 1px solid oklch(56% 0.16 210 / 20%); font-family: var(--font-mono); }
.sp-target-wt { color: var(--muted); font-size: 10px; }
.sp-no-targets { font-size: 11px; color: var(--muted); font-style: italic; }
.sp-card-dns { padding: 0 20px 8px; }
.sp-dns-domain { margin-bottom: 8px; padding: 8px; background: var(--bg); border-radius: var(--radius-md); border: 1px solid var(--border); }
.sp-dns-domain-name { font-size: 12px; font-weight: 600; color: var(--accent); font-family: var(--font-mono); margin-bottom: 2px; }
.sp-dns-domain-lb { font-size: 10px; color: var(--muted); margin-bottom: 4px; }
.sp-dns-nodes { display: flex; flex-wrap: wrap; gap: 4px; }
.sp-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: auto; padding: 10px 20px 16px; border-top: 1px solid var(--border); }
.sp-action-btn { background: none !important; background-color: transparent !important; }
.sp-action-btn:hover { background: var(--bg) !important; }

.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }

@media (max-width: 768px) {
  .sp-grid { grid-template-columns: 1fr; }
}
</style>
