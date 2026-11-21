<template>
  <div class="sp-page">
    <PageHeader title="四层代理" description="管理 TCP/UDP/TLS 四层转发规则">
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <!-- 序与设计页一致（r15-6）：批量管理（secondary）在「新建」（primary）左侧 -->
        <button class="btn btn-secondary" :aria-pressed="batchMode" @click="toggleBatchMode">
          {{ batchMode ? '退出批量管理' : '批量管理' }}
        </button>
        <button class="btn btn-primary" @click="openCreateWizard">
          <StrokeIcon name="plus" :size="13" /> 新建四层代理
        </button>
      </template>
    </PageHeader>

    <!-- 工具条 + 状态行（列表页同构，r15-1/2）：第一行 = 共享 TableToolbar（尺寸/边框/右侧簇顺序与路由页一致）；
         第二行 = .l5-chiprow 状态 chips（带「状态」标签与权威计数） -->
    <div class="l5-card sp-card-page">
      <TableToolbar
        v-model:mode="cardMode"
        :count="totalCount"
        count-unit="个四层代理"
        :show-count="false"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <SearchInput v-model="searchText" placeholder="搜索四层代理名称..." :width="150" @input="onSearch" />
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
          <select v-model="schemeFilter" class="l5-select" style="width: 104px" @change="loadProxies">
            <option value="">全部协议</option>
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="tls">TLS</option>
          </select>
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

      <!-- 状态 chips 附属行（r15-2）：与节点/上游/路由同款 .l5-chiprow -->
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

      <!-- 批量条（r15-7）：状态行之下、网格之上，随内容流（列表页 .l5-batchbar 同款） -->
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
          没有匹配「{{ searchText }}」的四层代理
          <a class="link-btn" style="margin-left: 8px" @click="onClearSearch">清除筛选</a>
        </div>
        <div v-else class="sp-empty-text">暂无四层代理</div>
      </div>
      <div
        v-else
        class="sp-grid card-grid l5-card"
        :class="[`mode-${cardMode}`, { 'batch-mode': batchMode, batch: batchMode }]"
      >
        <template v-for="g in renderGroups" :key="g.clusterId">
          <!-- 集群分组带（仅分组视图）：只报规模 + 次要指标，状态计数归顶部 chips 行 -->
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
            <!-- 平铺视图集群条（分组视图隐藏，集群信息由分组带承担） -->
            <div class="lp-strip">
              <span class="lp-tag lp-cluster">{{ p.cluster_name || '-' }}</span>
              <span v-if="p.cluster_group_name" class="lp-tag group lp-group">{{ p.cluster_group_name }}</span>
              <span class="st-algo"
                >负载均衡 · <b>{{ lbLabel(p.load_balance) }}</b></span
              >
            </div>
            <div class="lp-head no-wrap">
              <div class="lp-title">
                <span class="lp-hero">:{{ p.listen_port }}</span>
                <span class="lp-proto" :class="protoTone(p.scheme)">{{ protoLabel(p.scheme) }}</span>
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
              <div class="lp-row group-only">
                <span class="lp-k">负载均衡</span>
                <span class="lp-v">{{ lbLabel(p.load_balance) }}</span>
              </div>
              <div class="lp-row">
                <span class="lp-k">目标</span>
                <!-- 目标 IP 可能多条且需逐条核对 → 完整呈现、允许折行（r19：不做单行化/裁剪） -->
                <div class="lp-chips">
                  <span v-for="(t, i) in p.targets ?? []" :key="i" class="tg-chip"
                    >{{ t.target }}<span class="tg-w">{{ t.weight }}</span></span
                  >
                  <span v-if="!p.targets || p.targets.length === 0" class="lp-v dim">无目标</span>
                </div>
                <span v-if="p.targets && p.targets.length" class="lp-cnt">{{ p.targets.length }} 个</span>
              </div>
            </div>
            <!-- 发布未完全生效：卡内危险提示（四档警示语义：危险 = 实心红三角 + 可执行动作）。
                 文案两态（republish-failed-nodes D3/D4）：默认泛化；点「重发失败节点」解析成功后升级为具体节点 -->
            <div v-if="p.last_publish_status === 'partial' && !p.pending_publish" class="lp-notice alert alert-error">
              <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
              <span class="n-txt">{{ partialNoticeText(p) }}</span>
              <button class="n-act" :disabled="republishLoading" @click.stop="republishFailedNodes(p)">
                {{ republishLoading ? '获取失败节点…' : '重发失败节点' }}
              </button>
              <button class="n-act ghost" @click.stop="openPublishPreview(p)">查看差异</button>
            </div>
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
                    <span class="mi-sub">删平台配置，可同步删 Edge 监听规则（弹窗可选）</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Create/Edit Form Wizard (component) -->
    <StreamProxyFormWizard
      :visible="wizardVisible"
      :clusters="clusters"
      :editing-proxy="editingProxy"
      :default-proxy-type="proxyType"
      with-publish-guide
      @close="closeWizard"
      @saved="onWizardSaved"
      @publish-requested="onWizardPublishRequested"
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
      :preselected-node-ids="publishPreselected"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />

    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="previewRecord?.cluster_id ?? null"
      :resource-type="'stream_proxy'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.name"
      @publish="onPreviewPublish"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message } from 'ant-design-vue'
