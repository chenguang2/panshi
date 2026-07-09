import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getMetricTimeSeries } from '@/api/metrics'
import type { MetricDataPoint } from '@/types/metrics'

const intervalMap: Record<string, string> = {
  '1h': '1m',
  '6h': '5m',
  '24h': '15m',
  '7d': '1h',
}

export interface ChartDefinition {
  key: string
  label: string
  metricName: string
  labelFilter?: string
  unit?: string
}

export const BUSINESS_CHARTS: ChartDefinition[] = [
  { key: 'qps', label: 'QPS', metricName: 'edge_http_requests_total', unit: '/s' },
  { key: 'connections', label: '活跃连接数', metricName: 'edge_nginx_http_current_connections', labelFilter: 'state:active' },
  { key: 'errors', label: '采集错误率', metricName: 'edge_metric_errors_total', unit: '/s' },
]

export const INFRA_CHARTS: ChartDefinition[] = [
  { key: 'shared_capacity', label: '共享字典容量', metricName: 'edge_shared_dict_capacity_bytes' },
  { key: 'shared_free', label: '共享字典剩余', metricName: 'edge_shared_dict_free_space_bytes' },
  { key: 'scrape_duration', label: '采集耗时', metricName: 'scrape_duration_seconds' },
  { key: 'scrape_samples', label: '采集样本数', metricName: 'scrape_samples_scraped' },
  { key: 'scrape_series', label: '新增序列', metricName: 'scrape_series_added' },
  { key: 'up', label: '采集目标状态', metricName: 'up' },
]

export const useMetricsDashboardStore = defineStore('metricsDashboard', () => {
  const timeRange = ref('1h')
  const refreshInterval = ref(60)
  const autoRefreshEnabled = ref(true)
  const loading = ref(false)
  const infraLoaded = ref(false)

  const chartDataMap = ref<Record<string, MetricDataPoint[]>>({})
  const errorMap = ref<Record<string, string | null>>({})

  let refreshTimer: ReturnType<typeof setInterval> | null = null

  function intervalForRange(): string {
    return intervalMap[timeRange.value] || '5m'
  }

  async function loadSingleChart(cd: ChartDefinition): Promise<void> {
    try {
      const data = await getMetricTimeSeries(
        cd.metricName,
        timeRange.value,
        intervalForRange(),
        cd.labelFilter,
      )
      chartDataMap.value[cd.key] = data
      errorMap.value[cd.key] = null
    } catch {
      chartDataMap.value[cd.key] = []
      errorMap.value[cd.key] = '数据加载失败'
    }
  }

  async function loadAllCharts(): Promise<void> {
    loading.value = true
    const results = await Promise.allSettled(
      BUSINESS_CHARTS.map((cd) => loadSingleChart(cd)),
    )
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected' && !errorMap.value[BUSINESS_CHARTS[i].key]) {
        errorMap.value[BUSINESS_CHARTS[i].key] = '数据加载失败'
      }
    }
    loading.value = false
  }

  async function loadInfraCharts(): Promise<void> {
    const results = await Promise.allSettled(
      INFRA_CHARTS.map((cd) => loadSingleChart(cd)),
    )
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected' && !errorMap.value[INFRA_CHARTS[i].key]) {
        errorMap.value[INFRA_CHARTS[i].key] = '数据加载失败'
      }
    }
    infraLoaded.value = true
  }

  function setTimeRange(range: string): void {
    timeRange.value = range
    chartDataMap.value = {}
    errorMap.value = {}
    loadAllCharts()
  }

  function setRefreshInterval(seconds: number): void {
    refreshInterval.value = seconds
    if (autoRefreshEnabled.value) {
      restartAutoRefresh()
    }
  }

  function toggleAutoRefresh(): void {
    autoRefreshEnabled.value = !autoRefreshEnabled.value
    if (autoRefreshEnabled.value) {
      startAutoRefresh()
    } else {
      stopAutoRefresh()
    }
  }

  function startAutoRefresh(): void {
    stopAutoRefresh()
    refreshTimer = setInterval(() => {
      if (!document.hidden) {
        loadAllCharts()
      }
    }, refreshInterval.value * 1000)
  }

  function stopAutoRefresh(): void {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  function restartAutoRefresh(): void {
    if (autoRefreshEnabled.value) {
      startAutoRefresh()
    }
  }

  return {
    timeRange,
    refreshInterval,
    autoRefreshEnabled,
    loading,
    infraLoaded,
    chartDataMap,
    errorMap,
    loadAllCharts,
    loadInfraCharts,
    setTimeRange,
    setRefreshInterval,
    toggleAutoRefresh,
    startAutoRefresh,
    stopAutoRefresh,
  }
})
