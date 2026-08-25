# 部署特性配置说明

`features.yaml` 是磐石 Admin 的部署特性配置文件，位于部署目录的 `backend/` 下。
通过此文件，可以在**部署级别**控制哪些功能对外开放，不受用户角色权限的影响。

## 工作原理

```
配置文件 (features.yaml)
  │
  ├─ 后端：启动时读取，条件性注册 API 路由
  │   ├─ 禁用功能 → 路由不注册，API 返回 404
  │   └─ 插件白名单 → hard filter，覆盖 DB 开关
  │
  └─ 前端：通过 GET /api/v1/system/features 获取配置
      ├─ 禁用功能 → 路由不注册，菜单隐藏
      └─ 插件白名单 → 不在白名单的插件不显示
```

**修改配置后必须重启后端才能生效。**

## 配置项总览

```yaml
features:
  edge_client: true        # Edge 直连功能
  edge_import: true        # Edge 数据导入
  tools: true              # 开发者工具箱
  install_openresty: true  # 在网关上安装 OpenResty
  install_edge: true       # 在网关上安装 Edge 运行时
  plugin_switches: true    # 插件启用/禁用管理页面
   task_center: true        # 节点任务中心（/node-tasks）
   edge_autostart: true     # Edge 节点自启动管理（systemd）

enabled_plugins: []        # 插件白名单（空 = 不限制）

concurrency:
  max_playbooks: 5         # 后端全局 ansible 并发上限（1-50）
  batch_action: 5          # 前端批量节点操作并发数（1-50）
```

## 节点任务中心（task_center）

`task_center` 开关控制节点操作任务中心：全局 `/node-tasks` 页面、任务化 API 路由、侧边栏「运维管理 → 节点任务」菜单。默认 `true`。

**启用时**：用户可将节点运维操作（安装/升级/启动/停止/状态查询等）以持久化异步任务执行，在任务中心查看进度、日志、取消/重试。
**禁用时**：任务中心路由与菜单消失，任务化 API 返回 404；现有单节点 SSE 操作不受影响（双轨并存）。

详细说明见 [node-task-center.md](node-task-center.md)。

## 并发参数（concurrency）

`concurrency` 命名空间控制批量节点操作（启动/停止/reload/状态查询）的并发数，默认均为 `5`，取值范围 `1-50`。

| 参数 | 默认值 | 控制范围 |
|---|---|---|
| `max_playbooks` | `5` | 后端全局同时执行的 ansible playbook 数（`AnsibleRunnerService` 信号量，跨所有走 ansible 的操作） |
| `batch_action` | `5` | 前端批量节点操作同时发出的 HTTP 请求数（`runWithConcurrency` worker 数） |

**联动规则（clamp）**：前端实际并发为 `min(batch_action, max_playbooks)`——即使只调大 `batch_action`，也不会超过后端信号量上限。这是为了防止前端并发请求在后端排队超过 axios 30s 超时导致的**超时假失败**（前端显示失败，后端实际仍在排队执行）。建议两值联动调整，以后端 `max_playbooks` 为准（SSH 并发、ansible 进程资源是真正的瓶颈）。

**多 worker 进程注意**：若后端以多 worker 部署（如 `uvicorn --workers N`），每个进程各自持有一把信号量，实际并发 = `进程数 × max_playbooks`。

**配置校验**：`concurrency` 必须是映射，参数名必须是 `max_playbooks` / `batch_action` 之一（未知参数名启动即报错退出），值必须是非布尔整数且 1-50。配置错误时后端启动失败并输出明确错误信息。

**生效方式**：
- 后端：`max_playbooks` 在启动时读取，修改需**重启后端**生效
- 前端：`batch_action` 由前端在启动时经 `GET /api/v1/system/features` 拉取，**页面会话内冻结**——修改 features.yaml 后需**刷新前端页面 + 重启后端**才生效（前端未配置该字段时降级为默认 5）

**Docker 部署要求**：Docker 镜像内必须包含 `features.yaml`（Dockerfile 已 `COPY features.yaml`，compose 已只读挂载 `./backend/features.yaml:/app/features.yaml:ro`）。若镜像/容器内缺少该文件，系统会**静默使用默认配置**（不报错），concurrency 乃至全部功能配置都不生效。

**配置示例**：

```yaml
# 资源充足，提升批量操作并发
concurrency:
  max_playbooks: 10
  batch_action: 10
```

```yaml
# 仅放宽前端并发（实际仍受 max_playbooks clamp 约束）
concurrency:
  max_playbooks: 5
  batch_action: 10   # 实际并发 = min(10, 5) = 5
```

## 功能项详细说明

### `edge_client` — Edge 直连

| 项目 | 说明 |
|---|---|
| 默认值 | `true` |
| 控制范围 | 后端 `GET /api/v1/edge-client/*` 全部端点 |
| | 前端 `/edge-client` 路由 |
| | 左侧菜单"Edge直连"项 |
| 依赖权限 | `edge_nodes`（用户权限管理） |
| 关联数据 | `ps_node` 表（节点信息） |

