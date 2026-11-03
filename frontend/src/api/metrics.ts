import api from '@/api'
import type { ConnectionStates, MetricDataPoint, MetricSummary } from '@/types/metrics'

export async function getMetricNames(): Promise<string[]> {
  const res = await api.get('/metrics/names')
  return res.data.data as string[]
}

export async function getMetricTimeSeries(
  metricName: string,
  since = '1h',
  interval = '5m',
  label?: string,
  filter?: string,
): Promise<MetricDataPoint[]> {
  const params: Record<string, string> = { since, interval }
  if (label) params.label = label
  if (filter) params.filter = filter
  const res = await api.get(`/metrics/${metricName}`, { params })
  return res.data.data as MetricDataPoint[]
}

interface MetricSummaryResult {
  summary: MetricSummary
  connectionStates: ConnectionStates
  sourceOk: boolean | null
  sourceTarget: string
}

export async function getMetricSummary(filter?: string): Promise<MetricSummaryResult> {
  const params: Record<string, string> = {}
  if (filter) params.filter = filter
  const res = await api.get('/metrics/summary', { params })
  return {
    summary: res.data.data as MetricSummary,
    connectionStates: (res.data.connection_states ?? {}) as ConnectionStates,
    sourceOk: typeof res.data.source_ok === 'boolean' ? res.data.source_ok : null,
    sourceTarget: (res.data.source ?? '') as string,
  }
}

// ── Route Stats ──
// 后端按 stats_type 返回不同字段组合（qps/bandwidth/error_rate/latency），
// 统一为扁平可选字段结构，与 app/services/metrics_service.py 的返回保持一致
export interface RouteStatsItem {
  route_id: string
  uri?: string
  // qps
  requests_per_sec?: number
  total_requests?: number
  sample_count?: number
  // bandwidth
  direction?: string
  bytes_per_sec?: number
  total_bytes?: number
  // error_rate
  client_errors?: number
  server_errors?: number
  error_rate_pct?: number
  // latency
  latency_type?: string
  avg_latency_ms?: number
  max_latency_ms?: number
}

export async function getRouteStats(
  statsType: string,
  since: string,
  limit: number,
  latencyType?: string,
  filter?: string,
): Promise<RouteStatsItem[]> {
  const params: Record<string, string | number> = { stats_type: statsType, since, limit }
  if (latencyType) params.latency_type = latencyType
  if (filter) params.filter = filter
  const res = await api.get('/metrics/route-stats', { params })
  return res.data.data as RouteStatsItem[]
}

// ── Status Analysis ──
export interface StatusAnalysisItem {
  status_class: string
  request_count: number
  percentage: number
}

export async function getStatusAnalysis(since: string, filter?: string): Promise<StatusAnalysisItem[]> {
  const params: Record<string, string> = { since }
  if (filter) params.filter = filter
  const res = await api.get('/metrics/status-analysis', { params })
  return res.data.data as StatusAnalysisItem[]
}

// ── Time Comparison ──
export interface DayOverDayData {
  today_requests: number
  yesterday_requests: number
  change_rate: number
  data_quality: string
}

interface HourlyDistributionItem {
  hour_of_day: number
  day_of_week: number
  request_count: number
}

export async function getTimeComparison(
  comparisonType: string,
  days?: number,
  filter?: string,
): Promise<DayOverDayData | HourlyDistributionItem[]> {
  const params: Record<string, string | number> = { comparison_type: comparisonType }
  if (days) params.days = days
  if (filter) params.filter = filter
  const res = await api.get('/metrics/time-comparison', { params })
  return res.data.data as DayOverDayData | HourlyDistributionItem[]
}

// ── Node Health ──
interface NodeHealthItem {
  node_ip: string
  status?: number
  last_seen?: string
  dict_name?: string
  capacity_bytes?: number
  free_bytes?: number
  usage_percent?: number
}

