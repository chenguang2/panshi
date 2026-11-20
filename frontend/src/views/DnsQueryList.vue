<template>
  <div class="dq-page">
    <PageHeader
      title="DNS 代理（HTTP）"
      description="管理 DNS 代理路由（DoH 域名解析转发），基于 dns_upstream 插件实现"
    >
      <template #actions>
        <!-- AGENTS #88 ⑦：批量管理（secondary）在「新建」（primary）左侧 -->
        <button class="btn btn-secondary" :aria-pressed="batchMode" @click="toggleBatchMode">
          {{ batchMode ? '退出批量管理' : '批量管理' }}
        </button>
        <button class="btn btn-primary" @click="openCreateForm">
          <StrokeIcon name="plus" :size="13" /> 新建 DNS 代理路由
        </button>
      </template>
    </PageHeader>

    <!-- 工具条 + 状态行 + 批量条（AGENTS #87/#88：与列表页、其余卡片页同构）-->
    <div class="l5-card sp-card-page">
      <TableToolbar
        v-model:mode="cardMode"
        :count="totalCount"
        count-unit="条 DNS 代理路由"
        :show-count="false"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <SearchInput
            v-model="searchText"
            placeholder="搜索 DNS 代理路由名称..."
            :width="150"
            @input="onSearch"
            @clear="loadRoutes"
          />
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
            @change="loadRoutes"
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
            v-for="t in statusChips"
            :key="t.key"
            type="button"
            class="f-chip chip-status"
            :class="{ active: statusFilter === t.key, empty: t.count === 0 }"
            :aria-pressed="statusFilter === t.key ? 'true' : 'false'"
            @click="statusFilter = t.key"
          >
            {{ t.label }}<span class="f-count">{{ t.count }}</span>
          </button>
        </div>
        <span class="t-spacer"></span>
      </div>

      <!-- 批量条（AGENTS #88 ③）：状态行下、网格上、随流；只有「批量删除」 -->
      <div v-if="batchMode" class="l5-batchbar batchbar-dynamic" :class="{ 'has-sel': selectedIds.length > 0 }">
        <span class="b-count">已选 {{ selectedIds.length }} 项</span>
        <span class="b-sep"></span>
        <button class="btn btn-danger btn-sm need-sel" :disabled="selectedIds.length === 0" @click="batchDelete">
          <StrokeIcon name="trash" :size="12" /> 批量删除
        </button>
        <span class="b-spacer"></span>
        <button class="link-btn" @click="toggleSelectAllFiltered">
          {{ allFilteredSelected ? '取消全选结果' : '全选当前筛选结果' }}
        </button>
        <button class="link-btn" @click="clearSelection">清除选择</button>
      </div>

      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="displayedRoutes.length === 0" class="dq-empty">
        <template v-if="hasActiveFilters">
          <div class="dq-empty-icon">◎</div>
          <div class="dq-empty-text">无匹配结果</div>
          <button class="btn btn-secondary" style="margin-top: 12px" @click="clearFilters">清空筛选</button>
        </template>
        <template v-else>
          <div class="dq-empty-icon">&#9635;</div>
          <div class="dq-empty-text">暂无 DNS 代理路由</div>
          <button class="btn btn-primary" style="margin-top: 12px" @click="openCreateForm">+ 新建 DNS 代理路由</button>
        </template>
      </div>
      <div
        v-else
        class="dq-grid card-grid l5-card sp-cards"
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
            v-for="r in g.rows"
            :key="r.id"
            class="dq-card std-card l5-panel"
            :class="[
              clusterHueClass(r.cluster_id),
              {
                selected: selectedIds.includes(r.id),
                'is-selected': selectedIds.includes(r.id),
                'is-folded': cardMode === 'group' && !groupVisible(g.clusterId),
              },
            ]"
            @click="batchMode && toggleSelect(r.id)"
          >
            <span class="lp-check" aria-hidden="true"></span>
            <div class="lp-strip">
              <span class="lp-tag lp-cluster">{{ r.cluster_name || '-' }}</span>
              <span v-if="r.cluster_group_name" class="lp-tag group lp-group">{{ r.cluster_group_name }}</span>
              <span class="st-algo"
                >上游 · <b>{{ upstreamGroups(r).length }}</b> 组</span
              >
            </div>
            <div class="lp-head">
              <div class="lp-title">
                <span class="lp-hero sm">{{ r.uri }}</span>
                <span class="lp-name" :title="r.name">{{ r.name }}</span>
              </div>
              <div class="lp-status status-cell-flex">
                <PublishStatusTag
                  :version="r.current_version"
                  :published-at="r.published_at"
                  :pending="r.pending_publish === true"
                  :last-publish-status="r.last_publish_status"
                />
                <PublishDiffButton
                  :pending="r.pending_publish === true"
                  :last-publish-status="r.last_publish_status"
                  @click.stop="openPublishPreview(r)"
                />
              </div>
            </div>
            <div class="lp-body">
              <!-- 域名行：首域名 + `+N` + 算法胶囊（算法为分类值 → 胶囊） -->
              <div class="lp-row">
                <span class="lp-k">域名</span>
                <span class="lp-v split">
                  <span v-if="domains(r).length" class="tr mono" :title="domains(r).join('、')">
                    {{ domains(r)[0]
                    }}<span v-if="domains(r).length > 1" class="m-more">+{{ domains(r).length - 1 }}</span>
                  </span>
                  <span v-else class="lp-v dim">未配置</span>
                  <span v-if="domains(r).length" class="lp-algo">{{ dnsLbLabel(firstHostType(r)) }}</span>
                </span>
              </div>
              <!-- 上游行：AGENTS #87 ②（r19）——列表型关键信息两态都显示、完整呈现可折行 -->
              <div class="lp-row">
                <span class="lp-k">上游</span>
                <div class="lp-chips">
                  <span v-for="up in upstreamGroups(r)" :key="up" class="tg-chip">{{ up }}</span>
                  <span v-if="!upstreamGroups(r).length" class="lp-v dim">未配置</span>
                </div>
                <span v-if="upstreamGroups(r).length" class="lp-cnt">{{ upstreamGroups(r).length }} 组</span>
              </div>
            </div>
            <!-- 部分失败：文案两态（republish-failed-nodes D3/D4）+ 重发 / 查看差异双动作 -->
            <div v-if="r.last_publish_status === 'partial' && !r.pending_publish" class="lp-notice alert alert-error">
              <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
              <span class="n-txt">{{ partialNoticeText(r) }}</span>
              <button class="n-act" :disabled="republishLoading" @click.stop="republishFailedNodes(r)">
                {{ republishLoading ? '获取失败节点…' : '重发失败节点' }}
              </button>
              <button class="n-act ghost" @click.stop="openPublishPreview(r)">查看差异</button>
            </div>
            <div class="lp-foot" @click.stop>
              <button class="op-pub" @click="publishRouteAction(r)">发布</button>
              <div class="menu-anchor">
                <button
                  type="button"
                  class="op-btn"
                  title="更多操作"
                  aria-label="更多操作"
                  @click.stop="toggleCardMenu(r.id, $event)"
                >
                  <StrokeIcon name="dots" :size="14" />
                </button>
                <div class="l5-menu" :class="{ open: openMenuId === r.id, 'flip-up': menuFlipUp }">
                  <button class="mi" @click="menuView(r)">
                    <span class="mi-main">查看</span>
                  </button>
                  <button class="mi" @click="menuEdit(r)">
                    <span class="mi-main">编辑</span>
                  </button>
                  <button class="mi" @click="menuVersion(r)">
                    <span class="mi-main">版本管理</span>
                    <span class="mi-sub">历史版本查看与回滚</span>
                  </button>
                  <hr class="menu-sep" />
                  <button class="mi danger" @click="menuDelete(r)">
                    <span class="mi-main">删除</span>
                    <span class="mi-sub">删平台配置，可同步删 Edge 路由（弹窗可选）</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <DnsQueryFormModal
      :visible="formVisible"
      :clusters="clusters"
      :editing-route="editingRoute"
      @close="closeRouteForm"
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
      title="发布 DNS 代理路由"
      :cluster-id="publishClusterId"
      :preselected-node-ids="publishPreselected"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />

    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="previewRecord?.cluster_id ?? null"
      :resource-type="'route'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.name"
      @publish="onPreviewPublish"
    />

    <!-- View Drawer -->
    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: viewVisible ? 'flex' : 'none' }">
        <div class="modal" style="max-width: 640px">
          <div class="modal-header">
            <h2>查看 DNS 代理路由 - {{ viewingRoute?.name }}</h2>
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
                <span class="view-value view-mono" title="DoH 请求入口路径（DNS over HTTP 客户端访问的路径）">{{
                  viewingRoute.uri
                }}</span>
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
                  <span v-if="viewingRoute.current_version" class="badge badge-success"
                    ><span class="status-dot online"></span>已发布</span
                  >
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
                      <span v-if="cidrs && cidrs.length > 0" class="view-node-cidrs"
                        >CIDR: {{ (Array.isArray(cidrs) ? cidrs : []).join(', ') }}</span
                      >
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
            <button class="btn btn-primary" @click="editFromView">编辑</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import ClusterSelect from '@/components/ClusterSelect.vue'
