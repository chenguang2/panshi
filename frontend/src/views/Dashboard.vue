<template>
  <div class="dashboard">
    <PageHeader title="概览" description="平台资源统计与快捷入口">
      <template #actions>
        <span v-if="lastUpdated" class="updated-at">更新于 {{ lastUpdated }}</span>
        <button class="btn btn-secondary refresh-btn" :disabled="loading" @click="refreshAll">
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

    <!-- 统计卡（403 防御：静默隐藏） -->
    <template v-if="!denied.stats">
      <div v-if="loadErrors.stats" class="card area-error">
        <span class="area-error-text">加载失败</span>
        <button class="btn btn-secondary" :disabled="loading" @click="retryKey('stats')">重试</button>
      </div>
      <div v-else class="stats-grid" :class="{ 'stats-grid-loading': statsFirstLoading }">
        <StatCard
          v-for="c in visibleStatCards"
          :key="c.key"
          :value="statsLoaded ? String(stats[c.key]) : '…'"
          :label="c.label"
          :subtitle="c.subtitle"
          :accent="c.accent"
          :to="c.to"
        >
          <template #icon>
            <span class="stat-icon" :class="c.accent" v-html="c.icon"></span>
          </template>
        </StatCard>
      </div>
    </template>

    <div class="dashboard-columns">
      <!-- 集群区（无权限不渲染且不请求） -->
      <template v-if="canClustersCard">
        <div v-if="loadErrors.clusters" class="card area-error">
          <span class="area-error-text">加载失败</span>
          <button class="btn btn-secondary" :disabled="loading" @click="retryKey('clusters')">重试</button>
        </div>
        <template v-else>
          <TableCard
            v-if="clusterStatus.length || loading"
            :columns="clusterColumns"
            :data-source="clusterStatus"
            :pagination="false"
            size="small"
            :loading="loading"
          >
            <template #header>
              <span class="table-card-title">集群</span>
              <span class="table-card-count">共 {{ clusterStatus.length }} 个</span>
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <BadgeStatus
                  :text="record.status === 1 ? '已启用' : '已禁用'"
                  :status="record.status === 1 ? 'online' : 'offline'"
                />
              </template>
              <template v-else-if="column.key === 'display_name'">{{ record.display_name || '—' }}</template>
            </template>
            <template #footer>
              <router-link to="/clusters" class="table-card-link">查看全部集群 &rarr;</router-link>
            </template>
          </TableCard>
          <div v-else class="card">
            <div class="card-header">
              <span class="table-card-title">集群</span>
              <span class="table-card-count">共 0 个</span>
            </div>
            <div class="card-body empty-body">
              <router-link to="/clusters" class="empty-cta">
                {{ isAdmin ? '还没有集群，去创建' : '暂无可见集群，前往集群管理' }}
                &rarr;
              </router-link>
            </div>
          </div>
        </template>
      </template>

      <!-- 节点区（无权限不渲染且不请求）：明细收敛 TableCard 单实现（D7） -->
      <template v-if="canNodesCard">
        <div v-if="loadErrors.nodes" class="card area-error">
          <span class="area-error-text">加载失败</span>
          <button class="btn btn-secondary" :disabled="loading" @click="retryKey('nodes')">重试</button>
        </div>
        <template v-else>
          <div v-if="nodesTruncated" class="truncate-notice">节点数超过明细上限，失败清单可能不完整</div>
          <TableCard
            v-if="failedNodes.length || loading"
            class="node-detail-card"
            :columns="nodeColumns"
            :data-source="failedNodes"
            :pagination="false"
            size="small"
            :loading="loading"
          >
            <template #header>
              <span class="table-card-title">节点连通状态</span>
              <span v-if="nodesLoaded" class="node-summary">
                <BadgeStatus :text="`检测通过 ${summaryPassed}`" status="online" />
                <BadgeStatus :text="`未检测 ${summaryUntested}`" status="neutral" />
                <BadgeStatus v-if="summaryFailed" :text="`检测失败 ${summaryFailed}`" status="offline" />
              </span>
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'addr'">
                <span class="node-addr">{{ record.ip }}:{{ record.service_port }}</span>
              </template>
              <template v-else-if="column.key === 'cluster'">
                {{ record.cluster_name || clusterName(record.cluster_id) }}
              </template>
              <template v-else-if="column.key === 'result'">
                <BadgeStatus text="检测失败" status="offline" />
              </template>
            </template>
            <template #footer>
              <router-link to="/nodes" class="table-card-link">查看全部节点 &rarr;</router-link>
            </template>
          </TableCard>
          <div v-else-if="nodesLoaded && nodes.length" class="card">
            <div class="card-header">
              <span class="table-card-title">节点连通状态</span>
              <span class="node-summary">
                <BadgeStatus :text="`检测通过 ${summaryPassed}`" status="online" />
                <BadgeStatus :text="`未检测 ${summaryUntested}`" status="neutral" />
              </span>
            </div>
            <div class="card-body allpass-body">
              <div v-if="summaryUntested === 0" class="all-online">全部 {{ nodes.length }} 个节点上次检测通过</div>
              <router-link to="/nodes" class="table-card-link">查看全部节点 &rarr;</router-link>
            </div>
          </div>
          <div v-else-if="!loading" class="card">
            <div class="card-header">
              <span class="table-card-title">节点连通状态</span>
            </div>
            <div class="card-body empty-body">
              <router-link to="/nodes" class="empty-cta">
                {{ isAdmin ? '还没有节点，去添加' : '暂无可见节点，前往节点管理' }}
                &rarr;
              </router-link>
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- 最近路由区（无权限不渲染且不请求） -->
    <template v-if="canRoutesCard">
      <div v-if="loadErrors.routes" class="card area-error">
        <span class="area-error-text">加载失败</span>
        <button class="btn btn-secondary" :disabled="loading" @click="retryKey('routes')">重试</button>
      </div>
      <template v-else>
        <TableCard
          v-if="recentRoutes.length || loading"
          :columns="routeColumns"
          :data-source="recentRoutes"
          :pagination="false"
          size="small"
          :loading="loading"
          :custom-row="routeRowAttrs"
        >
          <template #header>
            <span class="table-card-title">最近创建的路由</span>
            <span class="table-card-count">共 {{ recentRoutes.length }} 条</span>
          </template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <BadgeStatus
                :text="record.status === 1 ? '启用' : '禁用'"
                :status="record.status === 1 ? 'online' : 'offline'"
              />
            </template>
            <template v-else-if="column.key === 'created_at'">{{ formatMonthDayTime(record.created_at) }}</template>
          </template>
          <template #footer>
            <router-link to="/routes" class="table-card-link">查看全部路由 &rarr;</router-link>
          </template>
        </TableCard>
        <div v-else class="card">
          <div class="card-header">
            <span class="table-card-title">最近创建的路由</span>
            <span class="table-card-count">共 0 条</span>
          </div>
          <div class="card-body empty-body">
            <router-link to="/routes" class="empty-cta">
              {{ isAdmin ? '还没有路由，去创建' : '暂无可见路由，前往路由管理' }}
              &rarr;
            </router-link>
          </div>
        </div>
      </template>
    </template>

    <div class="dashboard-columns quick-columns">
      <div v-if="visibleQuickLinks.length" class="card">
        <div class="card-header">
          <span class="table-card-title">快捷入口（运维操作）</span>
        </div>
        <div class="card-body quick-body">
          <router-link v-for="l in visibleQuickLinks" :key="l.path" :to="l.path" class="quick-chip">
            {{ l.title }}
            <span v-if="l.note" class="chip-note">{{ l.note }}</span>
            <span v-if="l.countKey && statsLoaded" class="chip-count">{{ stats[l.countKey] }}</span>
          </router-link>
        </div>
      </div>
      <div v-if="visibleMoreLinks.length" class="card">
        <div class="card-header">
          <span class="table-card-title">更多资源（配置与查询）</span>
        </div>
        <div class="card-body quick-body">
          <router-link v-for="l in visibleMoreLinks" :key="l.path" :to="l.path" class="quick-chip quick-chip-muted">
            {{ l.title }}
            <span v-if="l.note" class="chip-note">{{ l.note }}</span>
            <span v-if="l.countKey && statsLoaded" class="chip-count">{{ stats[l.countKey] }}</span>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import TableCard from '@/components/TableCard.vue'
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
}

