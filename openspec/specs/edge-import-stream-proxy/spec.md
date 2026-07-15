## ADDED Requirements

### Requirement: 数据导入支持四层代理类型
系统 SHALL 在 Edge 数据导入的配置类型选择中增加「四层代理」选项，支持从 Edge 节点批量导入 Stream Route 到本地数据库。

#### Scenario: 配置类型选择出现四层代理
- **WHEN** 用户进入 Edge 数据导入的第二步「选择配置」
- **THEN** 配置类型卡片中 SHALL 出现「四层代理」选项，默认选中
- **AND** 与其他 5 种类型风格一致

#### Scenario: 测试连接显示四层代理数量
- **WHEN** 用户点击「测试连接」
- **THEN** 连接结果中 SHALL 显示四层代理的数量

### Requirement: 抓取 Edge 节点 Stream Route
系统 SHALL 在预览阶段从 Edge 节点抓取 Stream Route 数据。

#### Scenario: 抓取数据
- **WHEN** 用户进入预览导入步骤且勾选了四层代理
- **THEN** 系统 SHALL 调用 `EdgeClient.list_stream_routes()` 获取 Edge 节点上的 Stream Route 列表
- **AND** 将每条记录转换为 DB 格式（server_port → listen_port, nodes → targets, type → load_balance）
- **AND** nodes 字段 SHALL 同时支持 dict 格式 `{"host:port": weight}` 和 array 格式 `[{"host": "...", "port": N, "weight": N}]`
- **AND** 系统 SHALL 保留 `upstream.retries` 和 `upstream.retry_timeout` 字段

### Requirement: 冲突检测
系统 SHALL 检测将要导入的 Stream Route 与数据库中已有记录是否冲突。

#### Scenario: 按端口检测冲突
- **WHEN** 预览导入数据时
- **THEN** 系统 SHALL 按 `cluster_id + listen_port` 检测冲突
- **AND** 已存在的记录标记为冲突，提示用户覆盖或跳过

### Requirement: 执行导入
系统 SHALL 将 Stream Route 数据写入 `ps_stream_proxy` 表。

#### Scenario: 成功导入
- **WHEN** 用户确认导入且勾选了四层代理
- **THEN** 系统 SHALL 写入 `ps_stream_proxy` 表
- **AND** 导入顺序在 plugin_metadata 之后、plugin_configs 之前
- **AND** 普通类型写入 targets、timeout、keepalive_pool、retries、retry_timeout
- **AND** DNS 类型写入 dns_config、proxy_type="dns"
- **AND** 导入完成后在结果中显示四层代理的导入数量

### Requirement: DNS 类型代理导入

系统 SHALL 支持导入 DNS 类型的四层代理（stream proxy with proxy_type=dns）。

#### Scenario: 自动识别 DNS 类型
- **WHEN** Edge 节点的 Stream Route 数据包含 `plugins.dns_upstream` 字段
- **THEN** 系统 SHALL 自动设置 `proxy_type = "dns"`
- **AND** 系统 SHALL 将 `plugins.dns_upstream` 写入 `dns_config` 字段
- **AND** 系统 SHALL 将 `plugins.log_process` 合并到 `dns_config.log_process` 中
- **AND** 系统 SHALL 设置 `scheme = "udp"`
- **AND** 系统 SHALL NOT 从 `upstream.nodes` 提取目标节点

#### Scenario: 普通类型保持不变
- **WHEN** Edge 节点的 Stream Route 数据不包含 `plugins.dns_upstream`
- **THEN** 系统 SHALL 按普通类型处理（`proxy_type = "normal"`）
- **AND** 系统 SHALL 从 `upstream.nodes` 解析目标节点

#### Scenario: 跳过冲突
- **WHEN** 导入时遇到冲突且用户选择跳过
- **THEN** 系统 SHALL 跳过该记录，不写入 DB
- **AND** 记录到导入日志中

### Requirement: ImportLog 记录四层代理数量
系统 SHALL 在导入日志中记录四层代理的导入数量。

#### Scenario: 查看导入历史
- **WHEN** 用户查看导入历史记录
- **THEN** 日志中 SHALL 显示四层代理的导入数量