import api from '@/api'
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import PageHeader from '@/components/PageHeader.vue'
import DnsQueryFormModal from '@/components/DnsQueryFormModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { formatDate } from '@/utils/format'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import SearchInput from '@/components/SearchInput.vue'
import TableToolbar from '@/components/TableToolbar.vue'
import ClusterBand from '@/components/ClusterBand.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import { useCardClusterGrouping } from '@/composables/useCardClusterGrouping'
import { useBatchDelete } from '@/composables/useBatchDelete'
import { useRepublishFailedNodes, noticeTextFromPublishDetail } from '@/composables/useRepublishFailedNodes'
import { clusterHueClass } from '@/utils/clusterHue'
import { getClusterNodes } from '@/api/clusters'
import { PAGE_SIZE_DROPDOWN } from '@/constants'

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
    ewma: 'EWMA',
    least_conn: '最少连接',
  }
  return map[algo || ''] || algo || '轮询'
}

// 批 3：健康检查类型规范化显示（https→HTTPS；未知值原样）
function dnsCheckLabel(type: string | undefined): string {
  const t = type || 'http'
  return /^https?$/i.test(t) ? t.toUpperCase() : t
}

function dnsDomainCount(r: any): number {
  const hosts = dnsHosts(r)
  return hosts ? Object.keys(hosts).length : 0
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
    const cfg = typeof plugin.config === 'string' ? JSON.parse(plugin.config) : plugin.config || {}
    return cfg?.hosts || null
  } catch {
    return null
  }
}

