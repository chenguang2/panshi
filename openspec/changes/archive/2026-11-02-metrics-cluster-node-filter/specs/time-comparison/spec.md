# metrics-cluster-node-filter — time-comparison Delta

## ADDED Requirements

### Requirement: Cluster and node filter

时间对比 SHALL 支持可选 `filter` 参数（`cluster:{id}` / `node:{ip}` / `unmanaged`），日对比与周对比的请求量、变化率与采样计数 SHALL 以 `edge_http_status` 的 `Attributes['ip']` 集合过滤后计算。

#### Scenario: 按集群过滤的日对比
- **WHEN** a GET request is sent to `/api/v1/metrics/time-comparison` with `type=day_over_day` and `filter=cluster:{id}`
- **THEN** `today_requests`/`yesterday_requests` 及采样计数 SHALL 仅统计该集群节点上报数据

#### Scenario: 按节点过滤的周对比
- **WHEN** a GET request is sent with `type=week_over_week` and `filter=node:{ip}`
- **THEN** 本周/上周请求量 SHALL 仅统计该节点上报数据

#### Scenario: 未纳管过滤
- **WHEN** a GET request is sent with `filter=unmanaged`
- **THEN** 对比 SHALL 仅统计未纳管 ip 的上报数据
