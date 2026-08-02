## MODIFIED Requirements

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
- **AND** 若请求路径解析为目录且目录下存在 `index.html`，返回该 `index.html`（目录索引回退，详见 static-resource-spa-serving 能力）
- **AND** 若 `spa_fallback` 开启且请求为导航请求（无扩展名或扩展名不在 MIME 类型表），回退返回资源根目录的 `index.html`（详见 static-resource-spa-serving 能力）

### Requirement: access 阶段标准返回值

插件在 access 阶段 SHALL 返回标准状态码而非直接调用 `ngx.exit()`。

#### Scenario: 文件不存在时返回 404

- **WHEN** 请求的文件在本地文件系统中不存在且不满足目录索引或 SPA 回退条件
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

#### Scenario: 校验 spa_fallback 为布尔值

- **WHEN** route 配置中 `spa_fallback` 为非布尔类型
- **THEN** `check_schema()` 返回 false 及错误信息

#### Scenario: 校验 app_base 为字符串

- **WHEN** route 配置中 `app_base` 为非字符串类型
- **THEN** `check_schema()` 返回 false 及错误信息
