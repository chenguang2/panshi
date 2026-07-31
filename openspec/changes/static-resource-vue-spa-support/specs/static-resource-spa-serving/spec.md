## ADDED Requirements

### Requirement: 目录索引

系统 SHALL 在请求路径解析为空、以 `/` 结尾或指向目录时，返回对应目录下的 `index.html` 文件。

#### Scenario: 访问路由根路径

- **WHEN** 用户访问路由根路径（如 `/static/{name}/` 或 `/`）
- **THEN** 返回资源目录下的 `index.html` 文件内容，Content-Type 为 `text/html`

#### Scenario: 访问子目录路径

- **WHEN** 用户访问包内存在的子目录路径（如 `/static/{name}/docs/`）
- **THEN** 返回该子目录下的 `index.html` 文件内容

#### Scenario: 访问无尾斜杠的目录

- **WHEN** 用户访问包内目录但不带尾斜杠（如 `/static/{name}/docs`）
- **THEN** 返回该目录下的 `index.html` 文件内容

#### Scenario: 目录下无 index.html

- **WHEN** 请求解析到的目录下不存在 `index.html`
- **THEN** 返回 404 Not Found

### Requirement: SPA 路由回退

系统 SHALL 在开启 `spa_fallback` 配置时，对不存在对应文件的"导航请求"回退返回资源根目录的 `index.html`。导航请求定义为：请求路径无扩展名，或扩展名不在系统 MIME 类型表中（如 `/login`、`/v1.0`）；扩展名在 MIME 类型表中的请求（如 `.js`、`.css`、`.png`）视为资源请求，不适用回退。

#### Scenario: history 模式路由访问

- **WHEN** `spa_fallback` 开启且用户访问无扩展名路径（如 `/static/{name}/login`），该路径在包内无对应文件
- **THEN** 返回资源根目录 `index.html` 文件内容，Content-Type 为 `text/html`

#### Scenario: 带点导航路径回退

- **WHEN** `spa_fallback` 开启且用户访问扩展名不在 MIME 表中的路径（如 `/static/{name}/v1.0`），该路径在包内无对应文件
- **THEN** 返回资源根目录 `index.html` 文件内容

#### Scenario: 资源文件缺失仍严格 404

- **WHEN** `spa_fallback` 开启但请求路径扩展名在 MIME 类型表中（如 `.js`、`.css`、`.png`、`.json`）且文件不存在
- **THEN** 返回 404 Not Found

#### Scenario: 未开启 spa_fallback 时导航请求 404

- **WHEN** `spa_fallback` 未开启且请求路径在包内无对应文件
- **THEN** 返回 404 Not Found

### Requirement: 构建 base 前缀剥离

系统 SHALL 支持配置 `app_base`，`extractPath` 解析出的相对路径以该前缀开头时剥离前缀后再解析文件路径。`app_base` 未配置时，系统 SHALL 对相对路径的**单段前缀**做剥离试探（剥掉第一段后重新解析），该行为无状态、无需缓存。

#### Scenario: 配置 app_base 后访问资源

- **WHEN** `app_base` 配置为 `/webTrade` 且用户访问 `/webTrade/assets/app.js`（包内实际路径为 `assets/app.js`）
- **THEN** 返回包内 `assets/app.js` 文件内容

#### Scenario: app_base 带尾斜杠

- **WHEN** `app_base` 配置为 `/webTrade/`（带尾斜杠）且用户访问 `/webTrade/assets/app.js`
- **THEN** 系统归一化配置后正确剥离前缀并返回文件

#### Scenario: 未配置 app_base 时单段前缀剥离试探

- **WHEN** `app_base` 未配置且用户访问 `/webTrade/assets/app.js`（包内实际路径为 `assets/app.js`）
- **THEN** 系统剥离第一段 `webTrade` 后正确返回 `assets/app.js` 文件内容

#### Scenario: 多段 base 需显式配置

- **WHEN** `app_base` 未配置且构建 base 为多段前缀（如 `/apps/webTrade/`），用户访问 `/apps/webTrade/assets/app.js`
- **THEN** 单段剥离试探无法命中（剥离 `apps` 后剩 `webTrade/assets/app.js` 仍不存在），返回 404 Not Found
- **AND** 配置 `app_base = /apps/webTrade` 后再次访问则正确返回文件

#### Scenario: 前缀剥离后文件仍不存在

- **WHEN** 剥离前缀后解析的文件路径在包内仍不存在
- **THEN** 返回 404 Not Found

#### Scenario: 剥离前原始路径命中优先

- **WHEN** 请求路径未经剥离即可在包内命中文件（如包内真实存在 `webTrade/assets/app.js` 目录结构）
- **THEN** 返回原始路径文件，不执行剥离

#### Scenario: 请求路径与 app_base 不匹配

- **WHEN** 相对路径不以 `app_base` 前缀开头（边界不满足 `/` 或结尾）
- **THEN** 按原始路径解析，不剥离前缀
