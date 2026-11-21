<template>
  <div class="sp-page">
    <PageHeader title="DNS 代理（UDP）" description="管理集群级的 DNS 代理规则">
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <!-- 序与设计页一致（AGENTS #88 ⑦）：批量管理（secondary）在「新建」（primary）左侧 -->
        <button class="btn btn-secondary" :aria-pressed="batchMode" @click="toggleBatchMode">
          {{ batchMode ? '退出批量管理' : '批量管理' }}
        </button>
        <button class="btn btn-primary" @click="openCreateWizard">
          <StrokeIcon name="plus" :size="13" /> 新建 DNS 代理
        </button>
      </template>
    </PageHeader>

    <!-- 工具条 + 状态行（AGENTS #88：与列表页同构）：第一行共享 TableToolbar，第二行 .l5-chiprow -->
    <div class="l5-card sp-card-page">
      <TableToolbar
        v-model:mode="cardMode"
        :count="totalCount"
        count-unit="个 DNS 代理"
        :show-count="false"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <SearchInput v-model="searchText" placeholder="搜索 DNS 代理..." :width="150" @input="onSearch" />
          <select
            v-model="groupFilter"
            :title="groupFilter.startsWith('__') ? '' : groupFilter"
            class="l5-select"
            style="width: 104px"
            @change="onGroupChange"
          >
            <option value="__all__">全部分组</option>
            <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
            <option value="__ung__">未分组</option>
          </select>
          <ClusterSelect
            v-model="clusterFilter"
            :clusters="filteredClusters"
            allow-all
            style="width: 120px"
            @change="onClusterChange"
          />
        </template>
        <template #mode-extra>
          <button
            v-if="cardMode === 'group'"
            type="button"
            class="tool-btn fold-all-btn"
            data-test="card-fold-all"
            :title="pageHasFolded ? '展开全部集群组' : '收起全部集群组'"
            @click="toggleFoldAll"
          >
            <StrokeIcon :name="pageHasFolded ? 'expandAll' : 'collapseAll'" :size="13" />
            <span class="fold-all-label">{{ pageHasFolded ? '全部展开' : '全部收起' }}</span>
          </button>
        </template>
      </TableToolbar>

      <div class="l5-chiprow" data-test="status-chip-row">
        <span class="chiprow-label">状态</span>
        <div class="f-chips status-chips" role="group" aria-label="按发布状态筛选">
          <button
            v-for="t in statusTabs"
            :key="t.key"
            type="button"
            class="f-chip chip-status"
            :class="{ active: statusFilter === t.key, empty: t.count === 0 }"
            :aria-pressed="statusFilter === t.key ? 'true' : 'false'"
            @click="goStatus(t.key)"
          >
            {{ t.label }}<span class="f-count">{{ t.count }}</span>
          </button>
        </div>
        <span class="t-spacer"></span>
      </div>

      <!-- 批量条（AGENTS #88 ③）：状态行下、网格上、随流；按钮集无「批量发布」 -->
      <div v-if="batchMode" class="l5-batchbar batchbar-dynamic" :class="{ 'has-sel': selectedProxies.length > 0 }">
        <span class="b-count">已选 {{ selectedProxies.length }} 项</span>
        <span class="b-sep"></span>
        <button class="btn btn-danger btn-sm need-sel" :disabled="selectedProxies.length === 0" @click="batchDelete">
          <StrokeIcon name="trash" :size="12" /> 批量删除
        </button>
        <span class="b-spacer"></span>
        <button v-if="showGroupSelectAll" class="link-btn" @click="toggleSelectAllGroup">
          {{ allGroupSelected ? '取消全选分组' : '全选当前分组' }}
        </button>
        <button class="link-btn" @click="toggleSelectAllFiltered">
          {{ allFilteredSelected ? '取消全选结果' : '全选当前筛选结果' }}
        </button>
        <button class="link-btn" @click="clearSelection">清除选择</button>
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
          没有匹配「{{ searchText }}」的 DNS 代理
          <a class="link-btn" style="margin-left: 8px" @click="onClearSearch">清除筛选</a>
        </div>
        <div v-else class="sp-empty-text">暂无 DNS 代理</div>
      </div>
      <div
        v-else
        class="sp-grid card-grid l5-card sp-cards"
        :class="[`mode-${cardMode}`, { 'batch-mode': batchMode, batch: batchMode }]"
      >
        <template v-for="g in renderGroups" :key="g.clusterId">
          <ClusterBand
            v-if="cardMode === 'group'"
            :name="g.clusterName"
            :group="g.groupName"
            :count-label="countLabelOf(g.count)"
            :secondary="secondaryOf(g.rows)"
            :hue-class="g.hueClass"
            :folded="isFolded(g.clusterId)"
            :batch="batchMode"
            :selected-count="selectedCountInGroup(g.rows)"
            @toggle="toggleFold(g.clusterId)"
            @toggle-select="toggleGroupSelect(g.rows)"
          />
          <div
            v-for="p in g.rows"
            :key="p.id"
            class="sp-card std-card l5-panel"
            :class="[
              clusterHueClass(p.cluster_id),
              {
                selected: selectedProxyIds.includes(p.id),
                'is-selected': selectedProxyIds.includes(p.id),
                'is-folded': cardMode === 'group' && !groupVisible(g.clusterId),
              },
            ]"
            @click="batchMode && toggleProxy(p.id)"
          >
            <span class="lp-check" aria-hidden="true"></span>
            <div class="lp-strip">
              <span class="lp-tag lp-cluster">{{ p.cluster_name || '-' }}</span>
              <span v-if="p.cluster_group_name" class="lp-tag group lp-group">{{ p.cluster_group_name }}</span>
              <span class="st-algo"
                >上游 · <b>{{ dnsUpstreams(p)[0] || '未配置' }}</b
                ><span v-if="dnsUpstreams(p).length > 1" class="c-dim"> +{{ dnsUpstreams(p).length - 1 }}</span></span
              >
            </div>
            <div class="lp-head">
              <div class="lp-title">
                <span class="lp-hero sm">{{ heroAddr(p) }}</span>
                <span v-if="isWanEnabled(p)" class="lp-tag tech">内外网分离</span>
                <span class="lp-name" :title="p.name">{{ p.name }}</span>
              </div>
              <div class="lp-status status-cell-flex">
                <PublishStatusTag
                  :version="p.current_version"
                  :published-at="p.published_at"
                  :pending="p.pending_publish === true"
                  :last-publish-status="p.last_publish_status"
                />
                <PublishDiffButton
                  :pending="p.pending_publish === true"
                  :last-publish-status="p.last_publish_status"
                  @click.stop="openPublishPreview(p)"
                />
              </div>
            </div>
            <div class="lp-body">
              <div class="lp-row">
                <span class="lp-k">域名</span>
                <span class="lp-v split">
                  <span class="tr mono" :title="dnsDomains(p).join('、')"
                    >{{ dnsDomains(p)[0] || '未配置'
                    }}<span v-if="dnsDomains(p).length > 1" class="m-more">+{{ dnsDomains(p).length - 1 }}</span></span
                  >
                  <span v-if="dnsAlgorithm(p)" class="lp-algo">{{ dnsAlgorithm(p) }}</span>
                </span>
              </div>
              <!-- 上游 IP 属「列表型关键信息」，两态都显示且**完整呈现**（不裁剪、允许折行；
                 用户裁定 DNS 上游 chips 不单行化，r18-A） -->
              <div class="lp-row">
                <span class="lp-k">上游</span>
                <div class="lp-chips">
                  <span v-for="(u, i) in dnsUpstreams(p)" :key="i" class="tg-chip">{{ u }}</span>
                  <span v-if="!dnsUpstreams(p).length" class="lp-v dim">未配置</span>
                </div>
                <span v-if="dnsUpstreams(p).length" class="lp-cnt">{{ dnsUpstreams(p).length }} 组</span>
              </div>
            </div>
            <div v-if="p.last_publish_status === 'partial' && !p.pending_publish" class="lp-notice alert alert-error">
              <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
              <span class="n-txt">{{ partialNoticeText(p) }}</span>
              <button class="n-act" :disabled="republishLoading" @click.stop="republishFailedNodes(p)">
                {{ republishLoading ? '获取失败节点…' : '重发失败节点' }}
              </button>
              <button class="n-act ghost" @click.stop="openPublishPreview(p)">查看差异</button>
            </div>
            <div class="lp-foot" @click.stop>
              <button class="op-pub" @click="publishProxyAction(p)">发布</button>
              <div class="menu-anchor">
                <button
                  type="button"
                  class="op-btn"
                  title="更多操作"
                  aria-label="更多操作"
                  @click.stop="toggleCardMenu(p.id, $event)"
                >
                  <StrokeIcon name="dots" :size="14" />
                </button>
                <div class="l5-menu" :class="{ open: openMenuId === p.id, 'flip-up': menuFlipUp }">
                  <button class="mi" @click="menuView(p)">
                    <span class="mi-main">查看</span>
                  </button>
                  <button class="mi" @click="menuEdit(p)">
                    <span class="mi-main">编辑</span>
                  </button>
                  <button class="mi" @click="menuVersion(p)">
                    <span class="mi-main">版本管理</span>
                    <span class="mi-sub">历史版本查看与回滚</span>
                  </button>
                  <hr class="menu-sep" />
                  <button class="mi danger" @click="menuDelete(p)">
                    <span class="mi-main">删除</span>
                    <span class="mi-sub">删平台配置，可同步删 Edge DNS 规则（弹窗可选）</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Create/Edit Form Wizard -->
    <StreamProxyFormWizard
      :visible="wizardVisible"
      :clusters="clusters"
      :editing-proxy="editingProxy"
      :default-proxy-type="'dns'"
      with-publish-guide
      @close="closeWizard"
      @saved="onWizardSaved"
      @publish-requested="onWizardPublishRequested"
    />

    <!-- View Modal -->
    <StreamProxyViewDrawer v-model:visible="viewDrawerVisible" :proxy="viewingProxy" />

    <!-- Version Management -->
    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="dns_proxy"
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
      :title="`发布 DNS 代理「${publishingProxy?.name ?? ''}」`"
      :cluster-id="publishClusterId"
      :current-version="publishingProxy?.current_version ?? null"
      :preselected-node-ids="publishPreselected"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />

    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="previewRecord?.cluster_id ?? null"
      :resource-type="'dns_proxy'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.name"
      @publish="onPreviewPublish"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import type { StreamProxy } from '@/types'
