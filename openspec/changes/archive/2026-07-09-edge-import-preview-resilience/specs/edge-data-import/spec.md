# edge-data-import

## MODIFIED Requirements

### Requirement: 数据预览

系统 SHALL 在导入前展示 Edge 节点数据的预览，包括数据类型、数量和冲突检测结果。

预览时单个资源类型获取失败 SHALL NOT 阻塞其他资源的预览展示。

#### Scenario: 展示预览数据
- **WHEN** 用户通过连接测试后进入预览阶段
- **THEN** 系统 SHALL 从 Edge 节点拉取 routes、upstreams、plugin_configs、global_rules、plugin_metadata、stream_proxies 数据
- **AND** 系统 SHALL 将 PANSHI 格式转换为磐石数据库格式
- **AND** 系统 SHALL 按数据类型分组展示预览结果
- **AND** 前端 SHALL 可展开查看每种类型的详细条目列表

#### Scenario: 单个资源获取失败不阻塞预览
- **WHEN** 从 Edge 节点获取某类资源失败（如接口不存在、超时等）
- **THEN** 该类资源 SHALL 在预览中显示为空
- **AND** 其他资源 SHALL 正常展示
- **AND** 后端 SHALL 记录错误日志到 `logs/app.log`
- **AND** 前端 SHALL 显示警告提示，列出哪些资源获取失败
