# 磐石 Admin 数据库结构设计

> 最后更新：2026-06-02
> 基于 `backend/app/models/` 中 SQLAlchemy ORM 模型

---

## 表前缀说明

| 前缀 | 含义 |
|------|------|
| `sys_` | 系统表（用户、权限、审计） |
| `ps_` | 业务表（集群、网关配置） |

---

## 完整表清单

| # | 表名 | 类名 | 说明 | 文件 |
|---|------|------|------|------|
| 1 | sys_user | User | 用户表 | models/user.py |
| 2 | sys_user_cluster | UserCluster | 用户-集群关联 | models/user.py |
| 3 | sys_user_permission | UserPermission | 用户资源权限 | models/user.py |
| 4 | sys_audit_log | AuditLog | 审计日志 | models/system.py |
| 5 | ps_cluster | Cluster | 网关集群 | models/cluster.py |
| 6 | ps_plugin_enabled | PluginEnabled | 插件启用开关 | models/cluster.py |
| 7 | ps_upstream | Upstream | 上游服务 | models/cluster.py |
| 8 | ps_upstream_target | UpstreamTarget | 上游目标节点 | models/cluster.py |
| 9 | ps_route | Route | 路由规则 | models/cluster.py |
| 10 | ps_route_plugin | RoutePlugin | 路由级插件 | models/cluster.py |
| 11 | ps_node | Node | Edge 节点 | models/cluster.py |
| 12 | ps_plugin_config | PluginConfig | 插件组 | models/cluster.py |
| 13 | ps_global_rule | GlobalRule | 全局规则 | models/cluster.py |
| 14 | ps_plugin_metadata | PluginMetadata | 插件元数据 | models/cluster.py |
| 15 | ps_config_version | ConfigVersion | 配置版本历史 | models/cluster.py |
| 16 | ps_static_resource | StaticResource | 静态资源 | models/static_resource.py |
| 17 | ps_import_log | ImportLog | Edge 导入日志 | models/edge_import.py |

---

## ER 图

