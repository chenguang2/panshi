<template>
  <div class="dashboard">
    <PageHeader title="概览" description="平台资源统计与快捷入口">
      <template #actions>
        <span v-if="lastUpdated" class="updated-at">更新于 {{ lastUpdated }}</span>
        <button class="btn btn-secondary refresh-btn" :disabled="loading" @click="refreshAll">
          <StrokeIcon name="rotate" :size="13" />
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </template>
    </PageHeader>

    <!-- 全部已发起请求失败（D3：错误 > 空态 > 加载，绝不显示假 0） -->
    <div v-if="allFailed" class="load-banner load-banner-danger">
      <span>数据加载失败，请检查后端服务是否可用</span>
      <button class="btn btn-secondary banner-retry" :disabled="loading" @click="retryFailed">重试</button>
    </div>
    <div v-else-if="partialFailed" class="load-banner load-banner-partial">
      <span>部分数据加载失败：{{ failedLabels.join('、') }}，以下内容可能不完整</span>
      <button class="btn btn-secondary banner-retry" :disabled="loading" @click="retryFailed">重试</button>
    </div>

    <!-- ── 大数统计（403 防御：静默隐藏；设计稿 dstat：色相左条 + mono 大数） ── -->
    <template v-if="!denied.stats">
      <div v-if="loadErrors.stats" class="card area-error">
        <span class="area-error-text">加载失败</span>
        <button class="btn btn-secondary" :disabled="loading" @click="retryKey('stats')">重试</button>
      </div>
      <div v-else class="dash-stats" :class="{ 'dash-stats-loading': statsFirstLoading }">
        <router-link v-for="c in visibleStatCards" :key="c.key" :to="c.to" class="dstat" :class="statHueClass(c.key)">
          <span class="d-top" v-html="c.icon"></span>
          <span class="d-num">{{ statsLoaded ? stats[c.key] : '…' }}</span>
          <span class="d-sub">
            <template v-if="c.key === 'nodes'">{{ nodeSubtitle }}</template>
            <template v-else>{{ c.subtitle }}</template>
          </span>
          <span class="d-label">{{ c.label }}</span>
        </router-link>
      </div>
    </template>

    <!-- ── 三列状态卡（集群 / 节点连通状态 / 最近创建的路由；无权限不渲染且不请求） ── -->
    <div class="dash-cards">
      <!-- 集群 -->
      <template v-if="canClustersCard">
        <div v-if="loadErrors.clusters" class="card area-error">
          <span class="area-error-text">加载失败</span>
          <button class="btn btn-secondary" :disabled="loading" @click="retryKey('clusters')">重试</button>
        </div>
        <div v-else class="dash-card">
          <div class="dc-head">
            <span class="dc-title">集群</span>
            <span v-if="clusterStatus.length" class="dc-badge">{{ clusterStatus.length }} 总数</span>
            <span class="t-spacer"></span>
            <router-link to="/clusters" class="dc-link">查看全部集群 →</router-link>
          </div>
          <table v-if="clusterStatus.length">
            <tbody>
              <tr v-for="c in clusterStatus" :key="c.id">
                <td>
                  <span class="c-strong">{{ c.display_name || c.name }}</span>
                  <span class="c-dim c-mono"> {{ c.name }}</span>
                </td>
                <td class="c-c">
                  <span class="ps-tag" :class="c.status === 1 ? 'ps-pub' : 'ps-unpub'">{{
                    c.status === 1 ? '已启用' : '已禁用'
                  }}</span>
                </td>
                <td class="c-r">
                  <span
                    class="c-mono c-dim"
                    :class="{ 'c-warn': (c.healthy_node_count || 0) < (c.node_count || 0) && (c.node_count || 0) > 0 }"
                    title="健康节点 / 节点总数"
                    >{{ c.healthy_node_count || 0 }}/{{ c.node_count || 0 }}</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else-if="!loading" class="dc-empty">
            <router-link to="/clusters" class="empty-cta">
              {{ isAdmin ? '还没有集群，去创建' : '暂无可见集群，前往集群管理' }} →
            </router-link>
          </div>
          <div v-else class="dc-empty"><span class="c-dim">加载中…</span></div>
        </div>
      </template>

      <!-- 节点连通状态 -->
      <template v-if="canNodesCard">
        <div v-if="loadErrors.nodes" class="card area-error">
          <span class="area-error-text">加载失败</span>
          <button class="btn btn-secondary" :disabled="loading" @click="retryKey('nodes')">重试</button>
        </div>
        <div v-else class="dash-card">
          <div class="dc-head">
            <span class="dc-title">节点连通状态</span>
            <span v-if="nodesLoaded" class="dc-badges">
              <span class="dc-badge dc-ok">检测通过 {{ summaryPassed }}</span>
              <span v-if="summaryUntested" class="dc-badge">未检测 {{ summaryUntested }}</span>
              <span v-if="summaryFailed" class="dc-badge dc-bad">检测失败 {{ summaryFailed }}</span>
            </span>
          </div>
          <div v-if="nodesTruncated" class="truncate-notice">节点数超过明细上限，失败清单可能不完整</div>
          <table v-if="dashboardNodeRows.length">
            <tbody>
              <tr v-for="n in dashboardNodeRows" :key="n.id">
                <td>
                  <span class="c-mono c-strong">{{ n.ip }}</span
                  ><span class="c-dim c-mono">:{{ n.service_port }}</span>
                </td>
                <td class="c-dim">{{ n.cluster_name || clusterName(n.cluster_id) }}</td>
                <td class="c-r" style="width: 96px">
                  <span class="ps-tag" :class="n.status === 1 ? 'ps-pub' : 'ps-partial'">{{
                    n.status === 1 ? '检测通过' : '检测失败'
                  }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else-if="!loading" class="dc-empty">
            <router-link to="/nodes" class="empty-cta">
              {{ isAdmin ? '还没有节点，去添加' : '暂无可见节点，前往节点管理' }} →
            </router-link>
          </div>
          <div v-else class="dc-empty"><span class="c-dim">加载中…</span></div>
          <div v-if="dashboardNodeRows.length" class="dc-foot">
            <router-link to="/nodes" class="dc-link">查看全部节点 →</router-link>
          </div>
        </div>
      </template>

      <!-- 最近创建的路由 -->
      <template v-if="canRoutesCard">
        <div v-if="loadErrors.routes" class="card area-error">
          <span class="area-error-text">加载失败</span>
          <button class="btn btn-secondary" :disabled="loading" @click="retryKey('routes')">重试</button>
        </div>
        <div v-else class="dash-card">
          <div class="dc-head">
            <span class="dc-title">最近创建的路由</span>
            <span v-if="recentRoutes.length" class="dc-badge">{{ recentRoutes.length }} 条</span>
            <span class="t-spacer"></span>
            <router-link to="/routes" class="dc-link">查看全部路由 →</router-link>
          </div>
          <table v-if="recentRoutes.length">
            <tbody>
              <tr v-for="r in recentRoutes" :key="r.id">
                <td>
                  <span class="c-strong">{{ r.name }}</span>
                </td>
                <td>
                  <span class="pipe-uri">{{ r.uri }}</span>
                </td>
                <td class="c-r">
                  <span class="ps-tag" :class="routeTagCls(r)">{{ routeTagText(r) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else-if="!loading" class="dc-empty">
            <router-link to="/routes" class="empty-cta">
              {{ isAdmin ? '还没有路由，去创建' : '暂无可见路由，前往路由管理' }} →
            </router-link>
          </div>
          <div v-else class="dc-empty"><span class="c-dim">加载中…</span></div>
        </div>
      </template>
    </div>

    <!-- ── 快捷入口（运维操作 + 更多资源合并单卡；feature 圆点 + countKey 计数） ── -->
    <div v-if="visibleQuickLinks.length || visibleMoreLinks.length" class="quick-card">
      <span class="dc-title">快捷入口</span>
      <div class="quick-row">
        <router-link
          v-for="l in allQuickChips"
          :key="l.path"
          :to="l.path"
          class="quick-chip"
          :class="{ 'quick-chip-muted': l.muted }"
        >
          <span v-if="l.feature" class="q-dot" :class="{ off: !featuresStore.has(l.feature) }"></span>
          {{ l.title }}
          <span v-if="l.countKey && statsLoaded" class="q-cnt">{{ stats[l.countKey] }}</span>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import BadgeStatus from '@/components/BadgeStatus.vue'
import { listNodes } from '@/api/nodes'
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import { formatMonthDayTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import { useFeaturesStore } from '@/stores/features'
import type { Node } from '@/types'

const authStore = useAuthStore()
const featuresStore = useFeaturesStore()
const router = useRouter()

interface LinkItem {
  title: string
  path: string
}

/** 入口三元门控（D4）：与 AppSidebar 过滤谓词严格同源 */
interface Gate {
  permission?: string
  feature?: string
  adminOnly?: boolean
}

/** 过滤谓词（AppSidebar 同款）：无 permission / feature 关闭 / 非 admin 访问 adminOnly → 隐藏 */
function canEnter(item: Gate): boolean {
  return (
    (!item.permission || authStore.hasPermission(item.permission)) &&
    (!item.feature || featuresStore.has(item.feature)) &&
    (!item.adminOnly || authStore.user?.role === 'admin')
  )
}

/** 空态文案角色区分（restricted-data-scoping D5）：与侧边栏/概览权限过滤同源判定 */
const isAdmin = computed(() => authStore.user?.role === 'admin')

/** 节点行（响应另含 cluster_name，可直接展示所属集群） */
type NodeRow = Node & { cluster_name?: string }

/** 后端 /dashboard/stats 响应（2026-10-10 curl 实测：平铺计数含 nodes_online/nodes_untested） */
interface DashboardStats {
  clusters: number
  nodes: number
  nodes_online: number
  nodes_untested: number
  upstreams: number
  routes: number
  users: number
  plugin_configs: number
  global_rules: number
  static_resources: number
  plugin_metadata: number
}

/** 最近路由行（响应另含 cluster_name；created_at 由后端批次 1 补充） */
interface RecentRouteRow {
  id: number
  name: string
  uri: string
  status: number
  cluster_name?: string
  created_at?: string
  current_version?: number | null
}

/** 集群行（概览只需 id/name/display_name/status） */
interface ClusterRow {
  id: number
  name: string
  display_name?: string | null
  status: number
  node_count?: number
  healthy_node_count?: number
}

type LoadKey = 'stats' | 'clusters' | 'nodes' | 'routes'

const LOAD_LABELS: Record<LoadKey, string> = { stats: '统计', clusters: '集群', nodes: '节点', routes: '最近路由' }

const stats = ref<DashboardStats>({
  clusters: 0,
  nodes: 0,
  nodes_online: 0,
  nodes_untested: 0,
  upstreams: 0,
  routes: 0,
  users: 0,
  plugin_configs: 0,
  global_rules: 0,
  static_resources: 0,
  plugin_metadata: 0,
})

const recentRoutes = ref<RecentRouteRow[]>([])
const clusterStatus = ref<ClusterRow[]>([])
const nodes = ref<NodeRow[]>([])

// ── 三态编排（D3/D6）：loadAll 单点，请求粒度成败记入 loadErrors；403 防御性静默隐藏 ──
const loading = ref(false)
const loadErrors = ref<Partial<Record<LoadKey, boolean>>>({})
/** 403 = 预期的权限拒绝（权限键漂移等意外路径），隐藏该区且不计入错误横幅 */
const denied = ref<Partial<Record<LoadKey, boolean>>>({})
const statsLoaded = ref(false)
const nodesLoaded = ref(false)
/** 「更新于」时间锚点（D6）：本机时间，首次成功加载前不渲染 */
const lastUpdated = ref<string | null>(null)

/** chip 计数徽章（消费 stats 闲置计数）；风险副标注（D8）已随「数据库管理」红字提示移除——入口按钮只做跳转，风险提示归目标页 */
interface ChipExtra {
  countKey?: 'plugin_configs' | 'plugin_metadata' | 'global_rules' | 'static_resources' | 'users'
  muted?: boolean
}

/** 快捷入口 = 运维操作（键值映射见 D4，2026-10-10 从 AppSidebar 逐项核实；防漂移测试钉住） */
const quickLinks: Array<LinkItem & Gate & ChipExtra> = [
  { title: '节点任务中心', path: '/node-tasks', permission: 'task_center', feature: 'task_center' },
  { title: '审计日志', path: '/audit-log', permission: 'audit_logs', feature: 'audit_log' },
  {
    title: '数据库管理',
    path: '/database-management',
    permission: 'database_management',
    feature: 'database_management',
  },
  {
    title: 'Ansible 主机清单',
    path: '/ansible-inventory',
    permission: 'ansible_inventory',
    feature: 'ansible_inventory',
  },
  { title: '自启动管理', path: '/edge-autostart', permission: 'edge_autostart', feature: 'edge_autostart' },
  { title: 'Edge 直连', path: '/edge-client', permission: 'edge_nodes', feature: 'edge_client' },
  { title: '用户管理', path: '/users', adminOnly: true, countKey: 'users' },
]

/** 更多资源 = 配置与查询 */
const moreLinks: Array<LinkItem & Gate & ChipExtra> = [
  { title: '插件组', path: '/plugin-configs', permission: 'plugin_groups', countKey: 'plugin_configs' },
  { title: '插件元数据', path: '/plugin-metadata', permission: 'plugin_metadata', countKey: 'plugin_metadata' },
  { title: '全局规则', path: '/global-rules', permission: 'global_rules', countKey: 'global_rules' },
  { title: '静态资源', path: '/static-resources', permission: 'static_resources', countKey: 'static_resources' },
  { title: '指标总览', path: '/metrics/dashboard', permission: 'metrics', feature: 'metrics' },
]

const visibleQuickLinks = computed(() => quickLinks.filter(canEnter))
const visibleMoreLinks = computed(() => moreLinks.filter(canEnter))

/** 快捷入口单卡合并（dashboard-cluster-parity 3.4：设计稿单卡；运维组在前、资源组在后） */
const allQuickChips = computed(() => [...visibleQuickLinks.value, ...visibleMoreLinks.value])

/** 大数统计卡色相（设计稿：集群 c1 / 节点 c3 / 上游 c5 / 路由 c7） */
function statHueClass(key: string): string {
  return { clusters: 'cluster-c1', nodes: 'cluster-c3', upstreams: 'cluster-c5', routes: 'cluster-c7' }[key] ?? ''
}

/** 最近路由卡发布徽标（后端透出 current_version；「待发布」依赖 published_at 回查不引入——列表页为准） */
function routeTagText(r: { current_version?: number | null }): string {
  return r.current_version ? `v${r.current_version}` : '未发布'
}
function routeTagCls(r: { current_version?: number | null }): string {
  return r.current_version ? 'ps-pub' : 'ps-unpub'
}

interface StatCardItem extends Gate {
  key: 'clusters' | 'nodes' | 'upstreams' | 'routes'
  label: string
  subtitle: string
  accent: string
  to: string
  icon: string
}

const statCards: StatCardItem[] = [
  {
    key: 'clusters',
    label: '集群',
    subtitle: '多集群管理',
    accent: 'cluster',
    to: '/clusters',
    permission: 'clusters',
    icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="12" height="4" rx="1"/><rect x="5" y="8" width="8" height="3" rx="1"/><rect x="6" y="13" width="6" height="3" rx="1"/></svg>',
  },
  {
    key: 'nodes',
    label: '节点',
    subtitle: 'Edge 网关节点',
    accent: 'node',
    to: '/nodes',
    permission: 'nodes',
    icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="4" r="2"/><circle cx="4" cy="14" r="2"/><circle cx="14" cy="14" r="2"/><path d="M9 6v3M4 12l2-2M14 12l-2-2"/></svg>',
  },
  {
    key: 'upstreams',
    label: '上游',
    subtitle: '后端服务',
    accent: 'upstream',
    to: '/upstreams',
    permission: 'upstreams',
    icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v12M5 10l4 4 4-4M2 16h14"/></svg>',
  },
  {
    key: 'routes',
    label: '路由',
    subtitle: 'API 路由规则',
    accent: 'route',
    to: '/routes',
    permission: 'routes',
    icon: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l4-6v4h10v4H6v4l-4-6z"/></svg>',
  },
]

const visibleStatCards = computed(() =>
  statCards.map((c) => (c.key === 'nodes' ? { ...c, subtitle: nodeSubtitle.value } : c)).filter(canEnter),
)

const routeColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: 'URI', dataIndex: 'uri', key: 'uri' },
  { title: '集群', dataIndex: 'cluster_name', key: 'cluster_name' },
  { title: '状态', key: 'status' },
  { title: '创建时间', key: 'created_at' },
]

const clusterColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '显示名称', dataIndex: 'display_name', key: 'display_name' },
  { title: '状态', key: 'status' },
]

