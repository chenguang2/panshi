# Node Health Monitoring

## Purpose

Provides node health status monitoring and resource usage summary via ClickHouse metrics, enabling operators to quickly identify unhealthy nodes and shared dictionary capacity issues.

## Requirements

### Requirement: Node Health Status Monitoring
The system SHALL provide node health status monitoring using the `up` metric from the `otel_metrics_gauge` table.

#### Scenario: Query node health status
- **WHEN** a GET request is sent to `/api/v1/metrics/node-health`
- **THEN** the response SHALL contain a JSON array of node health statuses
- **AND** each entry SHALL include `node_ip`, `status` (1=healthy, 0=unhealthy), `last_seen`, and `last_seen_ts` fields
- **AND** `last_seen_ts` SHALL be the Unix epoch seconds of the latest report (`toUnixTimestamp(max(TimeUnix))`), timezone-ambiguous raw timestamp strings SHALL NOT be the formatting source
- **AND** `last_seen` SHALL be preserved (string) for backward compatibility
- **AND** results SHALL be sorted by status ASC (unhealthy first) and last_seen DESC

#### Scenario: Health status determination
- **WHEN** determining node health status
- **THEN** the system SHALL query the `up` metric from `otel_metrics_gauge`
- **AND** the status SHALL be the latest value (`argMax(Value, TimeUnix)`)
- **AND** nodes not seen in the last 5 minutes SHALL be considered stale

#### Scenario: Filter by health status
- **WHEN** a GET request is sent to `/api/v1/metrics/node-health` with `status=unhealthy`
- **THEN** the response SHALL only include nodes with status=0 (unhealthy)
- **AND** nodes with status=1 (healthy) SHALL be excluded

### Requirement: Node health card presentation

节点健康卡 SHALL 以可读形态呈现状态与资源：状态列为 BadgeStatus（`up=1` → 正常 / `up=0` → 采集中断）；最后上报基于 `last_seen_ts` 格式化为本地时间并附相对时间；字典内存视图的使用率为进度条 + 百分比并带阈值色；类型切换只发起一次请求。

#### Scenario: 状态列渲染
- **WHEN** 节点健康卡（在线状态视图）渲染某节点的 `status` 字段
- **THEN** `status=1` SHALL 显示为 BadgeStatus「正常」（online 色），`status=0` SHALL 显示为「采集中断」（offline 色）
- **AND** 裸值 `0`/`1` SHALL NOT 出现在表格中

#### Scenario: 最后上报格式化
- **WHEN** 渲染 `last_seen_ts`
- **THEN** 卡片 SHALL 显示格式化本地时间（如 `2026-11-02 16:20:42`）并以弱色附相对时间（如「3 分钟前」）
- **AND** 原始微秒字符串（如 `2026-11-02 08:20:42.887000`）SHALL NOT 直出

#### Scenario: 字典内存视图
- **WHEN** 用户切换到「字典内存」视图
- **THEN** 表列 SHALL 为 字典 ｜ 节点IP ｜ 容量（formatFileSize）｜ 使用率（进度条 + %）
- **AND** 使用率 >85% 为红色、70–85% 为橙色、<70% 为常规色

#### Scenario: 类型切换单请求
- **WHEN** 用户在「在线状态 / 字典内存」间切换
- **THEN** 卡片 SHALL 只发起一次数据请求

#### Scenario: 切换器文案
- **WHEN** 渲染类型切换器
- **THEN** 选项文案 SHALL 为「在线状态」与「字典内存」

### Requirement: Resource Usage Summary
The system SHALL provide resource usage summary for shared dictionary capacity.

#### Scenario: Query resource usage
- **WHEN** a GET request is sent to `/api/v1/metrics/node-health` with `type=resource`
- **THEN** the response SHALL contain a JSON array of resource usage entries
- **AND** each entry SHALL include `dict_name`, `node_ip`, `capacity_bytes`, `free_bytes`, and `usage_percent` fields
- **AND** the data SHALL include both `edge_shared_dict_capacity_bytes` and `edge_shared_dict_free_space_bytes` metrics
- **AND** `usage_percent` SHALL be calculated as `(capacity_bytes - free_bytes) / capacity_bytes * 100`

### Requirement: Empty Data Response
The system SHALL return appropriate responses when no data is available.

#### Scenario: No data for query
- **WHEN** a GET request returns no data
- **THEN** the response SHALL return HTTP 200 with empty `data` array
- **AND** the response SHALL include `warning` field with message "No data available for the specified time range"

### Requirement: ClickHouse Connection Failure
The system SHALL gracefully handle ClickHouse connection failures.

#### Scenario: ClickHouse unavailable
- **WHEN** ClickHouse connection fails or times out
- **THEN** the response SHALL return HTTP 200 with empty `data` array
- **AND** the response SHALL include `error` field with failure reason
