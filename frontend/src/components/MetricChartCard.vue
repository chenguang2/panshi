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
import { computed, shallowRef, watchEffect } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import type { MetricDataPoint } from '@/types/metrics'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const props = defineProps<{
  title: string
  data: MetricDataPoint[]
  error?: string | null
  unit?: string
}>()

const hasData = computed(() => props.data.length > 0)

const latestValue = computed<number | null>(() => {
  if (!hasData.value) return null
  const last = props.data[props.data.length - 1]
  return last.avg ?? null
})

const formattedValue = computed(() => {
  if (latestValue.value === null) return '--'
  if (latestValue.value >= 100) return latestValue.value.toFixed(1)
  if (latestValue.value >= 10) return latestValue.value.toFixed(2)
  return latestValue.value.toFixed(3)
})

const chartOption = computed(() => ({
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
}))
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

.chart-body :deep(.v-chart) {
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