/** 失败节点明细列（D7：节点地址 mono / 所属集群 / 检测结果） */
const nodeColumns = [
  { title: '节点地址', key: 'addr' },
  { title: '所属集群', key: 'cluster' },
  { title: '检测结果', key: 'result' },
]

// 节点连通三态摘要（D5，批次 1 契约字段）：统一由 stats 派生——
// 通过 X = nodes_online − nodes_untested；未检测 Z = nodes_untested；失败 Y = nodes − nodes_online。
// listNodes 仅作失败节点明细来源，不参与摘要计数（明细与摘要可能短暂不一致，属允许瞬态）。
const summaryPassed = computed(() => Math.max(0, stats.value.nodes_online - stats.value.nodes_untested))
const summaryUntested = computed(() => stats.value.nodes_untested)
const summaryFailed = computed(() => Math.max(0, stats.value.nodes - stats.value.nodes_online))
/** 统计卡节点副标题（设计稿语义：健康 N · 离线 M；未检测属在线侧，由节点卡徽章表达） */
const nodeSubtitle = computed(() =>
  statsLoaded.value ? `健康 ${stats.value.nodes_online} · 离线 ${summaryFailed.value}` : '加载中…',
)
/** 明细截断：listNodes 达分页上限时失败清单可能不完整（软措辞兜住恰好 500 的假阳性） */
const nodesTruncated = computed(() => nodes.value.length >= PAGE_SIZE_CARD_GRID)

