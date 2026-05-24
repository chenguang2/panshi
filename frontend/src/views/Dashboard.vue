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
        <a-col :span="6">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">集群总数</div>
              <div class="stat-value">{{ stats.clusters }}</div>
              <div class="stat-accent"></div>
            </div>
          </div>
        </a-col>
        <a-col :span="6">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">上游总数</div>
              <div class="stat-value">{{ stats.upstreams }}</div>
              <div class="stat-accent"></div>
            </div>
          </div>
        </a-col>
        <a-col :span="6">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">路由总数</div>
              <div class="stat-value">{{ stats.routes }}</div>
              <div class="stat-accent"></div>
            </div>
          </div>
        </a-col>
        <a-col :span="6">
          <div class="glass-stat-card">
            <div class="stat-card-body">
              <div class="stat-label">用户总数</div>
              <div class="stat-value">{{ stats.users }}</div>
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
  position: relative;
  min-height: calc(100vh - 56px - 40px);
  margin: -20px -24px;
  padding: 20px 24px;
  overflow: hidden;
  background: linear-gradient(135deg, #0a0e27 0%, #1a1040 30%, #0d1b3e 60%, #0a0e27 100%);
}

/* ---- Tech grid background (matching login page) ---- */
.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(24, 144, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(24, 144, 255, 0.06) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse at center, black 25%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 25%, transparent 70%);
  pointer-events: none;
}

/* ---- Floating orbs ---- */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  animation: orbFloat 10s ease-in-out infinite;
}

.bg-orb-1 {
  width: 500px;
  height: 500px;
  left: -200px;
  top: -150px;
  background: radial-gradient(circle, rgba(24, 144, 255, 0.18) 0%, transparent 65%);
  animation-delay: 0s;
}

.bg-orb-2 {
  width: 420px;
  height: 420px;
  right: -150px;
  bottom: -100px;
  background: radial-gradient(circle, rgba(124, 58, 237, 0.14) 0%, transparent 65%);
  animation-delay: -3s;
}

.bg-orb-3 {
  width: 300px;
  height: 300px;
  left: 60%;
  top: 40%;
  background: radial-gradient(circle, rgba(24, 144, 255, 0.08) 0%, transparent 60%);
  animation-delay: -6s;
}

@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(35px, -25px) scale(1.06); }
  66% { transform: translate(-25px, 20px) scale(0.94); }
}

/* ---- Content wrapper (above background layers) ---- */
.dash-content {
  position: relative;
  z-index: 1;
}

/* ---- Header ---- */
h2 {
  margin-bottom: 16px;
  font-size: 20px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

/* ---- Stats row ---- */
.stats-row {
  margin-bottom: 16px;
}

/* ---- Glass stat card ---- */
.glass-stat-card {
  height: 100%;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  transition: transform 0.25s, box-shadow 0.25s;
  overflow: hidden;
  position: relative;
}

.glass-stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  border-color: rgba(24, 144, 255, 0.2);
}

.stat-card-body {
  padding: 22px 24px 26px;
  position: relative;
}

.stat-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 30px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
  letter-spacing: 1px;
  text-shadow: 0 0 20px rgba(24, 144, 255, 0.3);
}

.stat-accent {
  position: absolute;
  bottom: 0;
  left: 24px;
  right: 24px;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, #1890ff, #7c3aed, transparent);
  opacity: 0.5;
}

/* ---- Glass table card ---- */
.glass-table-card {
  height: 100%;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}



/* ---- Content row ---- */
.content-row {
  margin-top: 16px;
}

/* ---- Glass table card ---- */
.glass-table-card {
  background: rgba(255, 255, 255, 0.06);
}

/* Card header with bottom separator line */
.table-card-header {
  position: relative;
  padding: 16px 20px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.3px;
}

.table-card-header::after {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.02));
}

.table-card-body {
  padding: 0;
}

/* ---- Dark table overrides ---- */
:deep(.dark-table) .ant-table {
  background: transparent !important;
}

/* Table header row */
:deep(.dark-table) .ant-table-thead > tr > th {
  background: rgba(255, 255, 255, 0.04) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
  color: rgba(255, 255, 255, 0.5) !important;
  font-size: 12px;
  font-weight: 500;
  padding: 10px 16px;
}

:deep(.dark-table) .ant-table-thead > tr > th:not(:last-child)::after {
  display: none !important;
}

/* Data rows — alternating subtle tint for readability */
:deep(.dark-table) .ant-table-tbody > tr > td {
  background: transparent !important;
  border-bottom: none !important;
  padding: 10px 16px;
  color: rgba(255, 255, 255, 0.75);
}

:deep(.dark-table) .ant-table-tbody > tr:nth-child(even) > td {
  background: rgba(255, 255, 255, 0.02) !important;
}

:deep(.dark-table) .ant-table-tbody > tr:hover > td {
  background: rgba(24, 144, 255, 0.08) !important;
}

/* Tags — pill style with dark saturated colors */
:deep(.dark-table) .ant-tag {
  border: none;
  font-weight: 500;
  border-radius: 4px;
  padding: 1px 8px;
  line-height: 20px;
  height: 22px;
}

/* Status indicators (custom, replacing ant-badge) */
.status-ok {
  color: #95de64;
}

.status-err {
  color: #ff7875;
}

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
  background: #52c41a;
  box-shadow: 0 0 6px rgba(82, 196, 26, 0.5);
}

.dot-err {
  background: #ff4d4f;
  box-shadow: 0 0 6px rgba(255, 77, 79, 0.5);
}

:deep(.dark-table) .ant-table-placeholder .ant-empty-description {
  color: rgba(255, 255, 255, 0.25) !important;
}
</style>
