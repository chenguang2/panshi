import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/metrics', () => ({
  getMetricNames: vi.fn(),
  getMetricTimeSeries: vi.fn(),
  getMetricSummary: vi.fn(),
  getStatusAnalysis: vi.fn(),
}))

import { getMetricNames, getMetricTimeSeries, getMetricSummary, getStatusAnalysis } from '@/api/metrics'
import { useMetricsStore } from '../metrics'
import type { MetricDataPoint } from '@/types/metrics'

const dp = (avg = 1, unit?: string): MetricDataPoint => ({
  metric_name: 'm',
  timestamp: 1000,
  avg,
  sample_count: 2,
  ...(unit ? { unit } : {}),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.mocked(getMetricSummary).mockResolvedValue({
    summary: {},
    connectionStates: {},
    sourceOk: true,
    sourceTarget: 'ch:9000',
  })
})

afterEach(() => {
  vi.useRealTimers()
})

function newStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return useMetricsStore()
}

describe('metrics store — 指标查询页（metrics-query-ux）', () => {
  describe('默认指标（D1）', () => {
    it('首访默认选中 edge_http_requests_total，不再字典序第一个', async () => {
      vi.mocked(getMetricNames).mockResolvedValue(['edge_http_latency_max', 'edge_http_requests_total'])
      const store = newStore()
      await store.loadMetricNames()
      expect(store.selectedMetric).toBe('edge_http_requests_total')
    })

    it('首选指标不在清单时回退首项', async () => {
      vi.mocked(getMetricNames).mockResolvedValue(['edge_bandwidth', 'edge_http_status'])
      const store = newStore()
      await store.loadMetricNames()
      expect(store.selectedMetric).toBe('edge_bandwidth')
    })
  })

  describe('集群/节点筛选（D6）', () => {
    it('filterParam 三形态 + 未筛选 undefined', () => {
      const store = newStore()
      expect(store.filterParam).toBeUndefined()
      store.setClusterFilter(7)
      expect(store.filterParam).toBe('cluster:7')
      store.setNodeFilter('10.0.0.1')
      expect(store.filterParam).toBe('node:10.0.0.1')
      store.setNodeFilter(null)
      store.setClusterFilter(-1)
      expect(store.filterParam).toBe('unmanaged')
    })

    it('切集群重置节点（两级联动状态机）', () => {
      const store = newStore()
      store.setClusterFilter(7)
      store.setNodeFilter('10.0.0.1')
      store.setClusterFilter(8)
      expect(store.nodeIp).toBeNull()
      expect(store.filterParam).toBe('cluster:8')
    })

    it('loadChartData 透传 filter 到 time-series API', async () => {
      vi.mocked(getMetricNames).mockResolvedValue(['edge_http_requests_total'])
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const store = newStore()
      await store.loadMetricNames()
      store.setClusterFilter(7)
      await store.loadChartData()
      expect(vi.mocked(getMetricTimeSeries).mock.calls[0]).toEqual([
        'edge_http_requests_total',
        '1h',
        '1m',
        undefined,
        'cluster:7',
      ])
    })
  })

  describe('查询状态与错误（D3 归因前置）', () => {
    it('请求失败置 error=加载失败 并清空数据（归因文案由视图按 sourceOk 分派）', async () => {
      vi.mocked(getMetricNames).mockResolvedValue(['edge_http_requests_total'])
      vi.mocked(getMetricTimeSeries).mockRejectedValue(new Error('boom'))
      const store = newStore()
      await store.loadMetricNames()
      await store.loadChartData()
      expect(store.error).toBe('加载失败')
      expect(store.chartData).toEqual([])
    })

    it('loadAll 完成写 lastUpdated（更新于时间戳数据源）', async () => {
      vi.mocked(getMetricNames).mockResolvedValue(['edge_http_requests_total'])
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const store = newStore()
      await store.loadMetricNames()
      expect(store.lastUpdated).toBeNull()
      await store.loadAll()
      expect(store.lastUpdated).not.toBeNull()
    })
  })

  describe('状态码指标专项（D9-F1）', () => {
    it('edge_http_status 走 status-analysis（since+filter），不打 time-series', async () => {
      vi.mocked(getMetricNames).mockResolvedValue(['edge_http_status'])
      vi.mocked(getStatusAnalysis).mockResolvedValue([{ status_class: '2xx', request_count: 42, percentage: 97.7 }])
      const store = newStore()
      await store.loadMetricNames()
      store.selectedMetric = 'edge_http_status'
      store.setClusterFilter(7)
      await store.loadChartData()
      expect(getStatusAnalysis).toHaveBeenCalledWith('1h', 'cluster:7')
      expect(getMetricTimeSeries).not.toHaveBeenCalled()
      expect(store.statusBreakdown).toEqual([{ status_class: '2xx', request_count: 42, percentage: 97.7 }])
      expect(store.chartData).toEqual([])
    })

    it('status-analysis 失败置 error，breakdown 清空', async () => {
      vi.mocked(getMetricNames).mockResolvedValue(['edge_http_status'])
      vi.mocked(getStatusAnalysis).mockRejectedValue(new Error('boom'))
      const store = newStore()
      await store.loadMetricNames()
      store.selectedMetric = 'edge_http_status'
      await store.loadChartData()
      expect(store.error).toBe('加载失败')
      expect(store.statusBreakdown).toBeNull()
    })

    it('切回普通指标时 breakdown 复位', async () => {
      vi.mocked(getMetricNames).mockResolvedValue(['edge_http_status', 'edge_bandwidth'])
      vi.mocked(getStatusAnalysis).mockResolvedValue([{ status_class: '2xx', request_count: 1, percentage: 100 }])
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const store = newStore()
      await store.loadMetricNames()
      store.selectedMetric = 'edge_http_status'
      await store.loadChartData()
      expect(store.statusBreakdown).not.toBeNull()
      store.setMetric('edge_bandwidth')
      await vi.waitFor(() => expect(store.statusBreakdown).toBeNull())
    })
  })

  describe('刷新编排（D5，与总览页同款）', () => {
    it('默认 60s 周期自动刷新；setRefreshInterval(120) 重启定时器', async () => {
      vi.mocked(getMetricNames).mockResolvedValue(['edge_http_requests_total'])
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const store = newStore()
      await store.loadMetricNames()
      store.startAutoRefresh()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(getMetricTimeSeries).toHaveBeenCalledTimes(1)
      store.setRefreshInterval(120)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(getMetricTimeSeries).toHaveBeenCalledTimes(1) // 旧 60s 定时器已被清理
      await vi.advanceTimersByTimeAsync(60_000)
      expect(getMetricTimeSeries).toHaveBeenCalledTimes(2)
      store.stopAutoRefresh()
    })

    it('toggleAutoRefresh 关闭后停止自动刷新', async () => {
      vi.mocked(getMetricNames).mockResolvedValue(['edge_http_requests_total'])
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const store = newStore()
      await store.loadMetricNames()
      store.toggleAutoRefresh()
      await vi.advanceTimersByTimeAsync(120_000)
      expect(getMetricTimeSeries).toHaveBeenCalledTimes(0)
    })
  })
})
