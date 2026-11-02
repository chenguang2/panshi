<template>
  <div class="metric-chart-card">
    <div class="chart-header">
      <span class="chart-title">{{ title }}</span>
      <span v-if="scopeLabel" class="chart-scope">{{ scopeLabel }}</span>
      <span v-if="latestValue !== null" class="chart-value">{{ formattedValue }}</span>
      <span v-if="unitLabel && latestValue !== null" class="chart-unit-label">{{ unitLabel }}</span>
      <span v-if="unit && unit !== 'bytes' && unit !== 'bytes/s'" class="chart-unit">{{ unit }}</span>
    </div>
    <div class="chart-body">
      <div v-if="loading" class="chart-skeleton" aria-hidden="true"></div>
      <v-chart v-else-if="hasData" :option="chartOption" autoresize />
      <div v-else-if="errorText" class="chart-error">
        <span>{{ errorText }}</span>
        <button v-if="retryable" type="button" class="chart-retry" @click="emit('retry')">重试</button>
      </div>
      <div v-else class="chart-empty">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { formatFileSize } from '@/utils/format'
import type { MetricDataPoint } from '@/types/metrics'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

interface ChartSeriesInput {
  name: string
  color: string
  data: MetricDataPoint[]
}

const props = withDefaults(
  defineProps<{
    title: string
    data: MetricDataPoint[]
    error?: string | null
    unit?: string
    /** 多序列模式：提供时按 series 渲染多条线 + 图例，data 仅用于头部最新值 */
    series?: ChartSeriesInput[]
    /** 加载中骨架（metrics-dashboard-ux-optimization D2 三态机：loading > error > empty > data） */
    loading?: boolean
    /** 空态文案：流量类「统计窗口内暂无请求」，上报类默认「暂无上报数据」 */
    emptyText?: string
    /** 错误可重试（数据源不可用态传 false，与全页横幅同语义） */
    retryable?: boolean
    /** 头部值后缀标注（连接状态卡「活跃」） */
    unitLabel?: string
    /** 标题旁口径标注（平均耗时卡「近 {time range}」，metrics-avg-latency-card 文案 #2） */
    scopeLabel?: string
  }>(),
  {
    error: null,
    unit: undefined,
    series: undefined,
    loading: false,
    emptyText: '暂无上报数据',
    retryable: false,
    unitLabel: undefined,
    scopeLabel: undefined,
  },
)

const emit = defineEmits<{ retry: [] }>()

// 错误文案由页面按数据源状态归因后传入（数据源不可用 / 加载失败），卡片只负责渲染
const errorText = computed(() => props.error || null)

const hasData = computed(() => (props.series ? props.series.length > 0 : props.data.length > 0))

// 头部"当前值"取值优先级：
// 1. 最近一个带 last（gauge 最新读数）的点——连接数等瞬时值不应显示桶均值的假小数
// 2. 最近一个 sample_count >= 2 的点的 avg——刚开的计数器桶常只有 1 个样本，
//    单点无增量可算（rate=0），直接取会令 QPS 卡片频繁闪现 0.000
const latestValue = computed<number | null>(() => {
  if (!hasData.value) return null
  const pts = props.data
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    if (p && p.last !== undefined && p.last !== null) return p.last
    if (p && (p.sample_count ?? 0) >= 2) return p.avg ?? null
  }
  const last = pts[pts.length - 1]
  return last?.avg ?? null
})

/** 数值格式化：字节类经 formatFileSize 人性化（design D3），其余按量级裁尾零 */
function formatMetricValue(v: number): string {
  if (props.unit === 'bytes') return formatFileSize(v)
  if (props.unit === 'bytes/s') return `${formatFileSize(v)}/s`
  if (v >= 100) return Number(v.toFixed(1)).toString()
  if (v >= 10) return Number(v.toFixed(2)).toString()
  return Number(v.toFixed(3)).toString()
}

const formattedValue = computed(() => {
  if (latestValue.value === null) return '--'
  return formatMetricValue(latestValue.value)
})

const chartOption = computed(() => {
  if (props.series) {
    // 多序列模式：连接状态等细分场景，图例置底、细线无符号
    return {
      tooltip: {
        trigger: 'axis' as const,
        valueFormatter: (v: number) => `${Math.round(v)}${props.unit || ''}`,
      },
      grid: { left: 4, right: 4, top: 4, bottom: 20 },
      legend: {
        bottom: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 3,
        itemGap: 10,
        textStyle: { fontSize: 10, color: '#8c8c8c' },
      },
      xAxis: { show: false, type: 'time' as const },
      yAxis: { show: false, min: 0 },
      series: props.series.map((s) => ({
        name: s.name,
        type: 'line' as const,
        data: s.data.map((d) => [d.timestamp * 1000, d.avg]),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.5, color: s.color },
      })),
    }
  }
  return {
    tooltip: {
      trigger: 'axis' as const,
      valueFormatter: (v: number) =>
        `${formatMetricValue(v)}${props.unit === 'bytes' || props.unit === 'bytes/s' ? '' : props.unit || ''}`,
    },
    grid: { left: 4, right: 4, top: 4, bottom: 4 },
    xAxis: { show: false, type: 'time' as const },
    yAxis: { show: false, min: 0 },
    series: [
      {
        type: 'line' as const,
        data: props.data.map((d) => [d.timestamp * 1000, d.avg]),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: '#1677ff' },
        areaStyle: { color: 'rgba(22,119,255,0.08)' },
      },
    ],
  }
})
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

.chart-scope {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.75;
}

.chart-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--fg);
  font-family: var(--font-mono);
}

.chart-unit-label {
  font-size: 11px;
  color: var(--muted);
}

.chart-unit {
  font-size: 11px;
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

/* 加载骨架：shimmer 占位（design D2，替代「闪现当前无数据」） */
.chart-skeleton {
  height: 160px;
  border-radius: var(--radius-sm, 6px);
  background: linear-gradient(100deg, var(--bg) 40%, var(--surface) 50%, var(--bg) 60%);
  background-size: 200% 100%;
  animation: chart-shimmer 1.4s ease infinite;
}

@keyframes chart-shimmer {
  0% {
    background-position: 120% 0;
  }
  100% {
    background-position: -80% 0;
  }
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

.chart-retry:hover {
  text-decoration: underline;
}
</style>
