import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getMetricSummary, getMetricTimeSeries, getAvgLatencySeries, getFastRatioSeries } from '@/api/metrics'
import type { FastRatioBucketStats } from '@/api/metrics'
import type { MetricDataPoint } from '@/types/metrics'

const intervalMap: Record<string, string> = {
  '1h': '1m',
  '6h': '5m',
  '24h': '15m',
  '7d': '1h',
}

interface ChartDefinition {
  key: string
  label: string
  metricName: string
  labelFilter?: string
  unit?: string
  /** 加载通道（metrics-avg-latency-card D3）：缺省走 query_time_series；
   *  histogram_avg 走专用 avg-latency 端点；histogram_ratio 走 fast-ratio 端点
   *  （metrics-fast-ratio-card D4） */
  kind?: 'histogram_avg' | 'histogram_ratio'
}

// 「Nginx 连接状态」图的 4 条序列（active/reading/writing/waiting）
interface ConnectionSeriesDef {
  key: string
  state: string
  label: string
  color: string
}

export const CONNECTION_SERIES: ConnectionSeriesDef[] = [
  { key: 'connections_active', state: 'active', label: '活跃', color: '#1677ff' },
  { key: 'connections_reading', state: 'reading', label: '读取中', color: '#722ed1' },
  { key: 'connections_writing', state: 'writing', label: '写入中', color: '#13c2c2' },
  { key: 'connections_waiting', state: 'waiting', label: '等待中', color: '#8c8c8c' },
]

const CONNECTION_CHART_DEFS: ChartDefinition[] = CONNECTION_SERIES.map((s) => ({
  key: s.key,
  label: s.label,
  metricName: 'edge_nginx_http_current_connections',
  labelFilter: `state:${s.state}`,
}))

export const BUSINESS_CHARTS: ChartDefinition[] = [
  { key: 'qps', label: 'QPS', metricName: 'edge_http_requests_total', unit: '/s' },
  { key: 'avg_latency', label: '平均耗时', metricName: 'edge_http_latency', unit: 'ms', kind: 'histogram_avg' },
  {
    key: 'fast_ratio',
    label: '快速响应占比',
    metricName: 'edge_http_latency',
    unit: '%',
    kind: 'histogram_ratio',
  },
  // connections 卡片由 CONNECTION_CHART_DEFS 加载（4 状态序列），此处仅保留占位定义供视图渲染
  { key: 'connections', label: 'Nginx 连接状态', metricName: 'edge_nginx_http_current_connections' },
  { key: 'errors', label: '采集错误率', metricName: 'edge_metric_errors_total', unit: '/s' },
]