/** 卡内明细行（21.10 设计稿混排：失败节点在前、通过节点补齐，上限 8 行——失败永远可见） */
const dashboardNodeRows = computed(() => {
  const failed = nodes.value.filter((n) => n.status !== 1)
  const passed = nodes.value.filter((n) => n.status === 1)
  return [...failed, ...passed].slice(0, 8)
})
// 明细行（仅检测失败节点，TableCard 数据源）
const failedNodes = computed(() => nodes.value.filter((n) => n.status !== 1))

function clusterName(clusterId: number): string {
  const c = clusterStatus.value.find((item) => item.id === clusterId)
  return c?.display_name || c?.name || `集群 #${clusterId}`
}

// ── 请求级错误分类：403 = 预期权限拒绝，其余 = 故障 ─────────────────────
function statusOf(err: unknown): number | null {
  const resp = (err as { response?: { status?: number } } | null | undefined)?.response
  return typeof resp?.status === 'number' ? resp.status : null
}

async function loadStats() {
  const res = await api.get<DashboardStats>('/dashboard/stats')
  stats.value = res.data
  statsLoaded.value = true
}

async function loadClusters() {
  const res = await api.get<{ items: ClusterRow[] }>('/clusters')
  clusterStatus.value = res.data.items || []
}

async function loadNodes() {
  const res = await listNodes({ pageSize: PAGE_SIZE_CARD_GRID })
  nodes.value = res.data.items || []
  nodesLoaded.value = true
}

