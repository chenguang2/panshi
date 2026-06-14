# deployment-feature-config Specification

## Purpose

允许每份部署实例通过一个 `features.yaml` 配置文件控制启用的功能集和插件白名单，实现部署级别的特性隔离。

## Requirements

### Requirement: features.yaml 配置文件 + 严格校验

部署根目录 SHALL 包含一个 `features.yaml` 文件（可选），定义该部署实例启用的功能和插件白名单。**配置文件如果存在但格式错误，必须显式报错退出进程，不允许使用默认值静默启动。**

#### Scenario: 默认全启用
- **WHEN** `features.yaml` 文件不存在
- **THEN** 系统 SHALL 默认启用所有功能和插件

#### Scenario: 配置文件结构
- **WHEN** 系统读取 `features.yaml`
- **THEN** 文件 SHALL 包含 `features`（功能名 → boolean 映射）和 `enabled_plugins`（插件名列表）

#### Scenario: 启动时加载
- **WHEN** 后端服务启动
- **THEN** 系统 SHALL 在 `app.main:app` 创建之前读取 `features.yaml`
- **AND** 配置 SHALL 存储在全局单例中供整个应用生命周期使用

#### Scenario: YAML 语法错误报错退出
- **WHEN** `features.yaml` 存在但 YAML 语法错误（缩进错误、非法字符等）
- **THEN** 系统 SHALL 在 stderr 输出错误信息
- **AND** 进程 SHALL 以非零退出码退出
- **AND** SHALL NOT 使用任何默认值启动应用

#### Scenario: 未知功能名报错退出
- **WHEN** `features.yaml` 的 `features` 中包含代码中不存在的功能名（如 `edge_clinet`）
- **THEN** 系统 SHALL 输出未知功能名列表和已知功能名列表
- **AND** 进程 SHALL 以非零退出码退出

#### Scenario: 值类型错误报错退出
- **WHEN** `features.yaml` 中某项功能的值不是 boolean（如 `"true"` 字符串或 `1` 数字）
- **THEN** 系统 SHALL 指明哪个功能名和错误的值
- **AND** 进程 SHALL 以非零退出码退出

#### Scenario: enabled_plugins 类型错误报错退出
- **WHEN** `features.yaml` 中 `enabled_plugins` 不是列表
- **THEN** 系统 SHALL 输出类型错误信息
- **AND** 进程 SHALL 以非零退出码退出

### Requirement: 后端条件性路由注册

FastAPI 应用 SHALL 在启动时根据 `features.yaml` 条件性注册 API 路由。未启用的功能对应的路由 SHALL NOT 注册到应用中。

#### Scenario: 启用功能的路由注册
- **WHEN** `features.yaml` 中 `edge_client` 为 `true`
- **THEN** `edge_client_router` SHALL 通过 `app.include_router()` 注册
- **AND** `GET /api/v1/edge-client/nodes` SHALL 返回 200

#### Scenario: 禁用功能的路由不注册
- **WHEN** `features.yaml` 中 `edge_client` 为 `false`
- **THEN** `edge_client_router` SHALL NOT 注册
- **AND** `GET /api/v1/edge-client/nodes` SHALL 返回 404

#### Scenario: 安装路由拆分 — install_openresty
- **WHEN** `features.yaml` 中 `install_openresty` 为 `true`
- **THEN** `POST /clusters/{id}/nodes/{nid}/install-openresty` SHALL 可用
- **AND** `POST /clusters/{id}/nodes/{nid}/cancel-install` SHALL 可用（取消安装跟随 OpenResty 安装）
- **WHEN** `install_openresty` 为 `false`
- **THEN** 上述两个端点 SHALL 返回 404

#### Scenario: 安装路由拆分 — install_edge
- **WHEN** `features.yaml` 中 `install_edge` 为 `true`
- **THEN** `POST /clusters/{id}/nodes/{nid}/install-edge` SHALL 可用
- **WHEN** `install_edge` 为 `false`
- **THEN** 该端点 SHALL 返回 404

### Requirement: GET /api/v1/system/features 端点

系统 SHALL 提供 `GET /api/v1/system/features` 端点，返回当前部署的完整特性配置。

#### Scenario: 返回特性配置
- **WHEN** 前端发送 `GET /api/v1/system/features`
- **THEN** 后端返回 JSON 对象，包含 `features`（功能名 → boolean 映射）和 `enabled_plugins`（插件白名单列表）
- **AND** 该端点 SHALL 不需要认证（登录页面也需要判断功能）

### Requirement: 前端特性 Store 与启动时序

前端 SHALL 通过 Pinia store 加载特性配置。**不允许使用 fallback 默认值**。必须等待 features 加载成功才能完成应用初始化。

#### Scenario: 登录页不受 features 加载影响
- **WHEN** 用户访问前端
- **THEN** `/login` 路由 SHALL 静态注册，无需等待 features 加载
- **AND** 登录页 SHALL 立即可渲染

