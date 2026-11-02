# metrics-cluster-node-filter — http-status-analysis Delta

## ADDED Requirements

### Requirement: Cluster and node filter

HTTP 状态码分析 SHALL 支持可选 `filter` 参数（`cluster:{id}` / `node:{ip}` / `unmanaged`），状态分类聚合与占比 SHALL 以 `Attributes['ip']` 集合过滤后计算。

#### Scenario: 按集群过滤
- **WHEN** a GET request is sent to `/api/v1/metrics/status-analysis` with `filter=cluster:{id}`
- **THEN** 状态码分布与总请求数 SHALL 仅统计该集群节点上报数据

#### Scenario: 按节点过滤
- **WHEN** a GET request is sent with `filter=node:{ip}`
- **THEN** 状态码分布 SHALL 仅统计该节点上报数据

#### Scenario: 未纳管过滤
- **WHEN** a GET request is sent with `filter=unmanaged`
- **THEN** 状态码分布 SHALL 仅统计未纳管 ip 的上报数据
