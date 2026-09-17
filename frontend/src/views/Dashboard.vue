<template>
  <div class="dashboard">
    <PageHeader title="概览" description="网关运行状态与快捷入口" />

    <div class="stats-grid">
      <StatCard :value="String(stats.clusters)" label="集群" subtitle="多集群管理" accent="cluster" to="/clusters">
        <template #icon
          ><span class="stat-icon cluster"
            ><svg
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="2" width="12" height="4" rx="1" />
              <rect x="5" y="8" width="8" height="3" rx="1" />
              <rect x="6" y="13" width="6" height="3" rx="1" /></svg></span
        ></template>
      </StatCard>
      <StatCard :value="String(stats.nodes)" label="节点" subtitle="Edge 网关节点" accent="node" to="/nodes">
        <template #icon
          ><span class="stat-icon node"
            ><svg
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="9" cy="4" r="2" />
              <circle cx="4" cy="14" r="2" />
              <circle cx="14" cy="14" r="2" />
              <path d="M9 6v3M4 12l2-2M14 12l-2-2" /></svg></span
        ></template>
      </StatCard>
      <StatCard :value="String(stats.upstreams)" label="上游" subtitle="后端服务" accent="upstream" to="/upstreams">
        <template #icon
          ><span class="stat-icon upstream"
            ><svg
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 2v12M5 10l4 4 4-4M2 16h14" /></svg></span
        ></template>
      </StatCard>
      <StatCard :value="String(stats.routes)" label="路由" subtitle="API 路由规则" accent="route" to="/routes">
        <template #icon
          ><span class="stat-icon route"
            ><svg
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M2 9l4-6v4h10v4H6v4l-4-6z" /></svg></span
        ></template>
      </StatCard>
    </div>

    <div class="dashboard-columns">
      <TableCard :columns="clusterColumns" :data-source="clusterStatus" :pagination="false" size="small">
        <template #header>
          <span class="table-card-title">集群状态</span>
          <span class="table-card-count">共 {{ clusterStatus.length }} 个</span>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <BadgeStatus
              :text="record.status === 1 ? '正常运行' : '离线'"
              :status="record.status === 1 ? 'online' : 'offline'"
            />
          </template>
        </template>
        <template #footer>
          <router-link to="/clusters" class="table-card-link">查看全部集群 &rarr;</router-link>
        </template>
      </TableCard>

      <div class="card node-card">
        <div class="card-header">
          <span class="table-card-title">节点在线</span>
          <span class="node-summary">
            <BadgeStatus :text="`在线 ${onlineCount}`" status="online" />
            <BadgeStatus v-if="offlineNodes.length" :text="`离线 ${offlineNodes.length}`" status="offline" />
          </span>
        </div>
        <div class="card-body node-card-body">
          <template v-if="offlineNodes.length">
            <div v-for="n in offlineNodes" :key="n.id" class="node-row">
              <BadgeStatus text="离线" status="offline" />
              <span class="node-addr">{{ n.ip }}:{{ n.service_port }}</span>
              <span class="node-cluster">{{ clusterName(n.cluster_id) }}</span>
            </div>
          </template>
          <div v-else-if="nodes.length" class="all-online">全部 {{ onlineCount }} 个节点在线</div>
          <div v-else class="all-online all-online-muted">暂无节点数据</div>
        </div>
        <div class="card-footer">
          <router-link to="/nodes" class="table-card-link">查看全部节点 &rarr;</router-link>
        </div>
      </div>
    </div>

    <TableCard :columns="routeColumns" :data-source="recentRoutes" :pagination="false" size="small">
      <template #header>
        <span class="table-card-title">最近路由</span>
        <span class="table-card-count">共 {{ recentRoutes.length }} 条</span>
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <BadgeStatus
            :text="record.status === 1 ? '启用' : '禁用'"
            :status="record.status === 1 ? 'online' : 'offline'"
          />
        </template>
      </template>
      <template #footer>
        <router-link to="/routes" class="table-card-link">查看全部路由 &rarr;</router-link>
      </template>
    </TableCard>

    <div class="dashboard-columns quick-columns">
      <div class="card">
        <div class="card-header">
          <span class="table-card-title">快捷入口</span>
        </div>
        <div class="card-body quick-body">
          <router-link v-for="l in quickLinks" :key="l.path" :to="l.path" class="quick-chip">
            {{ l.title }}
          </router-link>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="table-card-title">更多资源</span>
        </div>
        <div class="card-body quick-body">
          <router-link v-for="l in moreLinks" :key="l.path" :to="l.path" class="quick-chip quick-chip-muted">
            {{ l.title }}
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import TableCard from '@/components/TableCard.vue'
import BadgeStatus from '@/components/BadgeStatus.vue'
import { listNodes } from '@/api/nodes'
import type { Node } from '@/types'