```
┌─────────────────┐     ┌───────────────────┐     ┌──────────────────────┐
│   sys_user      │     │ sys_user_cluster  │     │     ps_cluster       │
├─────────────────┤     ├───────────────────┤     ├──────────────────────┤
│ id (PK)         │◄────│ user_id (FK)      │     │ id (PK)              │
│ username     (U)│     │ cluster_id (FK)   │◄────│ name                 │
│ password_hash   │     └───────────────────┘     │ display_name         │
│ role            │                               │ admin_url            │
│ status          │                               │ admin_key            │
│ created_at      │                               │ description          │
│ updated_at      │                               │ group_name           │
└─────────────────┘                               │ status               │
                                                  │ creator_id           │
┌──────────────────┐                              │ created_at           │
│ sys_user_        │                              │ updated_at           │
│ permission       │                              └──────┬───────────────┘
├──────────────────┤                                     │
│ user_id (FK)◄────┼─────────────────────────────────────┤
│ resource_type    │                                     │
│ enabled          │         ┌──────────────────────┐     │
│ created_at       │         │  ps_plugin_enabled   │     │
└──────────────────┘         ├──────────────────────┤     │
                             │ id (PK)              │     │
┌──────────────────┐         │ plugin_name (U)      │     │
│ sys_audit_log    │         │ enabled              │     │
├──────────────────┤         │ created_at           │     │
│ id (PK)          │         │ updated_at           │     │
│ user_id          │         └──────────────────────┘     │
│ username         │                                      │
│ action           │          ┌──────────────────────┐     │
│ resource         │          │  ps_plugin_metadata  │     │
│ resource_id      │          ├──────────────────────┤     │
│ detail           │          │ cluster_id (FK)◄─────┼─────┘
│ ip_address       │          │ plugin_name          │
│ created_at       │          │ config_data          │
└──────────────────┘          │ current_version      │
                              │ created_at           │
                              │ updated_at           │
                              └──────────────────────┘


                     ┌──────────────────┐    ┌──────────────────┐
                     │   ps_upstream    │    │ ps_upstream_     │
                     ├──────────────────┤    │ target           │
                     │ id (PK)          │    ├──────────────────┤
                     │ edge_uuid        │    │ id (PK)          │
                     │ cluster_id (FK)◄─┼────│ upstream_id (FK) │
                     │ name             │    │ target (ip:port) │
                     │ load_balance     │    │ weight           │
                     │ description      │    │ created_at       │
                     │ hash_on          │    └──────────────────┘
                     │ key              │
                     │ checks (JSON)    │    ┌──────────────────┐
                     │ retries          │    │ ps_route_plugin  │
                     │ retry_timeout    │    ├──────────────────┤
                     │ timeout (JSON)   │    │ id (PK)          │
                     │ pass_host        │    │ route_id (FK)    │
                     │ upstream_host    │    │ plugin_name      │
                     │ scheme           │    │ config (JSON)    │
                     │ keepalive_pool   │    │ created_at       │
                     │ current_version  │    │ updated_at       │
                     │ created_at       │    └──────────────────┘
                     │ updated_at       │
                     └──────────────────┘    ┌──────────────────┐
                                             │  ps_route        │
                     ┌──────────────────┐    ├──────────────────┤
                     │  ps_plugin_config│    │ id (PK)          │
                     ├──────────────────┤    │ edge_uuid        │
                     │ id (PK)          │    │ cluster_id (FK)◄─┼─────┐
                     │ edge_uuid        │    │ upstream_id (FK) │     │
                     │ cluster_id (FK)◄─┼────┤ name             │     │
                     │ name             │    │ uri              │     │
                     │ description      │    │ methods          │     │
                     │ plugins (JSON)   │    │ priority         │     │
                     │ current_version  │    │ status           │     │
                     │ created_at       │    │ description      │     │
                     │ updated_at       │    │ current_version  │     │
                     └──────────────────┘    │ hosts            │     │
                                             │ remote_addrs     │     │
                     ┌──────────────────┐    │ vars (JSON)      │     │
                     │ ps_global_rule   │    │ advanced_match   │     │
                     ├──────────────────┤    │ plugin_config_ids│     │
                     │ id (PK)          │    │ created_at       │     │
                     │ edge_uuid        │    │ updated_at       │     │
                     │ cluster_id (FK)◄─┼────└──────────────────┘     │
                     │ name             │                             │
                     │ description      │    ┌──────────────────┐     │
                     │ plugins (JSON)   │    │ ps_static_       │     │
                     │ current_version  │    │ resource         │     │
                     │ created_at       │    ├──────────────────┤     │
                     │ updated_at       │    │ id (PK)          │     │
                     └──────────────────┘    │ cluster_id (FK)◄─┼─────┘
                                             │ route_id (FK)    │
                     ┌──────────────────┐    │ edge_uuid        │
                     │   ps_node        │    │ name             │
                     ├──────────────────┤    │ url_path         │
                     │ id (PK)          │    │ description      │
                     │ cluster_id (FK)◄─┼────┤ file_size        │
                     │ ip               │    │ storage_path     │
                     │ service_port     │    │ current_version  │
                     │ management_port  │    │ created_at       │
                     │ edge_path        │    │ updated_at       │
                     │ status           │    └──────────────────┘
                     │ status_detail    │
                     │ created_at       │    ┌──────────────────────┐
                     │ updated_at       │    │  ps_config_version   │
                     └──────────────────┘    ├──────────────────────┤
                                             │ id (PK)              │
                     ┌──────────────────┐    │ cluster_id (FK)      │
                     │  ps_import_log   │    │ resource_type        │
                     ├──────────────────┤    │ resource_id          │
                     │ id (PK)          │    │ version              │
                     │ cluster_id (FK)  │    │ config (JSON)        │
                     │ node_ip          │    │ created_at           │
                     │ node_port        │    │ created_by           │
                     │ edge_path        │    └──────────────────────┘
                     │ status           │
                     │ upstream_count   │
                     │ route_count      │
                     │ plugin_config_c  │
                     │ global_rule_cnt  │
                     │ known_plugin_cnt │
                     │ unknown_plugin_c │
                     │ unknown_plugin_n │
                     │ conflict_detail  │
                     │ error_message    │
                     │ created_at       │
                     └──────────────────┘
```

---

## 表结构详情

---

### 1. sys_user（用户表）

