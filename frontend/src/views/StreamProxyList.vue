<template>
  <div class="sp-page">
    <PageHeader title="四层代理" description="管理 TCP/UDP/TLS 四层转发规则">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateWizard">+ 新建四层代理</button>
        <button class="btn btn-secondary" @click="toggleBatchMode">
          {{ batchMode ? '退出批量管理' : '批量管理' }}
        </button>
      </template>
    </PageHeader>

    <div class="sp-header-actions">
      <div class="sp-status-tabs" role="group" aria-label="按发布状态筛选">
        <button
          v-for="t in statusTabs"
          :key="t.key"
          class="sp-status-tab"
          :class="{ active: statusFilter === t.key, empty: t.count === 0 }"
          :aria-pressed="statusFilter === t.key ? 'true' : 'false'"
          @click="goStatus(t.key)"
        >
          {{ t.label }}
          <span class="sp-status-count">{{ t.count }}</span>
        </button>
      </div>
      <div class="search-input-wrap">
        <input
          v-model="searchText"
          type="text"
          placeholder="搜索四层代理名称..."
          class="form-input"
          @input="onSearch"
        />
        <span class="search-icon">&#128269;</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width: 140px; flex-shrink: 0" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width: 160px; flex-shrink: 0" @change="loadProxies">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ totalCount }} 个四层代理</span>
      <template v-if="batchMode">
        <button v-if="showGroupSelectAll" class="link-btn" @click="toggleSelectAllGroup">
          {{ allGroupSelected ? '取消全选分组' : '全选当前分组' }}
        </button>
        <button class="link-btn" @click="toggleSelectAllFiltered">
          {{ allFilteredSelected ? '取消全选结果' : '全选当前筛选结果' }}
        </button>
      </template>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="displayedProxies.length === 0" class="sp-empty">
      <svg
        class="sp-empty-icon"
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="width: 48px; height: 48px; color: var(--muted)"
      >
        <rect x="8" y="14" width="32" height="24" rx="2" />
        <path d="M8 22h32M16 10v8M32 10v8" />
      </svg>
      <div v-if="searchText" class="sp-empty-text">
        没有匹配「{{ searchText }}」的四层代理
        <a class="link-btn" style="margin-left: 8px" @click="onClearSearch">清除筛选</a>
      </div>
      <div v-else class="sp-empty-text">暂无四层代理</div>
    </div>
    <div v-else class="sp-grid" :class="{ 'batch-mode': batchMode }">
      <div
        v-for="p in displayedProxies"
        :key="p.id"
        class="sp-card"
        :class="{ selected: selectedProxyIds.includes(p.id) }"
        :style="getCardBorderStyle(p.cluster_group_name)"
        @click="batchMode && toggleProxy(p.id)"
      >
        <div class="sp-card-topbar" :style="getGroupColorStyle(p.cluster_group_name)">
          <span>{{ p.cluster_name || '-' }}</span>
          <span v-if="p.proxy_type === 'dns'" class="dns-badge">DNS</span>
          <span v-if="p.proxy_type === 'dns' && isWanEnabled(p)" class="wan-badge">内外网分离</span>
          <span v-if="p.cluster_group_name" class="group-badge">{{ p.cluster_group_name }}</span>
          <span v-if="batchMode" class="sp-checkbox" @click.stop="toggleProxy(p.id)"></span>
        </div>
        <div class="sp-card-header">
          <div class="sp-card-info">
            <div class="sp-card-name">{{ p.name }}</div>
            <div v-if="p.description" class="sp-card-desc">{{ p.description }}</div>
          </div>
          <div class="sp-card-meta">
            <PublishStatusTag
              :version="p.current_version"
              :published-at="p.published_at"
              :pending="p.pending_publish === true"
              :last-publish-status="p.last_publish_status"
            />
          </div>
        </div>
        <div class="sp-card-details">
          <div class="sp-detail-row">
            <span class="sp-detail-label">协议</span>
            <span class="sp-detail-value">{{ schemeLabel(p.scheme) }}</span>
          </div>
          <span class="sp-detail-sep">&middot;</span>
          <div class="sp-detail-row">
            <span class="sp-detail-label">端口</span>
            <span class="sp-detail-value sp-port">{{ p.listen_port }}</span>
          </div>
        </div>

        <!-- Normal mode: load balance + targets -->
        <template v-if="p.proxy_type !== 'dns'">
          <div class="sp-card-details" style="margin-top: -4px">
            <div class="sp-detail-row">
              <span class="sp-detail-label">负载均衡</span>
              <span class="sp-detail-value">{{ lbLabel(p.load_balance) }}</span>
            </div>
          </div>
          <div class="sp-card-targets">
            <span v-for="(t, i) in p.targets" :key="i" class="sp-target-tag"
              >{{ t.target }}<span class="sp-target-wt">:{{ t.weight }}</span></span
            >
            <span v-if="!p.targets || p.targets.length === 0" class="sp-no-targets">无目标</span>
          </div>
        </template>

        <!-- DNS mode: show dns_upstream hosts info -->
        <template v-if="p.proxy_type === 'dns'">
          <div class="sp-card-dns" v-if="dnsHosts(p)">
            <div v-for="(host, domain) in dnsHosts(p)" :key="domain" class="sp-dns-domain">
              <div class="sp-dns-domain-name">{{ domain }}</div>
              <div class="sp-dns-domain-lb" style="display: flex; gap: 12px">
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
        <div class="sp-card-actions" @click.stop>
          <button class="btn btn-ghost btn-sm sp-action-btn" @click="viewProxy(p)">查看</button>
          <button class="btn btn-ghost btn-sm sp-action-btn" @click="editProxy(p)">编辑</button>
          <button class="btn btn-ghost btn-sm sp-action-btn" style="color: var(--danger)" @click="deleteProxy(p)">
            删除
          </button>
          <span style="flex: 1"></span>
          <button class="btn btn-secondary btn-sm" @click="publishProxyAction(p)">发布</button>
          <button class="btn btn-secondary btn-sm" @click="openVersionManagement(p)">版本管理</button>
        </div>
      </div>
    </div>

    <!-- Bottom batch action bar -->
    <div v-show="batchMode" class="sp-batch-bar">
      <span class="bb-selected"
        >已选择 <b>{{ selectedProxies.length }}</b> 个四层代理</span
      >
      <button class="btn btn-ghost btn-sm link-btn" @click="clearSelection">取消选择</button>
      <span class="bb-spacer"></span>
      <button class="btn btn-danger btn-sm" :disabled="selectedProxies.length === 0" @click="batchDelete">
        批量删除
      </button>
      <button class="btn btn-secondary btn-sm" @click="toggleBatchMode">退出批量管理</button>
    </div>

    <!-- Create/Edit Form Wizard (component) -->
    <StreamProxyFormWizard
      :visible="wizardVisible"
      :clusters="clusters"
      :editing-proxy="editingProxy"
      :default-proxy-type="proxyType"
      @close="closeWizard"
      @saved="onWizardSaved"
    />

    <!-- View Modal (component) -->
    <StreamProxyViewDrawer v-model:visible="viewDrawerVisible" :proxy="viewingProxy" />

    <!-- Version Management -->
    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="stream_proxy"
      :resource-id="vmId"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      :can-publish="true"
      @version-change="loadProxies"
      @published="loadProxies"
      @publish-requested="onVmPublishRequested"
    />

    <!-- Publish -->
    <PublishConfirmModal
      v-model:visible="publishVisible"
      :title="`发布四层代理「${publishingProxy?.name ?? ''}」`"
      :cluster-id="publishClusterId"
      :current-version="publishingProxy?.current_version ?? null"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message } from 'ant-design-vue'