async function loadRoutes() {
  const res = await api.get<{ items: RecentRouteRow[] }>('/dashboard/recent-routes')
  recentRoutes.value = res.data.items || []
}

/** 加载任务表：enabled 为 false 的数据区不发起请求（fetch-visible-only，D4 评审确认 A） */
const LOAD_TASKS: Array<{ key: LoadKey; enabled: () => boolean; run: () => Promise<void> }> = [
  { key: 'stats', enabled: () => !denied.value.stats, run: loadStats },
  { key: 'clusters', enabled: () => canEnter({ permission: 'clusters' }) && !denied.value.clusters, run: loadClusters },
  { key: 'nodes', enabled: () => canEnter({ permission: 'nodes' }) && !denied.value.nodes, run: loadNodes },
  { key: 'routes', enabled: () => canEnter({ permission: 'routes' }) && !denied.value.routes, run: loadRoutes },
]

// 三张数据卡显隐（与请求联动，D4）：无权限不渲染且不请求
const canClustersCard = computed(() => canEnter({ permission: 'clusters' }) && !denied.value.clusters)
const canNodesCard = computed(() => canEnter({ permission: 'nodes' }) && !denied.value.nodes)
const canRoutesCard = computed(() => canEnter({ permission: 'routes' }) && !denied.value.routes)

