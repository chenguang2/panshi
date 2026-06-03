<template>
  <div class="dashboard">
    <PageHeader title="概览" description="网关运行状态概览" />

    <div class="stats-grid">
      <StatCard :value="String(stats.clusters)" label="集群" subtitle="多集群管理" accent="cluster">
        <template #icon><span class="stat-icon cluster">&#x25C6;</span></template>
      </StatCard>
      <StatCard :value="String(stats.routes)" label="路由" subtitle="API 路由规则" accent="route">
        <template #icon><span class="stat-icon route">&#x25C7;</span></template>
      </StatCard>
      <StatCard :value="String(stats.upstreams)" label="上游" subtitle="后端服务" accent="upstream">
        <template #icon><span class="stat-icon upstream">&#x25CE;</span></template>
      </StatCard>
      <StatCard :value="String(stats.plugin_configs)" label="插件组" subtitle="插件配置" accent="plugin">
        <template #icon><span class="stat-icon plugin">&#x25B2;</span></template>
      </StatCard>
      <StatCard :value="String(stats.global_rules)" label="全局规则" subtitle="全局插件规则" accent="global">
        <template #icon><span class="stat-icon global">&#x229E;</span></template>
      </StatCard>
      <StatCard :value="String(stats.static_resources)" label="静态资源" subtitle="ZIP 资源文件" accent="node">
        <template #icon><span class="stat-icon resource">&#x25A3;</span></template>
      </StatCard>
      <StatCard :value="String(stats.users)" label="用户" subtitle="系统用户" accent="user">
        <template #icon><span class="stat-icon user">&#x25A0;</span></template>
      </StatCard>
    </div>

    <div class="dashboard-columns">
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
          <router-link to="/clusters" class="table-card-link">查看全部路由 &rarr;</router-link>
        </template>
      </TableCard>

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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import TableCard from '@/components/TableCard.vue'
import BadgeStatus from '@/components/BadgeStatus.vue'

const stats = ref({
  clusters: 0,
  upstreams: 0,
  routes: 0,
  users: 0,
  plugin_configs: 0,
  global_rules: 0,
  static_resources: 0
})

const recentRoutes = ref<any[]>([])
const clusterStatus = ref<any[]>([])

const routeColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: 'URI', dataIndex: 'uri', key: 'uri' },
  { title: '集群', dataIndex: 'cluster_name', key: 'cluster_name' },
  { title: '状态', key: 'status' }
]

const clusterColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '显示名称', dataIndex: 'display_name', key: 'display_name' },
  { title: '状态', key: 'status' }
]

onMounted(async () => {
  try {
    const [statsRes, recentRoutesRes, clusterRes] = await Promise.all([
      api.get('/dashboard/stats'),
      api.get('/dashboard/recent-routes'),
      api.get('/clusters')
    ])
    stats.value = statsRes.data
    recentRoutes.value = recentRoutesRes.data.items || []
    clusterStatus.value = clusterRes.data.items || []
  } catch (error) {
    console.error('加载仪表盘数据失败', error)
  }
})
</script>

<style scoped>
.dashboard {
  position: relative;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--p-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.stat-icon.cluster { background: color-mix(in srgb, var(--p-color-primary) 12%, transparent); color: var(--p-color-primary); }
.stat-icon.route { background: color-mix(in srgb, var(--p-color-success) 12%, transparent); color: var(--p-color-success); }
.stat-icon.upstream { background: color-mix(in srgb, var(--p-color-warning) 12%, transparent); color: var(--p-color-warning); }
.stat-icon.plugin { background: color-mix(in srgb, #7c3aed 12%, transparent); color: #7c3aed; }
.stat-icon.global { background: color-mix(in srgb, #52c41a 12%, transparent); color: #52c41a; }
.stat-icon.resource { background: color-mix(in srgb, var(--p-color-info) 12%, transparent); color: var(--p-color-info); }
.stat-icon.user { background: color-mix(in srgb, var(--p-color-danger) 12%, transparent); color: var(--p-color-danger); }

.dashboard-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.table-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--p-text-primary);
}

.table-card-count {
  font-size: 11px;
  color: var(--p-text-tertiary);
  font-family: var(--font-mono, var(--p-mono));
  font-weight: 500;
}

.table-card-link {
  font-size: 12px;
  color: var(--p-color-primary);
  text-decoration: none;
  font-weight: 500;
}

.table-card-link:hover {
  text-decoration: underline;
}

@media (max-width: 900px) {
  .dashboard-columns {
    grid-template-columns: 1fr;
  }
}
</style>
