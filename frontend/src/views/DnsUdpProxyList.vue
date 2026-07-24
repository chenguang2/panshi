<template>
  <div class="sp-page">
    <PageHeader :title="pageTitle" :description="pageDesc">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateWizard">+ 新建 DNS 代理</button>
      </template>
    </PageHeader>

    <div class="sp-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索 DNS 代理名称..." class="form-input" @input="onSearch">
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
      <span class="text-sm text-muted">共 {{ totalCount }} 个 DNS 代理</span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="displayedProxies.length === 0" class="sp-empty">
      <div class="sp-empty-icon">&#9635;</div>
      <div class="sp-empty-text">暂无 DNS 代理</div>
    </div>
    <div v-else class="sp-grid">
      <div v-for="p in displayedProxies" :key="p.id" class="sp-card" :style="getCardBorderStyle(p.cluster_group_name)">
        <div class="sp-card-topbar" :style="getGroupColorStyle(p.cluster_group_name)">
          <span>{{ p.cluster_name || '-' }}</span>
          <span class="dns-badge">DNS</span>
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
            <span class="sp-detail-label">端口</span>
            <span class="sp-detail-value sp-port">{{ p.listen_port }}</span>
          </div>
        </div>
        <div class="sp-card-dns" v-if="dnsHosts(p)">
          <div v-for="(hostInfo, domain) in dnsHosts(p)" :key="domain" class="dns-domain-block">
            <div class="dns-domain-name">{{ domain }}</div>
            <div class="dns-host-info">
              <span v-if="hostInfo.weight" class="dns-tag">{{ hostInfo.weight }}</span>
              <span v-if="hostInfo.ttl" class="dns-tag">TTL {{ hostInfo.ttl }}</span>
              <span v-if="hostInfo.checks" class="dns-tag dns-tag-check">健康检查</span>
              <div v-if="hostInfo.upstream_id" class="dns-upstream-id">upstream#{{ hostInfo.upstream_id }}</div>
            </div>
            <div v-if="hostInfo.nodes" class="dns-nodes">
              <span v-for="(node, ni) in hostInfo.nodes" :key="ni" class="dns-node-tag">{{ node.ip || node.host }}:{{ node.port }}</span>
            </div>
          </div>
        </div>
        <div class="sp-card-dns" v-else>
          <div class="dns-empty">暂无 DNS 主机映射</div>
        </div>
      </div>
    </div>

    <StreamProxyFormWizard
      v-if="showWizard"
      :mode="'create'"
      :proxy-type="'dns'"
      @close="showWizard = false"
      @created="onCreated"
    />

    <VersionManagementModal
      v-if="showVersionModal"
      :visible="showVersionModal"
      :resource-type="'stream_proxy'"
      :resource-id="versionModalProxyId"
      :cluster-id="versionModalClusterId"
      :resource-name="versionModalProxyName"
      @close="showVersionModal = false"
      @rolled-back="loadProxies"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useStreamProxyList } from '@/composables/useStreamProxyList'
import StreamProxyFormWizard from '@/components/StreamProxyFormWizard.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'

const route = useRoute()
const proxyType = computed<'dns'>(() => 'dns')

const {
  proxies, clusters, totalCount, loading,
  searchText, clusterFilter, groupFilter,
  pageTitle, pageDesc,
  groupOptions, filteredClusters, displayedProxies,
  loadProxies, loadClusters,
} = useStreamProxyList(proxyType)

const showWizard = ref(false)
const showVersionModal = ref(false)
const versionModalProxyId = ref(0)
const versionModalClusterId = ref(0)
const versionModalProxyName = ref('')

// ── Group color utilities (copied from StreamProxyList for consistency) ──
const groupColors: Record<string, string> = {}
const colorPalette = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e']

function getGroupColor(groupName: string): string {
  if (!groupName || groupName === '') return ''
  if (!groupColors[groupName]) {
    const idx = Object.keys(groupColors).length % colorPalette.length
    groupColors[groupName] = colorPalette[idx]
  }
  return groupColors[groupName]
}