import ClusterSelect from '@/components/ClusterSelect.vue'
import ClusterBand from '@/components/ClusterBand.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { useCardClusterGrouping } from '@/composables/useCardClusterGrouping'
import { useBatchDelete } from '@/composables/useBatchDelete'
import { clusterHueClass } from '@/utils/clusterHue'
import type { StreamProxy } from '@/types'
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
import TableToolbar from '@/components/TableToolbar.vue'

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
  schemeFilter,
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

// ── 集群分组 / 平铺双视图（filter-architecture，AGENTS #87）──
// 分组：每集群一条 band（只报规模 + 目标数），卡片内不重复集群标识；平铺：无 band，卡片顶条带集群。
// 折叠整条 band 可点 + 「全部收起/展开」；进页默认全展开。次要指标取目标总数（band 右端）。
/** 四层代理卡片在分组/平铺视图里的最小形状（比完整 StreamProxy 窄，便于复用分组组合式） */
type ProxyCardRow = StreamProxy & { cluster_group_name?: string }

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
} = useCardClusterGrouping<ProxyCardRow>({
  rows: () => displayedProxies.value as ProxyCardRow[],
  unit: '个四层代理',
  clusterIdOf: (p) => p.cluster_id,
  clusterNameOf: (p) => p.cluster_name,
  groupNameOf: (p) => p.cluster_group_name,
  secondary: (rows) => `目标 ${rows.reduce((n, p) => n + (p.targets?.length ?? 0), 0)} 个`,
})

/** 渲染用分组：分组视图按集群分堆；平铺视图收敛为单个伪组（band 不渲染，卡片全量） */
const renderGroups = computed(() =>
  cardMode.value === 'group'
    ? cardGroups.value
    : [
        {
          clusterId: -1,
          clusterName: '',
          groupName: '',
          hueClass: 'cluster-c1',
          rows: displayedProxies.value as ProxyCardRow[],
          count: displayedProxies.value.length,
        },
      ],
)

// 协议筛选：状态由 useStreamProxyList 的 schemeFilter 持有（随请求下发 `scheme`，
// 后端按 `StreamProxy.scheme` 过滤——曾被写成页面局部 ref 且从未参与过滤/请求，等于摆设）

/** 工具条刷新（TableToolbar @refresh）：重取集群与列表 */
async function refreshList(): Promise<void> {
  await loadClusters()
  await loadProxies()
}

/** 集群切换：清上游等联动筛选后重取（与路由页同名语义） */
function onClusterChange(): void {
  loadProxies()
}