/**
 * 加载编排单点（D6）：in-flight 防并发守卫统一覆盖「刷新」与各分区「重试」入口；
 * keys 省略 = 全量拉取（刷新），传入 keys = 只重发指定区（重试只重发失败请求）。
 */
async function loadAll(keys?: LoadKey[]) {
  if (loading.value) return
  loading.value = true
  const tasks = LOAD_TASKS.filter((t) => (!keys || keys.includes(t.key)) && t.enabled())
  let succeeded = 0
  await Promise.all(
    tasks.map(async (t) => {
      try {
        await t.run()
        succeeded++
        loadErrors.value[t.key] = false
      } catch (err) {
        if (statusOf(err) === 403) denied.value[t.key] = true
        else loadErrors.value[t.key] = true
      }
    }),
  )
  loading.value = false
  if (succeeded > 0) {
    lastUpdated.value = formatMonthDayTime(new Date().toISOString())
  }
}

function refreshAll() {
  void loadAll()
}

const failedKeys = computed(() => (Object.keys(LOAD_LABELS) as LoadKey[]).filter((k) => loadErrors.value[k]))
const failedLabels = computed(() => failedKeys.value.map((k) => LOAD_LABELS[k]))
const allFailed = computed(() => {
  const visible = LOAD_TASKS.filter((t) => t.enabled())
  return visible.length > 0 && visible.every((t) => loadErrors.value[t.key])
})
const partialFailed = computed(() => !allFailed.value && failedKeys.value.length > 0)