/** 集群行（概览只需 id/name/display_name/status） */
interface ClusterRow {
  id: number
  name: string
  display_name?: string | null
  status: number
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

/** chip 计数徽章（消费 stats 闲置计数）与风险副标注（D8） */
interface ChipExtra {
  countKey?: 'plugin_configs' | 'plugin_metadata' | 'global_rules' | 'static_resources' | 'users'
  note?: string
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
    note: '含恢复/迁移等高危操作',
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

/** 行点击定位（spec 7.2）：仅对具备 routes 权限的用户绑定点击与可点击样式 */
function routeRowAttrs(): Record<string, unknown> {
  if (!canEnter({ permission: 'routes' })) return {}
  return { class: 'clickable-row', onClick: () => router.push('/routes') }
}

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
/** 统计卡节点副标题动态三态（D2） */
const nodeSubtitle = computed(() =>
  statsLoaded.value
    ? `通过 ${summaryPassed.value} · 未检测 ${summaryUntested.value} · 失败 ${summaryFailed.value}`
    : '加载中…',
)
/** 明细截断：listNodes 达分页上限时失败清单可能不完整（软措辞兜住恰好 500 的假阳性） */
const nodesTruncated = computed(() => nodes.value.length >= PAGE_SIZE_CARD_GRID)
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

/* 首次加载统计卡容器半透明降交互（D3 加载态） */
.stats-grid-loading {
  opacity: 0.45;
  pointer-events: none;
}

/* 错误横幅（D3） */
.load-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
}
.load-banner-danger {
  background: var(--danger-bg, color-mix(in srgb, var(--danger) 10%, transparent));
  color: var(--danger);
}
.load-banner-partial {
  background: var(--warning-bg, color-mix(in srgb, var(--warning) 12%, transparent));
  color: var(--warning);
}
.banner-retry {
  flex-shrink: 0;
}

/* 「更新于」时间锚点 + 手动刷新（D6） */
.updated-at {
  font-size: 12px;
  color: var(--muted);
}

/* 分区轻量错误条 */
.area-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--danger);
}
.area-error-text {
  font-weight: 500;
}

