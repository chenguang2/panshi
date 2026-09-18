<template>
  <div class="metric-chart-card">
    <div class="chart-header">
      <span class="chart-title">{{ title }}</span>
      <span v-if="latestValue !== null" class="chart-value">{{ formattedValue }}</span>
      <span v-if="unit" class="chart-unit">{{ unit }}</span>
    </div>
    <div class="chart-body">
      <v-chart v-if="hasData" :option="chartOption" autoresize />
      <div v-else-if="error" class="chart-error">{{ error }}</div>
      <div v-else class="chart-empty">当前无数据</div>
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
import type { MetricDataPoint } from '@/types/metrics'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

interface ChartSeriesInput {
  name: string
  color: string
  data: MetricDataPoint[]
}

const props = defineProps<{
  title: string
  data: MetricDataPoint[]
  error?: string | null
  unit?: string
  /** 多序列模式：提供时按 series 渲染多条线 + 图例，data 仅用于头部最新值 */
  series?: ChartSeriesInput[]
}>()

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

const formattedValue = computed(() => {
  if (latestValue.value === null) return '--'
  const v = latestValue.value
  // 去尾零：整数不带小数点（586 而非 586.0），小数保留原有精度
  if (v >= 100) return Number(v.toFixed(1)).toString()
  if (v >= 10) return Number(v.toFixed(2)).toString()
  return Number(v.toFixed(3)).toString()
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
      valueFormatter: (v: number) => `${v.toFixed(3)}${props.unit || ''}`,
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

.chart-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--fg);
  font-family: var(--font-mono);
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
