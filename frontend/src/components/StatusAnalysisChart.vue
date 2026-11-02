<template>
  <div class="metric-chart-card">
    <div class="chart-header">
      <span class="chart-title">HTTP 状态码分析</span>
      <span class="chart-scope">{{ scopeLabel }}</span>
    </div>
    <div class="chart-body">
      <a-spin v-if="loading" class="chart-loading" />
      <div v-else-if="errorText" class="chart-error">
        <span>{{ errorText }}</span>
        <button v-if="retryable" type="button" class="chart-retry" @click="loadData">重试</button>
      </div>
      <template v-else-if="data.length">
        <div class="summary-row">
          <span class="summary-total">{{ totalRequests.toLocaleString() }} 请求</span>
        </div>
        <v-chart :option="chartOption" autoresize />
      </template>
      <div v-else class="chart-empty">统计窗口内暂无请求</div>
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
    /** 数据源可用性（父组件注入 store 值）：false 时不发请求、显示数据源不可用 */
    sourceOk?: boolean | null
    /** 全页刷新信号：每次整页刷新周期完成后由父组件 +1（design D6） */
    refreshTick?: number
  }>(),
  { since: '24h', sourceOk: null, refreshTick: 0 },
)

const SINCE_LABELS: Record<string, string> = {
  '1h': '近 1小时',
  '6h': '近 6小时',
  '24h': '近 24小时',
  '7d': '近 7天',
}
const scopeLabel = computed(() => SINCE_LABELS[props.since] || `近 ${props.since}`)

const loading = ref(false)
const failed = ref(false)
const data = ref<StatusItem[]>([])

const errorText = computed(() => {
  if (props.sourceOk === false) return '数据源不可用，无法读取指标'
  return failed.value ? '加载失败' : null
})
const retryable = computed(() => props.sourceOk !== false)

const colorMap: Record<string, string> = {
  '2xx': '#52c41a',
  '3xx': '#1677ff',
  '4xx': '#faad14',
  '5xx': '#ff4d4f',
  其他: '#d9d9d9',
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
  if (props.sourceOk === false) return
  loading.value = true
  failed.value = false
  try {
    data.value = await getStatusAnalysis(props.since)
  } catch {
    failed.value = true
    data.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(() => props.since, loadData)
watch(
  () => props.sourceOk,
  (v, old) => {
    if (old === false && v !== false) loadData()
  },
)
watch(
  () => props.refreshTick,
  (n, o) => {
    if (n !== o && n > 0 && props.sourceOk !== false) loadData()
  },
)
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
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.chart-error {
  color: var(--danger);
}

.chart-retry {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--accent);
  font-size: 12px;
  padding: 2px 10px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
}

.chart-scope {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.75;
}
</style>
