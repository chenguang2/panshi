<template>
  <div class="dq-page">
    <PageHeader title="DNS 查询" description="管理 DNS 查询路由规则，基于 dns_upstream 插件实现域名解析转发">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateForm">+ 新建 DNS 查询</button>
      </template>
    </PageHeader>

    <div class="dq-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索路由名称..." class="form-input" @input="onSearch">
        <span class="search-icon">&#128269;</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width:140px;flex-shrink:0;" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width:160px;flex-shrink:0;" @change="loadRoutes">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ totalCount }} 条 DNS 查询</span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="routes.length === 0" class="dq-empty">
      <div class="dq-empty-icon">&#9635;</div>
      <div class="dq-empty-text">暂无 DNS 查询路由</div>
    </div>
    <div v-else class="dq-grid">
      <div v-for="r in sortedRoutes" :key="r.id" class="dq-card" :style="getCardBorderStyle(r.cluster_group_name)">
        <div class="dq-card-topbar" :style="getGroupColorStyle(r.cluster_group_name)">
          <span class="dq-topbar-uri">{{ r.uri }}</span>
          <span class="dns-badge">DNS</span>
          <span v-if="r.cluster_group_name" class="group-badge">{{ r.cluster_group_name }}</span>
        </div>
        <div class="dq-card-header">
          <div class="dq-card-info">
            <div class="dq-card-name">{{ r.name }}</div>
            <div v-if="r.description" class="dq-card-desc">{{ r.description }}</div>
          </div>
          <div class="dq-card-meta">
            <span v-if="r.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
            <span v-else class="badge badge-neutral"><span class="status-dot"></span>未发布</span>
            <div class="dq-version-text">
              <template v-if="r.current_version && r.published_at">v{{ r.current_version }} &middot; {{ formatDate(r.published_at) }}</template>
              <template v-else-if="r.current_version">v{{ r.current_version }} &middot; 未同步</template>
            </div>
          </div>
        </div>

        <div class="dq-card-details">
          <div class="dq-detail-row">
            <span class="dq-detail-label">集群</span>
            <span class="dq-detail-value">{{ r.cluster_name || '-' }}</span>
          </div>
        </div>

        <div class="dq-card-hosts" v-if="dnsHosts(r)">
          <div v-for="(host, domain) in dnsHosts(r)" :key="domain" class="dq-host-domain">
            <div class="dq-host-domain-name">{{ domain }}</div>
            <div class="dq-host-domain-lb">
              <span class="dq-algo-tag">{{ dnsLbLabel(host.type) }}</span>
              <span v-if="host.ttl_valid != null" class="dq-ttl-tag">TTL: {{ host.ttl_valid }}s</span>
              <span v-if="host.checks" class="dq-check-tag">{{ host.checks.type || 'http' }}</span>
            </div>
            <div class="dq-host-nodes">
              <span v-for="(cidrs, nodeIp) in host.nodes" :key="nodeIp" class="dq-node-tag">{{ nodeIp }}</span>
            </div>
          </div>
        </div>
        <div v-else class="dq-card-hosts dq-hosts-empty">
          <span class="dq-no-hosts">无 DNS 配置</span>
        </div>

        <div class="dq-card-actions">
          <button class="btn btn-ghost btn-sm dq-action-btn" @click="viewRoute(r)">查看</button>
          <button class="btn btn-ghost btn-sm dq-action-btn" @click="editRoute(r)">编辑</button>
          <button class="btn btn-ghost btn-sm dq-action-btn" style="color:var(--danger);" @click="deleteRoute(r)">删除</button>
          <span style="flex:1"></span>
          <button class="btn btn-secondary btn-sm" @click="publishRouteAction(r)">发布</button>
          <button class="btn btn-secondary btn-sm" @click="openVersionManagement(r)">版本管理</button>
        </div>
      </div>
    </div>

    <DnsQueryFormModal
      :visible="formVisible"
      :clusters="clusters"
      :editing-route="editingRoute"
      @close="formVisible = false; editingRoute = null"
      @saved="onFormSaved"
    />

    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="route"
      :resource-id="vmId"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      @version-change="loadRoutes"
      @published="loadRoutes"
    />

    <PublishConfirmModal
      v-model:visible="publishVisible"
      title="发布 DNS 查询路由"
      :cluster-id="publishClusterId"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />

    <!-- View Drawer -->
    <Teleport to="body">
    <div class="modal-overlay" :style="{ display: viewVisible ? 'flex' : 'none' }">
      <div class="modal" style="max-width:640px;">
        <div class="modal-header">
          <h2>查看 DNS 查询路由 - {{ viewingRoute?.name }}</h2>
          <button class="modal-close" @click="viewVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="viewingRoute" class="view-body">
            <div class="view-field">
              <span class="view-label">名称</span>
              <span class="view-value">{{ viewingRoute.name }}</span>
            </div>
            <div class="view-field">
              <span class="view-label">URI</span>
              <span class="view-value view-mono">{{ viewingRoute.uri }}</span>
            </div>
            <div class="view-field">
              <span class="view-label">集群</span>
              <span class="view-value">{{ viewingRoute.cluster_name || '-' }}</span>
            </div>
            <div class="view-field" v-if="viewingRoute.description">
              <span class="view-label">描述</span>
              <span class="view-value">{{ viewingRoute.description }}</span>
            </div>
            <div class="view-field">
              <span class="view-label">状态</span>
              <span>
                <span v-if="viewingRoute.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
                <span v-else class="badge badge-neutral"><span class="status-dot"></span>未发布</span>
              </span>
            </div>
            <div class="view-field" v-if="viewingRoute.current_version">
              <span class="view-label">版本</span>
              <span class="view-value">v{{ viewingRoute.current_version }}</span>
            </div>
            <div class="view-field" v-if="viewingRoute.published_at">
              <span class="view-label">发布时间</span>
              <span class="view-value">{{ formatDate(viewingRoute.published_at) }}</span>
            </div>

            <div class="view-section">DNS 解析配置</div>
            <div v-if="viewDnsHosts" class="view-hosts">
              <div v-for="(host, domain) in viewDnsHosts" :key="domain" class="view-host-card">
                <div class="view-host-name">{{ domain }}</div>
                <div class="view-host-meta">
                  <span class="view-host-meta-item">算法: {{ dnsLbLabel(host.type) }}</span>
                  <span v-if="host.ttl_valid != null" class="view-host-meta-item">TTL: {{ host.ttl_valid }}s</span>
                  <span v-if="host.checks" class="view-host-meta-item">检查: {{ host.checks.type || 'http' }}</span>
                </div>
                <div class="view-host-nodes">
                  <div v-for="(cidrs, nodeIp) in host.nodes" :key="nodeIp" class="view-node-item">
                    <span class="view-node-ip">{{ nodeIp }}</span>
                    <span v-if="cidrs && cidrs.length > 0" class="view-node-cidrs">CIDR: {{ (Array.isArray(cidrs) ? cidrs : []).join(', ') }}</span>
                    <span v-else class="view-node-cidrs view-cidr-any">无 CIDR 限制</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="view-muted">无 DNS 配置</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="viewVisible = false">关闭</button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import api from '@/api'
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import PageHeader from '@/components/PageHeader.vue'
import DnsQueryFormModal from '@/components/DnsQueryFormModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress, formatDate } from '@/composables/useClusterUtils'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'

