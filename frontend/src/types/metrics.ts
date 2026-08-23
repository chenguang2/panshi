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

export interface ConnectionStates {
  active?: number
  reading?: number
  writing?: number
  waiting?: number
  /** accepted 窗口增量（新建连接数）；accepted/handled 原始值为累计计数不返回 */
  accepted_delta?: number
}

export interface MetricSummaryResponse {
  data: MetricSummary
  connection_states?: ConnectionStates
}
