## MODIFIED Requirements

### Requirement: 抓取 Edge 节点 Stream Route

系统 SHALL 在预览阶段从 Edge 节点抓取 Stream Route 数据，支持 nodes 的 dict 和 array 两种格式。

#### Scenario: 抓取数据
- **WHEN** 用户进入预览导入步骤且勾选了四层代理
- **THEN** 系统 SHALL 调用 `EdgeClient.list_stream_routes()` 获取 Edge 节点上的 Stream Route 列表
- **AND** 将每条记录转换为 DB 格式（server_port → listen_port, nodes → targets, type → load_balance）
- **AND** nodes 字段 SHALL 同时支持 dict 格式 `{"host:port": weight}` 和 array 格式 `[{"host": "...", "port": N, "weight": N}]`
- **AND** 系统 SHALL 保留 `upstream.retries` 和 `upstream.retry_timeout` 字段

### Requirement: DNS 类型代理导入

系统 SHALL 支持导入 DNS 类型的四层代理（stream proxy with proxy_type=dns）。

#### Scenario: 自动识别 DNS 类型
- **WHEN** Edge 节点的 Stream Route 数据包含 `plugins.dns_upstream` 字段
- **THEN** 系统 SHALL 自动设置 `proxy_type = "dns"`
- **AND** 系统 SHALL 将 `plugins.dns_upstream` 写入 `dns_config` 字段
- **AND** 系统 SHALL 将 `plugins.log_process` 合并到 `dns_config.log_process` 中
- **AND** 系统 SHALL 设置 `scheme = "udp"`
- **AND** 系统 SHALL NOT 从 `upstream.nodes` 提取目标节点（DNS 代理无传统上游节点）

#### Scenario: 普通类型保持不变
- **WHEN** Edge 节点的 Stream Route 数据不包含 `plugins.dns_upstream`
- **THEN** 系统 SHALL 按普通类型处理（`proxy_type = "normal"`）
- **AND** 系统 SHALL 从 `upstream.nodes` 解析目标节点

### Requirement: 执行导入

系统 SHALL 将 Stream Route 数据写入 `ps_stream_proxy` 表，包括 DNS 类型的配置。

#### Scenario: 成功导入
- **WHEN** 用户确认导入且勾选了四层代理
- **THEN** 系统 SHALL 写入 `ps_stream_proxy` 表
- **AND** 普通类型写入 targets、timeout、keepalive_pool、retries、retry_timeout
- **AND** DNS 类型写入 dns_config、proxy_type="dns"
- **AND** 导入完成后在结果中显示四层代理的导入数量
