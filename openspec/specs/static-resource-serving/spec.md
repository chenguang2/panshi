## Purpose

Edge 节点侧通过 PANSHI 插件提供静态文件访问功能。

## Requirements

### Requirement: 静态文件访问

已发布的静态资源 SHALL 通过 Edge 节点以 HTTP 方式直接访问，响应内容为 zip 包解压后的文件。

#### Scenario: 访问 html 页面
- **WHEN** 用户通过浏览器访问 `/static/{name}/index.html`
- **THEN** 返回 `index.html` 文件内容，Content-Type 为 `text/html`

#### Scenario: 访问子路径文件
- **WHEN** 用户访问 `/static/{name}/css/app.css`
- **THEN** 返回 `css/app.css` 文件内容，Content-Type 为 `text/css`

#### Scenario: 访问不存在的文件
- **WHEN** 用户访问不存在的文件路径
- **THEN** 返回 404 Not Found

### Requirement: 缓存控制

静态文件响应 SHALL 包含浏览器缓存控制头，支持条件请求以减少重复传输。

#### Scenario: 首次访问
- **WHEN** 浏览器首次请求静态文件
- **THEN** 响应包含 `Cache-Control`、`ETag`、`Last-Modified` 头

#### Scenario: 文件未变更的条件请求
- **WHEN** 浏览器携带 `If-None-Match` 头且文件未变更
- **THEN** 返回 304 Not Modified，无响应体

#### Scenario: 文件已变更的条件请求
- **WHEN** 浏览器携带 `If-None-Match` 头但文件已变更
- **THEN** 返回 200 和新文件内容，ETag 为新的值

### Requirement: MIME 类型推断

Edge 节点 SHALL 根据文件后缀自动设置正确的 Content-Type。

#### Scenario: 常见类型识别
- **WHEN** 请求的文件后缀为 `.html`、`.js`、`.css`、`.png`、`.jpg`、`.svg`、`.json` 等
- **THEN** Content-Type 分别对应 `text/html`、`application/javascript`、`text/css`、`image/png` 等

#### Scenario: 未知后缀
- **WHEN** 请求的文件后缀不在 MIME 映射表中
- **THEN** Content-Type 回退为 `application/octet-stream`

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