function getGroupColorStyle(groupName: string): Record<string, string> {
  const color = getGroupColor(groupName)
  return color ? { backgroundColor: color + '22', borderBottom: `2px solid ${color}` } : {}
}

function getCardBorderStyle(groupName: string): Record<string, string> {
  const color = getGroupColor(groupName)
  return color ? { borderLeft: `3px solid ${color}` } : {}
}

// ── Search debounce ──
let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { loadProxies() }, 400)
}

function onGroupChange() {
  clusterFilter.value = ''
  loadProxies()
}

function openCreateWizard() {
  showWizard.value = true
}

function onCreated() {
  showWizard.value = false
  loadProxies()
}

function dnsHosts(proxy: any): Record<string, any> | null {
  if (!proxy.dns_config) return null
  const cfg = typeof proxy.dns_config === 'string' ? JSON.parse(proxy.dns_config) : proxy.dns_config
  return cfg?.hosts || null
}

function formatDate(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Initial load ──
loadClusters()
loadProxies()
</script>

<style scoped>
/* Reuse sp-page styles from StreamProxyList.vue — scoped so no conflict */
.sp-page { padding: 24px; max-width: 1400px; margin: 0 auto; }
.sp-header-actions { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
.search-input-wrap { position: relative; flex: 1; min-width: 200px; }
.search-input-wrap .form-input { width: 100%; padding-right: 32px; }
.search-icon { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 14px; color: #999; pointer-events: none; }
.loading-state { text-align: center; padding: 60px 0; color: #999; }
.sp-empty { text-align: center; padding: 80px 0; color: #ccc; }
.sp-empty-icon { font-size: 48px; margin-bottom: 12px; }
.sp-empty-text { font-size: 16px; }
.sp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.sp-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); overflow: hidden; transition: box-shadow 0.2s; border-left: 3px solid transparent; }
.sp-card-topbar { display: flex; align-items: center; gap: 8px; padding: 6px 14px; font-size: 12px; color: #666; background: #f8f9fa; }
.dns-badge { background: #e8f5e9; color: #2e7d32; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.group-badge { background: #e3f2fd; color: #1565c0; padding: 1px 8px; border-radius: 10px; font-size: 11px; }
.sp-card-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 14px 8px; }
.sp-card-info { flex: 1; min-width: 0; }
.sp-card-name { font-size: 15px; font-weight: 600; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-card-desc { font-size: 12px; color: #888; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-card-meta { text-align: right; flex-shrink: 0; }
.sp-version-text { font-size: 11px; color: #999; margin-top: 2px; }
.sp-card-details { display: flex; align-items: center; gap: 8px; padding: 4px 14px 8px; font-size: 13px; }
.sp-detail-row { display: flex; align-items: center; gap: 4px; }
.sp-detail-label { color: #888; }
.sp-detail-value { color: #333; font-weight: 500; }
.sp-detail-sep { color: #ddd; }
.sp-port { font-family: 'SF Mono', 'Fira Code', monospace; font-weight: 600; }
.sp-card-dns { padding: 0 14px 12px; }
.dns-domain-block { background: #f5f5f5; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
.dns-domain-name { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px; }
.dns-host-info { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
.dns-tag { background: #e3f2fd; color: #1565c0; padding: 0 6px; border-radius: 4px; font-size: 11px; }
.dns-tag-check { background: #fff3e0; color: #e65100; }
.dns-upstream-id { font-size: 11px; color: #888; }
.dns-nodes { display: flex; flex-wrap: wrap; gap: 4px; }
.dns-node-tag { background: #f3e5f5; color: #7b1fa2; padding: 0 6px; border-radius: 4px; font-size: 11px; font-family: 'SF Mono', 'Fira Code', monospace; }
.dns-empty { text-align: center; padding: 12px; color: #bbb; font-size: 13px; }
</style>