**启用时**：用户可通过页面直接调用 Edge 节点的 Admin API 进行调试。
**禁用时**：所有 Edge 直连 API 返回 404，菜单和路由均不存在，用户无法访问。

### `edge_import` — Edge 数据导入

| 项目 | 说明 |
|---|---|
| 默认值 | `true` |
| 控制范围 | 后端 `POST /api/v1/edge-import/*` 全部端点 |
| | 前端 `/edge-import` 路由 |
| | 左侧菜单"数据导入"项 |
| 依赖权限 | 无（但需要知道 Edge 节点的 IP/端口/API Key） |

**启用时**：用户可将已在运行的 Edge 节点上的配置批量导入到磐石数据库。
**禁用时**：数据导入相关 API 返回 404，菜单和路由均不存在。

### `tools` — 开发者工具箱

| 项目 | 说明 |
|---|---|
| 默认值 | `true` |
| 控制范围 | 前端 `/tools` 路由（纯前端，无后端 API） |
| | 左侧菜单"工具箱"项 |
| 依赖权限 | 无 |

**启用时**：用户可使用 Lua 转换、URL 编解码、JSON 格式化、SM4 加解密、Base64 工具。
**禁用时**：工具箱路由和菜单消失。

### `install_openresty` — 安装 OpenResty

| 项目 | 说明 |
|---|---|
| 默认值 | `true` |
| 控制范围 | 后端 `POST .../install-openresty` + `POST .../cancel-install` |
| | `NodeList.vue` 和 `ClusterNodes.vue` 中的"安装 OpenResty"按钮 |
| 依赖权限 | 无（但需要 SSH 访问目标节点） |

**启用时**：用户可通过节点管理页面在网关节点上安装 OpenResty。
**禁用时**：安装 API 返回 404，相关按钮消失。
**注意**：`cancel-install`（取消安装）跟随此配置，禁用后也无法取消进行中的安装。

### `install_edge` — 安装 Edge 运行时

| 项目 | 说明 |
|---|---|
| 默认值 | `true` |
| 控制范围 | 后端 `POST .../install-edge` |
| | `NodeList.vue` 和 `ClusterNodes.vue` 中的"安装 Edge"按钮 |
| 依赖权限 | 无（但需要 SSH 访问目标节点） |

**启用时**：用户可通过节点管理页面在网关节点上安装 Edge 运行时。
**禁用时**：安装 API 返回 404，相关按钮消失。

### `plugin_switches` — 插件开关管理

| 项目 | 说明 |
|---|---|
| 默认值 | `true` |
| 控制范围 | 后端 `GET/PUT /api/v1/plugin-switches` |
| | 前端 `/plugin-switches` 路由 |
| | 左侧菜单"插件开关"项 |
| 依赖权限 | `plugin_management`（仅 admin 角色可访问） |

**启用时**：admin 用户可进入插件开关页面启用/禁用内置插件。
**禁用时**：插件开关 API 返回 404，菜单和路由均不存在。
**注意**：即使此功能禁用，`enabled_plugins` 白名单仍然生效。

### `ssl_cert` — SSL 证书管理

| 项目 | 说明 |
|---|---|
| 默认值 | `true` |
| 控制范围 | 后端 `GET/POST /clusters/{id}/ssl/*` + `GET /ssl/*` 全部端点 |
| | 前端 `/ssl` 路由 |
| | 左侧菜单"SSL 证书"项 |

**启用时**：用户可管理 SSL 证书（上传、编辑、删除、发布）。
**禁用时**：SSL 证书 API 返回 404，菜单和路由均不存在。

### `dns_proxy_udp` — DNS 代理[UDP]

| 项目 | 说明 |
|---|---|
| 默认值 | `true` |
| 控制范围 | 后端 `GET/POST /clusters/{id}/dns-proxies/*` 全部端点 |
| | 前端 `/dns-proxies` 路由 |
| | 左侧菜单"DNS代理[UDP]"项 |

**启用时**：用户可管理 UDP DNS 四层代理规则。
**禁用时**：DNS 代理[UDP] API 返回 404，菜单和路由均不存在。

### `dns_proxy_http` — DNS 代理[HTTP]（DNS 查询管理）

| 项目 | 说明 |
|---|---|
| 默认值 | `true` |
| 控制范围 | 前端 `/dns-queries` 路由（仅前端控制，复用 Routes API） |
| | 左侧菜单"DNS代理[HTTP]"项 |

**启用时**：用户可通过独立页面管理 HTTP 层的 DNS 查询路由。
**禁用时**：菜单和路由均不存在，但 Routes API 仍然可用（独立页面仅为管理入口）。

## 插件白名单

### `enabled_plugins` — 插件可用性限制

