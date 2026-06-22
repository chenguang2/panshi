export interface MetricDataPoint {
  metric_name: string
  timestamp: number
  avg: number
  max?: number
  min?: number
  sample_count: number
}

export interface MetricSummary {
  [metricName: string]: number
}

export interface MetricsApiResponse {
  data: MetricDataPoint[]
}

export interface MetricNamesResponse {
  data: string[]
}

export interface MetricSummaryResponse {
  data: MetricSummary
}
