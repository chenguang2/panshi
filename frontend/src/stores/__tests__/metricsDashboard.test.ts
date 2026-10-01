import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/metrics', () => ({
  getMetricTimeSeries: vi.fn(),
}))

import { getMetricTimeSeries } from '@/api/metrics'
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
})