**对应类**: `User` → `models/user.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 用户 ID |
| username | VARCHAR(50) | **UNIQUE**, NOT NULL, INDEX | 用户名 |
| password_hash | VARCHAR(255) | NOT NULL | 密码哈希（bcrypt） |
| role | VARCHAR(20) | NOT NULL, DEFAULT `'user'` | 角色: `admin` / `user` |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=正常, 0=禁用 |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

---

### 2. sys_user_cluster（用户-集群关联表）

**对应类**: `UserCluster` → `models/user.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 主键 ID |
| user_id | INTEGER | FK → sys_user.id, ON DELETE CASCADE | 用户 ID |
| cluster_id | INTEGER | FK → ps_cluster.id, ON DELETE CASCADE | 集群 ID |
| created_at | DATETIME | DEFAULT now() | 创建时间 |

---

### 3. sys_user_permission（用户权限表）

**对应类**: `UserPermission` → `models/user.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 主键 ID |
| user_id | INTEGER | FK → sys_user.id, ON DELETE CASCADE | 用户 ID |
| resource_type | VARCHAR(50) | NOT NULL | 资源类型（如 `route`、`upstream`） |
| enabled | INTEGER | NOT NULL, DEFAULT 1 | 是否启用: 1=启用, 0=禁用 |
| created_at | DATETIME | DEFAULT now() | 创建时间 |

---

### 4. sys_audit_log（审计日志表）

**对应类**: `AuditLog` → `models/system.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 日志 ID |
| user_id | INTEGER | NULLABLE | 操作用户 ID |
| username | VARCHAR(50) | NULLABLE | 操作用户名 |
| action | VARCHAR(50) | NOT NULL | 操作类型（`create_route`, `update_route` 等） |
| resource | VARCHAR(100) | NULLABLE | 资源类型 |
| resource_id | INTEGER | NULLABLE | 资源 ID |
| detail | TEXT | NULLABLE | 操作详情 |
| ip_address | VARCHAR(50) | NULLABLE | 客户端 IP 地址 |
| created_at | DATETIME | DEFAULT now() | 操作时间 |

---

### 5. ps_cluster（集群表）

**对应类**: `Cluster` → `models/cluster.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 集群 ID |
| name | VARCHAR(100) | NOT NULL | 集群名称（系统标识，小写字母+中划线） |
| display_name | VARCHAR(200) | NULLABLE | 显示名称（用户友好） |
| admin_url | VARCHAR(500) | NULLABLE | Edge 管理地址 |
| admin_key | VARCHAR(255) | NULLABLE | Edge 管理密钥 |
| description | TEXT | NULLABLE | 描述 |
| **group_name** | VARCHAR(100) | NULLABLE | 分组名称 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=正常, 0=禁用 |
| creator_id | INTEGER | NULLABLE | 创建者用户 ID |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

> **注意**: 文档中补充了 `group_name` 字段，代码中存在，旧版文档遗漏。

---

### 6. ps_plugin_enabled（插件启用开关表）

**对应类**: `PluginEnabled` → `models/cluster.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 主键 ID |
| plugin_name | VARCHAR(100) | **UNIQUE**, NOT NULL, INDEX | 插件名称 |
| enabled | INTEGER | NOT NULL, DEFAULT 1 | 是否启用: 1=启用, 0=禁用 |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

> **注意**: 整表在旧版文档中缺失，本次新增。

---

### 7. ps_upstream（上游服务表）

**对应类**: `Upstream` → `models/cluster.py`

**唯一约束**: `(cluster_id, edge_uuid)` — `uq_upstream_cluster_edge`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 上游 ID |
| edge_uuid | VARCHAR(36) | NOT NULL, DEFAULT uuid4() | Edge 节点标识 UUID |
| cluster_id | INTEGER | FK → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| name | VARCHAR(100) | NOT NULL | 上游名称 |
| load_balance | VARCHAR(20) | NOT NULL, DEFAULT `'weighted_roundrobin'` | 负载均衡算法 |
| description | TEXT | NULLABLE | 描述 |
| hash_on | VARCHAR(20) | NULLABLE | 哈希位置（chash 模式） |
| key | VARCHAR(100) | NULLABLE | 哈希 Key |
| checks | TEXT | NULLABLE | 健康检查配置（JSON 字符串） |
| retries | INTEGER | NULLABLE | 重试次数 |
| retry_timeout | INTEGER | NULLABLE | 重试超时（秒） |
| timeout | TEXT | NULLABLE | 超时配置（JSON: `{connect, send, read}`） |
| pass_host | VARCHAR(20) | NULLABLE, DEFAULT `'pass'` | Host 传递策略 |
| upstream_host | VARCHAR(255) | NULLABLE | 自定义 Host |
| scheme | VARCHAR(20) | NULLABLE, DEFAULT `'http'` | 通信协议 |
| keepalive_pool | TEXT | NULLABLE | 连接池配置（JSON: `{size, idle_timeout, requests}`） |
| current_version | INTEGER | NULLABLE | 当前发布版本号 |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