.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}
.stat-icon svg {
  width: 20px;
  height: 20px;
}

.stat-icon.cluster {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}
.stat-icon.node {
  background: color-mix(in srgb, var(--info) 12%, transparent);
  color: var(--info);
}
.stat-icon.route {
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
}
.stat-icon.upstream {
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  color: var(--warning);
}

.dashboard-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.node-summary {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

/* 失败节点明细区：防离线清单无限撑高（D7），表头/脚链固定、表格体滚动 */
.node-detail-card {
  max-height: 320px;
  overflow-y: auto;
}

/* 全通过横幅卡（非表格态） */
.allpass-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
}

.node-addr {
  font-family: var(--font-mono);
  color: var(--fg);
}

.all-online {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--success-bg);
  color: var(--success);
  font-size: 13px;
}

.table-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}

.table-card-count {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-weight: 500;
}

.table-card-link {
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}

.table-card-link:hover {
  text-decoration: underline;
}

/* 空态引导 CTA（D3 空态） */
.empty-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
}

.empty-cta {
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
}

.empty-cta:hover {
  text-decoration: underline;
}

.quick-body {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--fg);
  font-size: 13px;
  text-decoration: none;
  transition:
    color 0.15s,
    border-color 0.15s;
}

.quick-chip:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.quick-chip-muted {
  color: var(--muted);
}

/* chip 尾部 mono 计数徽章 + 高危副标注（D8） */
.chip-count {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  background: var(--bg);
  border-radius: 8px;
  padding: 0 6px;
  line-height: 16px;
}

.chip-note {
  font-size: 11px;
  color: var(--danger);
}

/* 明细截断提示（软措辞，D5） */
.truncate-notice {
  font-size: 12px;
  color: var(--muted);
  padding: 8px 16px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
}

/* 最近路由行点击定位（spec 7.2，仅 routes 权限用户绑定） */
.clickable-row {
  cursor: pointer;
}

@media (max-width: 900px) {
  .dashboard-columns {
    grid-template-columns: 1fr;
  }
}
</style>