export async function getNodeHealth(
  healthType: string,
  statusFilter?: string,
  filter?: string,
): Promise<NodeHealthItem[]> {
  const params: Record<string, string> = { health_type: healthType }
  if (statusFilter) params.status = statusFilter
  if (filter) params.filter = filter
  const res = await api.get('/metrics/node-health', { params })
  return res.data.data as NodeHealthItem[]
}

/** 平均请求处理耗时（metrics-avg-latency-card）：histogram 窗口增量 ΔSum/ΔCount，单位 ms。
 *  D13：windowAvgMs = 全窗口聚合均值（头部口径，与快速响应占比卡同约定）；null = 窗口无增量。 */
export interface AvgLatencySeries {
  points: MetricDataPoint[]
  windowAvgMs: number | null
}

export async function getAvgLatencySeries(since: string, interval: string, filter?: string): Promise<AvgLatencySeries> {
  const params: Record<string, string> = { since, interval }
  if (filter) params.filter = filter
  const res = await api.get('/metrics/avg-latency', { params })
  return {
    points: (res.data.data ?? []) as MetricDataPoint[],
    windowAvgMs: typeof res.data.window_avg_ms === 'number' ? res.data.window_avg_ms : null,
  }
}

/** 各桶区间精确占比/计数（metrics-fast-ratio-card D9，2026-11-03 扩展）。
 *  含溢出桶 (bounds[-1], +∞)，数组长度 = len(bounds)+1；窗口无请求时后端返回 null。 */
export interface FastRatioBucketStats {
  bounds: number[]
  /** 各桶占窗口总请求的百分比（两位小数） */
  ratios: number[]
  /** 各桶请求计数 */
  counts: number[]
  /** 窗口总请求 ΣΔCount */
  total: number
}

/** 快速响应占比（metrics-fast-ratio-card）：histogram 桶计数增量精确占比，单位 %。
 *  阈值只能取桶边界（bounds），由后端校验；bounds 同时是下拉选项来源。 */
export interface FastRatioSeries {
  points: MetricDataPoint[]
  /** 生效阈值（ms），后端按桶边界解析后的权威值 */
  thresholdMs: number
  /** 可选阈值枚举（= ExplicitBounds，读数据不硬编码） */
  bounds: number[]
  /** 各桶区间占比/计数（D9 区间分布）；缺省/null = 窗口无请求或无边界，不显示分布 */
  bucketStats?: FastRatioBucketStats | null
  /** 头部窗口聚合占比（D13）：ΣΔ前 k 桶 / ΣΔCount，全窗口单次舍入；null = 窗口无请求 */
  windowRatio?: number | null
}

const FAST_RATIO_DEFAULT_THRESHOLD = 10

export async function getFastRatioSeries(
  since: string,
  interval: string,
  filter?: string,
  thresholdMs?: number,
): Promise<FastRatioSeries> {
  const params: Record<string, string | number> = { since, interval }
  if (filter) params.filter = filter
  if (thresholdMs != null) params.threshold_ms = thresholdMs
  const res = await api.get('/metrics/fast-ratio', { params })
  return {
    points: (res.data.data ?? []) as MetricDataPoint[],
    thresholdMs: typeof res.data.threshold_ms === 'number' ? res.data.threshold_ms : FAST_RATIO_DEFAULT_THRESHOLD,
    bounds: (res.data.bounds ?? []) as number[],
    bucketStats: (res.data.bucket_stats ?? null) as FastRatioBucketStats | null,
    windowRatio: typeof res.data.window_ratio === 'number' ? res.data.window_ratio : null,
  }
}

export async function getRouteNameMap(edgeUuids: string[]): Promise<Record<string, { name: string; uri: string }>> {
  if (edgeUuids.length === 0) return {}
  const res = await api.post('/routes/by-edge-uuids', edgeUuids)
  const routes = res.data.items || []
  const map: Record<string, { name: string; uri: string }> = {}
  routes.forEach((r: { edge_uuid: string; name: string; uri: string }) => {
    map[r.edge_uuid] = { name: r.name, uri: r.uri }
  })
  return map
}