**负载均衡算法**: `weighted_roundrobin`, `chash`, `ewma`, `least_conn`

---

### 8. ps_upstream_target（上游目标节点表）

**对应类**: `UpstreamTarget` → `models/cluster.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 目标 ID |
| upstream_id | INTEGER | FK → ps_upstream.id, ON DELETE CASCADE | 所属上游 |
| target | VARCHAR(255) | NOT NULL | 目标地址（如 `192.168.1.10:8080`） |
| weight | INTEGER | NOT NULL, DEFAULT 100 | 权重（1-1000） |
| created_at | DATETIME | DEFAULT now() | 创建时间 |

---

### 9. ps_route（路由表）

**对应类**: `Route` → `models/cluster.py`

**唯一约束**: `(cluster_id, edge_uuid)` — `uq_route_cluster_edge`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 路由 ID |
| edge_uuid | VARCHAR(36) | NOT NULL, DEFAULT uuid4() | Edge 节点标识 UUID |
| cluster_id | INTEGER | FK → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| upstream_id | INTEGER | FK → ps_upstream.id, ON DELETE SET NULL | 关联上游 |
| name | VARCHAR(100) | NOT NULL | 路由名称 |
| uri | VARCHAR(500) | NOT NULL | URI 路径（如 `/api/*`） |
| methods | VARCHAR(100) | NULLABLE | HTTP 方法（逗号分隔，如 `GET,POST`） |
| priority | INTEGER | NOT NULL, DEFAULT 0 | 优先级（值越大越优先） |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=启用, 0=禁用 |
| description | TEXT | NULLABLE | 描述 |
| current_version | INTEGER | NULLABLE | 当前发布版本号 |
| hosts | VARCHAR(500) | NULLABLE | 域名（逗号分隔） |
| remote_addrs | VARCHAR(500) | NULLABLE | 客户端 IP（逗号分隔） |
| vars | TEXT | NULLABLE | 高级匹配条件（JSON 数组: `[[var, op, val], ...]`） |
| advanced_match_enabled | INTEGER | NOT NULL, DEFAULT 0 | 高级匹配是否启用: 0=关闭, 1=启用 |
| plugin_config_ids | TEXT | NULLABLE | 关联插件组 edge_uuid 列表（JSON 数组） |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

---

### 10. ps_route_plugin（路由级插件表）

**对应类**: `RoutePlugin` → `models/cluster.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 插件 ID |
| route_id | INTEGER | FK → ps_route.id, ON DELETE CASCADE | 所属路由 |
| plugin_name | VARCHAR(50) | NOT NULL | 插件名称（如 `limit-req`, `cors`） |
| config | TEXT | NULLABLE | 插件配置（JSON 字符串） |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

---

### 11. ps_node（集群节点表）

**对应类**: `Node` → `models/cluster.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 节点 ID |
| cluster_id | INTEGER | FK → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| ip | VARCHAR(50) | NOT NULL | 节点 IP 地址 |
| service_port | INTEGER | NOT NULL, DEFAULT 80 | 服务端口（Edge 对外端口） |
| management_port | INTEGER | NOT NULL, DEFAULT 9180 | 管理端口（Edge Admin API） |
| edge_path | VARCHAR(255) | NOT NULL | Edge 安装路径前缀 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=在线, 0=离线 |
| **status_detail** | TEXT | NULLABLE | 节点状态详情（JSON，Ansible 执行结果缓存） |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

> **注意**: `status_detail` 字段为旧版文档遗漏，用于存储 Ansible 节点操作的最近执行结果。

---

### 12. ps_plugin_config（插件组表）

**对应类**: `PluginConfig` → `models/cluster.py`

**唯一约束**: `(cluster_id, edge_uuid)` — `uq_pc_cluster_edge`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 配置 ID |
| edge_uuid | VARCHAR(36) | NOT NULL, DEFAULT uuid4() | Edge 节点标识 UUID |
| cluster_id | INTEGER | FK → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| name | VARCHAR(100) | NOT NULL | 插件组名称 |
| description | TEXT | NULLABLE | 描述 |
| plugins | TEXT | NULLABLE | 插件配置（JSON: `{plugin_name: {config}}`） |
| current_version | INTEGER | NULLABLE | 当前发布版本号 |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

---

### 13. ps_global_rule（全局规则表）

**对应类**: `GlobalRule` → `models/cluster.py`

**唯一约束**: `(cluster_id, edge_uuid)` — `uq_gr_cluster_edge`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 规则 ID |
| edge_uuid | VARCHAR(36) | NOT NULL, DEFAULT uuid4() | Edge 节点标识 UUID |
| cluster_id | INTEGER | FK → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| name | VARCHAR(100) | NOT NULL | 规则名称 |
| description | TEXT | NULLABLE | 描述 |
| plugins | TEXT | NULLABLE | 插件配置（JSON） |
| current_version | INTEGER | NULLABLE | 当前发布版本号 |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

---

### 14. ps_plugin_metadata（插件元数据表）

**对应类**: `PluginMetadata` → `models/cluster.py`

**唯一约束**: `(cluster_id, plugin_name)` — `uq_cluster_plugin`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 元数据 ID |
| cluster_id | INTEGER | FK → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| plugin_name | VARCHAR(50) | NOT NULL | 插件名称 |
| config_data | TEXT | NOT NULL, DEFAULT `'{}'` | 配置数据（JSON 字符串） |
| current_version | INTEGER | NULLABLE | 当前发布版本号 |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

---

### 15. ps_config_version（配置版本历史表）

**对应类**: `ConfigVersion` → `models/cluster.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 版本 ID |
| cluster_id | INTEGER | FK → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| resource_type | VARCHAR(20) | NOT NULL | 资源类型（`upstream`, `route`, `plugin_config`, `global_rule`, `plugin_metadata`, `static_resource`） |
| resource_id | INTEGER | NOT NULL | 资源 ID |
| version | INTEGER | NOT NULL | 版本号（自增） |
| config | TEXT | NOT NULL | 配置快照（JSON 字符串） |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| created_by | VARCHAR(50) | DEFAULT `'system'` | 创建者 |

---

### 16. ps_static_resource（静态资源表）

**对应类**: `StaticResource` → `models/static_resource.py`

**唯一约束**: `(cluster_id, route_id)` — `uq_static_resource_cluster_route`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 资源 ID |
| cluster_id | INTEGER | FK → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| route_id | INTEGER | FK → ps_route.id, ON DELETE SET NULL | 关联路由 |
| edge_uuid | VARCHAR(36) | NULLABLE | Edge 标识 UUID |
| name | VARCHAR(100) | NOT NULL | 名称（取自关联路由名称） |
| url_path | VARCHAR(200) | NULLABLE | URL 路径 |
| description | TEXT | NULLABLE | 描述 |
| file_size | BIGINT | NULLABLE | ZIP 文件大小（字节） |
| storage_path | VARCHAR(500) | NULLABLE | 本地存储路径 |
| current_version | INTEGER | NULLABLE | 当前版本号 |
| created_at | DATETIME | DEFAULT now() | 创建时间 |
| updated_at | DATETIME | ON UPDATE now() | 更新时间 |

---

### 17. ps_import_log（Edge 导入日志表）

**对应类**: `ImportLog` → `models/edge_import.py`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO INCREMENT | 日志 ID |
| cluster_id | INTEGER | FK → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| node_ip | VARCHAR(50) | NOT NULL | Edge 节点 IP |
| node_port | INTEGER | NOT NULL | Edge 节点管理端口 |
| edge_path | VARCHAR(255) | **NULLABLE** | Edge 路径 |
| status | VARCHAR(20) | NOT NULL, DEFAULT `'success'` | 状态: `success` / `partial` / `failed` |
| upstream_count | INTEGER | DEFAULT 0 | 导入上游数 |
| route_count | INTEGER | DEFAULT 0 | 导入路由数 |
| plugin_config_count | INTEGER | DEFAULT 0 | 导入插件组数 |
| global_rule_count | INTEGER | DEFAULT 0 | 导入全局规则数 |
| **known_plugin_count** | INTEGER | DEFAULT 0 | 已知插件数 |
| **unknown_plugin_count** | INTEGER | DEFAULT 0 | 未知插件数 |
| **unknown_plugin_names** | TEXT | NULLABLE | 未知插件名称列表（JSON 数组） |
| conflict_details | TEXT | NULLABLE | 冲突详情（JSON 数组） |
| error_message | TEXT | NULLABLE | 错误信息 |
| created_at | DATETIME | DEFAULT now() | 创建时间 |

> **注意**: 旧版文档遗漏了 `known_plugin_count`、`unknown_plugin_count` 字段，且 `unknown_plugin_names` 误写为 `unknown_plugins`。`edge_path` 实际为 NULLABLE。

---

## 外键关系汇总

```
sys_user ──┬── sys_user_cluster ──┬── ps_cluster
           │                      │
           │                      ├── ps_plugin_enabled
           │                      ├── ps_upstream ── ps_upstream_target
           │                      ├── ps_route ──── ps_route_plugin
           │                      ├── ps_plugin_config
           │                      ├── ps_global_rule
           │                      ├── ps_plugin_metadata
           │                      ├── ps_node
           │                      ├── ps_static_resource ── ps_route
           │                      └── ps_config_version
           │
           ├── sys_user_permission
           │
           └── sys_audit_log
```

---

## 索引设计

| 表名 | 索引字段 | 类型 |
|------|----------|------|
| sys_user | username | **UNIQUE INDEX** |
| sys_user_cluster | (user_id, cluster_id) | INDEX |
| sys_user_permission | user_id | INDEX |
| ps_plugin_enabled | plugin_name | **UNIQUE INDEX** |
| ps_upstream | (cluster_id, edge_uuid) | **UNIQUE INDEX** (`uq_upstream_cluster_edge`) |
| ps_upstream | cluster_id | INDEX |
| ps_route | (cluster_id, edge_uuid) | **UNIQUE INDEX** (`uq_route_cluster_edge`) |
| ps_route | cluster_id, upstream_id | INDEX |
| ps_upstream_target | upstream_id | INDEX |
| ps_route_plugin | route_id | INDEX |
| ps_node | cluster_id | INDEX |
| ps_plugin_config | (cluster_id, edge_uuid) | **UNIQUE INDEX** (`uq_pc_cluster_edge`) |
| ps_global_rule | (cluster_id, edge_uuid) | **UNIQUE INDEX** (`uq_gr_cluster_edge`) |
| ps_plugin_metadata | (cluster_id, plugin_name) | **UNIQUE INDEX** (`uq_cluster_plugin`) |
| ps_static_resource | (cluster_id, route_id) | **UNIQUE INDEX** (`uq_static_resource_cluster_route`) |
| ps_config_version | (cluster_id, resource_type, resource_id) | INDEX |
| ps_import_log | cluster_id | INDEX |

---

## 级联与删除策略

- **级联删除（CASCADE）**: 集群删除时级联删除其下所有关联数据（上游、目标节点、路由、插件、节点、版本历史等）
- **置空删除（SET NULL）**: 路由删除时关联的 upstream_id 置空；静态资源删除时 route_id 置空
- **物理删除**: 所有删除为物理删除，无软删除机制
- **配置版本**: 每次发布创建 ConfigVersion 快照，回滚时恢复配置，删除资源时级联清理版本历史
- **审计日志**: 物理删除资源时审计日志保留（不级联删除）

---

## 与旧版文档的差异

| 项目 | 旧版 | 实际代码 | 说明 |
|------|------|---------|------|
| ps_cluster.group_name | 缺失 | `VARCHAR(100), NULLABLE` | 新增分组字段 |
| ps_plugin_enabled | 整表缺失 | id, plugin_name(U), enabled, created_at, updated_at | 插件开关功能 |
| ps_node.status_detail | 缺失 | `TEXT, NULLABLE` | 节点状态详情缓存 |
| ps_import_log.known_plugin_count | 缺失 | `INTEGER, DEFAULT 0` | 已知插件计数 |
| ps_import_log.unknown_plugin_count | 缺失 | `INTEGER, DEFAULT 0` | 未知插件计数 |
| ps_import_log.unknown_plugin_names | 误写为 `unknown_plugins` | `TEXT, NULLABLE` | 字段名不同 |
| ps_import_log.edge_path | NOT NULL | **NULLABLE** | 约束不同 |