const route = useRoute()

const routes = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const searchText = ref('')
const clusterFilter = ref<string | number>('')
const groupFilter = ref('__all__')

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map((c: any) => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter((c: any) => !c.group_name)
  return clusters.value.filter((c: any) => c.group_name === groupFilter.value)
})

const sortedRoutes = computed(() => {
  return [...routes.value].sort((a: any, b: any) => {
    const ga = a.cluster_group_name || ''
    const gb = b.cluster_group_name || ''
    if (ga && !gb) return 1
    if (!ga && gb) return -1
    return ga.localeCompare(gb)
  })
})

// ── DNS helpers ──

function dnsLbLabel(algo: string | undefined): string {
  const map: Record<string, string> = {
    roundrobin: '轮询',
    chash: '一致性哈希',
    least_conn: '最少连接',
  }
  return map[algo || ''] || algo || '轮询'
}

interface DnsHostEntry {
  nodes: Record<string, string[]>
  type: string
  ttl_valid?: number
  checks?: { type?: string; active?: unknown; passive?: unknown }
}

function dnsHosts(r: any): Record<string, DnsHostEntry> | null {
  try {
    const plugins: any[] = r.plugins || []
    const plugin = plugins.find((p: any) => p.plugin_name === 'dns_upstream')
    if (!plugin) return null
    const cfg = typeof plugin.config === 'string'
      ? JSON.parse(plugin.config)
      : (plugin.config || {})
    return cfg?.hosts || null
  } catch {
    return null
  }
}