| 项目 | 说明 |
|---|---|
| 默认值 | `[]`（空列表 = 所有插件可用） |
| 优先级 | 第 1 层白名单 > 第 2 层 DB 开关（`ps_plugin_enabled`） |
| 影响范围 | `GET /api/v1/plugins/builtin` 返回结果 |
| | 路由/插件组/全局规则中的插件选择器 |
| | 即使 `all=1` 参数也无法绕过 |

**配置示例**：

```yaml
# 只允许这几个插件，其余全部隐藏
enabled_plugins:
  - proxy_rewrite
  - cors
  - key_auth
  - traceid
  - monitor
```

**三层过滤链**：

```
BUILTIN_PLUGINS (代码中所有插件定义)
  │
  ▼ 第 1 层：enabled_plugins 白名单（部署级硬上限）
  │   空列表 = 不限制，全部可用
  │   非空   = 只返回列表中的插件
  │   即使 all=1 也受此限制
  │
  ▼ 第 2 层：ps_plugin_enabled DB 开关（运维级细粒度）
  │   all=1 时跳过这层
  │   正常情况：只返回 enabled=1 的插件
  │
  ▼ 返回结果 → 前端渲染
```

**已有插件列表**（共 26 个）：

| 插件名 | 分类 | 说明 |
|---|---|---|
| `proxy_rewrite` | rewrite | 代理重写 |
| `response_rewrite` | rewrite | 响应重写 |
| `cors` | rewrite | 跨域 |
| `traffic_split` | flow | 流量分流 |
| `traffic_limit_count` | flow | 流量限流 |
| `auth_basic` | auth | 基本认证 |
| `auth_key` | auth | Key 认证 |
| `pre_functions` | process | 前置函数 |
| `functions_pre` | process | 函数预处理 |
| `data_center` | process | 数据中心 |
| `log_process` | process | 日志处理 |
| `static_resource` | static | 静态资源 |
| `traceid` | monitor | 链路追踪 |
| `monitor` | monitor | 监控 |
| `security_common_body` | security | 请求体安全 |
| `security_corerule` | security | 核心规则 |
| `security_common_args` | security | 参数安全 |
| `security_common_cookie` | security | Cookie 安全 |
| `security_common_referer` | security | Referer 安全 |
| `security_common_uri` | security | URI 安全 |
| `security_common_useragent` | security | User-Agent 安全 |
| `security_restrict_ip` | security | IP 黑/白名单 |
| `security_restrict_uri` | security | URI 白名单 |
| `security_restrict_form` | security | 表单限制 |
| `security_super_ip` | security | 高级 IP 限制 |
| `security_super_user` | security | 高级用户限制 |

## 与权限系统的关系

特性配置和权限系统是**两个独立的控制层**：

```
部署级（特性配置）："这个部署有什么功能"     ← features.yaml
用户级（权限系统）："这个用户能用哪些功能"    ← sys_user_permission

最终可见 = 特性配置 ∩ 用户权限
两者都通过才能使用
```

| 特性配置 | 用户权限 | 最终结果 |
|---|---|---|
| 启用 | 有权限 | ✅ 可以使用 |
| 启用 | 无权限 | ❌ 权限不足 |
| 禁用 | 有权限 | ❌ 功能不存在（404） |
| 禁用 | 无权限 | ❌ 功能不存在 |

**重要**：admin 角色（超级管理员）可以绕过权限检查，但**不能绕过特性配置**。
即使 admin 也无法使用一个被 `features.yaml` 禁用的功能。

## 完整配置示例

### 最小配置（全部启用）

```yaml
features: {}
enabled_plugins: []
```

### 仅核心功能（关闭所有可选功能）

```yaml
features:
  edge_client: false
  edge_import: false
  tools: false
  install_openresty: false
  install_edge: false
  plugin_switches: false
enabled_plugins: []
```

### 只开放部分功能 + 限制部分插件

```yaml
features:
  edge_client: true
  edge_import: false
  tools: false
  install_openresty: true
  install_edge: true
  plugin_switches: true

enabled_plugins:
  - proxy_rewrite
  - response_rewrite
  - traffic_split
  - traffic_limit_count
  - pre_functions
  - functions_pre
  - data_center
  - log_process
  - static_resource
  - traceid
  - monitor
```

## 故障排查

**问题**：修改 features.yaml 后菜单项仍然显示
**原因**：配置文件只在后端启动时读取一次，修改后需要重启
**解决**：

```bash
bash stop.sh
# 修改 features.yaml
bash start.sh
```

**问题**：某个功能虽然启用了，但菜单项不显示
**原因**：该功能可能还有权限要求（如 `edge_client` 需要 `edge_nodes` 权限）
**解决**：在用户管理中为该用户分配对应的权限

**问题**：前端页面空白
**原因**：可能是前端缓存了旧的路由信息
**解决**：按 Ctrl+F5 强制刷新页面
