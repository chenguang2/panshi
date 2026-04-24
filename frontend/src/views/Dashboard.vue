<template>
  <div class="dashboard">
    <h2>Dashboard</h2>
    <a-row :gutter="16" class="stats-row">
      <a-col :span="6">
        <a-card>
          <a-statistic title="Total Clusters" :value="stats.clusters" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="Total Upstreams" :value="stats.upstreams" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="Total Routes" :value="stats.routes" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="Total Users" :value="stats.users" />
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" class="content-row">
      <a-col :span="12">
        <a-card title="Recent Routes" class="recent-card">
          <a-table :dataSource="recentRoutes" :columns="routeColumns" :pagination="false" size="small">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <a-tag :color="record.status === 1 ? 'green' : 'red'">
                  {{ record.status === 1 ? 'Active' : 'Inactive' }}
                </a-tag>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card title="Cluster Status" class="cluster-card">
          <a-table :dataSource="clusterStatus" :columns="clusterColumns" :pagination="false" size="small">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <a-badge :status="record.status === 1 ? 'success' : 'error'" :text="record.status === 1 ? 'Healthy' : 'Offline'" />
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
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'URI', dataIndex: 'uri', key: 'uri' },
  { title: 'Status', key: 'status' }
]

const clusterColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Display Name', dataIndex: 'display_name', key: 'display_name' },
  { title: 'Status', key: 'status' }
]

onMounted(async () => {
  try {
    const [clusterRes, userRes] = await Promise.all([
      api.get('/clusters'),
      api.get('/admin/users')
    ])
    stats.value.clusters = clusterRes.data.total
    stats.value.users = userRes.data.total
    clusterStatus.value = clusterRes.data.items
  } catch (error) {
    console.error('Failed to load dashboard data', error)
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