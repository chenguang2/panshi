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