export const INFRA_CHARTS: ChartDefinition[] = [
  { key: 'shared_capacity', label: '共享字典容量', metricName: 'edge_shared_dict_capacity_bytes', unit: 'bytes' },
  { key: 'shared_free', label: '共享字典剩余', metricName: 'edge_shared_dict_free_space_bytes', unit: 'bytes' },
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
  // 数据源连接级可用性（summary 响应 source_ok）：false 显示横幅；null 不显示
  const sourceOk = ref<boolean | null>(null)
  const sourceTarget = ref('')
  // 新鲜度与全区块刷新信号（metrics-dashboard-ux-optimization D6）：
  // lastUpdated 供「更新于 HH:mm:ss」；refreshTick 供扩展四卡/基础设施区跟随刷新周期 reload
  const lastUpdated = ref<number | null>(null)
  const refreshTick = ref(0)

  // ── 快速响应占比阈值（metrics-fast-ratio-card D2/D5）──
  // 阈值只能取桶边界（bounds 由接口返回）：桶内数值无法精确统计，故控件是下拉而非输入框
  const fastRatioThresholdMs = ref<number>(10)
  const fastRatioBounds = ref<number[]>([])
  // 各桶区间占比/计数（D9 区间分布，2026-11-03）：null = 窗口无请求/加载失败 → 分布整块不渲染（D12）
  const fastRatioBuckets = ref<FastRatioBucketStats | null>(null)
  // 头部窗口聚合占比（D13）：ΣΔ前 k 桶 / ΣΔCount，与分布条同源；头部值不再取「最近一桶」
  const fastRatioWindowRatio = ref<number | null>(null)
  // 平均耗时卡头部窗口聚合均值（D13 同改）：ΣΔSum / ΣΔCount，全窗口
  const avgLatencyWindowMs = ref<number | null>(null)

  // ── 集群/节点筛选（metrics-cluster-node-filter D4）──
  // clusterId：null=全部集群；-1=未纳管节点；>0=具体集群。nodeIp 仅在具体集群下有意义。
  const clusterId = ref<number | -1 | null>(null)
  const nodeIp = ref<string | null>(null)
  // 后端单参数 filter 三形态（design D1）；nodeIp 优先于集群
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

  let sourceInFlight = false

  async function loadSourceStatus(): Promise<void> {
    if (sourceInFlight) return
    sourceInFlight = true
    try {
      const { sourceOk: ok, sourceTarget: target } = await getMetricSummary(filterParam.value)
      sourceOk.value = ok
      sourceTarget.value = target
    } catch {
      sourceOk.value = null
    } finally {
      sourceInFlight = false
    }
  }

  let refreshTimer: ReturnType<typeof setInterval> | null = null

  function intervalForRange(): string {
    return intervalMap[timeRange.value] || '5m'
  }

  async function loadSingleChart(cd: ChartDefinition): Promise<void> {
    try {
      if (cd.kind === 'histogram_ratio') {
        // 快速响应占比卡：阈值随请求下发，响应带回权威阈值与边界枚举（可回退）
        const res = await getFastRatioSeries(
          timeRange.value,
          intervalForRange(),
          filterParam.value,
          fastRatioThresholdMs.value,
        )
        chartDataMap.value[cd.key] = res.points
        fastRatioThresholdMs.value = res.thresholdMs
        fastRatioBounds.value = res.bounds
        fastRatioBuckets.value = res.bucketStats ?? null
        fastRatioWindowRatio.value = res.windowRatio ?? null
      } else {
        // histogram_avg 通道：平均耗时卡走专用端点（metrics-avg-latency-card D3），其余走通用 time-series
        if (cd.kind === 'histogram_avg') {
          const res = await getAvgLatencySeries(timeRange.value, intervalForRange(), filterParam.value)
          chartDataMap.value[cd.key] = res.points
          avgLatencyWindowMs.value = res.windowAvgMs
        } else {
          chartDataMap.value[cd.key] = await getMetricTimeSeries(
            cd.metricName,
            timeRange.value,
            intervalForRange(),
            cd.labelFilter,
            filterParam.value,
          )
        }
      }
      errorMap.value[cd.key] = null
    } catch {
      if (cd.kind === 'histogram_ratio') {
        fastRatioBuckets.value = null
        fastRatioWindowRatio.value = null
      }
      if (cd.kind === 'histogram_avg') avgLatencyWindowMs.value = null
      chartDataMap.value[cd.key] = []
      errorMap.value[cd.key] = '数据加载失败'
    }
  }

  /** 切换快速响应占比阈值：仅重发该卡（不触发全页刷新，与其他筛选的整页 reload 语义不同） */
  async function setFastRatioThreshold(ms: number): Promise<void> {
    if (fastRatioThresholdMs.value === ms) return
    fastRatioThresholdMs.value = ms
    const cd = BUSINESS_CHARTS.find((d) => d.key === 'fast_ratio')
    if (cd) await loadSingleChart(cd)
  }

  // 业务图加载目标：普通业务图 + 连接状态 4 序列（跳过 connections 占位定义）
  function businessLoadTargets(): ChartDefinition[] {
    return [...BUSINESS_CHARTS.filter((cd) => cd.key !== 'connections'), ...CONNECTION_CHART_DEFS]
  }

  let chartsInFlight = false

  // 全量加载目标（含基础设施区）：retryChart 按卡 key 查找用
  function allLoadTargets(): ChartDefinition[] {
    return [...businessLoadTargets(), ...INFRA_CHARTS]
  }

  async function loadAllCharts(): Promise<void> {
    // 单飞守卫：加载中不重复发起，避免快速切换页面时慢查询无限堆叠
    if (chartsInFlight) return
    chartsInFlight = true
    loading.value = true
    try {
      const targets = businessLoadTargets()
      void loadSourceStatus()
      const results = await Promise.allSettled(targets.map((cd) => loadSingleChart(cd)))
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected' && !errorMap.value[targets[i].key]) {
          errorMap.value[targets[i].key] = '数据加载失败'
        }
      }
    } finally {
      chartsInFlight = false
      loading.value = false
      lastUpdated.value = Date.now()
      refreshTick.value++
    }
  }

  // 单卡重试：仅重发该卡的请求（错误态「重试」按钮，design D2）
  async function retryChart(key: string): Promise<void> {
    if (key === 'connections') {
      await Promise.allSettled(CONNECTION_CHART_DEFS.map((cd) => loadSingleChart(cd)))
      return
    }
    const cd = allLoadTargets().find((d) => d.key === key)
    if (cd) await loadSingleChart(cd)
  }

  let infraInFlight = false

  async function loadInfraCharts(): Promise<void> {
    if (infraInFlight) return
    infraInFlight = true
    try {
      const results = await Promise.allSettled(INFRA_CHARTS.map((cd) => loadSingleChart(cd)))
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected' && !errorMap.value[INFRA_CHARTS[i].key]) {
          errorMap.value[INFRA_CHARTS[i].key] = '数据加载失败'
        }
      }
    } finally {
      infraInFlight = false
      infraLoaded.value = true
    }
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
    sourceOk,
    sourceTarget,
    lastUpdated,
    refreshTick,
    clusterId,
    nodeIp,
    filterParam,
    fastRatioThresholdMs,
    fastRatioBounds,
    fastRatioBuckets,
    fastRatioWindowRatio,
    avgLatencyWindowMs,
    loadAllCharts,
    loadInfraCharts,
    loadSourceStatus,
    retryChart,
    setFastRatioThreshold,
    setTimeRange,
    setRefreshInterval,
    toggleAutoRefresh,
    startAutoRefresh,
    stopAutoRefresh,
    setClusterFilter,
    setNodeFilter,
  }
})