// ── Data loading ──

async function loadRoutes() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page_size: PAGE_SIZE_CARD_GRID,
      plugin: 'dns_upstream',
      group_name: groupFilter.value,
    }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/routes', { params })
    routes.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch (e: any) {
    const detail = e?.response?.data?.detail
    const msg = typeof detail === 'string' ? detail : (e?.message || '加载 DNS 查询路由失败')
    message.error(msg)
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

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadRoutes()
  }, 300)
}

function onGroupChange() {
  clusterFilter.value = ''
  loadRoutes()
}

// ── View ──

const viewVisible = ref(false)
const viewingRoute = ref<any | null>(null)

const viewDnsHosts = computed(() => {
  return viewingRoute.value ? dnsHosts(viewingRoute.value) : null
})

function viewRoute(r: any) {
  viewingRoute.value = r
  viewVisible.value = true
}

// ── Form ──

const formVisible = ref(false)
const editingRoute = ref<any | null>(null)

function openCreateForm() {
  editingRoute.value = null
  formVisible.value = true
}

function editRoute(r: any) {
  editingRoute.value = r
  formVisible.value = true
}

function onFormSaved() {
  formVisible.value = false
  editingRoute.value = null
  loadRoutes()
}

// ── Version management ──

const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')

function openVersionManagement(r: any) {
  vmId.value = r.id
  vmClusterId.value = r.cluster_id
  vmName.value = r.name
  vmVisible.value = true
}

// ── Publish ──

const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingRoute = ref<any | null>(null)

