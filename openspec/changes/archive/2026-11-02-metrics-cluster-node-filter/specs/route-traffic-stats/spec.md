# metrics-cluster-node-filter — route-traffic-stats Delta

## ADDED Requirements

### Requirement: Cluster and node filter

路由统计 SHALL 支持可选 `filter` 参数（`cluster:{id}` / `node:{ip}` / `unmanaged`），四个视图（QPS / 带宽 / 错误率 / 延迟）SHALL 以 `Attributes['ip']` 集合过滤后聚合与排序。

#### Scenario: 按集群过滤
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `filter=cluster:{id}`
- **THEN** 仅该集群节点上报的统计数据 SHALL 参与聚合与排名

#### Scenario: 按节点过滤
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `filter=node:{ip}`
- **THEN** 仅该节点上报的统计数据 SHALL 参与聚合与排名

#### Scenario: 未纳管过滤
- **WHEN** a GET request is sent to `/api/v1/metrics/route-stats` with `filter=unmanaged`
- **THEN** 仅「近 24h 有上报但平台无对应节点记录」的 ip 数据 SHALL 参与

#### Scenario: 非法参数
- **WHEN** a GET request is sent with an invalid `filter` value
- **THEN** the response SHALL return HTTP 400 with 中文报错「筛选参数无效，应为 cluster:{id}、node:{ip} 或 unmanaged」
