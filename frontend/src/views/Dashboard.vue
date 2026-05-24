<template>
  <div class="dashboard">
    <!-- Background tech elements (matching login page style) -->
    <div class="bg-grid"></div>
    <div class="bg-orb bg-orb-1"></div>
    <div class="bg-orb bg-orb-2"></div>
    <div class="bg-orb bg-orb-3"></div>

    <div class="dash-content">
      <h2>仪表盘</h2>

      <a-row :gutter="16" class="stats-row">
        <a-col :span="3">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">集群总数</div>
              <div class="stat-value">{{ stats.clusters }}</div>
              <div class="stat-accent"></div>
            </div>
          </div>
        </a-col>
        <a-col :span="3">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">上游总数</div>
              <div class="stat-value">{{ stats.upstreams }}</div>
              <div class="stat-accent"></div>
            </div>
          </div>
        </a-col>
        <a-col :span="3">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">路由总数</div>
              <div class="stat-value">{{ stats.routes }}</div>
              <div class="stat-accent"></div>
            </div>
          </div>
        </a-col>
        <a-col :span="3">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">用户总数</div>
              <div class="stat-value">{{ stats.users }}</div>
              <div class="stat-accent"></div>
            </div>
          </div>
        </a-col>
        <a-col :span="4">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">插件组</div>
              <div class="stat-value">{{ stats.plugin_configs }}</div>
              <div class="stat-accent"></div>
            </div>
          </div>
        </a-col>
        <a-col :span="4">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">全局规则</div>
              <div class="stat-value">{{ stats.global_rules }}</div>
              <div class="stat-accent"></div>
            </div>
          </div>
        </a-col>
        <a-col :span="4">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">静态资源</div>
              <div class="stat-value">{{ stats.static_resources }}</div>
              <div class="stat-accent"></div>
            </div>
          </div>
        </a-col>
      </a-row>

      <a-row :gutter="16" class="content-row">
        <a-col :span="12">
          <div class="glass-table-card">
            <div class="table-card-header">最近路由</div>
            <div class="table-card-body">
              <a-table
                :dataSource="recentRoutes"
                :columns="routeColumns"
                :pagination="false"
                size="small"
                class="dark-table"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'status'">
                    <a-tag :color="record.status === 1 ? '#237804' : '#a8071a'">
                      {{ record.status === 1 ? '正常' : '禁用' }}
                    </a-tag>
                  </template>
                </template>
              </a-table>
            </div>
          </div>
        </a-col>
        <a-col :span="12">
          <div class="glass-table-card">
            <div class="table-card-header">集群状态</div>
            <div class="table-card-body">
              <a-table
                :dataSource="clusterStatus"
                :columns="clusterColumns"
                :pagination="false"
                size="small"
                class="dark-table"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'status'">
                    <span :class="record.status === 1 ? 'status-ok' : 'status-err'">
                      <span class="status-dot" :class="record.status === 1 ? 'dot-ok' : 'dot-err'"></span>
                      {{ record.status === 1 ? '健康' : '离线' }}
                    </span>
                  </template>
                </template>
              </a-table>
            </div>
          </div>
        </a-col>
      </a-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'

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
  min-height: calc(100vh - 56px - 40px);
  margin: -20px -24px;
  padding: 20px 24px;
  overflow: hidden;
  background: var(--p-bg-page);
}

.ambient {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}

.ambient-1 {
  width: 600px;
  height: 600px;
  left: -200px;
  top: -100px;
  background: radial-gradient(circle, var(--p-color-primary-bg) 0%, transparent 60%);
}

.ambient-2 {
  width: 500px;
  height: 500px;
  right: -150px;
  bottom: -50px;
  background: radial-gradient(circle, color-mix(in srgb, var(--p-color-info) 8%, transparent) 0%, transparent 60%);
}

.dash-content {
  position: relative;
  z-index: 1;
}

h2 {
  margin-bottom: 16px;
  font-size: 20px;
  font-weight: 600;
  color: var(--p-text-primary);
}

.stats-row {
  margin-bottom: 16px;
}

.glass-stat-card {
  height: 100%;
  background: transparent;
  border-radius: var(--p-radius-lg);
  background: var(--p-bg-glass);
  backdrop-filter: blur(var(--p-glass-blur));
  -webkit-backdrop-filter: blur(var(--p-glass-blur));
  border: 1px solid var(--p-glass-border);
  box-shadow: var(--p-shadow-glass);
  transition: transform 0.25s, box-shadow 0.25s;
  overflow: hidden;
  position: relative;
}

.glass-stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--p-shadow-lg);
  border-color: var(--p-color-primary);
}

.stat-card-body {
  padding: 22px 24px 26px;
  position: relative;
}

.stat-card-body::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--p-color-primary), var(--p-color-info));
  opacity: 0.5;
}

.stat-label {
  font-size: 13px;
  color: var(--p-text-secondary);
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 30px;
  font-weight: 700;
  color: var(--p-color-primary);
  line-height: 1.2;
  letter-spacing: 1px;
}

.stat-accent {
  position: absolute;
  bottom: 0;
  left: 24px;
  right: 24px;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--p-color-primary), var(--p-color-info), transparent);
  opacity: 0.4;
}

.glass-table-card {
  height: 100%;
  border-radius: var(--p-radius-lg);
  background: var(--p-bg-glass-table);
  backdrop-filter: blur(var(--p-glass-blur));
  -webkit-backdrop-filter: blur(var(--p-glass-blur));
  border: 1px solid var(--p-glass-border);
  box-shadow: var(--p-shadow-glass);
  overflow: hidden;
}

.table-card-header {
  position: relative;
  padding: 16px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--p-text-primary);
  letter-spacing: 0.3px;
}

.table-card-header::after {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, var(--p-border-divider), transparent);
}

.table-card-body {
  padding: 0;
}

.content-row {
  margin-top: 16px;
}

:deep(.dark-table) .ant-table {
  background: transparent !important;
}

:deep(.dark-table) .ant-table-thead > tr > th {
  background: var(--p-color-primary-bg) !important;
  border-bottom: 2px solid var(--p-color-primary) !important;
  color: var(--p-text-primary) !important;
  font-size: 12px;
  font-weight: 600;
  padding: 10px 16px;
}

:deep(.dark-table) .ant-table-thead > tr > th:not(:last-child)::after {
  display: none !important;
}

:deep(.dark-table) .ant-table-tbody > tr > td {
  background: transparent !important;
  border-bottom: none !important;
  padding: 10px 16px;
  color: var(--p-text-secondary);
}

:deep(.dark-table) .ant-table-tbody > tr:nth-child(even) > td {
  background: var(--p-bg-hover) !important;
}

:deep(.dark-table) .ant-table-tbody > tr:hover > td {
  background: color-mix(in srgb, var(--p-color-primary) 8%, transparent) !important;
}

:deep(.dark-table) .ant-tag {
  border: none;
  font-weight: 500;
  border-radius: var(--p-radius-sm);
  padding: 1px 8px;
  line-height: 20px;
  height: 22px;
}

:deep(.dark-table) .ant-table-placeholder .ant-empty-description {
  color: var(--p-text-disabled) !important;
}

.status-ok { color: var(--p-color-success); }
.status-err { color: var(--p-color-danger); }

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
  position: relative;
  top: -1px;
}

.dot-ok {
  background: var(--p-color-success);
  box-shadow: 0 0 6px color-mix(in srgb, var(--p-color-success) 50%, transparent);
}

.dot-err {
  background: var(--p-color-danger);
  box-shadow: 0 0 6px color-mix(in srgb, var(--p-color-danger) 50%, transparent);
}
</style>