import type { StreamProxy } from '@/types'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import StreamProxyFormWizard from '@/components/StreamProxyFormWizard.vue'
import StreamProxyViewDrawer from '@/components/StreamProxyViewDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress, routeLabel } from '@/composables/useClusterUtils'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'
import { formatDateTime as formatDate } from '@/utils/format'
import { useStreamProxyList } from '@/composables/useStreamProxyList'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import PublishStatusTag from '@/components/PublishStatusTag.vue'

// ── Proxy type from route query ──
const proxyType = computed<'normal' | 'dns'>(() => (route.query.type === 'dns' ? 'dns' : 'normal'))

const {
  proxies,
  clusters,
  totalCount,
  loading,
  searchText,
  clusterFilter,
  groupFilter,
  groupOptions,
  filteredClusters,
  displayedProxies,
  statusFilter,
  statusCounts,
  batchMode,
  selectedProxyIds,
  selectedProxies,
  allGroupSelected,
  allFilteredSelected,
  showGroupSelectAll,
  toggleBatchMode,
  toggleProxy,
  toggleSelectAllGroup,
  toggleSelectAllFiltered,
  clearSelection,
  loadProxies,
  loadClusters,
} = useStreamProxyList(proxyType)

function onGroupChange() {
  clusterFilter.value = ''
  loadProxies()
}

