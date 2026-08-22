# Time Comparison

## Purpose

Provides time-based comparison statistics (day-over-day, week-over-week) and hourly distribution analysis for traffic heatmap visualization, enabling operators to identify trends and anomalies.

## Requirements

### Requirement: Today vs Yesterday Comparison
The system SHALL provide today vs yesterday comparison statistics using the `edge_http_status` metric from the `otel_metrics_sum` table.

#### Scenario: Query day-over-day comparison
- **WHEN** a GET request is sent to `/api/v1/metrics/time-comparison` with `type=day_over_day`
- **THEN** the response SHALL contain a JSON object with `today_requests`, `yesterday_requests`, and `change_rate` fields
- **AND** the response SHALL include `data_quality` field ("complete" or "partial")
- **AND** the response SHALL include `today_sample_count` and `yesterday_sample_count` fields

#### Scenario: Today's request count
- **WHEN** calculating today's request count
- **THEN** the system SHALL query `otel_metrics_sum` where `TimeUnix > toStartOfDay(now())`
- **AND** the result SHALL be `max(Value) - min(Value)` for `edge_http_status`

#### Scenario: Yesterday's request count
- **WHEN** calculating yesterday's request count
- **THEN** the system SHALL query `otel_metrics_sum` where `TimeUnix > toStartOfDay(now()) - INTERVAL 1 DAY AND TimeUnix <= toStartOfDay(now())`
- **AND** the result SHALL be `max(Value) - min(Value)` for `edge_http_status`

#### Scenario: Data quality assessment
- **WHEN** calculating data quality
- **THEN** the system SHALL compare sample_count against expected count (1440 for 24h, 1 per minute)
- **AND** if sample_count >= expected_count * 0.9, `data_quality` SHALL be "complete"
- **AND** if sample_count < expected_count * 0.9, `data_quality` SHALL be "partial"

### Requirement: Hourly Distribution Analysis
The system SHALL provide hourly request distribution analysis for heatmap visualization.

#### Scenario: Query hourly distribution
- **WHEN** a GET request is sent to `/api/v1/metrics/time-comparison` with `type=hourly_distribution` and `days=7`
- **THEN** the response SHALL contain a JSON array of hourly request counts
- **AND** each entry SHALL include `hour_of_day` (0-23), `day_of_week` (1-7), and `request_count` fields
- **AND** the data SHALL cover the last N days (default 7 days)
- **AND** results SHALL be ordered by day_of_week and hour_of_day

### Requirement: Weekly Comparison
The system SHALL provide week-over-week comparison statistics.

#### Scenario: Query week-over-week comparison
- **WHEN** a GET request is sent to `/api/v1/metrics/time-comparison` with `type=week_over_week`
- **THEN** the response SHALL contain a JSON object with `this_week_requests`, `last_week_requests`, `change_rate`, `data_quality`, `this_week_sample_count`, and `last_week_sample_count` fields

### Requirement: Empty Data Response
The system SHALL return appropriate responses when no data is available.

#### Scenario: No data for query
- **WHEN** a GET request returns no data
- **THEN** the response SHALL return HTTP 200 with empty data
- **AND** the response SHALL include `warning` field with message "No data available for the specified time range"

### Requirement: ClickHouse Connection Failure
The system SHALL gracefully handle ClickHouse connection failures.

#### Scenario: ClickHouse unavailable
- **WHEN** ClickHouse connection fails or times out
- **THEN** the response SHALL return HTTP 200 with empty data
- **AND** the response SHALL include `error` field with failure reason