/** 卡片域名清单（首个 + `+N`） */
function domains(r: any): string[] {
  const hosts = dnsHosts(r)
  return hosts ? Object.keys(hosts) : []
}

/** 首个域名的负载均衡算法（算法为分类值 → 胶囊） */
function firstHostType(r: any): string | undefined {
  const hosts = dnsHosts(r)
  const first = hosts ? Object.values(hosts)[0] : undefined
  return first?.type
}

/** 上游清单（所有域名的 dns_upstream 节点地址，去重保持顺序） */
function upstreamGroups(r: any): string[] {
  const hosts = dnsHosts(r)
  if (!hosts) return []
  const out: string[] = []
  for (const entry of Object.values(hosts)) {
    for (const addr of Object.keys(entry.nodes || {})) {
      if (!out.includes(addr)) out.push(addr)
    }
  }
  return out
}

/** 集群 id → 显示名（批量删除节点清单标注归属集群用） */
function clusterNameById(id: number): string {
  const c = clusters.value.find((x: any) => x.id === id)
  return c ? c.display_name || c.name || `集群 ${id}` : `集群 ${id}`
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
    const msg = typeof detail === 'string' ? detail : e?.message || '加载 DNS 代理路由失败'
    message.error(msg)
  } finally {
    loading.value = false
  }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch {
    /* ignore */
  }
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

