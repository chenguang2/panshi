## MODIFIED Requirements

### Requirement: Backend provides config diff API

→ 四层代理（Stream Proxy）SHALL 被纳入配置对比。

#### Scenario: 四层代理对比结果纳入配置对比API
- **WHEN** 发送 `GET /clusters/{cluster_id}/nodes/{node_id}/diff`
- **THEN** 响应中的 groups SHALL 包含 `stream_proxies` 分组
- **AND** 该分组 SHALL 与其他资源（upstreams/routes）使用相同的对比状态（match/mismatch/only_in_db/only_in_edge）

#### Scenario: 对比 four 层代理的负载均衡算法
- **WHEN** 四层代理的 DB 配置使用 `weighted_roundrobin`
- **AND** Edge 节点使用 `roundrobin`
- **THEN** 对比结果 SHALL 为 `match`（两者语义等效）

#### Scenario: 对比四层代理的 targets
- **WHEN** DB 的 targets 为 JSON 数组 `[{"target":"10.0.0.1:3306","weight":100}]`
- **AND** Edge 节点的 `upstream.nodes` 为 dict 格式 `{"10.0.0.1:3306": 100}`
- **THEN** 对比结果 SHALL 正确识别为 `match` 或列出差异字段

#### Scenario: stream route 配置在 upstream 嵌套对象中
- **WHEN** 从 Edge 拉取 stream route 数据
- **THEN** `load_balance` SHALL 从 `upstream.type` 读取
- **AND** `scheme` SHALL 从 `upstream.scheme` 读取
- **AND** `timeout` / `keepalive_pool` SHALL 从 `upstream.timeout` / `upstream.keepalive_pool` 读取
- **AND** `listen_port` SHALL 从顶层 `server_port` 读取

#### Scenario: 检测仅存在于 Edge 的四层代理
- **WHEN** Edge 节点上有 stream route 但 DB 中无对应 edge_uuid 的记录
- **THEN** 对比结果 SHALL 将其标记为 `only_in_edge`
- **AND** 使用 stream route 的 name 或 listen_port 作为显示名称

### Requirement: Frontend shows diff in Drawer

→ 四层代理的对比结果 SHALL 在前端配置对比 Drawer 中正确展示。

#### Scenario: 四层代理分组显示在对比 Drawer 中
- **WHEN** 前端打开配置对比 Drawer 且后端返回了 `stream_proxies` 分组
- **THEN** Drawer SHALL 显示"四层代理"分组，包含该分组的所有对比项
- **AND** 分组折叠/展开、差异高亮等功能 SHALL 与其他资源一致
- **AND** 四层代理的字段标签 SHALL 使用中文显示

#### Scenario: 四层代理字段标签映射
- **WHEN** 前端渲染四层代理的字段级差异
- **THEN** 以下字段 SHALL 有中文标签：
  - `listen_port` → "监听端口"
  - `load_balance` → "负载均衡"
  - `scheme` → "协议"
  - `targets` → "目标节点"
  - `timeout` → "超时配置"
  - `keepalive_pool` → "连接池"
  - `remote_addr` → "CIDR 范围"
  - `sni` → "TLS SNI"
