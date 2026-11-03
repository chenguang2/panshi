import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/metrics', () => ({
  getMetricTimeSeries: vi.fn(),
  getMetricSummary: vi.fn(),
  getAvgLatencySeries: vi.fn(),
  getFastRatioSeries: vi.fn(),
}))

import { getMetricTimeSeries, getMetricSummary, getAvgLatencySeries, getFastRatioSeries } from '@/api/metrics'
import { useMetricsDashboardStore } from '../metricsDashboard'
import type { MetricDataPoint } from '@/types/metrics'

const mockDataPoint = (ts: number, avg: number): MetricDataPoint => ({
  metric_name: 'test',
  timestamp: ts,
  avg,
  sample_count: 1,
})

describe('metricsDashboard store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads all business charts concurrently', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    // qps + errors + 连接状态 4 序列（active/reading/writing/waiting）= 6
    expect(getMetricTimeSeries).toHaveBeenCalledTimes(6)
    expect(store.chartDataMap['qps']).toHaveLength(1)
    expect(store.chartDataMap['connections_active']).toHaveLength(1)
    expect(store.chartDataMap['connections_waiting']).toHaveLength(1)
    expect(store.chartDataMap['errors']).toHaveLength(1)
    expect(store.loading).toBe(false)
  })

  it('sets timeRange and reloads all charts', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    const store = useMetricsDashboardStore()
    store.setTimeRange('6h')
    expect(store.timeRange).toBe('6h')
    expect(getMetricTimeSeries).toHaveBeenCalled()
  })

  it('sets refreshInterval', () => {
    const store = useMetricsDashboardStore()
    store.setRefreshInterval(120)
    expect(store.refreshInterval).toBe(120)
  })

  it('toggles auto refresh', () => {
    const store = useMetricsDashboardStore()
    expect(store.autoRefreshEnabled).toBe(true)
    store.toggleAutoRefresh()
    expect(store.autoRefreshEnabled).toBe(false)
    store.toggleAutoRefresh()
    expect(store.autoRefreshEnabled).toBe(true)
  })

  it('loads infrastructure charts on demand', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    const store = useMetricsDashboardStore()
    await store.loadInfraCharts()
    // 6 infrastructure metrics should be loaded
    expect(getMetricTimeSeries).toHaveBeenCalledTimes(6)
    expect(store.infraLoaded).toBe(true)
  })

  it('handles partial failures gracefully', async () => {
    // URL 感知 mock（约定 #43）：按 metricName / label 分发，不依赖调用顺序。
    // 与真实请求对应：getMetricTimeSeries(metricName, since, interval, label)，
    // 连接状态 4 序列共享 metricName=edge_nginx_http_current_connections，以 label=state:* 区分。
    const seriesValues: Record<string, number> = {
      'state:reading': 1,
      'state:writing': 2,
      'state:waiting': 3,
    }
    vi.mocked(getMetricTimeSeries).mockImplementation(
      async (_metricName: string, _since: string, _interval: string, label?: string) => {
        if (label === 'state:active') throw new Error('fail') // connections_active 失败
        return [mockDataPoint(1000, seriesValues[label ?? ''] ?? 50)]
      },
    )
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    expect(store.chartDataMap['qps']).toHaveLength(1)
    expect(store.errorMap['errors']).toBeNull()
    expect(store.chartDataMap['connections_active']).toHaveLength(0)
    expect(store.errorMap['connections_active']).toBeTruthy()
    expect(store.chartDataMap['connections_reading']).toHaveLength(1)
    expect(store.chartDataMap['connections_writing']).toHaveLength(1)
    expect(store.chartDataMap['connections_waiting']).toHaveLength(1)
    expect(store.loading).toBe(false)
  })

  it('loadAllCharts 完成后更新 lastUpdated 与 refreshTick（页面新鲜度与全区块刷新信号）', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    vi.mocked(getMetricSummary).mockResolvedValue({
      summary: {},
      connectionStates: {},
      sourceOk: true,
      sourceTarget: 'ch:9000',
    })
    const store = useMetricsDashboardStore()
    expect(store.refreshTick).toBe(0)
    expect(store.lastUpdated).toBeNull()
    await store.loadAllCharts()
    expect(store.refreshTick).toBe(1)
    expect(store.lastUpdated).not.toBeNull()
    await store.loadAllCharts()
    expect(store.refreshTick).toBe(2)
  })

  it('retryChart 只重发指定卡片的请求', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    vi.mocked(getMetricTimeSeries).mockClear()
    await store.retryChart('qps')
    expect(getMetricTimeSeries).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getMetricTimeSeries).mock.calls[0][0]).toBe('edge_http_requests_total')
    expect(store.chartDataMap['qps']).toHaveLength(1)
  })

  it('retryChart(connections) 重发连接状态 4 序列', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    vi.mocked(getMetricTimeSeries).mockClear()
    await store.retryChart('connections')
    expect(getMetricTimeSeries).toHaveBeenCalledTimes(4)
  })

  it('filterParam 组装：默认不过滤 / 集群 / 未纳管 / 节点优先（metrics-cluster-node-filter D4）', () => {
    const store = useMetricsDashboardStore()
    expect(store.filterParam).toBeUndefined()
    store.setClusterFilter(3)
    expect(store.filterParam).toBe('cluster:3')
    store.setClusterFilter(-1)
    expect(store.filterParam).toBe('unmanaged')
    store.setClusterFilter(null)
    expect(store.filterParam).toBeUndefined()
    store.setClusterFilter(3)
    store.setNodeFilter('10.0.0.1')
    expect(store.filterParam).toBe('node:10.0.0.1')
    store.setNodeFilter(null)
    expect(store.filterParam).toBe('cluster:3')
  })

  it('setClusterFilter 重置节点选择（两级联动状态机）', () => {
    const store = useMetricsDashboardStore()
    store.setClusterFilter(3)
    store.setNodeFilter('10.0.0.1')
    store.setClusterFilter(5)
    expect(store.nodeIp).toBeNull()
    expect(store.clusterId).toBe(5)
  })

  it('加载函数透传 filter（time-series 全部目标 + summary）', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    vi.mocked(getMetricSummary).mockResolvedValue({
      summary: {},
      connectionStates: {},
      sourceOk: true,
      sourceTarget: 'ch:9000',
    })
    const store = useMetricsDashboardStore()
    store.setClusterFilter(7)
    await store.loadAllCharts()
    // qps + errors + 连接状态 4 序列 = 6 个 time-series 调用全部带 filter
    expect(getMetricTimeSeries).toHaveBeenCalledTimes(6)
    expect(vi.mocked(getMetricTimeSeries).mock.calls.every((c) => c[4] === 'cluster:7')).toBe(true)
    expect(getMetricSummary).toHaveBeenLastCalledWith('cluster:7')
  })

  it('avg_latency 卡走 histogram 专用加载（metrics-avg-latency-card D3）', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    vi.mocked(getAvgLatencySeries).mockResolvedValue({ points: [mockDataPoint(1000, 0.8)], windowAvgMs: 0.9 })
    const store = useMetricsDashboardStore()
    store.setClusterFilter(7)
    await store.loadAllCharts()
    // qps + errors + 4 连接序列走 time-series；avg_latency 走 histogram 专用 API
    expect(getAvgLatencySeries).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getAvgLatencySeries).mock.calls[0]).toEqual(['1h', '1m', 'cluster:7'])
    expect(store.chartDataMap['avg_latency']).toEqual([mockDataPoint(1000, 0.8)])
    expect(store.avgLatencyWindowMs).toBe(0.9)
  })

  it('retryChart(avg_latency) 只重发 histogram 专用请求', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    vi.mocked(getAvgLatencySeries).mockResolvedValue({ points: [mockDataPoint(1000, 0.8)], windowAvgMs: 0.9 })
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    vi.mocked(getAvgLatencySeries).mockClear()
    vi.mocked(getMetricTimeSeries).mockClear()
    await store.retryChart('avg_latency')
    expect(getAvgLatencySeries).toHaveBeenCalledTimes(1)
    expect(getMetricTimeSeries).not.toHaveBeenCalled()
    vi.mocked(getAvgLatencySeries).mockRejectedValue(new Error('boom'))
    await store.retryChart('avg_latency')
    expect(store.avgLatencyWindowMs).toBeNull()
  })

  it('时间范围变化时 avg_latency 用新聚合间隔重发', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    vi.mocked(getAvgLatencySeries).mockResolvedValue({ points: [mockDataPoint(1000, 0.8)], windowAvgMs: 0.9 })
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    vi.mocked(getAvgLatencySeries).mockClear()
    store.setTimeRange('24h')
    await vi.waitFor(() => expect(getAvgLatencySeries).toHaveBeenCalledTimes(1))
    expect(vi.mocked(getAvgLatencySeries).mock.calls[0][1]).toBe('15m')
  })

  it('fast_ratio 卡走 histogram 占比专用 API，并回写阈值与边界（metrics-fast-ratio-card D4）', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    vi.mocked(getFastRatioSeries).mockResolvedValue({
      points: [mockDataPoint(1000, 99.97)],
      thresholdMs: 10,
      bounds: [10, 20, 50],
    })
    const store = useMetricsDashboardStore()
    store.setClusterFilter(7)
    await store.loadAllCharts()
    expect(vi.mocked(getFastRatioSeries)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getFastRatioSeries).mock.calls[0]).toEqual(['1h', '1m', 'cluster:7', 10])
    expect(store.chartDataMap['fast_ratio']).toEqual([mockDataPoint(1000, 99.97)])
    expect(store.fastRatioThresholdMs).toBe(10)
    expect(store.fastRatioBounds).toEqual([10, 20, 50])
  })

  it('fast_ratio 响应写入 fastRatioBuckets（D9 区间分布）', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    const bucketStats = { bounds: [10, 20, 50], ratios: [99.5, 0.4, 0.1, 0], counts: [995, 4, 1, 0], total: 1000 }
    vi.mocked(getFastRatioSeries).mockResolvedValue({
      points: [mockDataPoint(1000, 99.97)],
      thresholdMs: 10,
      bounds: [10, 20, 50],
      bucketStats,
      windowRatio: 99.5,
    })
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    expect(store.fastRatioBuckets).toEqual(bucketStats)
    expect(store.fastRatioWindowRatio).toBe(99.5)
  })

  it('fast_ratio 响应缺 bucketStats / 请求失败 → fastRatioBuckets/fastRatioWindowRatio 置 null（分布整块隐藏）', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    vi.mocked(getFastRatioSeries).mockResolvedValue({ points: [], thresholdMs: 10, bounds: [10] })
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    expect(store.fastRatioBuckets).toBeNull()
    expect(store.fastRatioWindowRatio).toBeNull()
    vi.mocked(getFastRatioSeries).mockRejectedValue(new Error('boom'))
    await store.retryChart('fast_ratio')
    expect(store.fastRatioBuckets).toBeNull()
    expect(store.fastRatioWindowRatio).toBeNull()
  })

  it('setFastRatioThreshold 只重发 fast_ratio 一张卡（阈值切换不触发整页刷新）', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    vi.mocked(getFastRatioSeries).mockResolvedValue({ points: [], thresholdMs: 10, bounds: [10, 100] })
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    vi.mocked(getFastRatioSeries).mockClear()
    vi.mocked(getMetricTimeSeries).mockClear()

    vi.mocked(getFastRatioSeries).mockResolvedValue({ points: [], thresholdMs: 100, bounds: [10, 100] })
    await store.setFastRatioThreshold(100)

    expect(vi.mocked(getFastRatioSeries)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getFastRatioSeries).mock.calls[0][3]).toBe(100)
    expect(vi.mocked(getMetricTimeSeries)).not.toHaveBeenCalled()
    expect(store.fastRatioThresholdMs).toBe(100)
  })

  it('setFastRatioThreshold 同值不重复请求', async () => {
    const store = useMetricsDashboardStore()
    vi.mocked(getFastRatioSeries).mockClear()
    await store.setFastRatioThreshold(10)
    expect(vi.mocked(getFastRatioSeries)).not.toHaveBeenCalled()
  })

  it('retryChart(fast_ratio) 只重发占比请求', async () => {
    vi.mocked(getMetricTimeSeries).mockResolvedValue([mockDataPoint(1000, 50)])
    vi.mocked(getFastRatioSeries).mockResolvedValue({ points: [], thresholdMs: 10, bounds: [10] })
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    vi.mocked(getFastRatioSeries).mockClear()
    vi.mocked(getMetricTimeSeries).mockClear()
    await store.retryChart('fast_ratio')
    expect(vi.mocked(getFastRatioSeries)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getMetricTimeSeries)).not.toHaveBeenCalled()
  })
})
