<template>
  <div class="metrics-page">
    <PageHeader title="指标查询" description="Edge 网关节点单指标查询与分析" />

    <!-- ── Controls ── -->
    <div class="metrics-controls">
      <div class="control-group">
        <label>指标</label>
        <a-select
          v-model:value="store.selectedMetric"
          style="width: 240px"
          :loading="store.loadingNames"
          @change="store.setMetric"
          :options="metricOptions"
          placeholder="选择指标"
        />
      </div>
      <div class="control-group">
        <label>时间范围</label>
        <a-radio-group :value="store.timeRange" @change="onTimeRangeChange">
          <a-radio-button value="1h">1小时</a-radio-button>
          <a-radio-button value="6h">6小时</a-radio-button>
          <a-radio-button value="24h">24小时</a-radio-button>
          <a-radio-button value="7d">7天</a-radio-button>
        </a-radio-group>
      </div>
      <a-tag v-if="store.loading" color="processing">加载中...</a-tag>
      <a-tag v-else color="green">60s 自动刷新</a-tag>
    </div>

    <!-- ── Chart ── -->
    <div class="metrics-chart-wrapper">
      <v-chart v-if="hasChartData" :option="chartOption" autoresize />
      <div v-else-if="store.error" class="metrics-empty">{{ store.error }}</div>
      <div v-else class="metrics-empty">当前无数据</div>
    </div>

    <!-- ── Summary Cards ── -->
    <div class="metrics-summary">
      <div class="summary-card" v-for="card in summaryCards" :key="card.key">
        <div class="summary-label">{{ card.label }}</div>
        <div class="summary-value">{{ formatValue(card.key) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useMetricsStore } from '@/stores/metrics'

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent])

const store = useMetricsStore()

// Business metrics to show in summary cards
const BUSINESS_METRICS = [
  'edge_http_requests_total',
  'edge_nginx_http_current_connections',
  'edge_metric_errors',
]

const metricOptions = computed(() =>
  store.metricNames.map((n) => ({ value: n, label: n })),
)

const hasChartData = computed(() => store.chartData.length > 0)

const summaryCards = computed(() =>
  BUSINESS_METRICS
    .filter((k) => k in store.summaryData)
    .map((k) => ({
      key: k,
      label: METRIC_LABELS[k] || k,
    })),
)

const METRIC_LABELS: Record<string, string> = {
  edge_http_requests_total: '总请求数 (QPS)',
  edge_nginx_http_current_connections: '活跃连接数',
  edge_metric_errors: '采集错误数',
}

const chartOption = computed(() => ({
  tooltip: {
    trigger: 'axis',
    valueFormatter: (v: number) => v.toFixed(2),
  },
  legend: { data: ['平均值', '最大值', '最小值'] },
  grid: { left: 60, right: 20, bottom: 40, top: 40 },
  xAxis: {
    type: 'time',
    axisLabel: { fontSize: 11 },
  },
  yAxis: { type: 'value', min: 0 },
  series: [
    {
      name: '平均值',
      type: 'line',
      data: store.chartData.map((d) => [d.timestamp * 1000, d.avg]),
      smooth: true,
      lineStyle: { width: 2 },
      showSymbol: false,
    },
    {
      name: '最大值',
      type: 'line',
      data: store.chartData.map((d) => [d.timestamp * 1000, d.max ?? d.avg]),
      smooth: true,
      lineStyle: { width: 1, type: 'dashed' },
      showSymbol: false,
    },
    {
      name: '最小值',
      type: 'line',
      data: store.chartData.map((d) => [d.timestamp * 1000, d.min ?? d.avg]),
      smooth: true,
      lineStyle: { width: 1, type: 'dashed' },
      showSymbol: false,
    },
  ],
}))

function formatValue(key: string): string {
  const v = store.summaryData[key]
  if (v === undefined || v === null) return '--'
  if (key === 'edge_nginx_http_current_connections') return String(Math.round(v))
  return v.toFixed(2)
}

function onTimeRangeChange(e: any): void {
  store.setTimeRange(e.target.value)
}

onMounted(async () => {
  await store.loadMetricNames()
  await store.loadAll()
  store.startAutoRefresh()
})

onUnmounted(() => {
  store.stopAutoRefresh()
})
</script>

<style scoped>
.metrics-page {
  max-width: 1200px;
}

.metrics-controls {
  display: flex;
  align-items: center;
  gap: 20px;
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

.metrics-chart-wrapper {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
  min-height: 360px;
}

.metrics-chart-wrapper :deep(.v-chart) {
  height: 360px;
}

.metrics-empty {
  height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 14px;
}

.metrics-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.summary-card {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 20px;
  text-align: center;
}

.summary-label {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}

.summary-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
  font-family: var(--font-mono);
}
</style>