#### Scenario: 成功加载特性配置
- **WHEN** `GET /api/v1/system/features` 返回 200
- **THEN** `featuresStore.load()` SHALL 解析返回的 features 和 enabled_plugins
- **AND** loaded 标志 SHALL 设为 `true`
- **AND** 随后 `setupDynamicRoutes(router)` SHALL 执行，注册可选功能的路由
- **AND** 结果 SHALL 缓存在 store 中（不重复请求）

#### Scenario: 请求失败时重试
- **WHEN** `GET /api/v1/system/features` 返回非 200 或网络错误
- **THEN** `featuresStore.load()` SHALL 抛出异常
- **AND** 调用方 SHALL 在 3 秒退避后重试
- **AND** 在成功之前 SHALL NOT 使用任何默认猜想来注册路由
- **AND** 在成功之前 SHALL NOT 认为任何功能可用或不可用

#### Scenario: 加载完成前特性检查
- **WHEN** `featuresStore.load()` 尚未成功返回
- **THEN** `featuresStore.has('feature_name')` SHALL 返回 `false`
- **AND** 这样做是为了防止在特性未知时错误展示功能入口

### Requirement: 前端条件性路由注册

前端 Vue Router SHALL 在应用初始化时根据特性配置动态注册路由。未启用功能的路由 SHALL NOT 注册到 router 中。

#### Scenario: 启用功能的路由可访问
- **WHEN** `features.yaml` 中 `tools` 为 `true`
- **THEN** `/tools` 路由 SHALL 注册
- **AND** 用户访问 `/tools` SHALL 正常渲染工具箱页面

#### Scenario: 禁用功能的路由返回 404
- **WHEN** `features.yaml` 中 `tools` 为 `false`
- **THEN** `/tools` 路由 SHALL NOT 注册
- **AND** 用户访问 `/tools` SHALL 显示 404（或重定向到首页）

#### Scenario: 路由注册延迟
- **WHEN** 前端初始化
- **THEN** router SHALL 等待 `featuresStore.load()` 完成后才完成 setup
- **AND** 依赖特性路由的页面 SHALL 在特性加载完成后才可访问

### Requirement: 侧边栏菜单特性过滤

侧边栏菜单项 SHALL 支持通过 `feature` 字段控制可见性。同时存在 `permission` 和 `feature` 限制时，两者都满足才显示。

#### Scenario: 功能启用且有权显示
- **WHEN** `featuresStore.has('edge_client')` 返回 `true`
- **AND** `authStore.hasPermission('edge_nodes')` 返回 `true`
- **THEN** Edge 直连菜单项 SHALL 显示

#### Scenario: 功能禁用不显示
- **WHEN** `featuresStore.has('edge_client')` 返回 `false`
- **THEN** Edge 直连菜单项 SHALL NOT 显示（无论权限如何）
- **AND** 所属的 Edge 功能分区 SHALL 在该分区所有菜单项都隐藏时自动隐藏

### Requirement: 操作按钮特性过滤

节点管理页面中的安装相关按钮 SHALL 根据特性配置条件性显示。

#### Scenario: 安装功能启用
- **WHEN** `featuresStore.has('install_openresty')` 返回 `true`
- **THEN** NodeList.vue 行下拉菜单中的"安装 OpenResty"和"安装 Edge"按钮 SHALL 显示
- **AND** ClusterNodes.vue 中的"安装"下拉按钮 SHALL 显示

#### Scenario: 安装功能禁用
- **WHEN** `featuresStore.has('install_openresty')` 返回 `false`
- **THEN** 上述安装按钮 SHALL NOT 渲染
- **AND** 节点的启动/停止/状态/对比等核心操作按钮 SHALL 不受影响

### Requirement: 插件白名单硬过滤

`GET /api/v1/plugins/builtin` 端点 SHALL 在现有 `ps_plugin_enabled` 表过滤之后，再根据 `features.yaml` 中的 `enabled_plugins` 做第二层硬过滤。

#### Scenario: 配置文件限制插件范围
- **WHEN** `features.yaml` 中 `enabled_plugins` 为 `["proxy_rewrite", "cors", "key_auth"]`
- **AND** 用户请求 `GET /api/v1/plugins/builtin`
- **THEN** 返回的插件列表 SHALL 仅包含 `proxy_rewrite`、`cors`、`key_auth` 三个插件
- **AND** 即使 `ps_plugin_enabled` 表中其他插件为启用状态，SHALL NOT 出现在返回中

#### Scenario: 空列表不限制
- **WHEN** `features.yaml` 中 `enabled_plugins` 为空列表或未配置
- **THEN** `GET /api/v1/plugins/builtin` SHALL 返回所有已启用（DB 开关）的插件
- **AND** 行为与现有逻辑一致

### Requirement: 与权限系统的优先级规则

特性配置系统 SHALL 与现有权限系统正交运行。特性配置是第一道闸（部署级），权限系统是第二道闸（用户级）。两道闸独立运作，不互相修改。

#### Scenario: 特性禁用时权限不生效
- **WHEN** `features.yaml` 中 `edge_client` 为 `false`
- **AND** 当前用户拥有 `edge_nodes` 权限
- **THEN** Edge 直连路由 SHALL NOT 注册（前端 404）
- **AND** Edge 直连的 API 端点 SHALL 返回 404
- **AND** 侧边栏 Edge 直连菜单项 SHALL NOT 显示
- **AND** 用户 SHALL 无法以任何方式使用该功能

