# 磐石 Admin 架构说明书

> 版本：1.19.0 | 更新日期：2026-06-27

---

## 目录

1. [系统概述](#1-系统概述)
2. [整体架构](#2-整体架构)
3. [后端架构](#3-后端架构)
4. [前端架构](#4-前端架构)
5. [数据模型](#5-数据模型)
6. [API 设计](#6-api-设计)
7. [认证与授权](#7-认证与授权)
8. [发布工作流](#8-发布工作流)
9. [Edge 节点通信](#9-edge-节点通信)
10. [部署架构](#10-部署架构)
11. [技术选型](#11-技术选型)

---

## 1. 系统概述

### 1.1 产品定位

磐石 Admin 是一个**多集群 Edge 网关统一管理平台**。它作为控制平面，在同一个界面管理上游服务、路由规则、插件配置，然后统一发布到 Edge 网关节点。

### 1.2 核心能力

- **集群管理**：多集群统一视图，分组管理，连接可用性验证
- **上游管理**：后端服务配置，多策略负载均衡（轮询/一致性哈希/EWMA/最少连接），健康检查，超时/连接池配置
- **路由管理**：按域名、路径、请求头、请求方法等条件定义匹配规则，支持高级组合条件
- **插件管理**：路由级插件 + 插件组（PluginConfig）+ 全局规则（GlobalRule），支持表单和 JSON 双模式编辑
- **插件元数据**：可复用的插件模板，附带参数 Schema
- **静态资源**：ZIP 文件上传、路由绑定、自动部署到 Edge 节点
- **四层代理**：TCP/UDP 四层代理转发规则管理
- **节点管理**：Edge 网关节点生命周期（启动/停止/重启/状态查询/安装），SSH/Ansible 驱动
- **配置对比**：本地数据库与 Edge 节点运行配置差异化高亮
- **Edge 数据导入**：从 Edge 节点批量导入上游、路由等到本地数据库
- **配置版本管理**：变更追踪，版本对比，一键回滚
- **用户与权限**：基于 JWT 的用户认证 + 基于角色和集群范围的授权

### 1.3 适用场景

- 运维团队需要在一个地方管理分布在多个机房的 Edge 网关集群
- 需要为不同业务线配置不同的上游服务、路由规则和插件策略
- 需要将配置变更发布到生产 Edge 节点，并追踪每次变更的版本历史
- 需要对比本地期望配置与 Edge 节点实际运行配置的差异

---

## 2. 整体架构

### 2.1 架构分层

```
┌──────────────────────────────────────────────────────────┐
│                    用户界面 (Vue 3 SPA)                    │
│  RouteList  │  UpstreamList  │  ClusterList  │  ...       │
│  插件组       │  全局规则       │  节点管理       │  Edge 工具   │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP REST (JSON)
                       ▼
┌──────────────────────────────────────────────────────────┐
│              控制平面 (FastAPI + SQLAlchemy)               │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  认证/授权    │  │  业务路由     │  │  发布引擎        │ │
│  │  JWT + bcrypt│  │  CRUD + 查询  │  │  Edge 同步 + 版本 │ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Ansible     │  │  Edge 通信    │  │  配置差异比对    │ │
│  │  节点管理     │  │  SM4 加密     │  │  等效规则引擎    │ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  SQLite/    │  │  ClickHouse  │  │  导入引擎        │ │
│  │  PostgreSQL │  │  指标查询     │  │  Edge→DB 管道    │ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTPS (REST) / SSH (Ansible)
                       ▼
┌──────────────────────────────────────────────────────────┐
│                  Edge 网关节点 (数据平面)                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Nginx   │  │  Edge    │  │  Route   │  │  Upstream │ │
│  │ 运行时    │  │  管理API  │  │  配置     │  │  配置     │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 2.2 组件职责

| 组件 | 职责 |
|---|---|
| **前端 SPA** | 用户交互、表单编辑、卡片/表格展示、API 调用 |
| **后端 API** | RESTful 接口，CRUD 操作，业务逻辑编排，数据持久化 |
| **数据库** | 期望配置存储（声明式），非运行时配置 |
| **Ansible** | Edge 节点 SSH 管理，Nginx 启停/配置检查/状态查询 |
| **Edge API** | 与 Edge 节点管理接口通信，推送配置，查询状态 |
| **ClickHouse** | 可选，运行时指标存储和查询 |

### 2.3 关键设计原则

1. **声明式配置**：数据库存储的是期望状态（desired state），而非 Edge 节点的运行时状态
2. **显式发布**：编辑配置后需要主动点击"发布"才会推送到 Edge 节点，不自动同步
3. **版本追踪**：每次发布创建 `ConfigVersion` 快照，支持回滚到任意历史版本
4. **功能门控**：通过 `features.yaml` 控制部署特性，与代码逻辑解耦
5. **分组组织**：集群通过 `group_name` 分组管理，资源页面通过分组筛选和颜色标识

---

## 3. 后端架构

### 3.1 目录结构

```
backend/
├── app/
│   ├── api/v1/           # REST API 路由层（29 个始终启用 + 9 个功能门控）
│   ├── core/             # 核心基础设施（数据库、JWT、特性开关、迁移）
│   ├── models/           # SQLAlchemy ORM 模型（16 个）
│   ├── schemas/          # Pydantic v2 请求/响应 Schema（11 个文件）
│   ├── services/         # 业务逻辑层（8 个服务）
│   ├── config/           # 静态配置（插件定义、等效规则 YAML）
│   └── utils/            # 工具函数（YAML 验证器）
├── tests/                # pytest 测试
├── ansible/              # Ansible playbook 项目目录
└── data/                 # SQLite 数据库文件
```

### 3.2 依赖链

```
API 路由层 (api/v1/)
  ├── 依赖注入: core.database.get_db() → AsyncSession
  ├── ORM 查询: models.*（select() / execute() 直连模式）
  ├── 数据验证: schemas.*（Pydantic v2）
  └── 业务逻辑: services.*（Edge 通信、Ansible、配置比对）

服务层 (services/)
  ├── edge_client.py       ← 依赖: httpx, SM4 加密库
  ├── edge_sync.py         ← 依赖: models.*, core.database
  ├── edge_import_service.py ← 依赖: edge_client, models.*
  ├── ansible_service.py   ← 依赖: ansible_runner, subprocess
  ├── config_diff.py       ← 依赖: equivalence_rules.yaml
  ├── metrics_service.py   ← 依赖: clickhouse_client
  └── edge_logger.py       ← 依赖: 文件系统（logs/ 目录）

核心层 (core/)
  ├── database.py          ← 独立（SQLAlchemy 引擎）
  ├── security.py          ← 独立（JWT + bcrypt）
  ├── features.py          ← 独立（features.yaml）
  ├── seed.py              ← 依赖: security, models.user
  └── migrate.py           ← 依赖: database
```

### 3.3 路由设计模式

**路由分两层**：

1. **作用域路由**（scoped）：`/clusters/{cluster_id}/<resource>` — 在特定集群内操作资源
2. **全局路由**（global）：`/<resource>` — 跨集群查看和过滤资源列表

```python
# 作用域路由示例
@router.post("/{cluster_id}/routes/{route_id}/publish")
async def publish_route(cluster_id, route_id, ...):
    node = await _verify_node(...)
    # 1. 创建 ConfigVersion 快照
    # 2. 转换为 Edge API 格式
    # 3. 推送到目标节点
    # 4. 记录日志
    # 5. 返回发布结果

# 全局路由示例
@router.get("/routes")
async def list_all_routes(group_name, cluster_id, search, ...):
    # JOIN Cluster 表，支持 group_name 过滤
    # 分页 + 排序 + 搜索
    # 返回统一格式的响应
```

### 3.4 设计模式

| 模式 | 应用位置 | 说明 |
|---|---|---|
| **直连数据库访问** | 所有路由处理程序 | 不使用 Repository 模式，直接 `select()` / `execute()` |
| **最小服务层** | services/ | 仅当逻辑跨路由共享时才提取到服务层 |
| **功能门控** | main.py + features.yaml | 特性通过 YAML 配置启用/禁用，路由按条件注册 |
| **发布工作流** | edge_sync.py | 版本快照 → 格式转换 → 推送节点 → 日志记录 |
| **等效规则引擎** | config_diff.py | YAML 驱动的 DB-vs-Edge 字段映射规则 |
| **Ansible SSH 双回退** | ansible_service.py | 密钥认证 → sshpass 密码认证 |
| **SM4 加密通信** | edge_client.py | Edge 节点管理 API 的请求/响应加解密 |

---

## 4. 前端架构

### 4.1 目录结构

```
frontend/src/
├── api/              # Axios HTTP 客户端 + 按模块划分的 API 函数
├── components/       # 可复用 Vue 组件（25 个文件）
├── composables/      # 可复用状态逻辑（15 个 composable）
├── router/           # Vue Router 配置（静态 + 动态特性门控路由）
├── stores/           # Pinia 状态管理（5 个 store）
├── styles/           # OKLCH 设计 Token
├── types/            # TypeScript 接口定义
├── views/            # 页面级组件（24 个 + 6 个集群子视图）
│   └── clusters/     # 集群详情 Tab 子视图
├── constants.ts      # 全局常量（分页大小等）
└── style.css         # 全局设计系统 CSS
```

### 4.2 路由架构

**两层路由注册**：

1. **静态路由** — 应用启动时注册，始终可用（登录、仪表盘、核心资源管理）
2. **动态路由** — 启动后根据 `features.yaml` 返回的特性配置按需注册

```
/login → Login.vue（公开）
/ → DefaultLayout.vue（需要认证）
  ├── (空)           → Dashboard.vue
  ├── users          → UserList.vue
  ├── clusters       → ClusterList.vue
  ├── central-management → CentralList.vue
  ├── upstreams      → UpstreamList.vue
  ├── routes         → RouteList.vue
  ├── plugin-configs → PluginConfigList.vue
  ├── global-rules   → GlobalRuleList.vue
  ├── plugin-metadata → PluginMetadataList.vue
  ├── static-resources → StaticResourceList.vue
  ├── nodes          → NodeList.vue
  ├── stream-proxies → StreamProxyList.vue（需 stream_proxy 特性）
  ├── edge-client    → EdgeClient.vue（需 edge_client 特性）
  ├── edge-import    → EdgeImport.vue（需 edge_import 特性）
  ├── edge-env       → EdgeEnv.vue（需 edge_env 特性）
  ├── tools          → Tools.vue（需 tools 特性）
  ├── plugin-switches → PluginSwitches.vue（需 plugin_switches 特性）
  ├── metrics        → Metrics.vue（需 metrics 特性）
  └── metrics/dashboard → MetricsDashboard.vue（需 metrics 特性）
```

### 4.3 数据流

```
用户操作 → Vue 组件
  → Composable（useCluster*）
    → API 函数（api/*.ts）
      → Axios 实例（JWT 拦截器自动注入 Token）
        → 后端 API
          → ORM 查询
            → 数据库
  ← 响应数据
  ← 组件响应式更新
```

### 4.4 关键设计模式

| 模式 | 位置 | 说明 |
|---|---|---|
| **Composable 封装 CRUD** | composables/useCluster*.ts | 每个资源类型一个 composable，封装增删改查 + 发布 + 版本管理 |
| **可复用 Composable** | useClusterPluginEntity.ts | 插件组和全局规则共享同一 CRUD 逻辑（通过配置区分 API 端点） |
| **共享发布/删除工具** | useClusterUtils.ts | executePublish / executeDeleteWithProgress 带进度弹窗 |
| **特征门控动态路由** | router/index.ts | 启动后加载特性配置，按需注册功能页面 |
| **分组颜色系统** | useGroupColors.ts | 基于分组名字符串哈希的确定性 OKLCH 调色板 |
| **持久化列配置** | useColumnConfig.ts | 用户自定义的列可见性/排序/搜索字段存储在 localStorage |
| **双模式插件编辑器** | PluginEditorDrawer.vue | 表单模式 + JSON 编辑器模式，实时同步 |

---

## 5. 数据模型

### 5.1 核心域模型

磐石 Admin 的核心域由 7 个可管理资源组成，所有资源都隶属于某个集群：

```
Cluster（集群）
  ├── Upstream（上游服务）
  │   └── UpstreamTarget（目标节点）
  ├── Route（路由规则）
  │   └── RoutePlugin（路由级插件）
  ├── Node（Edge 节点）
  ├── PluginConfig（插件组）
  ├── GlobalRule（全局规则）
  ├── PluginMetadata（插件元数据）
  ├── StaticResource（静态资源）
  └── StreamProxy（四层代理）
       └── targets（内嵌 JSON）
```

### 5.2 模型关系图

```
ps_cluster
├── id (PK)
├── name / display_name
├── admin_url / admin_key    # Edge 管理 API 地址和密钥
├── group_name               # 分组名称
├── status                   # 1=正常, 0=停用
├── current_version          # 当前配置版本
│
├── ps_upstream (CASCADE)
│   ├── cluster_id (FK → ps_cluster)
│   ├── edge_uuid (UNIQUE per cluster)
│   ├── load_balance (weighted_roundrobin/chash/ewma/least_conn)
│   ├── checks / timeout / keepalive_pool (JSON)
│   └── current_version
│       └── ps_upstream_target (CASCADE)
│           ├── upstream_id (FK → ps_upstream)
│           ├── target (host:port)
│           └── weight
│
├── ps_route (CASCADE)
│   ├── cluster_id (FK → ps_cluster)
│   ├── edge_uuid (UNIQUE per cluster)
│   ├── upstream_id (FK → ps_upstream, SET NULL)
│   ├── uri / methods / hosts
│   ├── vars (JSON 高级匹配)
│   ├── plugin_config_ids (JSON 引用的插件组 ID 列表)
│   └── current_version
│       └── ps_route_plugin (CASCADE)
│           ├── route_id (FK → ps_route)
│           ├── plugin_name
│           └── config (JSON)
│
├── ps_node (CASCADE)
│   ├── cluster_id (FK → ps_cluster)
│   ├── ip / service_port / management_port
│   ├── edge_path / edge_install_path
│   ├── status (1=正常, 0=停用)
│   └── status_detail (JSON: ansible 执行结果)
│
├── ps_plugin_config / ps_global_rule
│   ├── cluster_id (FK)
│   ├── name / description
│   ├── plugins (JSON: {plugin_name: config})
│   └── current_version
│
├── ps_plugin_metadata
│   ├── cluster_id (FK)
│   ├── plugin_name (UNIQUE per cluster)
│   └── config_data (JSON)
│
├── ps_static_resource
│   ├── cluster_id (FK)
│   ├── route_id (FK → ps_route)
│   ├── name / url_path / description
│   ├── file_size / storage_path
│   └── current_version
│
├── ps_stream_proxy
│   ├── cluster_id (FK)
│   ├── listen_port (UNIQUE per cluster)
│   ├── load_balance / scheme (tcp/udp)
│   ├── targets / timeout / keepalive_pool (JSON)
│   └── current_version
│
└── ps_config_version (多态)
    ├── cluster_id (FK)
    ├── resource_type (route/upstream/plugin_config/...)
    ├── resource_id
    ├── version (INT, auto-increment per resource)
    └── config (JSON: 完整配置快照)
```

### 5.3 安全与审计模型

```
sys_user
├── id (PK) / username (UNIQUE)
├── password_hash (bcrypt)
├── role (admin/user)
└── status (1=正常, 0=禁用)
    ├── sys_user_cluster (多对多)
    │   ├── user_id (FK → sys_user)
    │   └── cluster_id (FK → ps_cluster)
    └── sys_user_permission
        ├── user_id (FK → sys_user)
        ├── resource_type
        └── enabled

sys_audit_log
├── user_id / username
├── action / resource / resource_id
├── detail (JSON)
└── ip_address
```

### 5.4 导入与指标模型

```
ps_import_log
├── cluster_id / node_ip / node_port
├── status (success/partial/failed)
├── upstream_count / route_count / ... (各类资源计数)
├── unknown_plugin_names (JSON)
├── conflict_details (JSON)
└── error_message

ClickHouse (外部)
├── otel_metrics_* 表（OpenTelemetry 指标数据）
└── 通过 metrics_service 查询
```

### 5.5 关键约束

| 约束 | 说明 |
|---|---|
| `UNIQUE(cluster_id, edge_uuid)` | 每个集群内，Edge 资源 UUID 唯一 |
| `UNIQUE(cluster_id, listen_port)` | 每个集群内，四层代理监听端口唯一 |
| `UNIQUE(cluster_id, plugin_name)` | 每个集群内，插件元数据唯一 |
| `UNIQUE(username)` | 用户名全局唯一 |
| `resource_type + resource_id` | ConfigVersion 的多态关联 |

---

## 6. API 设计

### 6.1 API 风格

- **RESTful**：资源通过 URL 路径标识，HTTP 方法表示操作
- **统一前缀**：`/api/v1/`
- **请求体**：JSON（Pydantic v2 验证）
- **认证**：JWT Bearer Token（`Authorization: Bearer <token>`）
- **分页**：`?page=1&page_size=20`，响应包含 `total / page / page_size / items`

### 6.2 端点分类

#### 认证与系统（4 个）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/login` | 用户登录，返回 JWT |
| POST | `/auth/logout` | 用户登出 |
| GET | `/auth/me/permissions` | 获取当前用户权限 |
| GET | `/system/features` | 获取部署特性配置（无需认证） |

#### 集群管理（9 个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/clusters` | 列表 / 创建 |
| GET/PUT/DELETE | `/clusters/{id}` | 详情 / 更新 / 删除 |
| GET | `/clusters/my` | 当前用户有权限的集群 |
| GET | `/clusters/{id}/stats` | 集群统计（各资源计数） |
| POST | `/clusters/{id}/test` | 连接测试 |

#### 资源管理（7 个资源 × 标准 CRUD）

每个资源（upstreams/routes/nodes/plugin_configs/global_rules/plugin-metadata/static-resources/stream-proxies）遵循统一模式：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/clusters/{id}/<resource>` | 列表（作用域） |
| POST | `/clusters/{id}/<resource>` | 创建 |
| GET | `/clusters/{id}/<resource>/{rid}` | 详情 |
| PUT | `/clusters/{id}/<resource>/{rid}` | 更新 |
| DELETE | `/clusters/{id}/<resource>/{rid}` | 删除 |

#### 全局列表（8 个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/<resource>` | 跨集群列表（支持 group_name/cluster_id/search 过滤） |

#### 发布与版本管理

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/clusters/{id}/<resource>/{rid}/publish` | 发布到指定节点 |
| GET | `/clusters/{id}/<resource>/{rid}/versions` | 版本历史 |
| GET | `/clusters/{id}/<resource>/{rid}/versions/{vid}` | 版本详情 |
| POST | `/clusters/{id}/<resource>/{rid}/rollback` | 回滚到指定版本 |

### 6.3 统一响应格式

```json
{
  "total": 100,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 1,
      "cluster_id": 1,
      "cluster_name": "生产集群",
      "cluster_group_name": "线上",
      "...": "资源特有字段"
    }
  ]
}
```

---

## 7. 认证与授权

### 7.1 认证流程

```
用户 → 登录表单 → POST /auth/login
  → 后端验证用户名密码（bcrypt）
  → 生成 JWT（HS256, 24h 过期）
  → 返回 { access_token, user, permissions }

后续请求：
  → Axios 拦截器注入 Authorization: Bearer <token>
  → 后端依赖注入 get_current_user()
    → 解码 JWT
    → 查询用户
    → 检查用户状态
  → 路由处理程序执行
```

### 7.2 授权模型

| 角色 | 权限 |
|---|---|
| **admin** | 完全访问所有集群和资源 |
| **user** | 只能操作 `UserCluster` 分配的集群，受 `UserPermission` 限制 |

### 7.3 权限检查层次

1. **路由级**：非管理员用户的 `UserCluster` 限制了可访问的集群
2. **UI 级**：前端的 `authStore.hasPermission()` 控制按钮/菜单显示
3. **API 级**：后端 `get_current_user()` 在路由处理程序中过滤数据

---

## 8. 发布工作流

### 8.1 标准发布流程

```
1. 用户在 UI 中编辑资源配置
2. 点击"发布"按钮
3. 弹出节点选择弹窗（PublishConfirmModal）
4. 用户选择目标 Edge 节点
5. 后端执行：
   a. 创建 ConfigVersion 快照
   b. 将配置转换为 Edge API 格式
   c. 通过 EdgeClient 推送到目标节点
   d. 记录发布日志
   e. 返回发布结果（成功/失败/部分成功）
6. 前端显示发布结果 Drawer
```

### 8.2 配置版本管理

- 每次发布自动创建 `ConfigVersion` 记录
- 版本号在资源内自增（`resource_type + resource_id` 维度）
- 版本配置存储完整 JSON 快照
- 支持查看版本历史、版本详情对比、回滚到任意版本

### 8.3 Edge 节点通信

```
后端 → EdgeClient.api(resource, action, data)
  → SM4 ECB 加密请求体（PKCS7 填充）
  → HTTPS POST 到 Edge 管理端口
  → Edge 节点处理并返回
  → SM4 ECB 解密响应体
  → 返回格式化结果
```

支持 7 种资源类型的 CRUD 操作，通过统一的 `RESOURCE_PATHS` + `ACTION_METHOD` 映射。

---

## 9. Edge 节点通信

### 9.1 通信协议

| 层面 | 细节 |
|---|---|
| 传输 | HTTPS |
| 端口 | 节点管理端口（默认 9180） |
| 加密 | SM4 ECB 模式（PKCS7 填充） |
| 认证 | API Key（集群配置中的 admin_key） |
| 格式 | JSON |

### 9.2 统一 API 方法

```python
# 统一入口
EdgeClient.api(resource="upstreams", action="list", cluster_id=1)
EdgeClient.api(resource="routes", action="get", cluster_id=1, resource_id="route-1")
EdgeClient.api(resource="routes", action="create", cluster_id=1, data={...})
```

`RESOURCE_PATHS` 映射定义了每种资源在 Edge API 上的路径模板，`ACTION_METHOD` 映射定义了每种操作对应的 HTTP 方法。

### 9.3 Ansible 节点管理

对于需要 SSH 访问的操作（Nginx 启停、状态查询、安装 OpenResty/Edge），使用 Ansible playbook：

```python
# 节点启动
POST /clusters/{id}/nodes/{nid}/start
  → _run_and_update(db, node, "nginx_cmd_run", {"nginx_cmd": "nginx_start"})
  → ansible runner 执行 playbook
  → 解析 stdout 确定 nginx 运行状态
  → 更新 node.status_detail + node.status

# 节点状态查询
POST /clusters/{id}/nodes/{nid}/statistic
  → _run_and_update(db, node, "edge_statistic", {...})
  → 解析 nginx_running + CPU/内存/版本等统计信息
  → 同步更新 node.status
```

SSH 认证支持双回退：密钥认证 → `sshpass` 密码认证。

---

## 10. 部署架构

### 10.1 开发环境

```
┌──────────┐     HTTP 代理      ┌──────────┐     SQLite     ┌──────────┐
│  Vite Dev │ ────:9100/api──► │ FastAPI   │ ◄────────────► │  SQLite   │
│  Server   │                  │ Dev Server │                │ 文件      │
│  :9100    │                  │ :9000     │                │ panshi.db │
└──────────┘                  └──────────┘                └──────────┘
```

- 前端 Vite 开发服务器代理 `/api` 请求到后端
- 后端使用 SQLite 文件数据库，无需额外安装

### 10.2 Docker 生产环境

```
┌──────────┐                ┌──────────┐     PostgreSQL    ┌──────────┐
│  Nginx    │  proxy_pass   │  FastAPI │ ◄──────────────► │PostgreSQL│
│  :3000    │ ──→ :8000     │  Gunicorn │                │  :5432   │
│  (SPA)    │               │  :8000   │                └──────────┘
└──────────┘               └──────────┘
```

- 前端通过 Nginx 提供静态文件服务（端口 3000）
- Nginx 反向代理 `/api` 请求到后端 Gunicorn（端口 8000）

### 10.3 Edge 节点管理网络

```
┌──────────────┐     Ansible SSH     ┌───────────────┐
│  磐石 Admin   │ ◄──────────────► │  Edge 节点集群   │
│  控制平面      │                   │               │
│              │     Edge API      │  ┌───────────┐ │
│              │ ◄──────────────► │  │ Nginx     │ │
│              │   HTTPS + SM4    │  │ 管理 API  │ │
└──────────────┘                   │  :9180     │ │
                                   │  └───────────┘ │
                                   └───────────────┘
```

---

## 11. 技术选型

### 11.1 后端技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Python | 3.11+ | 运行语言 |
| FastAPI | 0.115+ | Web 框架 |
| SQLAlchemy | 2.0+ | ORM（异步模式） |
| Pydantic | 2.0+ | 数据验证 |
| python-jose | — | JWT 令牌 |
| bcrypt | — | 密码哈希 |
| httpx | — | HTTP 客户端（Edge 通信） |
| ansible-runner | — | Ansible 执行 |
| aiosqlite | — | SQLite 异步驱动 |
| asyncpg | — | PostgreSQL 驱动 |
| clickhouse-driver | — | ClickHouse 查询 |

### 11.2 前端技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Vue | 3.5+ | UI 框架（Composition API） |
| TypeScript | 6.0+ | 类型安全 |
| Ant Design Vue | 4.2+ | UI 组件库 |
| Pinia | 3.0+ | 状态管理 |
| Vue Router | 5.0+ | 路由 |
| Vite | 8.0+ | 构建工具 |
| Axios | 1.15+ | HTTP 客户端 |
| ECharts | 6.1+ | 图表（监控仪表盘） |
| Monaco Editor | 0.55+ | 代码编辑器（YAML/JSON） |
| json-editor-vue | 0.18+ | JSON 编辑器 |
| js-yaml | 5.1+ | YAML 解析 |
| Vitest | 4.1+ | 单元测试 |
| Playwright | 1.59+ | E2E 测试 |

### 11.3 开发工具

| 工具 | 用途 |
|---|---|
| uv | Python 包管理 |
| npm | Node 包管理 |
| pytest + pytest-asyncio | 后端测试 |
| vue-tsc | TypeScript 编译检查 |

---

*本文档与 OpenSpec 规格说明书共同构成磐石 Admin 的完整技术文档体系。*
*规格说明书覆盖每个功能的详细场景和验收标准，本文档覆盖整体架构和交互关系。*
