# metrics-dashboard

## MODIFIED Requirements

### Requirement: Business metric definitions

- **WHEN** the dashboard loads
- **THEN** the QPS chart SHALL query `edge_http_requests_total` (Counter → rate, labeled "QPS" with unit `/s`)
- **AND** the active connections chart SHALL query `edge_nginx_http_current_connections?label=state:active` (Gauge, labeled "活跃连接数")
- **AND** the error rate chart SHALL query `edge_metric_errors_total` (Counter → rate, labeled "采集错误率")
- **AND** the latest value shown on each chart SHALL be the last data point from its time_series query result

#### Scenario: Business metric chart definitions
- **WHEN** the dashboard loads
- **THEN** the QPS chart SHALL query `edge_http_requests_total` (Counter → rate, labeled "QPS" with unit `/s`)
- **AND** the active connections chart SHALL query `edge_nginx_http_current_connections?label=state:active` (Gauge, labeled "活跃连接数")
- **AND** the error rate chart SHALL query `edge_metric_errors_total` (Counter → rate, labeled "采集错误率")

### Requirement: Infrastructure metrics in collapsible section

- **WHEN** the dashboard loads
- **THEN** the collapsible "更多指标" section SHALL contain charts for: `edge_shared_dict_capacity_bytes`, `edge_shared_dict_free_space_bytes`, `scrape_duration_seconds`, `scrape_samples_scraped`, `scrape_samples_post_metric_relabeling`, `scrape_series_added`, `up`

#### Scenario: Infrastructure metric names
- **WHEN** the dashboard loads
- **THEN** the collapsible "更多指标" section SHALL contain charts for: `edge_shared_dict_capacity_bytes`, `edge_shared_dict_free_space_bytes`, `scrape_duration_seconds`, `scrape_samples_scraped`, `scrape_samples_post_metric_relabeling`, `scrape_series_added`, `up`