#### Scenario: 特性启用但用户无权限
- **WHEN** `features.yaml` 中 `edge_client` 为 `true`
- **AND** 当前用户不拥有 `edge_nodes` 权限
- **THEN** Edge 直连路由 SHALL 注册
- **AND** 侧边栏 Edge 直连菜单项 SHALL NOT 显示（被权限系统过滤）
- **AND** 用户直接访问 `/edge-client` SHALL 被 `router.beforeEach` 守卫拦截

#### Scenario: 特性启用且有权限
- **WHEN** `features.yaml` 中 `edge_client` 为 `true`
- **AND** 当前用户拥有 `edge_nodes` 权限
- **THEN** Edge 直连路由 SHALL 注册
- **AND** 侧边栏 Edge 直连菜单项 SHALL 显示
- **AND** 用户 SHALL 可以正常使用该功能

#### Scenario: Admin 用户不过 bypass 特性配置
- **WHEN** 当前用户角色为 `admin`（超级管理员）
- **AND** `features.yaml` 中 `edge_client` 为 `false`
- **THEN** `authStore.hasPermission('edge_nodes')` 返回 `true`（admin bypass 权限检查）
- **AND** `featuresStore.has('edge_client')` 返回 `false`
- **AND** 菜单过滤使用 AND 逻辑：`hasFeature AND hasPermission`
- **THEN** Edge 直连菜单 SHALL NOT 显示（因为 `hasFeature` 为 `false`）
- **AND** admin 也无法使用该功能（部署级限制高于用户角色）

### Requirement: 插件过滤三层链

`GET /api/v1/plugins/builtin` 端点 SHALL 使用三层过滤链：配置文件白名单（部署级硬上限）→ DB 开关（运维级细粒度）→ 返回结果。

#### Scenario: 配置文件白名单为硬上限
- **WHEN** `features.yaml` 中 `enabled_plugins` 为 `["proxy_rewrite", "cors", "key_auth"]`
- **AND** `ps_plugin_enabled` 表中 `traceid` 为启用状态
- **AND** 用户请求 `GET /api/v1/plugins/builtin`（不带 `all` 参数）
- **THEN** 返回结果中 SHALL NOT 包含 `traceid`
- **AND** 即使 `traceid` 在 DB 中为启用状态，由于不在配置文件白名单中，SHALL 不出现

#### Scenario: all=1 也受配置文件限制
- **WHEN** `features.yaml` 中 `enabled_plugins` 为 `["proxy_rewrite", "cors", "key_auth"]`
- **AND** 用户请求 `GET /api/v1/plugins/builtin?all=1`
- **THEN** 返回结果 SHALL 仅包含 `proxy_rewrite`、`cors`、`key_auth` 三个插件
- **AND** `all=1` 仅表示"忽略 DB 开关"，SHALL NOT 绕过配置文件白名单

#### Scenario: 空白名单不限制
- **WHEN** `features.yaml` 中 `enabled_plugins` 为空列表或未配置
- **THEN** `GET /api/v1/plugins/builtin` SHALL 按现有逻辑返回（仅受 DB 开关控制）

### Requirement: 用户管理中的权限选项动态过滤

用户管理页面中的权限分配选项 SHALL 根据特性配置动态过滤。对应功能被禁用的权限选项 SHALL NOT 显示在分配界面中。

#### Scenario: 功能启用时权限选项显示
- **WHEN** `features.yaml` 中 `edge_client` 为 `true`
- **THEN** 用户管理权限分配界面中 SHALL 显示"Edge直连"权限选项
- **AND** admin 可以正常分配该权限给普通用户

#### Scenario: 功能禁用时权限选项隐藏
- **WHEN** `features.yaml` 中 `edge_client` 为 `false`
- **THEN** 用户管理权限分配界面中 SHALL NOT 显示"Edge直连"权限选项
- **AND** admin 无法勾选不存在的权限
- **AND** 其他权限（插件组管理、全局规则管理、插件元数据）SHALL 不受影响

#### Scenario: 后端 API 仍然接受已隐藏的权限
- **WHEN** 通过直接 API 调用 `PUT /admin/users/{id}/permissions` 传入 `edge_nodes`
- **THEN** 后端 SHALL 仍然正常保存该权限
- **AND** 不报错，不做特殊处理
- **AND** 这样设计是为了后续功能重新启用时，之前分配的权限自动生效

### Requirement: 构建部署集成

`gen-linux.sh` 打包脚本 SHALL 在构建离线部署包时自动包含 `features.yaml` 文件。

#### Scenario: 离线打包包含配置文件
- **WHEN** 执行 `gen-linux.sh`
- **THEN** 脚本 SHALL 从 `product/features.yaml` 拷贝到部署根目录
- **AND** 部署启动后系统 SHALL 读取该配置

#### Scenario: 开发模式默认配置
- **WHEN** 使用 `develop/linux/start.sh` 启动开发环境
- **THEN** 系统 SHALL 使用 `backend/features.yaml`（如果存在）或默认全部启用
