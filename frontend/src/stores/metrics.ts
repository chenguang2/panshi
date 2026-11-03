import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getMetricNames, getMetricTimeSeries, getMetricSummary, getStatusAnalysis } from '@/api/metrics'
import type { StatusAnalysisItem } from '@/api/metrics'
import type { ConnectionStates, MetricDataPoint, MetricSummary } from '@/types/metrics'

const intervalMap: Record<string, string> = {
  '1h': '1m',
  '6h': '5m',
  '24h': '15m',
  '7d': '1h',
}

// 部分多序列指标必须按标签聚焦后查询：否则不同量纲的序列混入同一 avg/max
// 计算（如 nginx 连接数的 active≈1 与 accepted/handled 累计值≈数千），
// 折线会被累计值压成无变化的直线，头部值也失真。与总览页
// metricsDashboard 的 CONNECTION_CHART_DEFS 聚焦口径保持一致。
const METRIC_LABEL_FILTERS: Record<string, string> = {
  edge_nginx_http_current_connections: 'state:active',
}

// 首访默认指标（metrics-query-ux D1）：业务主指标必有数据、含义直白。
// 不再字典序第一个——那恰是已证伪的进程累计 gauge edge_http_latency_max（恒值/恒 0）。
const DEFAULT_METRIC = 'edge_http_requests_total'

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
  // 数据源连接级可用性（summary 响应 source_ok）：false 显示横幅并归因空态；null（summary 请求本身失败）不显示
  const sourceOk = ref<boolean | null>(null)
  const sourceTarget = ref('')
  const lastUpdated = ref<number | null>(null)
  // 状态码指标专项（metrics-query-ux D9-F1）：该指标不打 time-series，改按状态类组成呈现
  const statusBreakdown = ref<StatusAnalysisItem[] | null>(null)

  // ── 集群/节点筛选（metrics-query-ux D6，与总览页同款两级联动语义；共享态机 useMetricsFilter）──
  // clusterId：null=全部集群；-1=未纳管节点；>0=具体集群。nodeIp 仅在具体集群下有意义。
  const clusterId = ref<number | -1 | null>(null)
  const nodeIp = ref<string | null>(null)
  // 后端单参数 filter 三形态；nodeIp 优先于集群
  const filterParam = computed(() => {
    if (nodeIp.value) return `node:${nodeIp.value}`
    if (clusterId.value === -1) return 'unmanaged'
    if (clusterId.value != null) return `cluster:${clusterId.value}`
    return undefined
  })
  function setClusterFilter(id: number | -1 | null): void {
    // 切集群重置节点（两级联动状态机）
    clusterId.value = id
    nodeIp.value = null
  }
  function setNodeFilter(ip: string | null): void {
    nodeIp.value = ip
  }

  // ── 刷新编排（metrics-query-ux D5，与总览页同款：间隔可选 + 自动/手动 + 隐藏暂停）──
  const refreshInterval = ref(60)
  const autoRefreshEnabled = ref(true)
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  async function loadMetricNames(force = false): Promise<void> {
    // 指标名列表来自远端 ClickHouse 且变化很少：已有缓存时跳过（避免每次进页都打 2s+ 慢查询）
    if (!force && metricNames.value.length > 0) return
    loadingNames.value = true
    try {
      metricNames.value = await getMetricNames()
      if (!selectedMetric.value && metricNames.value.length > 0) {
        selectedMetric.value = metricNames.value.includes(DEFAULT_METRIC) ? DEFAULT_METRIC : metricNames.value[0]
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
    // 状态码指标：价值在 code 维度——合并速率线看不到状态码且「计数+/s」误导（D9-F1）
    // 改走 status-analysis（窗口内按状态类计数，支持 since+filter），与总览页状态码分析同源
    if (selectedMetric.value === 'edge_http_status') {
      try {
        statusBreakdown.value = await getStatusAnalysis(timeRange.value, filterParam.value)
        chartData.value = []
      } catch {
        error.value = '加载失败'
        statusBreakdown.value = null
      } finally {
        chartInFlight = false
        loading.value = false
      }
      return
    }
    statusBreakdown.value = null
    try {
      chartData.value = await getMetricTimeSeries(
        selectedMetric.value,
        timeRange.value,
        intervalMap[timeRange.value] || '5m',
        METRIC_LABEL_FILTERS[selectedMetric.value],
        filterParam.value,
      )
    } catch {
      // 归因文案由视图按 sourceOk 分派（数据源不可用 / 加载失败），store 只记通用失败
      error.value = '加载失败'
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
      // 汇总卡保持全站口径（metrics-query-ux D7）：summary 不随筛选（口径标注显式声明）
      const { summary, connectionStates: states, sourceOk: ok, sourceTarget: target } = await getMetricSummary()
      summaryData.value = summary
      connectionStates.value = states
      sourceOk.value = ok
      sourceTarget.value = target
    } catch {
      summaryData.value = {}
      connectionStates.value = {}
      sourceOk.value = null
    } finally {
      summaryInFlight = false
    }
  }

  async function loadAll(): Promise<void> {
    await Promise.all([loadChartData(), loadSummary()])
    lastUpdated.value = Date.now()
  }

  function setMetric(name: string): void {
    selectedMetric.value = name
    loadChartData()
  }

  function setTimeRange(range: string): void {
    timeRange.value = range
    loadChartData()
  }

  function setRefreshInterval(seconds: number): void {
    refreshInterval.value = seconds
    if (autoRefreshEnabled.value) {
      startAutoRefresh()
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
        loadAll()
      }
    }, refreshInterval.value * 1000)
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
    sourceOk,
    sourceTarget,
    lastUpdated,
    statusBreakdown,
    clusterId,
    nodeIp,
    filterParam,
    refreshInterval,
    autoRefreshEnabled,
    loadMetricNames,
    loadChartData,
    loadSummary,
    loadAll,
    setMetric,
    setTimeRange,
    setClusterFilter,
    setNodeFilter,
    setRefreshInterval,
    toggleAutoRefresh,
    startAutoRefresh,
    stopAutoRefresh,
  }
})
