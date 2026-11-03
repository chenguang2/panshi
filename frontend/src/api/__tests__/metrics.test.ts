import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) },
}))

describe('metrics API — 快速响应占比（metrics-fast-ratio-card）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes since/interval/filter/threshold_ms and unwraps points+threshold+bounds', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        data: [{ metric_name: 'edge_http_latency', timestamp: 1000, avg: 99.97, sample_count: 10 }],
        threshold_ms: 100,
        bounds: [10, 20, 50, 100],
      },
    })
    const { getFastRatioSeries } = await import('../metrics')
    const res = await getFastRatioSeries('1h', '1m', 'cluster:7', 100)
    expect(mockApiGet).toHaveBeenCalledWith('/metrics/fast-ratio', {
      params: { since: '1h', interval: '1m', filter: 'cluster:7', threshold_ms: 100 },
    })
    expect(res.points).toHaveLength(1)
    expect(res.points[0].avg).toBe(99.97)
    expect(res.thresholdMs).toBe(100)
    expect(res.bounds).toEqual([10, 20, 50, 100])
  })

  it('unwraps bucket_stats into bucketStats（D9 区间分布）', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        data: [],
        threshold_ms: 10,
        bounds: [10, 20],
        bucket_stats: { bounds: [10, 20], ratios: [99.9, 0.1, 0], counts: [999, 1, 0], total: 1000 },
      },
    })
    const { getFastRatioSeries } = await import('../metrics')
    const res = await getFastRatioSeries('1h', '1m')
    expect(res.bucketStats).toEqual({ bounds: [10, 20], ratios: [99.9, 0.1, 0], counts: [999, 1, 0], total: 1000 })
  })

  it('bucket_stats 缺省 → bucketStats null（不显示分布）', async () => {
    mockApiGet.mockResolvedValue({ data: { data: [] } })
    const { getFastRatioSeries } = await import('../metrics')
    const res = await getFastRatioSeries('1h', '1m')
    expect(res.bucketStats).toBeNull()
  })

  it('unwraps window_ratio into windowRatio（D13 头部窗口聚合口径）', async () => {
    mockApiGet.mockResolvedValue({
      data: { data: [], threshold_ms: 10, bounds: [10], window_ratio: 99.98 },
    })
    const { getFastRatioSeries } = await import('../metrics')
    const res = await getFastRatioSeries('1h', '1m')
    expect(res.windowRatio).toBe(99.98)
  })

  it('window_ratio 缺省 → windowRatio null（头部回落 data 末点/`--`）', async () => {
    mockApiGet.mockResolvedValue({ data: { data: [] } })
    const { getFastRatioSeries } = await import('../metrics')
    const res = await getFastRatioSeries('1h', '1m')
    expect(res.windowRatio).toBeNull()
  })

  it('平均耗时：unwraps points + window_avg_ms（D13 头部窗口聚合口径）', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        data: [{ metric_name: 'edge_http_latency', timestamp: 1000, avg: 0.823, sample_count: 500 }],
        window_avg_ms: 0.939,
      },
    })
    const { getAvgLatencySeries } = await import('../metrics')
    const res = await getAvgLatencySeries('1h', '1m', 'cluster:7')
    expect(mockApiGet).toHaveBeenCalledWith('/metrics/avg-latency', {
      params: { since: '1h', interval: '1m', filter: 'cluster:7' },
    })
    expect(res.points).toHaveLength(1)
    expect(res.windowAvgMs).toBe(0.939)
  })

  it('平均耗时：window_avg_ms 缺省 → null', async () => {
    mockApiGet.mockResolvedValue({ data: { data: [] } })
    const { getAvgLatencySeries } = await import('../metrics')
    const res = await getAvgLatencySeries('1h', '1m')
    expect(res.windowAvgMs).toBeNull()
  })

  it('omits filter/threshold_ms when not provided', async () => {
    mockApiGet.mockResolvedValue({ data: { data: [] } })
    const { getFastRatioSeries } = await import('../metrics')
    await getFastRatioSeries('1h', '1m')
    expect(mockApiGet.mock.calls[0][1]).toEqual({ params: { since: '1h', interval: '1m' } })
  })

  it('falls back to 10ms threshold and empty bounds when response omits them', async () => {
    mockApiGet.mockResolvedValue({ data: { data: [] } })
    const { getFastRatioSeries } = await import('../metrics')
    const res = await getFastRatioSeries('1h', '1m')
    expect(res.thresholdMs).toBe(10)
    expect(res.bounds).toEqual([])
    expect(res.points).toEqual([])
  })
})
