## MODIFIED Requirements

### Requirement: 连接测试

系统 SHALL 验证与 Edge 节点的 Admin API 连通性，并在导入前展示节点基本信息，包括 SSL 证书数量。

#### Scenario: 连接成功
- **WHEN** 用户输入 Edge 节点 IP、端口和 API Key 并点击"测试连接"
- **THEN** 系统 SHALL 调用 Edge 节点 Admin API 验证连通性
- **AND** 系统 SHALL 返回节点版本号、已安装插件数量、路由数量、上游数量、SSL 证书数量
- **AND** 前端 SHALL 显示连接成功状态和节点概要信息（含 SSL 证书计数）

### Requirement: 数据预览

系统 SHALL 在导入前展示 Edge 节点数据的预览，包括 SSL 证书和四层代理在内的全量数据类型、数量和冲突检测结果。

#### Scenario: 展示预览数据
- **WHEN** 用户通过连接测试后进入预览阶段
- **THEN** 系统 SHALL 从 Edge 节点拉取 routes、upstreams、plugin_configs、global_rules、plugin_metadata、stream_proxies、ssl_certificates 数据
- **AND** 系统 SHALL 将 PANSHI 格式转换为磐石数据库格式
- **AND** 系统 SHALL 按数据类型分组展示预览结果（含 SSL 证书卡片）
- **AND** 前端 SHALL 可展开查看每种类型的详细条目列表

### Requirement: 导入执行

系统 SHALL 在用户确认后执行数据导入，并反馈导入结果，结果中包含 SSL 证书导入数量。

#### Scenario: 成功导入
- **WHEN** 用户确认导入所选数据
- **THEN** 系统 SHALL 按顺序导入：上游 → 路由 → 插件配置 → 全局规则 → SSL 证书
- **AND** 系统 SHALL 写入 `ps_import_log` 记录本次导入详情
- **AND** 前端 SHALL 显示导入成功，展示各类别导入数量（含 SSL 证书和四层代理）

#### Scenario: 导入结果展示
- **WHEN** 导入完成
- **THEN** 前端 SHALL 显示汇总结果：
  - 成功导入：上游 N 个、路由 N 条、插件配置 N 个、全局规则 N 个、插件元数据 N 个、四层代理 N 个、SSL 证书 N 个
  - 已跳过：N 条（含原因）
  - 查看集群详情的链接