interface LinkItem {
  title: string
  path: string
}

const stats = ref({
  clusters: 0,
  nodes: 0,
  upstreams: 0,
  routes: 0,
  users: 0,
  plugin_configs: 0,
  global_rules: 0,
  static_resources: 0,
  plugin_metadata: 0,
})

const recentRoutes = ref<any[]>([])
const clusterStatus = ref<any[]>([])
const nodes = ref<Node[]>([])

const quickLinks: LinkItem[] = [
  { title: '节点任务中心', path: '/node-tasks' },
  { title: '审计日志', path: '/audit-log' },
  { title: '数据库管理', path: '/database-management' },
  { title: 'Ansible 主机清单', path: '/ansible-inventory' },
  { title: '自启动管理', path: '/edge-autostart' },
  { title: 'Edge 直连', path: '/edge-client' },
]

const moreLinks: LinkItem[] = [
  { title: '插件组', path: '/plugin-configs' },
  { title: '插件元数据', path: '/plugin-metadata' },
  { title: '全局规则', path: '/global-rules' },
  { title: '静态资源', path: '/static-resources' },
  { title: '用户管理', path: '/users' },
  { title: '指标总览', path: '/metrics/dashboard' },
]

const routeColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: 'URI', dataIndex: 'uri', key: 'uri' },
  { title: '集群', dataIndex: 'cluster_name', key: 'cluster_name' },
  { title: '状态', key: 'status' },
]

const clusterColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '显示名称', dataIndex: 'display_name', key: 'display_name' },
  { title: '状态', key: 'status' },
]

const offlineNodes = computed(() => nodes.value.filter((n) => n.status !== 1))
const onlineCount = computed(() => nodes.value.length - offlineNodes.value.length)

function clusterName(clusterId: number): string {
  const c = clusterStatus.value.find((item) => item.id === clusterId)
  return c?.display_name || c?.name || `集群 #${clusterId}`
}

onMounted(async () => {
  const [statsRes, routesRes, clustersRes, nodesRes] = await Promise.all([
    api.get('/dashboard/stats').catch(() => null),
    api.get('/dashboard/recent-routes').catch(() => null),
    api.get('/clusters').catch(() => null),
    listNodes({ pageSize: 500 }).catch(() => null),
  ])
  if (statsRes) stats.value = statsRes.data
  if (routesRes) recentRoutes.value = routesRes.data.items || []
  if (clustersRes) clusterStatus.value = clustersRes.data.items || []
  if (nodesRes) nodes.value = nodesRes.data.items || []
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

.node-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.node-addr {
  font-family: var(--font-mono);
  color: var(--fg);
}

.node-cluster {
  color: var(--muted);
  font-size: 12px;
}

.all-online {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--success-bg);
  color: var(--success);
  font-size: 13px;
}

.all-online-muted {
  background: var(--bg);
  color: var(--muted);
}

.card-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border);
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

.quick-body {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-chip {
  display: inline-flex;
  align-items: center;
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

@media (max-width: 900px) {
  .dashboard-columns {
    grid-template-columns: 1fr;
  }
}
</style>
