import api from '@/api'
import type { MetricDataPoint, MetricSummary } from '@/types/metrics'

export async function getMetricNames(): Promise<string[]> {
  const res = await api.get('/metrics/names')
  return res.data.data as string[]
}

export async function getMetricTimeSeries(
  metricName: string,
  since = '1h',
  interval = '5m',
  label?: string,
): Promise<MetricDataPoint[]> {
  const params: Record<string, string> = { since, interval }
  if (label) params.label = label
  const res = await api.get(`/metrics/${metricName}`, { params })
  return res.data.data as MetricDataPoint[]
}

export async function getMetricSummary(): Promise<MetricSummary> {
  const res = await api.get('/metrics/summary')
  return res.data.data as MetricSummary
}

// ── Route Stats ──
export interface RouteStatsItem {
  route_id: string
  value: number
  unit?: string
}

export async function getRouteStats(
  statsType: string,
  since: string,
  limit: number,
  latencyType?: string,
): Promise<RouteStatsItem[]> {
  const params: Record<string, string | number> = { stats_type: statsType, since, limit }
  if (latencyType) params.latency_type = latencyType
  const res = await api.get('/metrics/route-stats', { params })
  return res.data.data as RouteStatsItem[]
}

// ── Status Analysis ──
export interface StatusAnalysisItem {
  status_class: string
  request_count: number
  percentage: number
}

export async function getStatusAnalysis(since: string): Promise<StatusAnalysisItem[]> {
  const res = await api.get('/metrics/status-analysis', { params: { since } })
  return res.data.data as StatusAnalysisItem[]
}

// ── Time Comparison ──
export interface DayOverDayData {
  today_requests: number
  yesterday_requests: number
  change_rate: number
  data_quality: string
}

export interface HourlyDistributionItem {
  hour_of_day: number
  day_of_week: number
  request_count: number
}

export async function getTimeComparison(
  comparisonType: string,
  days?: number,
): Promise<DayOverDayData | HourlyDistributionItem[]> {
  const params: Record<string, string | number> = { comparison_type: comparisonType }
  if (days) params.days = days
  const res = await api.get('/metrics/time-comparison', { params })
  return res.data.data as DayOverDayData | HourlyDistributionItem[]
}

// ── Node Health ──
export interface NodeHealthItem {
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
): Promise<NodeHealthItem[]> {
  const params: Record<string, string> = { health_type: healthType }
  if (statusFilter) params.status = statusFilter
  const res = await api.get('/metrics/node-health', { params })
  return res.data.data as NodeHealthItem[]
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
