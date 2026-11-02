# metrics-cluster-node-filter — node-health-monitoring Delta

## ADDED Requirements

### Requirement: Cluster and node filter

节点健康 SHALL 支持可选 `filter` 参数（`cluster:{id}` / `node:{ip}`），在线状态与字典内存两视图 SHALL 以 `Attributes['ip']` 集合过滤。

#### Scenario: 按集群过滤在线状态
- **WHEN** a GET request is sent to `/api/v1/metrics/node-health` with `filter=cluster:{id}`
- **THEN** 仅该集群节点的健康条目 SHALL 返回

#### Scenario: 按节点过滤字典内存
- **WHEN** a GET request is sent with `filter=node:{ip}` and `health_type=resource`
- **THEN** 仅该节点的字典内存条目 SHALL 返回

#### Scenario: 过滤后为空
- **WHEN** 筛选集合内节点均无上报
- **THEN** the response SHALL return HTTP 200 with empty `data` array（前端呈现既有空态「暂无上报数据」）
