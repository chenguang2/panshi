<template>
  <div class="dashboard">
    <h2>仪表盘</h2>
    <a-row :gutter="16" class="stats-row">
      <a-col :span="6">
        <a-card>
          <a-statistic title="集群总数" :value="stats.clusters" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="上游总数" :value="stats.upstreams" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="路由总数" :value="stats.routes" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="用户总数" :value="stats.users" />
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" class="content-row">
      <a-col :span="12">
        <a-card title="最近路由" class="recent-card">
          <a-table :dataSource="recentRoutes" :columns="routeColumns" :pagination="false" size="small">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <a-tag :color="record.status === 1 ? 'green' : 'red'">
                  {{ record.status === 1 ? '正常' : '禁用' }}
                </a-tag>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card title="集群状态" class="cluster-card">
          <a-table :dataSource="clusterStatus" :columns="clusterColumns" :pagination="false" size="small">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <a-badge :status="record.status === 1 ? 'success' : 'error'" :text="record.status === 1 ? '健康' : '离线'" />
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'

const stats = ref({
  clusters: 0,
  upstreams: 0,
  routes: 0,
  users: 0
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
  padding: 0;
}

.stats-row {
  margin-bottom: 16px;
}

.content-row {
  margin-top: 16px;
}

.recent-card,
.cluster-card {
  height: 100%;
}
</style>