const statsFirstLoading = computed(() => loading.value && !statsLoaded.value)

function retryFailed() {
  void loadAll(failedKeys.value)
}

function retryKey(key: LoadKey) {
  void loadAll([key])
}

onMounted(() => {
  void loadAll()
})
</script>

<style scoped>
.dashboard {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 大数统计（设计稿 dstat：色相左条 + mono 大数 + 副文案） ── */
.dash-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.dash-stats-loading {
  opacity: 0.45;
  pointer-events: none;
}
.dstat {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 16px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  transition:
    border-color 0.15s,
    transform 0.15s,
    box-shadow 0.15s;
}
.dstat::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--cc, var(--accent));
}
.dstat:hover {
  border-color: oklch(56% 0.16 210 / 45%);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
.dstat .d-top {
  font-size: 12px;
  color: var(--muted);
}
.dstat .d-top :deep(svg) {
  width: 14px;
  height: 14px;
  vertical-align: -2px;
  color: var(--cc, var(--accent));
}
.dstat .d-num {
  font-size: 26px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--fg);
  line-height: 1.15;
}
.dstat .d-sub {
  font-size: 11.5px;
  color: var(--muted);
}
.dstat .d-label {
  position: absolute;
  right: 16px;
  top: 14px;
  font-size: 12px;
  color: var(--muted);
}

