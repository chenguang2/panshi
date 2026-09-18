export interface MetricDataPoint {
  metric_name: string
  timestamp: number
  avg: number
  max?: number
  min?: number
  /** gauge 指标：桶内最新读数（argMax），卡片头部"当前值"优先取它 */
  last?: number
  /** 计数器指标：avg 实为每秒速率，带 "/s" 单位 */
  unit?: string
  sample_count: number
}

export interface MetricSummary {
  [metricName: string]: number
}

export interface ConnectionStates {
  active?: number
  reading?: number
  writing?: number
  waiting?: number
  /** accepted 窗口增量（新建连接数）；accepted/handled 原始值为累计计数不返回 */
  accepted_delta?: number
}
