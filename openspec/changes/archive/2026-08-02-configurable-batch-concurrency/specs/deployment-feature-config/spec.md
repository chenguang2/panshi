# deployment-feature-config — Delta Spec

## MODIFIED Requirements

### Requirement: features.yaml 配置文件 + 严格校验

部署根目录 SHALL 包含一个 `features.yaml` 文件（可选），定义该部署实例启用的功能、插件白名单和并发参数。**配置文件如果存在但格式错误，必须显式报错退出进程，不允许使用默认值静默启动。**

#### Scenario: 默认全启用
- **WHEN** `features.yaml` 文件不存在
- **THEN** 系统 SHALL 默认启用所有功能和插件
- **AND** 并发参数 SHALL 使用默认值（5）

#### Scenario: 配置文件结构
- **WHEN** 系统读取 `features.yaml`
- **THEN** 文件 SHALL 包含 `features`（功能名 → boolean 映射）和 `enabled_plugins`（插件名列表）
- **AND** 文件 MAY 包含 `concurrency`（并发参数名 → 整数映射）
- **AND** `concurrency` 未配置时系统 SHALL 使用默认并发值（5）

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

#### Scenario: concurrency 类型错误报错退出
- **WHEN** `features.yaml` 中 `concurrency` 不是映射（如字符串或列表）
- **THEN** 系统 SHALL 输出类型错误信息
- **AND** 进程 SHALL 以非零退出码退出

#### Scenario: concurrency 值非法报错退出
- **WHEN** `features.yaml` 中 `concurrency` 的某项值不是整数、是布尔值、小于 1 或大于 50
- **THEN** 系统 SHALL 指明哪个并发参数名和错误的值
- **AND** 进程 SHALL 以非零退出码退出

#### Scenario: concurrency 未知 key 报错退出
- **WHEN** `features.yaml` 中 `concurrency` 包含代码中不存在的并发参数名（如 `max_playbook` 拼写错误或 `batch_action_x`）
- **THEN** 系统 SHALL 输出未知参数名列表和允许的参数名列表（`max_playbooks`、`batch_action`）
- **AND** 进程 SHALL 以非零退出码退出（防止拼写错误导致配置静默失效，对齐 `KNOWN_FEATURES` 校验哲学）

## ADDED Requirements

### Requirement: 并发参数配置与读取

系统 SHALL 支持通过 `features.yaml` 的 `concurrency` 命名空间配置并发参数。未配置的参数 SHALL 使用默认值 5。已知并发参数：`max_playbooks`（后端全局 ansible playbook 并发上限）和 `batch_action`（前端批量节点操作并发数）。

#### Scenario: 读取已配置的并发参数
- **WHEN** `features.yaml` 包含 `concurrency: { max_playbooks: 10 }`
- **THEN** `get_concurrency("max_playbooks", 5)` SHALL 返回 `10`
- **AND** 后端 ansible 并发信号量 SHALL 以上限 10 创建

#### Scenario: 未配置的并发参数使用默认值
- **WHEN** `features.yaml` 不包含 `concurrency` 命名空间或缺少某个参数
- **THEN** `get_concurrency("max_playbooks", 5)` SHALL 返回 `5`
- **AND** `get_concurrency("batch_action", 5)` SHALL 返回 `5`
- **AND** 系统行为 SHALL 与配置化之前完全一致

#### Scenario: concurrency 空映射
- **WHEN** `features.yaml` 包含 `concurrency: {}`（空映射）或 `concurrency: null`
- **THEN** 系统 SHALL 将其视为空配置，所有并发参数 SHALL 使用默认值 5
- **AND** 启动 SHALL NOT 报错

### Requirement: GET /api/v1/system/features 返回并发配置

`GET /api/v1/system/features` 端点 SHALL 在响应中包含 `concurrency` 命名空间（当且仅当配置文件中存在时）。

#### Scenario: 配置了 concurrency 时返回
- **WHEN** `features.yaml` 包含 `concurrency: { max_playbooks: 8 }`
- **AND** 前端发送 `GET /api/v1/system/features`
- **THEN** 响应 SHALL 包含 `concurrency` 字段且 `concurrency.max_playbooks` 为 `8`

#### Scenario: 未配置 concurrency 时不返回该字段
- **WHEN** `features.yaml` 不包含 `concurrency` 命名空间
- **AND** 前端发送 `GET /api/v1/system/features`
- **THEN** 响应 SHALL NOT 包含 `concurrency` 字段（`get_features()` 返回原始 dict，未配置的 key 不出现）
- **AND** 响应结构 SHALL 向后兼容（`features` 与 `enabled_plugins` 字段不变）
- **AND** 前端 SHALL 通过 `res.data.concurrency || {}` 兜底为空配置

### Requirement: 前端并发配置 Store 解析

前端 Pinia features store SHALL 解析 `GET /api/v1/system/features` 响应中的 `concurrency` 字段，并提供读取单个并发参数的方法，缺省返回默认值 5。

#### Scenario: 成功加载并发配置
- **WHEN** `GET /api/v1/system/features` 返回 `concurrency: { batch_action: 10 }`
- **THEN** `featuresStore.concurrencyOf('batch_action', 5)` SHALL 返回 `10`

#### Scenario: 未配置时返回默认值
- **WHEN** `GET /api/v1/system/features` 返回的 `concurrency` 为空映射或不存在
- **THEN** `featuresStore.concurrencyOf('batch_action', 5)` SHALL 返回 `5`

#### Scenario: store 加载前返回默认值
- **WHEN** `featuresStore.load()` 尚未成功返回
- **THEN** `featuresStore.concurrencyOf('batch_action', 5)` SHALL 返回默认值 `5`（安全降级，不与硬编码行为冲突）

### Requirement: Docker 部署必须携带 features.yaml

Docker 部署 SHALL 在镜像内包含 `features.yaml` 或通过只读挂载提供，否则 `load_features()` 找不到文件会静默回退默认配置，导致 `concurrency`（及全部 feature 配置）在 Docker 下失效且无报错提示。

#### Scenario: 镜像包含 features.yaml
- **WHEN** 执行 `docker build`（`backend/Dockerfile`）
- **THEN** 构建产物 SHALL 包含 `/app/features.yaml`（通过 `COPY features.yaml ./features.yaml`）
- **AND** `.dockerignore` SHALL NOT 排除 `features.yaml`

#### Scenario: 运行时只读挂载
- **WHEN** 使用 `docker-compose up` 启动后端服务
- **THEN** `docker-compose.yml` SHALL 将宿主机 `./backend/features.yaml` 只读挂载到容器内 `/app/features.yaml`
- **AND** 修改宿主机 features.yaml 后重启容器 SHALL 生效（无需重建镜像）
