# system-branding Specification

## Purpose

系统品牌信息（系统名称、品牌名称、版本号）通过 `features.yaml` 的 `branding` 命名空间按部署实例配置，登录页、主界面侧边栏与浏览器标签页标题实时显示配置值，未配置时保持现状默认文案。

## Requirements

### Requirement: branding 配置命名空间与校验

`features.yaml` SHALL 支持顶层 `branding` 命名空间（与 `concurrency` 同构）：包含 4 个字符串 key —— `system_name`（系统短名）、`brand_name`（品牌名称）、`product_name`（产品英文全名）、`version`（版本号）。`branding` 未配置或单个 key 缺失时，系统 SHALL 对该 key 使用内置默认值（`system_name=磐石`、`brand_name=磐石 Gateway`、`product_name=Panshi Gateway Admin`、`version=v1.0`），行为与现状一致。配置存在但非法时 MUST 显式报错退出，不允许静默使用默认值。`branding` SHALL 支持 mtime 热加载（修改后免重启生效）。

#### Scenario: 未配置 branding 时行为不变

- **WHEN** `features.yaml` 不存在或不包含 `branding` 命名空间
- **THEN** 各展示面 SHALL 显示内置默认值（登录页「磐石 Gateway」、页脚「Panshi Gateway Admin v1.0」、侧边栏品牌「磐石 Gateway」、版本「v1.0」、标签页标题「磐石」）
- **AND** 系统 SHALL 正常启动，不因 branding 缺失报错

#### Scenario: branding 类型错误报错退出

- **WHEN** `features.yaml` 中 `branding` 不是映射（如字符串或列表），或其某项值不是字符串（如数字或布尔值）
- **THEN** 系统 SHALL 在 stderr 指明出错的 key 与实际类型
- **AND** 进程 SHALL 以非零退出码退出

#### Scenario: branding 未知 key 报错退出

- **WHEN** `features.yaml` 的 `branding` 包含代码中不存在的 key（如 `brandname` 拼写错误）
- **THEN** 系统 SHALL 输出未知 key 列表和允许的 key 列表
- **AND** 进程 SHALL 以非零退出码退出（防止拼写错误导致配置静默失效）

#### Scenario: branding 修改热生效

- **WHEN** 后端运行期间 `features.yaml` 的 `branding` 值被修改
- **THEN** 后续 `GET /system/features` SHALL 返回新值，无需重启后端

### Requirement: 后端透出 branding 配置

`GET /system/features` SHALL 在响应中包含 `branding` 对象（含全部 4 个 key，未配置的 key 填默认值）。该端点保持公开（无需鉴权），登录页在认证前可读取。

#### Scenario: 响应包含 branding

- **WHEN** 客户端请求 `GET /api/v1/system/features`
- **THEN** 响应 JSON SHALL 包含 `branding` 字段
- **AND** `branding` SHALL 同时包含 `system_name`、`brand_name`、`product_name`、`version` 四个字符串值

### Requirement: 登录页展示配置品牌

登录页 SHALL 从 features 配置渲染品牌信息：主品牌区显示 `brand_name`，页脚版本行显示 `product_name + 空格 + version`。

#### Scenario: 登录页读取配置值

- **WHEN** `features.yaml` 配置 `branding.brand_name: 星门 Gateway`、`product_name: Xingmen Gateway Admin`、`version: v2.1`
- **THEN** 登录页主品牌区 SHALL 显示「星门 Gateway」
- **AND** 登录页页脚 SHALL 显示「Xingmen Gateway Admin v2.1」

### Requirement: 侧边栏展示配置品牌

主界面左侧边栏 SHALL 从 features 配置渲染品牌信息：品牌文案显示 `brand_name`，版本徽标显示 `version`；侧边栏折叠时品牌文案隐藏、版本徽标行为不变。

#### Scenario: 侧边栏读取配置值

- **WHEN** `features.yaml` 配置 `branding.brand_name: 星门 Gateway`、`version: v2.1`
- **THEN** 侧边栏品牌文案 SHALL 显示「星门 Gateway」
- **AND** 侧边栏版本徽标 SHALL 显示「v2.1」

### Requirement: 浏览器标签页标题跟随配置

features 配置加载完成后，浏览器标签页标题 SHALL 设为 `branding.system_name`；配置加载前保留 `index.html` 的静态标题作为回落。

#### Scenario: 标签页标题读取配置值

- **WHEN** `features.yaml` 配置 `branding.system_name: 星门`
- **THEN** features 加载完成后浏览器标签页标题 SHALL 显示「星门」

### Requirement: 品牌配置实时刷新

前端 SHALL 在页面重新可见（visibilitychange/focus）时重新拉取 features 配置，使 branding 修改在用户切回页面后即时反映到登录页、侧边栏与标签页标题，无需重启后端或手动刷新浏览器。

#### Scenario: 修改配置后切回页面即刷新

- **WHEN** 用户修改 `features.yaml` 的 branding 值后切回该浏览器标签页
- **THEN** 前端 SHALL 重新拉取 `/system/features` 并更新展示值
- **AND** 侧边栏品牌文案与标签页标题 SHALL 反映新值
