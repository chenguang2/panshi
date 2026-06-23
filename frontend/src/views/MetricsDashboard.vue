<template>
  <div class="metrics-dashboard">
    <PageHeader title="指标总览" description="Edge 网关关键指标概览" />

    <!-- ── Global Controls ── -->
    <div class="dashboard-controls">
      <div class="control-group">
        <label>时间范围</label>
        <a-radio-group :value="store.timeRange" @change="onTimeRangeChange">
          <a-radio-button value="1h">1小时</a-radio-button>
          <a-radio-button value="6h">6小时</a-radio-button>
          <a-radio-button value="24h">24小时</a-radio-button>
          <a-radio-button value="7d">7天</a-radio-button>
        </a-radio-group>
      </div>
      <div class="control-group">
        <label>刷新间隔</label>
        <a-select :value="store.refreshInterval" style="width: 100px" @change="onRefreshIntervalChange">
          <a-select-option :value="60">60s</a-select-option>
          <a-select-option :value="120">120s</a-select-option>
          <a-select-option :value="300">300s</a-select-option>
        </a-select>
      </div>
      <div class="control-group">
        <a-switch
          :checked="store.autoRefreshEnabled"
          @change="store.toggleAutoRefresh"
          checked-children="自动"
          un-checked-children="手动"
        />
      </div>
      <a-button size="small" @click="refreshAll">
        <template #icon><ReloadOutlined /></template>
        刷新
      </a-button>
      <a-tag v-if="store.loading" color="processing">加载中...</a-tag>
    </div>

    <!-- ── Business Metrics Grid ── -->
    <div class="chart-grid">
      <MetricChartCard
        v-for="chart in businessCharts"
        :key="chart.key"
        :title="chart.label"
        :data="store.chartDataMap[chart.key] || []"
        :error="store.errorMap[chart.key]"
        :unit="chart.unit"
      />
    </div>

    <!-- ── Infra Collapsible ── -->
    <div class="infra-section">
      <div class="infra-toggle" @click="toggleInfra">
        <span>{{ infraOpen ? '收起' : '更多指标' }}</span>
        <span class="infra-count" v-if="!infraOpen">({{ INFRA_CHARTS.length }} 项)</span>
        <CaretDownOutlined :class="{ rotated: infraOpen }" />
      </div>
      <div v-if="infraOpen" class="chart-grid">
        <MetricChartCard
          v-for="chart in INFRA_CHARTS"
          :key="chart.key"
          :title="chart.label"
          :data="store.chartDataMap[chart.key] || []"
          :error="store.errorMap[chart.key]"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { ref } from 'vue'
import { ReloadOutlined, CaretDownOutlined } from '@ant-design/icons-vue'
import { useMetricsDashboardStore, BUSINESS_CHARTS, INFRA_CHARTS } from '@/stores/metricsDashboard'
import MetricChartCard from '@/components/MetricChartCard.vue'
import PageHeader from '@/components/PageHeader.vue'

const store = useMetricsDashboardStore()
const infraOpen = ref(false)

const businessCharts = BUSINESS_CHARTS

function onTimeRangeChange(e: any): void {
  store.setTimeRange(e.target.value)
}

function onRefreshIntervalChange(value: number): void {
  store.setRefreshInterval(value)
}

function toggleInfra(): void {
  infraOpen.value = !infraOpen.value
  if (infraOpen.value) {
    store.loadInfraCharts()
  }
}

function refreshAll(): void {
  store.loadAllCharts()
  if (infraOpen.value) {
    store.loadInfraCharts()
  }
}

onMounted(async () => {
  await store.loadAllCharts()
  store.startAutoRefresh()
})

onUnmounted(() => {
  store.stopAutoRefresh()
})
</script>

<style scoped>
.metrics-dashboard {
  max-width: 1200px;
}

.dashboard-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-group label {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}

.chart-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.infra-section {
  margin-top: 8px;
}

.infra-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: var(--surface);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  color: var(--muted);
  user-select: none;
  margin-bottom: 16px;
  transition: background 0.15s;
}

.infra-toggle:hover {
  background: var(--bg);
}

.infra-count {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.6;
}

.infra-toggle .anticon-caret-down {
  margin-left: auto;
  transition: transform 0.2s;
}

.infra-toggle .anticon-caret-down.rotated {
  transform: rotate(180deg);
}

@media (max-width: 800px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}
</style>