/* ── 三列状态卡 ── */
.dash-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.dash-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  min-width: 0;
}
.dc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border);
}
.dc-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--fg);
}
.dc-badge {
  font-size: 11px;
  font-family: var(--font-mono);
  padding: 1px 8px;
  border-radius: 999px;
  background: oklch(50% 0.018 240 / 8%);
  color: var(--muted);
  white-space: nowrap;
}
.dc-badge.dc-ok {
  color: var(--success);
  background: oklch(55% 0.15 145 / 10%);
}
.dc-badge.dc-bad {
  color: var(--danger);
  background: oklch(55% 0.19 25 / 10%);
}
.dc-badges {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
}
.dc-link {
  font-size: 12px;
  color: var(--accent);
  white-space: nowrap;
}
.dc-link:hover {
  text-decoration: underline;
}
.dash-card table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.dash-card td {
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-card tbody tr:first-child td {
  border-top: none;
}
.dash-card tbody tr {
  transition: background 0.12s;
}
.dash-card tbody tr:hover {
  background: oklch(56% 0.16 210 / 4%);
}
.c-c {
  width: 76px;
  text-align: right;
}
.c-r {
  width: 64px;
  text-align: right;
}
.c-strong {
  font-weight: 600;
}
.c-strong + .c-dim {
  margin-left: 6px;
}
.c-mono {
  font-family: var(--font-mono);
}
.c-dim {
  color: var(--muted);
}
.c-warn {
  color: var(--warning);
  font-weight: 600;
}
.pipe-uri {
  font-family: var(--font-mono);
  font-size: 11.5px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--fg);
}
.dc-empty {
  padding: 20px 14px;
  text-align: center;
}
.dc-foot {
  border-top: 1px solid var(--border);
  padding: 9px 14px;
}
.truncate-notice {
  padding: 6px 14px;
  font-size: 11.5px;
  color: var(--warning);
  border-bottom: 1px solid var(--border);
}

/* ── 快捷入口（单卡合并） ── */
.quick-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  padding: 14px;
}
.quick-card .dc-title {
  display: block;
  margin-bottom: 10px;
}
.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.quick-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font-size: 12px;
  color: var(--muted);
  text-decoration: none;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.quick-chip:hover {
  border-color: oklch(56% 0.16 210 / 40%);
  color: var(--accent);
  background: var(--accent-bg);
}
.quick-chip .q-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--success);
  flex-shrink: 0;
}
.quick-chip .q-dot.off {
  background: var(--muted);
}
.quick-chip .q-cnt {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--muted);
}

/* ── 断点（与 card-grid 同规范：3 列 → ≤1200 2 列 → ≤768 1 列） ── */
@media (max-width: 1200px) {
  .dash-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dash-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 768px) {
  .dash-stats {
    grid-template-columns: 1fr;
  }
  .dash-cards {
    grid-template-columns: 1fr;
  }
}
</style>