// 批 3：查看 → 编辑一次直达（关闭查看、打开编辑同一路由）
function editFromView() {
  if (!viewingRoute.value) return
  const r = viewingRoute.value
  viewVisible.value = false
  editRoute(r)
}

// ── Form ──

const formVisible = ref(false)
const editingRoute = ref<any | null>(null)

function closeRouteForm(): void {
  formVisible.value = false
  editingRoute.value = null
}

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

// ── 重发失败节点（republish-failed-nodes：预览取失败集合并预选，单一实现）──
const { loading: republishLoading, resolve: resolveFailedNodes } = useRepublishFailedNodes()
// 解析成功后的具体文案缓存（会话内按资源 id；主键全库唯一）
const republishNotices = ref<Record<number, string>>({})
const publishPreselected = ref<number[]>([])

/** 卡内「发布未完全生效」文案：默认泛化；解析成功后升级为具体失败节点 */
function partialNoticeText(r: any): string {
  // 三级回退（D11）：持久化明细（方案 B，打开即见）→ 会话内预览解析缓存 → 泛化
  return (
    noticeTextFromPublishDetail(r?.last_publish_detail) ??
    republishNotices.value[r?.id] ??
    '发布未完全生效，请查看发布差异'
  )
}

async function republishFailedNodes(r: any): Promise<void> {
  const outcome = await resolveFailedNodes({ id: r.id, cluster_id: r.cluster_id }, 'route')
  if (!outcome) return
  if (outcome.ok && outcome.noticeText) {
    republishNotices.value[r.id] = outcome.noticeText
    publishingRoute.value = r
    publishClusterId.value = r.cluster_id
    publishPreselected.value = outcome.failedNodeIds
    publishVisible.value = true
  } else {
    message.warning('未能获取失败节点，请通过「查看差异」排查')
  }
}

function publishRouteAction(r: any) {
  publishingRoute.value = r
  publishClusterId.value = r.cluster_id
  // 常规发布不带预选（仅「重发失败节点」入口设置；防上一次重发残留）
  publishPreselected.value = []
  publishVisible.value = true
}

// 发布差异预览（publish-diff-preview）：修复死按钮——此前只有 openPublishPreview 置 ref、模板无弹窗
const previewVisible = ref(false)
const previewRecord = ref<any | null>(null)

function openPublishPreview(r: any) {
  previewRecord.value = r
  previewVisible.value = true
}