function publishRouteAction(r: any) {
  publishingRoute.value = r
  publishClusterId.value = r.cluster_id
  publishVisible.value = true
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const r = publishingRoute.value
  if (!r) return
  await executePublish({
    title: `发布 DNS 查询路由: ${r.name}`,
    apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}/publish`,
    nodeIds,
    refreshFn: loadRoutes,
  })
}

// ── Delete ──

async function deleteRoute(r: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${r.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch { /* ignore */ }

  showDeleteConfirm({
    title: `确定要删除 DNS 查询路由 "${r.name}" 吗？`,
    apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除 DNS 查询路由: ${r.name}`,
        apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}`,
        cluster: { id: r.cluster_id, nodes } as any,
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadRoutes,
        clearSelectedFn: () => {},
      })
    },
  })
}

// ── Lifecycle ──

onMounted(async () => {
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  await loadClusters()
  loadRoutes()
})
</script>

<style scoped>
.dq-page { padding: 20px 24px; }
.dq-header-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: nowrap; }
.loading-state { text-align: center; padding: 60px 0; color: var(--muted); font-size: 14px; }
.dq-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; }
.dq-empty-icon { font-size: 40px; color: var(--muted); margin-bottom: 12px; opacity: 0.4; }
.dq-empty-text { font-size: 14px; color: var(--muted); }

/* ── Card Grid ── */
.dq-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.dq-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: box-shadow 0.2s; display: flex; flex-direction: column; overflow: hidden; }
.dq-card:hover { box-shadow: var(--shadow-md); }
.dq-card-topbar { padding: 4px 16px; font-size: 11px; font-weight: 500; color: var(--accent); background: oklch(56% 0.16 210 / 8%); border-bottom: 1px solid oklch(56% 0.16 210 / 12%); display: flex; align-items: center; gap: 6px; }
.dq-topbar-uri { font-family: var(--font-mono); font-weight: 600; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-badge { display: inline-block; font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 8px; background: var(--badge-bg, oklch(50% 0.12 170 / 15%)); color: var(--badge-fg, oklch(45% 0.12 170)); border: 1px solid var(--badge-border, oklch(50% 0.12 170 / 25%)); line-height: 1.4; flex-shrink: 0; }
.dns-badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: oklch(55% 0.18 280 / 18%); color: oklch(40% 0.18 280); border: 1px solid oklch(55% 0.18 280 / 30%); line-height: 1.4; flex-shrink: 0; }
.dq-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding: 12px 20px 0; }
.dq-card-info { flex: 1; }
.dq-card-name { font-size: 15px; font-weight: 600; }
.dq-card-desc { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.5; }
.dq-card-meta { text-align: right; flex-shrink: 0; margin-left: 12px; }
.dq-version-text { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: var(--font-mono); }
.dq-card-details { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-bottom: 8px; padding: 0 20px; }
.dq-detail-row { display: inline-flex; align-items: center; gap: 4px; }
.dq-detail-label { font-size: 11px; color: var(--muted); }
.dq-detail-value { font-size: 12px; font-weight: 500; color: var(--fg); }
.dq-uri { font-family: var(--font-mono); font-weight: 600; color: var(--accent); }

/* ── DNS Hosts ── */
.dq-card-hosts { padding: 0 20px 8px; }
.dq-hosts-empty { padding-bottom: 12px; }
.dq-host-domain { margin-bottom: 8px; padding: 8px; background: var(--bg); border-radius: var(--radius-md); border: 1px solid var(--border); }
.dq-host-domain-name { font-size: 12px; font-weight: 600; color: var(--accent); font-family: var(--font-mono); margin-bottom: 4px; word-break: break-all; }
.dq-host-domain-lb { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
.dq-algo-tag { display: inline-block; padding: 1px 6px; border-radius: 6px; font-size: 10px; font-weight: 500; background: oklch(55% 0.14 160 / 16%); color: oklch(40% 0.14 160); border: 1px solid oklch(55% 0.14 160 / 28%); line-height: 1.5; }
.dq-ttl-tag { display: inline-block; padding: 1px 6px; border-radius: 6px; font-size: 10px; font-weight: 500; background: oklch(50% 0.10 260 / 14%); color: oklch(38% 0.10 260); border: 1px solid oklch(50% 0.10 260 / 24%); line-height: 1.5; }
.dq-check-tag { display: inline-block; padding: 1px 6px; border-radius: 6px; font-size: 10px; font-weight: 500; background: oklch(55% 0.14 30 / 16%); color: oklch(40% 0.14 30); border: 1px solid oklch(55% 0.14 30 / 28%); line-height: 1.5; }
.dq-host-nodes { display: flex; flex-wrap: wrap; gap: 4px; }
.dq-node-tag { display: inline-flex; align-items: center; gap: 2px; padding: 2px 10px; border-radius: 10px; font-size: 11px; background: oklch(56% 0.16 210 / 10%); color: var(--accent); border: 1px solid oklch(56% 0.16 210 / 20%); font-family: var(--font-mono); }
.dq-no-hosts { font-size: 11px; color: var(--muted); font-style: italic; }

/* ── Actions ── */
.dq-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: auto; padding: 10px 20px 16px; border-top: 1px solid var(--border); }
.dq-action-btn { background: none !important; background-color: transparent !important; }
.dq-action-btn:hover { background: var(--bg) !important; }

/* ── View Drawer ── */
.view-body { padding: 0 4px; }
.view-field { display: flex; padding: 10px 0; border-bottom: 1px solid var(--border); }
.view-label { width: 100px; flex-shrink: 0; font-size: 12px; color: var(--muted); font-weight: 500; }
.view-value { font-size: 13px; color: var(--fg); }
.view-mono { font-family: var(--font-mono); font-weight: 600; color: var(--accent); }
.view-section { font-size: 14px; font-weight: 600; color: var(--fg); padding: 16px 0 8px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.view-hosts { display: flex; flex-direction: column; gap: 10px; }
.view-host-card { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px; background: var(--bg); }
.view-host-name { font-size: 13px; font-weight: 600; color: var(--accent); font-family: var(--font-mono); margin-bottom: 4px; }
.view-host-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.view-host-meta-item { font-size: 11px; color: var(--muted); background: var(--surface); padding: 2px 8px; border-radius: 6px; border: 1px solid var(--border); }
.view-host-nodes { display: flex; flex-direction: column; gap: 4px; }
.view-node-item { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: var(--surface); border-radius: var(--radius-sm); border: 1px solid var(--border); }
.view-node-ip { font-family: var(--font-mono); font-size: 12px; font-weight: 500; }
.view-node-cidrs { font-size: 11px; color: var(--muted); }
.view-cidr-any { font-style: italic; opacity: 0.6; }
.view-muted { font-size: 12px; color: var(--muted); font-style: italic; padding: 8px 0; }

.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }

@media (max-width: 768px) {
  .dq-grid { grid-template-columns: 1fr; }
}
</style>
