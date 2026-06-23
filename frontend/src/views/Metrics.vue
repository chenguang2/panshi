<template>
  <div class="metrics-page">
    <PageHeader title="指标查询" description="Edge 网关节点单指标查询与分析" />

    <!-- ── Controls ── -->
    <div class="metrics-controls">
      <div class="control-group">
        <label>指标</label>
        <a-select
          v-model:value="store.selectedMetric"
          style="width: 460px"
          :loading="store.loadingNames"
          @change="store.setMetric"
          :options="metricOptions"
          placeholder="选择指标"
          :dropdownMatchSelectWidth="false"
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

    <!-- ── Current value ── -->
    <div v-if="hasChartData" class="metrics-current">
      <div class="current-label">{{ store.selectedMetric ? (METRIC_LABELS[store.selectedMetric] || store.selectedMetric) : '' }}</div>
      <div class="current-value">{{ currentValue }}</div>
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
import PageHeader from '@/components/PageHeader.vue'
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
  store.metricNames.map((n) => ({
    value: n,
    label: METRIC_LABELS[n] ? `${n} — ${METRIC_LABELS[n]}` : n,
  })),
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
  // Edge OTel 业务指标
  edge_http_requests_total: '总请求数 (QPS)',
  edge_nginx_http_current_connections: 'Nginx 活跃连接数',
  edge_metric_errors: '指标采集错误数',
  edge_cpu_usage: 'CPU 使用率',
  edge_memory_usage: '内存使用率',
  edge_latency_avg: '平均延迟 (ms)',
  edge_latency_p99: 'P99 延迟 (ms)',
  edge_error_rate: '错误率',
  edge_qps: '每秒请求数 (QPS)',
  // Edge 共享字典指标
  edge_shared_dict_capacity_bytes: '共享字典总容量 (字节)',
  edge_shared_dict_free_space_bytes: '共享字典剩余空间 (字节)',

  // 采集器自身指标
  scrape_duration: '采集耗时 (秒)',
  scrape_samples_scraped: '采集样本数',
  scrape_series_added: '新增时序序列数',
  up: '采集目标状态 (1=正常)',

  // 通用 Prometheus/OTel 指标
  cpu: 'CPU 使用率',
  cpu_usage: 'CPU 使用率 (%)',
  mem: '内存使用量',
  memory_usage: '内存使用率 (%)',
  qps: '每秒请求数',
  active_connections: '活跃连接数',
  latency_avg: '平均延迟 (ms)',
  latency_p99: 'P99 延迟 (ms)',
  error_rate: '错误率 (%)',
  http_requests_total: 'HTTP 总请求数',
  http_request_duration_seconds: 'HTTP 请求耗时 (秒)',
  node_cpu_seconds_total: '节点 CPU 时间 (秒)',
  node_memory_MemTotal_bytes: '节点总内存 (字节)',
  node_memory_MemAvailable_bytes: '节点可用内存 (字节)',
  node_filesystem_size_bytes: '文件系统大小 (字节)',
  node_filesystem_avail_bytes: '文件系统可用空间 (字节)',
  node_network_receive_bytes_total: '网络接收流量 (字节)',
  node_network_transmit_bytes_total: '网络发送流量 (字节)',
  container_cpu_usage_seconds_total: '容器 CPU 使用时间 (秒)',
  container_memory_usage_bytes: '容器内存使用 (字节)',
}

function fmtVal(v: number): string {
  if (v >= 100) return v.toFixed(1)
  if (v >= 10) return v.toFixed(2)
  return v.toFixed(3)
}

const hasMaxMin = computed(() =>
  store.chartData.some((d) => d.max !== undefined && d.min !== undefined),
)

const currentValue = computed(() => {
  if (!hasChartData.value) return '--'
  const last = store.chartData[store.chartData.length - 1]
  const v = last.avg
  if (v === undefined || v === null) return '--'
  return fmtVal(v)
})

const chartOption = computed(() => {
  const series: any[] = [
    {
      name: '平均值',
      type: 'line',
      data: store.chartData.map((d) => [d.timestamp * 1000, d.avg]),
      smooth: true,
      lineStyle: { width: 2 },
      showSymbol: false,
    },
  ]
  if (hasMaxMin.value) {
    series.push(
      {
        name: '最大值',
        type: 'line',
        data: store.chartData.map((d) => [d.timestamp * 1000, d.max!]),
        smooth: true,
        lineStyle: { width: 1, type: 'dashed' },
        showSymbol: false,
      },
      {
        name: '最小值',
        type: 'line',
        data: store.chartData.map((d) => [d.timestamp * 1000, d.min!]),
        smooth: true,
        lineStyle: { width: 1, type: 'dashed' },
        showSymbol: false,
      },
    )
  }
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params]
        const p = items[0]
        if (!p) return ''
        const date = new Date(p.axisValue)
        const pad = (n: number) => String(n).padStart(2, '0')
        const timeStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
        let html = `<div style="font-size:12px;color:#999;margin-bottom:4px">${timeStr}</div>`
        for (const item of items) {
          if (item.value[1] == null) continue
          html += `<div style="display:flex;align-items:center;gap:6px;font-size:13px;line-height:1.8">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color}"></span>
            <span style="color:#999">${item.seriesName}</span>
            <span style="font-weight:600;font-family:var(--font-mono,monospace)">${fmtVal(Number(item.value[1]))}</span>
          </div>`
        }
        return html
      },
    },
    legend: {
      data: hasMaxMin.value ? ['平均值', '最大值', '最小值'] : ['平均值'],
      right: 0,
      top: 'center',
      orient: 'vertical',
    },
    grid: { left: 60, right: 90, bottom: 40, top: 40 },
    xAxis: {
      type: 'time',
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value' },
    series,
  }
})

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

.metrics-current {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 14px 20px;
  margin-bottom: 12px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.current-label {
  font-size: 13px;
  color: var(--muted);
}

.current-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
  font-family: var(--font-mono);
}

.metrics-chart-wrapper {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
  min-height: 360px;
}

.metrics-chart-wrapper :deep(.echarts) {
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