function onPreviewPublish() {
  const r = previewRecord.value
  previewVisible.value = false
  if (r) publishRouteAction(r)
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const r = publishingRoute.value
  if (!r) return
  await executePublish({
    title: `发布 DNS 代理路由: ${r.name}`,
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
  } catch {
    /* ignore */
  }

  showDeleteConfirm({
    title: `确定要删除 DNS 代理路由 "${r.name}" 吗？`,
    apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除 DNS 代理路由: ${r.name}`,
        apiEndpoint: `/clusters/${r.cluster_id}/routes/${r.id}`,
        cluster: { id: r.cluster_id, nodes },
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadRoutes,
        clearSelectedFn: () => {},
      })
    },
  })
}

// ── 发布状态 chips（带计数；本页全量拉取，前端聚合）──
type StatusKey = 'all' | 'unpublished' | 'pending' | 'published' | 'partial'
const statusFilter = ref<StatusKey>('all')

function statusOf(r: any): Exclude<StatusKey, 'all'> {
  if (r.pending_publish === true) return 'pending'
  if (r.last_publish_status === 'partial') return 'partial'
  if (r.current_version) return 'published'
  return 'unpublished'
}

const statusChips = computed(() => {
  const c = { unpublished: 0, pending: 0, published: 0, partial: 0 }
  routes.value.forEach((r: any) => c[statusOf(r)]++)
  return [
    { key: 'all' as StatusKey, label: '全部', count: totalCount.value },
    { key: 'unpublished' as StatusKey, label: '未发布', count: c.unpublished },
    { key: 'pending' as StatusKey, label: '待发布', count: c.pending },
    { key: 'published' as StatusKey, label: '已发布', count: c.published },
    { key: 'partial' as StatusKey, label: '部分失败', count: c.partial },
  ]
})

const displayedRoutes = computed(() =>
  statusFilter.value === 'all'
    ? sortedRoutes.value
    : sortedRoutes.value.filter((r: any) => statusOf(r) === statusFilter.value),
)

const hasActiveFilters = computed(
  () => searchText.value.trim() !== '' || clusterFilter.value !== '' || groupFilter.value !== '__all__',
)

function clearFilters(): void {
  searchText.value = ''
  clusterFilter.value = ''
  groupFilter.value = '__all__'
  loadRoutes()
}

async function refreshList(): Promise<void> {
  await loadClusters()
  await loadRoutes()
}

// ── 集群分组 / 平铺双视图（AGENTS #87/#88）──
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
  rows: () => displayedRoutes.value,
  unit: '条 DNS 代理路由',
  clusterIdOf: (r) => r.cluster_id,
  clusterNameOf: (r) => r.cluster_name,
  groupNameOf: (r) => r.cluster_group_name,
  secondary: (rows) => {
    const ups = new Set<string>()
    rows.forEach((r) => upstreamGroups(r).forEach((u) => ups.add(u)))
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
          rows: displayedRoutes.value,
          count: displayedRoutes.value.length,
        },
      ],
)

// ── 批量管理（只有「批量删除」）──
const batchMode = ref(false)
const selectedIds = ref<number[]>([])
const selectedRoutes = computed(() => routes.value.filter((r: any) => selectedIds.value.includes(r.id)))
const allFilteredSelected = computed(
  () => displayedRoutes.value.length > 0 && displayedRoutes.value.every((r: any) => selectedIds.value.includes(r.id)),
)

function toggleBatchMode(): void {
  batchMode.value = !batchMode.value
  if (!batchMode.value) selectedIds.value = []
}
function toggleSelect(id: number): void {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((x) => x !== id)
    : [...selectedIds.value, id]
}
function clearSelection(): void {
  selectedIds.value = []
}
function toggleSelectAllFiltered(): void {
  if (allFilteredSelected.value) {
    const ids = new Set(displayedRoutes.value.map((r: any) => r.id))
    selectedIds.value = selectedIds.value.filter((id) => !ids.has(id))
  } else {
    selectedIds.value = [...new Set([...selectedIds.value, ...displayedRoutes.value.map((r: any) => r.id)])]
  }
}
function selectedCountInGroup(rows: any[]): number {
  return rows.filter((r) => selectedIds.value.includes(r.id)).length
}
function toggleGroupSelect(rows: any[]): void {
  const ids = rows.map((r) => r.id)
  const allSelected = ids.every((id) => selectedIds.value.includes(id))
  selectedIds.value = allSelected
    ? selectedIds.value.filter((id) => !ids.includes(id))
    : [...new Set([...selectedIds.value, ...ids])]
}

/** 批量删除（统一入口 composable/useBatchDelete，AGENTS #88 ⑪） */
const batchDelete = useBatchDelete<any>({
  label: 'DNS 代理路由',
  endpoint: '/routes',
  idField: 'route_ids',
  nameField: 'route_name',
  rows: () => selectedRoutes.value,
  ids: () => selectedIds.value,
  nameOf: (r: any) => r.name,
  clusterIdOf: (r: any) => r.cluster_id,
  clusterNameOf: clusterNameById,
  refresh: loadRoutes,
  clearSelection: () => clearSelection(),
  exitBatch: () => toggleBatchMode(),
  subsetConsequence: '未选中的 {n} 个节点将保留该 DNS 代理路由',
})

// ── ⋯ 菜单（同屏只开一个；空间不足向上翻转，AGENTS #88 ⑥）──
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

function menuView(r: any): void {
  closeCardMenu()
  viewRoute(r)
}
function menuEdit(r: any): void {
  closeCardMenu()
  editRoute(r)
}
function menuVersion(r: any): void {
  closeCardMenu()
  openVersionManagement(r)
}
function menuDelete(r: any): void {
  closeCardMenu()
  deleteRoute(r)
}

/** 发布差异预览（与 ⋯ 菜单并列的圆形按钮） */

// ── Lifecycle ──

onMounted(async () => {
  const clusterId = route.query.cluster_id as string | undefined
  const numeric = Number(clusterId)
  if (Number.isFinite(numeric)) clusterFilter.value = numeric
  await loadClusters()
  loadRoutes()
})
</script>

<style scoped>
.dq-header-actions {
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
.dq-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}
.dq-empty-icon {
  font-size: 40px;
  color: var(--muted);
  margin-bottom: 12px;
  opacity: 0.4;
}
.dq-empty-text {
  font-size: 14px;
  color: var(--muted);
}

/* 网格与卡片容器样式已上移共享 .card-grid / .std-card（style.css 卡片一致性单点） */
.dq-card-topbar {
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
.dq-topbar-name {
  font-weight: 600;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dq-hosts-count {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 6px;
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
.dq-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  padding: 12px 20px 0;
}
.dq-card-info {
  flex: 1;
}
.dq-card-name {
  font-size: 14px;
  font-weight: 600;
}
.dq-card-desc {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  line-height: 1.5;
}
.dq-card-meta {
  text-align: right;
  flex-shrink: 0;
  margin-left: 12px;
}
.dq-version-text {
  white-space: nowrap;
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  font-family: var(--font-mono);
}
.dq-card-details {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-bottom: 8px;
  padding: 0 20px;
}
.dq-detail-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.dq-detail-label {
  font-size: 11px;
  color: var(--muted);
}
.dq-detail-value {
  font-size: 12px;
  font-weight: 500;
  color: var(--fg);
}
.dq-uri {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
}

/* ── DNS Hosts ── */
.dq-card-hosts {
  padding: 0 20px 8px;
}
.dq-hosts-empty {
  padding-bottom: 12px;
}
.dq-host-domain {
  margin-bottom: 8px;
  padding: 8px;
  background: var(--bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}
.dq-host-domain-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  font-family: var(--font-mono);
  margin-bottom: 4px;
  word-break: break-all;
}
.dq-host-domain-lb {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.dq-algo-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: oklch(55% 0.14 160 / 16%);
  color: oklch(40% 0.14 160);
  border: 1px solid oklch(55% 0.14 160 / 28%);
  line-height: 1.5;
}
.dq-ttl-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: oklch(50% 0.1 260 / 14%);
  color: oklch(38% 0.1 260);
  border: 1px solid oklch(50% 0.1 260 / 24%);
  line-height: 1.5;
}
.dq-check-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: oklch(55% 0.14 30 / 16%);
  color: oklch(40% 0.14 30);
  border: 1px solid oklch(55% 0.14 30 / 28%);
  line-height: 1.5;
}
.dq-host-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.dq-node-tag {
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
.dq-no-hosts {
  font-size: 11px;
  color: var(--muted);
  font-style: italic;
}

/* ── Actions ── */
.dq-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: auto;
  padding: 10px 20px 16px;
  border-top: 1px solid var(--border);
}
.dq-action-btn {
  background: none !important;
  background-color: transparent !important;
}
.dq-action-btn:hover {
  background: var(--bg) !important;
}

/* ── View Drawer ── */
.view-body {
  padding: 0 4px;
}
.view-field {
  display: flex;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.view-label {
  width: 100px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}
.view-value {
  font-size: 13px;
  color: var(--fg);
}
.view-mono {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
}
.view-section {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
  padding: 16px 0 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.view-hosts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.view-host-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--bg);
}
.view-host-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  font-family: var(--font-mono);
  margin-bottom: 4px;
}
.view-host-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.view-host-meta-item {
  font-size: 11px;
  color: var(--muted);
  background: var(--surface);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.view-host-nodes {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.view-node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.view-node-ip {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
}
.view-node-cidrs {
  font-size: 11px;
  color: var(--muted);
}
.view-cidr-any {
  font-style: italic;
  opacity: 0.6;
}
.view-muted {
  font-size: 12px;
  color: var(--muted);
  font-style: italic;
  padding: 8px 0;
}

.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
}

/* 网格/卡片容器断点已上移共享 .card-grid（style.css） */
</style>