import ClusterSelect from '@/components/ClusterSelect.vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import StreamProxyFormWizard from '@/components/StreamProxyFormWizard.vue'
import StreamProxyViewDrawer from '@/components/StreamProxyViewDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress, routeLabel } from '@/composables/useClusterUtils'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'
import { formatDateTime as formatDate } from '@/utils/format'
import { useStreamProxyList } from '@/composables/useStreamProxyList'
import { useRepublishFailedNodes, noticeTextFromPublishDetail } from '@/composables/useRepublishFailedNodes'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import SearchInput from '@/components/SearchInput.vue'

const proxyType = computed<'dns'>(() => 'dns')

const {
  proxies,
  clusters,
  totalCount,
  statusFilter,
  statusCounts,
  loading,
  searchText,
  clusterFilter,
  groupFilter,
  groupOptions,
  filteredClusters,
  displayedProxies,
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

// ── 状态分段（对齐四层代理页，dns-udp-proxy-ux-parity 批 1）──
type StatusKey = 'all' | 'unpublished' | 'pending' | 'published' | 'partial'
const statusTabs = computed<{ key: StatusKey; label: string; count: number }[]>(() => [
  { key: 'all', label: '全部', count: totalCount.value },
  { key: 'unpublished', label: '未发布', count: statusCounts.value.unpublished },
  { key: 'pending', label: '待发布', count: statusCounts.value.pending },
  { key: 'published', label: '已发布', count: statusCounts.value.published },
  { key: 'partial', label: '部分失败', count: statusCounts.value.partial },
])
function goStatus(key: StatusKey) {
  statusFilter.value = key
}

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

// ── 重发失败节点（republish-failed-nodes：预览取失败集合并预选，单一实现）──
const { loading: republishLoading, resolve: resolveFailedNodes } = useRepublishFailedNodes()
// 解析成功后的具体文案缓存（会话内按资源 id；主键全库唯一）
const republishNotices = ref<Record<number, string>>({})
const publishPreselected = ref<number[]>([])

async function republishFailedNodes(p: StreamProxy): Promise<void> {
  const outcome = await resolveFailedNodes({ id: p.id, cluster_id: p.cluster_id }, 'dns_proxy')
  if (!outcome) return
  if (outcome.ok && outcome.noticeText) {
    republishNotices.value[p.id] = outcome.noticeText
    publishingProxy.value = p
    publishClusterId.value = p.cluster_id
    publishRefreshFn.value = loadProxies
    publishPreselected.value = outcome.failedNodeIds
    publishVisible.value = true
  } else {
    message.warning('未能获取失败节点，请通过「查看差异」排查')
  }
}

// ── Helpers ──

function schemeLabel(scheme: string | undefined): string {
  if (scheme === 'tcp') return 'TCP'
  if (scheme === 'udp') return 'UDP'
  if (scheme === 'tls') return 'TLS'
  return scheme || 'TCP'
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

function dnsApiPath(clusterId: number, proxyId: number, action: string = ''): string {
  return `/clusters/${clusterId}/dns-proxies/${proxyId}${action}`
}

// 搜索防抖换共享实现（dns-udp-proxy-ux-parity 3.3，对齐四层代理页）
const { onSearch: onDebouncedSearch } = useDebouncedSearch()
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

// publish-guide 批 4：向导保存引导「立即发布」→ 打开该代理的发布确认弹窗（与行内发布同链路）
function onWizardPublishRequested(payload: { clusterId: number; proxyId: number | null; name: string }) {
  publishingProxy.value = {
    id: payload.proxyId,
    cluster_id: payload.clusterId,
    name: payload.name,
  } as StreamProxy
  publishClusterId.value = payload.clusterId
  publishPreselected.value = []
  publishVisible.value = true
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
    title: `确定要删除 DNS 代理 "${p.name}" 吗？`,
    apiEndpoint: dnsApiPath(p.cluster_id, p.id),
    nodes,
    defaultSelectOnline: true,
    subsetConsequence: '未选中的 {n} 个节点将保留该转发规则并继续承载流量',
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除 DNS 代理: ${p.name}`,
        apiEndpoint: dnsApiPath(p.cluster_id, p.id),
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

/** 集群 id → 显示名（批量删除节点清单标注归属集群） */
function clusterNameById(id: number): string {
  const c = clusters.value.find((x: any) => x.id === id)
  return c ? c.display_name || c.name || `集群 ${id}` : `集群 ${id}`
}

/** 批量删除（统一入口 composable/useBatchDelete，AGENTS #88 ⑪） */
const batchDelete = useBatchDelete<any>({
  label: 'DNS 代理',
  endpoint: '/stream-proxies',
  idField: 'proxy_ids',
  nameField: 'name',
  rows: () => selectedProxies.value,
  ids: () => selectedProxyIds.value,
  nameOf: (p: any) => p.name,
  clusterIdOf: (p: any) => p.cluster_id,
  clusterNameOf: clusterNameById,
  refresh: loadProxies,
  clearSelection: () => clearSelection(),
  exitBatch: () => toggleBatchMode(),
  subsetConsequence: '未选中的 {n} 个节点将保留该DNS 代理',
})

function publishProxyAction(p: StreamProxy) {
  publishingProxy.value = p
  publishClusterId.value = p.cluster_id
  publishRefreshFn.value = loadProxies
  // 常规发布不带预选（仅「重发失败节点」入口设置；防上一次重发残留）
  publishPreselected.value = []
  publishVisible.value = true
}

// 发布差异预览（publish-diff-preview-batch2）：弹窗自持拉取；「去发布」接既有发布流程
const previewVisible = ref(false)
const previewRecord = ref<StreamProxy | null>(null)

function openPublishPreview(p: StreamProxy) {
  previewRecord.value = p
  previewVisible.value = true
}

function onPreviewPublish() {
  const p = previewRecord.value
  previewVisible.value = false
  if (p) publishProxyAction(p)
}

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
  publishPreselected.value = []
  vmVisible.value = false
  publishVisible.value = true
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const p = publishingProxy.value
  if (!p) return
  await executePublish({
    title: `发布 DNS 代理: ${p.name}`,
    apiEndpoint: dnsApiPath(p.cluster_id, p.id, '/publish'),
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
          const rl = routeLabel(r.route, r)
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

// ── Initial load ──
loadClusters()
loadProxies()
// ── r24 修复补齐：DNS 卡片辅助 + 集群分组 + ⋯ 菜单（其余选择/状态已有）──
import TableToolbar from '@/components/TableToolbar.vue'
import ClusterBand from '@/components/ClusterBand.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { useCardClusterGrouping } from '@/composables/useCardClusterGrouping'
import { useBatchDelete } from '@/composables/useBatchDelete'
import { clusterHueClass } from '@/utils/clusterHue'

/** DNS 配置（UDP 页字段是 `dns_config`，可能是 JSON 字符串） */
function dnsPluginCfg(p: any): any {
  try {
    const cfg = p?.dns_config
    return typeof cfg === 'string' ? JSON.parse(cfg) : cfg || null
  } catch {
    return null
  }
}

function dnsDomains(p: any): string[] {
  const cfg = dnsPluginCfg(p)
  return cfg?.hosts ? Object.keys(cfg.hosts) : []
}

function dnsUpstreams(p: any): string[] {
  const cfg = dnsPluginCfg(p)
  if (!cfg?.hosts) return []
  const out: string[] = []
  for (const entry of Object.values<any>(cfg.hosts)) {
    for (const addr of Object.keys(entry?.nodes || {})) if (!out.includes(addr)) out.push(addr)
  }
  return out
}

function dnsAlgorithm(p: any): string {
  const cfg = dnsPluginCfg(p)
  const first = cfg?.hosts ? Object.values<any>(cfg.hosts)[0] : undefined
  const map: Record<string, string> = { roundrobin: '轮询', chash: '一致性哈希', ewma: 'EWMA', least_conn: '最少连接' }
  return map[first?.type || ''] || first?.type || ''
}

/** hero = 监听地址:端口（DNS 代理由 Edge 全地址监听 0.0.0.0） */
function heroAddr(p: any): string {
  const port = p?.listen_port ?? p?.service_port
  if (!port) return '—'
  return `0.0.0.0:${port}`
}

/** 卡内「发布未完全生效」文案：默认泛化；「重发失败节点」解析成功后升级为具体失败节点（republishNotices 会话缓存） */
function partialNoticeText(p: any): string {
  // 三级回退（D11）：持久化明细（方案 B，打开即见）→ 会话内预览解析缓存 → 泛化
  return (
    noticeTextFromPublishDetail(p?.last_publish_detail) ??
    republishNotices.value[p?.id] ??
    '发布未完全生效，请查看发布差异'
  )
}

const rowsFiltered = computed(() =>
  statusFilter.value === 'all'
    ? displayedProxies.value
    : displayedProxies.value.filter((p: any) => {
        // 批 5：与 useStreamProxyList.statusOf 同口径（partial 从「已发布」拆出）
        const key =
          p.pending_publish === true
            ? 'pending'
            : p.last_publish_status === 'partial'
              ? 'partial'
              : p.current_version
                ? 'published'
                : 'unpublished'
        return key === statusFilter.value
      }),
)

const {
  mode: cardMode,
  groups: cardGroups,
  countLabel: countLabelOf,
  secondaryOf,
  isFolded,
  toggleFold,
  pageHasFolded,
  toggleFoldAll,
  groupVisible,
} = useCardClusterGrouping<any>({
  rows: () => rowsFiltered.value,
  unit: '条 DNS 代理',
  clusterIdOf: (p) => p.cluster_id,
  clusterNameOf: (p) => p.cluster_name,
  groupNameOf: (p) => p.cluster_group_name,
  secondary: (rows) => {
    const ups = new Set<string>()
    rows.forEach((p) => dnsUpstreams(p).forEach((u) => ups.add(u)))
    return `上游 · ${ups.size} 组`
  },
})

const renderGroups = computed(() =>
  cardMode.value === 'group'
    ? cardGroups.value
    : [
        {
          clusterId: -1,
          clusterName: '',
          groupName: '',
          hueClass: 'cluster-c1',
          rows: rowsFiltered.value,
          count: rowsFiltered.value.length,
        },
      ],
)

async function refreshList(): Promise<void> {
  await loadClusters()
  await loadProxies()
}

function onClusterChange(): void {
  loadProxies()
}

function selectedCountInGroup(rows: any[]): number {
  return rows.filter((p) => selectedProxyIds.value.includes(p.id)).length
}

function toggleGroupSelect(rows: any[]): void {
  const ids = rows.map((p) => p.id)
  const all = ids.every((id) => selectedProxyIds.value.includes(id))
  selectedProxyIds.value = all
    ? selectedProxyIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedProxyIds.value, ...ids])]
}

const openMenuId = ref<number | null>(null)
const menuFlipUp = ref(false)
function toggleCardMenu(id: number, event?: MouseEvent): void {
  if (openMenuId.value === id) {
    openMenuId.value = null
    return
  }
  openMenuId.value = id
  const rect = (event?.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  menuFlipUp.value = rect ? rect.bottom + 200 > window.innerHeight : false
}
function closeCardMenu(): void {
  openMenuId.value = null
}
function onDocClick(): void {
  if (openMenuId.value !== null) openMenuId.value = null
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

function menuView(p: any): void {
  closeCardMenu()
  viewProxy(p)
}
function menuEdit(p: any): void {
  closeCardMenu()
  editProxy(p)
}
function menuVersion(p: any): void {
  closeCardMenu()
  openVersionManagement(p)
}
function menuDelete(p: any): void {
  closeCardMenu()
  deleteProxy(p)
}

/** 页头徽标（#86② 补充维度）：涉及集群数 + 域名总数 */
const headerStatItems = computed(() => [
  { value: new Set(proxies.value.map((p) => p.cluster_id)).size, label: '集群' },
  { value: proxies.value.reduce((n, p) => n + dnsDomains(p).length, 0), label: '个域名' },
])
</script>

<style scoped>
/* ── 状态分段控件（连接式 segmented，与四层代理页同款）──────────────── */

.sp-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
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

/* 网格与卡片容器样式已上移共享 .card-grid / .std-card（style.css 卡片一致性单点） */
.sp-card {
  cursor: default;
}
.sp-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px oklch(56% 0.16 210 / 35%);
}
.batch-mode .sp-card {
  cursor: pointer;
}
.sp-card.selected .group-badge {
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
.sp-version-text {
  white-space: nowrap;
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  font-family: var(--font-mono);
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

.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
}

/* 网格/卡片容器断点已上移共享 .card-grid（style.css） */
</style>
