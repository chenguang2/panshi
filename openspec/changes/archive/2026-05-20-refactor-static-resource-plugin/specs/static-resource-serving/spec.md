## ADDED Requirements

### Requirement: 插件遵循 Edge 标准开发规范

static_resource 插件 SHALL 遵循 Edge 节点的标准插件开发规范。

#### Scenario: 使用 plugin.new() 创建插件
- **WHEN** Edge 节点加载 static_resource 插件
- **THEN** 插件使用 `plugin.new({...})` 创建，包含 version、priority、name、schema 属性

#### Scenario: 所有引用变量已正确定义
- **WHEN** Edge 节点加载和执行插件代码
- **THEN** 所有在代码中引用的变量（包括 `attr_schema`、`default_attr_schema`）均已正确定义

### Requirement: access 阶段标准返回值

插件在 access 阶段 SHALL 返回标准状态码而非直接调用 `ngx.exit()`。

#### Scenario: 文件不存在时返回 404
- **WHEN** 请求的文件在本地文件系统中不存在
- **THEN** 插件返回状态码 404，而非调用 `ngx.exit(404)`

#### Scenario: 路径遍历攻击返回 403
- **WHEN** 请求的路径包含 `..` 路径遍历字符
- **THEN** 插件返回状态码 403，而非调用 `ngx.exit(403)`

### Requirement: Schema 校验完整性

插件 SHALL 对配置参数进行完整的 Schema 校验。

#### Scenario: 校验 cache_max_age 为非负整数
- **WHEN** route 配置中 `cache_max_age` 为负数
- **THEN** `check_schema()` 返回 false 及错误信息

#### Scenario: 校验 base_path 为字符串
- **WHEN** route 配置中 `base_path` 为非字符串类型
- **THEN** `check_schema()` 返回 false 及错误信息
