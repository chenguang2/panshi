import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getMetricNames, getMetricTimeSeries, getMetricSummary } from '@/api/metrics'
import type { ConnectionStates, MetricDataPoint, MetricSummary } from '@/types/metrics'

const intervalMap: Record<string, string> = {
  '1h': '1m',
  '6h': '5m',
  '24h': '15m',
  '7d': '1h',
}

export const useMetricsStore = defineStore('metrics', () => {
  const metricNames = ref<string[]>([])
  const selectedMetric = ref<string>('')
  const timeRange = ref<string>('1h')
  const chartData = ref<MetricDataPoint[]>([])
  const summaryData = ref<MetricSummary>({})
  const connectionStates = ref<ConnectionStates>({})
  const loading = ref(false)
  const loadingNames = ref(false)
  const error = ref<string | null>(null)

  let refreshTimer: ReturnType<typeof setInterval> | null = null

  async function loadMetricNames(force = false): Promise<void> {
    // 指标名列表来自远端 ClickHouse 且变化很少：已有缓存时跳过（避免每次进页都打 2s+ 慢查询）
    if (!force && metricNames.value.length > 0) return
    loadingNames.value = true
    try {
      metricNames.value = await getMetricNames()
      if (!selectedMetric.value && metricNames.value.length > 0) {
        selectedMetric.value = metricNames.value[0]
      }
    } catch {
      // silent fail -- names will be empty
    } finally {
      loadingNames.value = false
    }
  }

  let chartInFlight = false

  async function loadChartData(): Promise<void> {
    if (!selectedMetric.value || chartInFlight) return
    chartInFlight = true
    loading.value = true
    error.value = null
    try {
      chartData.value = await getMetricTimeSeries(
        selectedMetric.value,
        timeRange.value,
        intervalMap[timeRange.value] || '5m',
      )
    } catch {
      error.value = '数据加载失败'
      chartData.value = []
    } finally {
      chartInFlight = false
      loading.value = false
    }
  }

  let summaryInFlight = false

  async function loadSummary(): Promise<void> {
    if (summaryInFlight) return
    summaryInFlight = true
    try {
      const { summary, connectionStates: states } = await getMetricSummary()
      summaryData.value = summary
      connectionStates.value = states
    } catch {
      summaryData.value = {}
      connectionStates.value = {}
    } finally {
      summaryInFlight = false
    }
  }

  async function loadAll(): Promise<void> {
    await Promise.all([loadChartData(), loadSummary()])
  }

  function setMetric(name: string): void {
    selectedMetric.value = name
    loadChartData()
  }

  function setTimeRange(range: string): void {
    timeRange.value = range
    loadChartData()
  }

  function startAutoRefresh(): void {
    stopAutoRefresh()
    refreshTimer = setInterval(() => {
      if (!document.hidden) {
        loadAll()
      }
    }, 60000)
  }

  function stopAutoRefresh(): void {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  return {
    metricNames,
    selectedMetric,
    timeRange,
    chartData,
    summaryData,
    connectionStates,
    loading,
    loadingNames,
    error,
    loadMetricNames,
    loadChartData,
    loadSummary,
    loadAll,
    setMetric,
    setTimeRange,
    startAutoRefresh,
    stopAutoRefresh,
  }
})
