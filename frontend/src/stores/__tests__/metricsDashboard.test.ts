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
    // 3 business metrics should be loaded
    expect(getMetricTimeSeries).toHaveBeenCalledTimes(3)
    expect(store.chartDataMap['qps']).toHaveLength(1)
    expect(store.chartDataMap['connections']).toHaveLength(1)
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
    vi.mocked(getMetricTimeSeries)
      .mockResolvedValueOnce([mockDataPoint(1000, 50)]) // qps succeeds
      .mockRejectedValueOnce(new Error('fail')) // connections fails
      .mockResolvedValueOnce([mockDataPoint(1000, 0)]) // errors succeeds
    const store = useMetricsDashboardStore()
    await store.loadAllCharts()
    expect(store.chartDataMap['qps']).toHaveLength(1)
    expect(store.chartDataMap['connections']).toHaveLength(0)
    expect(store.errorMap['connections']).toBeTruthy()
    expect(store.loading).toBe(false)
  })
})