// Wizard
const wizardVisible = ref(false)
const editingProxy = ref<StreamProxy | null>(null)

function closeWizard(): void {
  wizardVisible.value = false
  editingProxy.value = null
}

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
// 版本弹窗出口链：发布完成后的刷新回调可注入「重开版本弹窗」（RouteList 同款范式）
const publishRefreshFn = ref<() => Promise<void>>(loadProxies)

// ── Helpers ──

function schemeLabel(scheme: string | undefined): string {
  if (scheme === 'tcp') return 'TCP'
  if (scheme === 'udp') return 'UDP'
  if (scheme === 'tls') return 'TLS'
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

function dnsHosts(
  p: any,
): Record<string, { nodes: Record<string, string[]>; type: string; ttl_valid?: number }> | null {
  try {
    const cfg = typeof p.dns_config === 'string' ? JSON.parse(p.dns_config) : p.dns_config
    return cfg?.hosts || null
  } catch {
    return null
  }
}

function isWanEnabled(p: any): boolean {
  try {
    const cfg = typeof p.dns_config === 'string' ? JSON.parse(p.dns_config) : p.dns_config
    return !!(cfg && cfg.wan_enabled)
  } catch {
    return false
  }
}

// 搜索防抖换共享实现（stream-proxy-ux-review-fixes D8，对齐 RouteList）
const { cancelSearch, onSearch: onDebouncedSearch } = useDebouncedSearch()
function onSearch() {
  onDebouncedSearch(() => loadProxies())
}
function onClearSearch() {
  searchText.value = ''
  loadProxies()
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
  let nodes: { id: number; ip: string; management_port: number; status?: number }[] = []
  try {
    const res = await api.get(`/clusters/${p.cluster_id}/nodes`)
    nodes = (res.data?.items || []).map((n: any) => ({
      id: n.id,
      ip: n.ip,
      management_port: n.management_port,
      status: n.status,
    }))
  } catch {
    /* ignore */
  }

  showDeleteConfirm({
    title: `确定要删除四层代理 "${p.name}" 吗？`,
    apiEndpoint: `/clusters/${p.cluster_id}/stream-proxies/${p.id}`,
    nodes,
    defaultSelectOnline: true,
    subsetConsequence: '未选中的 {n} 个节点将保留该转发规则并继续承载流量',
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除四层代理: ${p.name}`,
        apiEndpoint: `/clusters/${p.cluster_id}/stream-proxies/${p.id}`,
        cluster: { id: p.cluster_id, nodes },
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadProxies,
        clearSelectedFn: () => {},
        retryable: true,
      })
    },
  })
}

function publishProxyAction(p: StreamProxy) {
  publishingProxy.value = p
  publishClusterId.value = p.cluster_id
  publishRefreshFn.value = loadProxies
  publishVisible.value = true
}

function goStatus(key: StatusKey) {
  statusFilter.value = key
}

type StatusKey = 'all' | 'unpublished' | 'pending' | 'published'
const statusTabs = computed<{ key: StatusKey; label: string; count: number }[]>(() => [
  { key: 'all', label: '全部', count: totalCount.value },
  { key: 'unpublished', label: '未发布', count: statusCounts.value.unpublished },
  { key: 'pending', label: '待发布', count: statusCounts.value.pending },
  { key: 'published', label: '已发布', count: statusCounts.value.published },
])

// 版本弹窗「立即发布恢复的配置」出口：先关版本弹窗再打开发布确认弹窗（不同屏），
// 发布完成后经 publishRefreshFn 刷新并重开版本弹窗
function onVmPublishRequested() {
  const p = proxies.value.find((x: StreamProxy) => x.id === vmId.value)
  if (!p) return
  publishingProxy.value = p
  publishClusterId.value = p.cluster_id
  publishRefreshFn.value = async () => {
    await loadProxies()
    vmVisible.value = true
  }
  vmVisible.value = false
  publishVisible.value = true
}

function batchDelete() {
  const proxies = selectedProxies.value
  if (proxies.length === 0) return
  const names = proxies.map((p: any) => p.name)
  const title =
    names.length > 3
      ? `确定要删除选中的 ${names.length} 个四层代理吗？${names.slice(0, 3).join('、')} 等 ${names.length} 个`
      : `确定要删除选中的 ${names.length} 个四层代理吗？${names.join('、')}`
  showDeleteConfirm({
    title,
    apiEndpoint: '/stream-proxies',
    noNodeSelection: true,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `批量删除四层代理: ${names.join('、')}`,
        apiEndpoint: '/stream-proxies',
        deleteDb,
        deleteEdge,
        nodeIds,
        resourceKey: { field: 'proxy_ids', label: '四层代理', nameField: 'name', keys: selectedProxyIds.value },
        refreshFn: loadProxies,
        clearSelectedFn: () => {
          clearSelection()
          if (batchMode.value) toggleBatchMode()
        },
      })
    },
  })
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const p = publishingProxy.value
  if (!p) return
  await executePublish({
    title: `发布四层代理: ${p.name}`,
    apiEndpoint: `/clusters/${p.cluster_id}/stream-proxies/${p.id}/publish`,
    nodeIds,
    refreshFn: publishRefreshFn.value,
    handleResult: (data, addLog, progress) => {
      addLog(`状态: ${data.status || '-'}`)
      addLog(`消息: ${data.message || '-'}`)
      if (data.version !== undefined) addLog(`版本: v${data.version}`)

      if (data.results && data.results.length > 0) {
        addLog('')
        addLog('══════ 节点同步结果 ══════')
        for (const r of data.results) {
          const icon = r.status === 'success' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌'
          const rl = routeLabel(r.route)
          addLog(`${icon} 节点: ${r.node || r.scope || '-'}${rl ? `（${rl}）` : ''}`)
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
  publishRefreshFn.value = loadProxies
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

// 侧边栏切换 TCP/DNS 时重新加载数据（组件复用，onMounted 只触发一次）
watch(
  () => route.query.type,
  () => {
    loadProxies()
  },
)

onUnmounted(() => {
  cancelSearch()
})
</script>

<style scoped>
.sp-page:has(.sp-batch-bar) {
  padding-bottom: 80px;
}
/* ── 状态分段控件（连接式 segmented，方案 A）──────────────────────── */
.sp-status-tabs {
  display: inline-flex;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
  flex-shrink: 0;
}

.sp-status-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-family: inherit;
  padding: 5px 13px;
  border-radius: 7px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    opacity 0.15s;
}

.sp-status-tab:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--fg);
}

.sp-status-tab.active {
  background: var(--accent);
  color: #fff;
  cursor: default;
  font-weight: 500;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--accent) 35%, transparent);
}

.sp-status-count {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--muted) 14%, transparent);
  color: var(--muted);
}

.sp-status-tab.active .sp-status-count {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

.sp-status-tab.empty {
  opacity: 0.55;
}

.sp-status-tab.empty:hover {
  opacity: 1;
}

.sp-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}
.link-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.link-btn:hover {
  background: oklch(56% 0.16 210 / 8%);
}
.loading-state {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
  font-size: 14px;
}
.sp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}
.sp-empty-icon {
  font-size: 40px;
  color: var(--muted);
  margin-bottom: 12px;
  opacity: 0.4;
}
.sp-empty-text {
  font-size: 14px;
  color: var(--muted);
}

/* ── Card Grid (aligns with PluginConfigList .pc-grid) ── */
.sp-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.sp-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: default;
}
.sp-card:hover {
  box-shadow: var(--shadow-md);
}
.sp-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px oklch(56% 0.16 210 / 35%);
}
.batch-mode .sp-card {
  cursor: pointer;
}
.sp-card-topbar {
  padding: 4px 16px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: oklch(56% 0.16 210 / 8%);
  border-bottom: 1px solid oklch(56% 0.16 210 / 12%);
  display: flex;
  align-items: center;
  gap: 6px;
}
.sp-checkbox {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  margin-left: auto;
  flex-shrink: 0;
}
.sp-card:not(.selected) .sp-checkbox:hover {
  border-color: var(--accent);
}
.sp-card.selected .sp-checkbox {
  border-color: var(--accent);
  background: var(--accent);
}
.sp-card.selected .sp-checkbox::after {
  content: '✓';
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.sp-batch-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -4px 16px oklch(0% 0 0 / 8%);
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 100;
}
.bb-selected {
  font-size: 13px;
}
.bb-selected b {
  color: var(--accent);
}
.bb-spacer {
  flex: 1;
}
.group-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--badge-bg, oklch(50% 0.12 170 / 15%));
  color: var(--badge-fg, oklch(45% 0.12 170));
  border: 1px solid var(--badge-border, oklch(50% 0.12 170 / 25%));
  line-height: 1.4;
  flex-shrink: 0;
}
.dns-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  background: oklch(55% 0.18 280 / 18%);
  color: oklch(40% 0.18 280);
  border: 1px solid oklch(55% 0.18 280 / 30%);
  line-height: 1.4;
  flex-shrink: 0;
}
.wan-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  background: oklch(65% 0.18 45 / 18%);
  color: oklch(50% 0.18 45);
  border: 1px solid oklch(65% 0.18 45 / 30%);
  line-height: 1.4;
  flex-shrink: 0;
}
.sp-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  padding: 12px 20px 0;
}
.sp-card-info {
  flex: 1;
}
.sp-card-name {
  font-size: 14px;
  font-weight: 600;
}
.sp-card-desc {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  line-height: 1.5;
}
.sp-card-meta {
  text-align: right;
  flex-shrink: 0;
  margin-left: 12px;
}
.sp-version-text {
  white-space: nowrap;
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  font-family: var(--font-mono);
}
.sp-card-details {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-bottom: 8px;
  padding: 0 20px;
}
.sp-detail-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sp-detail-sep {
  color: var(--border);
  font-size: 12px;
}
.sp-detail-label {
  font-size: 11px;
  color: var(--muted);
}
.sp-detail-value {
  font-size: 12px;
  font-weight: 500;
  color: var(--fg);
}
.sp-detail-value.sp-port {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
}
.sp-card-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  padding: 0 20px;
}
.sp-target-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  background: oklch(56% 0.16 210 / 10%);
  color: var(--accent);
  border: 1px solid oklch(56% 0.16 210 / 20%);
  font-family: var(--font-mono);
}
.sp-target-wt {
  color: var(--muted);
  font-size: 11px;
}
.sp-no-targets {
  font-size: 11px;
  color: var(--muted);
  font-style: italic;
}
.sp-card-dns {
  padding: 0 20px 8px;
}
.sp-dns-domain {
  margin-bottom: 8px;
  padding: 8px;
  background: var(--bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}
.sp-dns-domain-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  font-family: var(--font-mono);
  margin-bottom: 2px;
}
.sp-dns-domain-lb {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 4px;
}
.sp-dns-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sp-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: auto;
  padding: 10px 20px 16px;
  border-top: 1px solid var(--border);
}
.sp-action-btn {
  background: none !important;
  background-color: transparent !important;
}
.sp-action-btn:hover {
  background: var(--bg) !important;
}

.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
}

@media (max-width: 768px) {
  .sp-grid {
    grid-template-columns: 1fr;
  }
}
</style>
