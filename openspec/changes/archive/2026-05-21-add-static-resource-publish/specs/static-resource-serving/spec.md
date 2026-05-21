## ADDED Requirements

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
