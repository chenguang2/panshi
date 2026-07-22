## Purpose

Stream 模式插件元数据的管理能力。通过在 plugin_definitions 中注册 `_stream` 后缀的独立插件，实现对 Stream 模式插件元数据的独立配置和发布，利用现有 CRUD 和唯一约束。

## Requirements

### Requirement: 注册 log_process_stream 插件

系统 SHALL 在 `BUILTIN_PLUGINS` 中注册 `log_process_stream` 作为独立的 Stream 模式日志插件。

#### Scenario: 插件定义
- **WHEN** 系统启动时加载插件定义
- **THEN** `BUILTIN_PLUGINS` SHALL 包含 `log_process_stream` 条目
- **AND** `name` 为 `"log_process_stream"`
- **AND** `display_name` 为 `"日志记录(Stream)"`
- **AND** `enable_metadata` 为 `True`
- **AND** `schema` 和 `metadata_schema` 与 `log_process` 一致

#### Scenario: 白名单注册
- **WHEN** 加载 `features.yaml`
- **THEN** `enabled_plugins` SHALL 包含 `log_process_stream`
- **AND** 产品配置 `product/features.yaml` 也同步包含

### Requirement: 独立配置和存储

系统 SHALL 利用现有 `(cluster_id, plugin_name)` 唯一约束，使 `log_process_stream` 的元数据独立于 `log_process` 存储。

#### Scenario: 独立记录
- **WHEN** 用户为集群创建 `log_process_stream` 插件元数据
- **THEN** 数据库 SHALL 新增一条 `plugin_name="log_process_stream"` 的记录
- **AND** 该记录与同集群的 `log_process` 记录互不冲突

### Requirement: 导入时识别 Stream 元数据

系统 SHALL 在从 Edge 导入数据时读取 Stream 端点的插件元数据并映射为 `_stream` 后缀的本地记录。

#### Scenario: 导入 Stream 元数据
- **WHEN** 用户执行数据导入
- **THEN** 系统 SHALL 额外读取 `/stream/edge/admin/plugin_metadata`
- **AND** 将 key 路径含 `/stream/` 的元数据记录的 `plugin_name` 追加 `_stream` 后缀
- **AND** 与 HTTP 元数据一并进入冲突检测和保存流程
- **AND** HTTP 版 `log_process` 与 Stream 版 `log_process_stream` 互不冲突

### Requirement: Config diff 对比 Stream 元数据

系统 SHALL 在配置对比时同时拉取 HTTP 和 Stream 两种插件元数据。

#### Scenario: 对比时包含 Stream 元数据
- **WHEN** 用户执行配置对比
- **THEN** 系统 SHALL 额外拉取 `/stream/edge/admin/plugin_metadata`
- **AND** 以 `plugin_name + "_stream"` 为 key 合入 edge 数据字典
- **AND** DB 中的 `log_process_stream` 记录能与 edge 数据正常对比

### Requirement: 前端自动展示

系统 SHALL 在现有插件元数据管理页面中自动展示 `log_process_stream`。

#### Scenario: 出现在可用插件列表
- **WHEN** 用户打开插件元数据页面
- **THEN** 左侧可用插件列表 SHALL 包含 `日志记录(Stream)` 条目
- **AND** 该条目与 `日志记录` 条目并列显示
- **AND** 配置、编辑、发布等操作与普通插件元数据完全一致