/** 卡片 ⋯ 菜单（同屏只开一个；点外部关闭；空间不足时向上翻转） */
const openMenuId = ref<number | null>(null)
/** 打开中的菜单是否向上弹（r15-4：末行卡片下方空间不足时会落到视口外） */
const menuFlipUp = ref(false)
function toggleCardMenu(id: number, event?: MouseEvent): void {
  if (openMenuId.value === id) {
    openMenuId.value = null
    return
  }
  openMenuId.value = id
  // 预估菜单高度（4 条目 + 分隔线 ≈ 196px）；锚点下方不足即向上弹
  const anchor = (event?.currentTarget as HTMLElement | null) ?? null
  const rect = anchor?.getBoundingClientRect()
  const MENU_H = 200
  menuFlipUp.value = rect ? rect.bottom + MENU_H > window.innerHeight : false
}
function closeCardMenu(): void {
  openMenuId.value = null
}
function onDocClick(): void {
  if (openMenuId.value !== null) openMenuId.value = null
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

/** ⋯ 菜单条目：先关菜单再执行（模板多语句会被 prettier 重排破坏编译，故提为函数，#25） */
function menuView(p: StreamProxy): void {
  closeCardMenu()
  viewProxy(p)
}
function menuEdit(p: StreamProxy): void {
  closeCardMenu()
  editProxy(p)
}
function menuVersion(p: StreamProxy): void {
  closeCardMenu()
  openVersionManagement(p)
}
function menuDelete(p: StreamProxy): void {
  closeCardMenu()
  deleteProxy(p)
}

/** 卡内「发布未完全生效」文案：默认泛化；「重发失败节点」解析成功后升级为具体失败节点（republishNotices 会话缓存）。
 *  （历史注：此函数曾按 last_publish_detail.failed_nodes 拼文案，但 StreamProxy 无该列、列表也不下发——恒走泛化兜底） */
function partialNoticeText(p: ProxyCardRow): string {
  // 三级回退（D11）：持久化明细（方案 B，打开即见）→ 会话内预览解析缓存 → 泛化
  return (
    noticeTextFromPublishDetail(p?.last_publish_detail) ??
    republishNotices.value[p.id] ??
    '发布未完全生效，请查看发布差异'
  )
}

/** 协议标签与色调（设计 .lp-proto 三态：tcp / udp / tls） */
function protoLabel(scheme?: string | null): string {
  const v = String(scheme ?? '').toLowerCase()
  if (v.includes('tls') || v === 'https') return 'TLS'
  if (v.includes('udp')) return 'UDP'
  return 'TCP'
}
function protoTone(scheme?: string | null): string {
  return protoLabel(scheme).toLowerCase()
}

/** 批量态：某组已选数量 / 整组全选切换（band 右端「全选本组 / 取消本组」） */
function selectedCountInGroup(rows: ProxyCardRow[]): number {
  return rows.filter((p) => selectedProxyIds.value.includes(p.id)).length
}
function toggleGroupSelect(rows: ProxyCardRow[]): void {
  const ids = rows.map((p) => p.id)
  const allSelected = ids.every((id) => selectedProxyIds.value.includes(id))
  selectedProxyIds.value = allSelected
    ? selectedProxyIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedProxyIds.value, ...ids])]
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

// ── 重发失败节点（republish-failed-nodes：预览取失败集合并预选，AGENTS D5 单一实现）──
const { loading: republishLoading, resolve: resolveFailedNodes } = useRepublishFailedNodes()
// 解析成功后的具体文案缓存（会话内按资源 id；主键全库唯一）
const republishNotices = ref<Record<number, string>>({})
const publishPreselected = ref<number[]>([])

async function republishFailedNodes(p: StreamProxy): Promise<void> {
  const outcome = await resolveFailedNodes({ id: p.id, cluster_id: p.cluster_id }, 'stream_proxy')
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

function goStatus(key: StatusKey) {
  statusFilter.value = key
}

type StatusKey = 'all' | 'unpublished' | 'pending' | 'published' | 'partial'
const statusTabs = computed<{ key: StatusKey; label: string; count: number }[]>(() => [
  { key: 'all', label: '全部', count: totalCount.value },
  { key: 'unpublished', label: '未发布', count: statusCounts.value.unpublished },
  { key: 'pending', label: '待发布', count: statusCounts.value.pending },
  { key: 'published', label: '已发布', count: statusCounts.value.published },
  { key: 'partial', label: '部分失败', count: statusCounts.value.partial },
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
  publishPreselected.value = []
  vmVisible.value = false
  publishVisible.value = true
}

/** 集群 id → 显示名（批量删除节点清单标注归属集群） */
function clusterNameById(id: number): string {
  const c = clusters.value.find((x: any) => x.id === id)
  return c ? c.display_name || c.name || `集群 ${id}` : `集群 ${id}`
}

/** 批量删除（统一入口 composable/useBatchDelete，AGENTS #88 ⑪） */
const batchDelete = useBatchDelete<any>({
  label: '四层代理',
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
  subsetConsequence: '未选中的 {n} 个节点将保留该四层代理',
})

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

// ── Lifecycle ──

onMounted(async () => {
  const clusterId = route.query.cluster_id as string | undefined
  const numeric = Number(clusterId)
  if (Number.isFinite(numeric)) clusterFilter.value = numeric
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

/** 页头徽标（#86② 补充维度）：涉及集群数 + 目标总数 */
const headerStatItems = computed(() => [
  { value: new Set(proxies.value.map((p) => p.cluster_id)).size, label: '集群' },
  { value: proxies.value.reduce((n, p) => n + (p.targets?.length ?? 0), 0), label: '个目标' },
])
</script>

<style scoped>
.sp-page:has(.sp-batch-bar) {
  padding-bottom: 80px;
}
/* ── 状态分段控件（连接式 segmented，方案 A）──────────────────────── */

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
/* 分组视图：集群信息由分组带承担，卡内顶条隐藏；折叠组内卡片隐藏 */
.sp-card.is-folded {
  display: none;
}
/* 平铺视图：左缘集群色条（色相 cluster-cN，与 band / 列表页集群列同源） */
.mode-flat .sp-card {
  border-left: 4px solid var(--cc, var(--border));
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

/* 网格/卡片容器断点已上移共享 .card-grid（style.css） */
</style>
