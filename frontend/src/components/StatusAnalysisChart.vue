<template>
  <div class="metric-chart-card">
    <div class="chart-header">
      <span class="chart-title">HTTP 状态码分析</span>
    </div>
    <div class="chart-body">
      <a-spin v-if="loading" class="chart-loading" />
      <div v-else-if="error" class="chart-error">{{ error }}</div>
      <template v-else-if="data.length">
        <div class="summary-row">
          <span class="summary-total">{{ totalRequests.toLocaleString() }} 请求</span>
        </div>
        <v-chart :option="chartOption" autoresize />
      </template>
      <div v-else class="chart-empty">当前无数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { getStatusAnalysis } from '@/api/metrics'

use([CanvasRenderer, PieChart, TooltipComponent, LegendComponent])

interface StatusItem {
  status_class: string
  request_count: number
  percentage: number
}

const props = withDefaults(
  defineProps<{
    since?: string
  }>(),
  { since: '24h' },
)

const loading = ref(false)
const error = ref<string | null>(null)
const data = ref<StatusItem[]>([])

const colorMap: Record<string, string> = {
  '2xx': '#52c41a',
  '3xx': '#1677ff',
  '4xx': '#faad14',
  '5xx': '#ff4d4f',
  '其他': '#d9d9d9',
}

const totalRequests = computed(() => data.value.reduce((sum, d) => sum + d.request_count, 0))

const chartOption = computed(() => ({
  tooltip: {
    trigger: 'item' as const,
    formatter: (params: { name: string; value: number; percent: number }) =>
      `${params.name}: ${params.value.toLocaleString()} (${params.percent}%)`,
  },
  legend: {
    orient: 'vertical' as const,
    right: 0,
    top: 'center',
    textStyle: { fontSize: 11 },
  },
  series: [
    {
      type: 'pie' as const,
      radius: ['40%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 12, fontWeight: 'bold' },
      },
      data: data.value.map((d) => ({
        name: d.status_class,
        value: d.request_count,
        itemStyle: { color: colorMap[d.status_class] || '#d9d9d9' },
      })),
    },
  ],
}))

async function loadData() {
  loading.value = true
  error.value = null
  try {
    data.value = await getStatusAnalysis(props.since)
  } catch {
    error.value = '数据加载失败'
    data.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(() => props.since, loadData)
</script>

<style scoped>
.metric-chart-card {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.chart-header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}

.chart-title {
  font-size: 12px;
  color: var(--muted);
}

.chart-body {
  flex: 1;
  min-height: 160px;
}

.chart-body :deep(.echarts) {
  height: 160px;
  width: 100%;
}

.chart-loading {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.summary-row {
  margin-bottom: 4px;
}

.summary-total {
  font-size: 11px;
  color: var(--muted);
}

.chart-empty,
.chart-error {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 12px;
}

.chart-error {
  color: var(--danger);
}
</style>
