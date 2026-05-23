# 磐石Admin 数据库结构设计

## ER图

```
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│   sys_user      │     │ sys_user_cluster  │     │   ps_cluster    │
├─────────────────┤     ├───────────────────┤     ├─────────────────┤
│ id (PK)         │◄────│ user_id (FK)      │     │ id (PK)         │
│ username        │     │ cluster_id (FK)   │◄────│ cluster_id      │
│ password_hash   │     └───────────────────┘     │ name            │
│ role            │                               │ display_name    │
│ status          │                               │ admin_url       │
│ created_at      │                               │ admin_key       │
└─────────────────┘                               │ description     │
                                                  │ status          │
                                                  │ creator_id      │
                                                  │ created_at      │
                                                  │ updated_at      │
                                                  └────────┬────────┘
                                                           │
         ┌─────────────────────────────────────────────────┼─────────────────────────────┐
         │              ┌──────────────────┐               │              ┌─────────────┐│
         │              │  ps_plugin_      │               │              │  ps_static_ ││
         │              │  metadata        │               │              │  resource   ││
         │              ├──────────────────┤               │              ├─────────────┤│
         │              │ cluster_id (FK)──┼───────────────┼──────────────│ route_id(FK)││
         │              │ plugin_name      │               │              │ …           ││
         │              └──────────────────┘               │              └─────────────┘│
         ▼                                                 ▼                              ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐
│  ps_upstream     │  │ ps_upstream_     │  │   ps_route       │  │ ps_route_plugin  │  │  ps_node     │
├──────────────────┤  │ target           │  ├──────────────────┤  ├──────────────────┤  ├──────────────┤
│ id (PK)          │  ├──────────────────┤  │ id (PK)          │  │ id (PK)          │  │ id (PK)      │
│ edge_uuid(UUID)  │  │ id (PK)          │  │ edge_uuid(UUID)  │  │ route_id (FK)    │  │ cluster_id   │
│ cluster_id (FK)──┼──│ upstream_id (FK) │  │ cluster_id (FK)──┼──┤ plugin_name      │  │ ip           │
│ name             │  │ target (ip:port) │  │ upstream_id(FK)  │  │ config (JSON)    │  │ service_port │
│ load_balance     │  │ weight           │  │ name             │  │ created_at       │  │ mgmt_port    │
│ hash_on          │  │ created_at       │  │ uri              │  └──────────────────┘  │ edge_path    │
│ key              │  └──────────────────┘  │ methods          │                       │ status       │
│ checks (JSON)    │                        │ hosts            │                       │ created_at   │
│ retries          │                        │ priority         │                       │ updated_at   │
│ retry_timeout    │                        │ status           │                       └──────────────┘
│ timeout (JSON)   │                        │ vars (JSON)      │
│ pass_host        │                        │ advanced_match   │
│ upstream_host    │                        │ plugin_config_ids│
│ scheme           │                        │ current_version  │
│ keepalive_pool   │                        │ created_at       │
│ current_version  │                        │ updated_at       │
│ created_at       │                        └──────────────────┘
│ updated_at       │
└──────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ ps_plugin_config │  │ ps_global_rule   │  │ ps_config_version│  │ ps_import_log    │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│ id (PK)          │  │ id (PK)          │  │ id (PK)          │  │ id (PK)          │
│ edge_uuid(UUID)  │  │ edge_uuid(UUID)  │  │ cluster_id (FK)  │  │ cluster_id (FK)  │
│ cluster_id (FK)  │  │ cluster_id (FK)  │  │ resource_type    │  │ node_ip          │
│ name             │  │ name             │  │ resource_id      │  │ node_port        │
│ description      │  │ description      │  │ version          │  │ edge_path        │
│ plugins (JSON)   │  │ plugins (JSON)   │  │ config (JSON)    │  │ status           │
│ current_version  │  │ current_version  │  │ created_at       │  │ upstream_count   │
│ created_at       │  │ created_at       │  │ created_by       │  │ route_count      │
│ updated_at       │  │ updated_at       │  └──────────────────┘  │ plugin_config_c  │
└──────────────────┘  └──────────────────┘                        │ global_rule_cnt  │
                                                                   │ unknown_plugins   │
┌──────────────────┐  ┌──────────────┐                             │ conflict_details  │
│ sys_audit_log    │  │ sys_user_    │                             │ error_message     │
├──────────────────┤  │ permission   │                             │ created_at        │
│ id (PK)          │  ├──────────────┤                             └──────────────────┘
│ user_id          │  │ user_id (FK) │
│ username         │  │ resource_type│
│ action           │  │ enabled      │
│ resource         │  │ created_at   │
│ resource_id      │  └──────────────┘
│ detail           │
│ ip_address       │
│ created_at       │
└──────────────────┘
```

## 表结构详情

### 表前缀说明

| 前缀 | 含义 |
|------|------|
| sys_ | 系统表（用户、权限、审计） |
| ps_ | 业务表（集群、网关配置） |

---

### 1. sys_user（用户表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 用户ID |
| username | VARCHAR(50) | UNIQUE, NOT NULL, INDEX | 用户名 |
| password_hash | VARCHAR(255) | NOT NULL | 密码哈希（bcrypt） |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'user' | 角色: admin/user |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=正常, 0=禁用 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 2. sys_user_cluster（用户集群关联表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 主键ID |
| user_id | INTEGER | FK → sys_user.id, CASCADE | 用户ID |
| cluster_id | INTEGER | FK → ps_cluster.id, CASCADE | 集群ID |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

### 3. sys_user_permission（用户权限表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 主键ID |
| user_id | INTEGER | FK → sys_user.id, CASCADE | 用户ID |
| resource_type | VARCHAR(50) | NOT NULL | 资源类型（如 plugin_groups） |
| enabled | INTEGER | DEFAULT 1 | 是否启用 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

### 4. sys_audit_log（审计日志表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 日志ID |
| user_id | INTEGER | NULL | 操作用户ID |
| username | VARCHAR(50) | NULL | 操作用户名 |
| action | VARCHAR(50) | NOT NULL | 操作类型（create/update/delete） |
| resource | VARCHAR(100) | NULL | 资源类型 |
| resource_id | INTEGER | NULL | 资源ID |
| detail | TEXT | NULL | 详情 |
| ip_address | VARCHAR(50) | NULL | IP地址 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 操作时间 |

### 5. ps_cluster（集群表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 集群ID |
| name | VARCHAR(100) | NOT NULL | 集群名称（系统标识，小写+中划线） |
| display_name | VARCHAR(200) | NULL | 显示名称（用户友好） |
| admin_url | VARCHAR(500) | NULL | Edge 管理地址 |
| admin_key | VARCHAR(255) | NULL | 管理密钥 |
| description | TEXT | NULL | 描述 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=正常, 0=禁用 |
| creator_id | INTEGER | NULL | 创建者用户ID |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 6. ps_upstream（上游服务表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 上游ID |
| edge_uuid | VARCHAR(36) | NOT NULL, DEFAULT UUID4 | Edge 节点标识 |
| cluster_id | INTEGER | FK → ps_cluster.id, CASCADE | 所属集群 |
| name | VARCHAR(100) | NOT NULL | 上游名称 |
| load_balance | VARCHAR(20) | NOT NULL, DEFAULT 'weighted_roundrobin' | 负载均衡算法 |
| description | TEXT | NULL | 描述 |
| hash_on | VARCHAR(20) | NULL | 哈希位置（chash模式） |
| key | VARCHAR(100) | NULL | 哈希 Key |
| checks | TEXT | NULL | 健康检查配置（JSON） |
| retries | INTEGER | NULL | 重试次数 |
| retry_timeout | INTEGER | NULL | 重试超时（秒） |
| timeout | TEXT | NULL | 超时配置（JSON: connect/send/read） |
| pass_host | VARCHAR(20) | NULL, DEFAULT 'pass' | Host传递策略 |
| upstream_host | VARCHAR(255) | NULL | 自定义 Host |
| scheme | VARCHAR(20) | NULL, DEFAULT 'http' | 通信协议 |
| keepalive_pool | TEXT | NULL | 连接池配置（JSON） |
| current_version | INTEGER | NULL | 当前发布版本 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**唯一约束**：(cluster_id, edge_uuid)

**负载均衡算法**: weighted_roundrobin, chash, ewma, least_conn

### 7. ps_upstream_target（上游目标节点表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 目标ID |
| upstream_id | INTEGER | FK → ps_upstream.id, CASCADE | 所属上游 |
| target | VARCHAR(255) | NOT NULL | 目标地址（如 192.168.1.10:8080） |
| weight | INTEGER | NOT NULL, DEFAULT 100 | 权重 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

### 8. ps_route（路由表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 路由ID |
| edge_uuid | VARCHAR(36) | NOT NULL, DEFAULT UUID4 | Edge 节点标识 |
| cluster_id | INTEGER | FK → ps_cluster.id, CASCADE | 所属集群 |
| upstream_id | INTEGER | FK → ps_upstream.id, SET NULL | 关联上游 |
| name | VARCHAR(100) | NOT NULL | 路由名称 |
| uri | VARCHAR(500) | NOT NULL | URI路径 |
| methods | VARCHAR(100) | NULL | HTTP方法（逗号分隔） |
| priority | INTEGER | NOT NULL, DEFAULT 0 | 优先级（值越大越优先） |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=启用, 0=禁用 |
| description | TEXT | NULL | 描述 |
| hosts | VARCHAR(500) | NULL | 域名（逗号分隔） |
| remote_addrs | VARCHAR(500) | NULL | 客户端IP |
| vars | TEXT | NULL | 高级匹配条件（JSON数组） |
| advanced_match_enabled | INTEGER | NOT NULL, DEFAULT 0 | 高级匹配是否启用 |
| plugin_config_ids | TEXT | NULL | 关联插件组ID列表（JSON数组） |
| current_version | INTEGER | NULL | 当前发布版本 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**唯一约束**：(cluster_id, edge_uuid)

### 9. ps_route_plugin（路由插件表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 插件ID |
| route_id | INTEGER | FK → ps_route.id, CASCADE | 所属路由 |
| plugin_name | VARCHAR(50) | NOT NULL | 插件名称 |
| config | TEXT | NULL | 插件配置（JSON） |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 10. ps_node（集群节点表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 节点ID |
| cluster_id | INTEGER | FK → ps_cluster.id, CASCADE | 所属集群 |
| ip | VARCHAR(50) | NOT NULL | 节点IP地址 |
| service_port | INTEGER | NOT NULL, DEFAULT 80 | 服务端口 |
| management_port | INTEGER | NOT NULL, DEFAULT 9180 | 管理端口 |
| edge_path | VARCHAR(255) | NOT NULL | Edge 路径前缀 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=在线, 0=离线 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 11. ps_plugin_config（插件组表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 配置ID |
| edge_uuid | VARCHAR(36) | NOT NULL, DEFAULT UUID4 | Edge 节点标识 |
| cluster_id | INTEGER | FK → ps_cluster.id, CASCADE | 所属集群 |
| name | VARCHAR(100) | NOT NULL | 名称 |
| description | TEXT | NULL | 描述 |
| plugins | TEXT | NULL | 插件配置（JSON） |
| current_version | INTEGER | NULL | 当前发布版本 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**唯一约束**：(cluster_id, edge_uuid)

### 12. ps_global_rule（全局规则表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 规则ID |
| edge_uuid | VARCHAR(36) | NOT NULL, DEFAULT UUID4 | Edge 节点标识 |
| cluster_id | INTEGER | FK → ps_cluster.id, CASCADE | 所属集群 |
| name | VARCHAR(100) | NOT NULL | 名称 |
| description | TEXT | NULL | 描述 |
| plugins | TEXT | NULL | 插件配置（JSON） |
| current_version | INTEGER | NULL | 当前发布版本 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**唯一约束**：(cluster_id, edge_uuid)

### 13. ps_plugin_metadata（插件元数据表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 元数据ID |
| cluster_id | INTEGER | FK → ps_cluster.id, CASCADE | 所属集群 |
| plugin_name | VARCHAR(50) | NOT NULL | 插件名称 |
| config_data | TEXT | NOT NULL, DEFAULT '{}' | 配置数据（JSON） |
| current_version | INTEGER | NULL | 当前发布版本 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**唯一约束**：(cluster_id, plugin_name)

### 14. ps_config_version（配置版本历史表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 版本ID |
| cluster_id | INTEGER | FK → ps_cluster.id, CASCADE | 所属集群 |
| resource_type | VARCHAR(20) | NOT NULL | 资源类型（upstream/route/plugin_config等） |
| resource_id | INTEGER | NOT NULL | 资源ID |
| version | INTEGER | NOT NULL | 版本号 |
| config | TEXT | NOT NULL | 配置快照（JSON） |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| created_by | VARCHAR(50) | DEFAULT 'system' | 创建者 |

### 15. ps_static_resource（静态资源表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 资源ID |
| cluster_id | INTEGER | FK → ps_cluster.id, CASCADE | 所属集群 |
| route_id | INTEGER | FK → ps_route.id, SET NULL | 关联路由 |
| edge_uuid | VARCHAR(36) | NULL | Edge 标识 |
| name | VARCHAR(100) | NOT NULL | 名称 |
| url_path | VARCHAR(200) | NULL | URL路径 |
| description | TEXT | NULL | 描述 |
| file_size | BIGINT | NULL | 文件大小（字节） |
| storage_path | VARCHAR(500) | NULL | 存储路径 |
| current_version | INTEGER | NULL | 当前版本 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**唯一约束**：(cluster_id, route_id)

### 16. ps_import_log（Edge 导入日志表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 日志ID |
| cluster_id | INTEGER | FK → ps_cluster.id, CASCADE | 所属集群 |
| node_ip | VARCHAR(50) | NOT NULL | Edge 节点IP |
| node_port | INTEGER | NOT NULL | Edge 节点管理端口 |
| edge_path | VARCHAR(255) | NOT NULL | Edge 路径 |
| status | VARCHAR(20) | NOT NULL | 状态: success/partial/failed |
| upstream_count | INTEGER | DEFAULT 0 | 导入上游数 |
| route_count | INTEGER | DEFAULT 0 | 导入路由数 |
| plugin_config_count | INTEGER | DEFAULT 0 | 导入插件组数 |
| global_rule_count | INTEGER | DEFAULT 0 | 导入全局规则数 |
| unknown_plugins | TEXT | NULL | 未知插件列表（JSON） |
| conflict_details | TEXT | NULL | 冲突详情（JSON） |
| error_message | TEXT | NULL | 错误信息 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

## 外键关系汇总

```
sys_user ─────────┬───── sys_user_cluster ─────────── ps_cluster
                  │                 │
                  │                 ├──── Upstream ──── UpstreamTarget
                  │                 ├──── Route ─────── RoutePlugin
                  │                 ├──── Node
                  │                 ├──── PluginConfig
                  │                 ├──── GlobalRule
                  │                 ├──── PluginMetadata
                  │                 ├──── StaticResource ── Route
                  │                 └──── ConfigVersion
                  │
                  ├──── sys_user_permission
                  │
                  └──── sys_audit_log
```

## 索引设计

| 表名 | 索引字段 | 类型 |
|------|----------|------|
| sys_user | username | UNIQUE INDEX |
| sys_user_cluster | (user_id, cluster_id) | INDEX |
| sys_user_permission | user_id | INDEX |
| ps_cluster | name | INDEX |
| ps_upstream | (cluster_id, edge_uuid) | UNIQUE INDEX |
| ps_upstream | cluster_id | INDEX |
| ps_route | (cluster_id, edge_uuid) | UNIQUE INDEX |
| ps_route | cluster_id, upstream_id | INDEX |
| ps_upstream_target | upstream_id | INDEX |
| ps_route_plugin | route_id | INDEX |
| ps_node | cluster_id | INDEX |
| ps_plugin_config | (cluster_id, edge_uuid) | UNIQUE INDEX |
| ps_global_rule | (cluster_id, edge_uuid) | UNIQUE INDEX |
| ps_plugin_metadata | (cluster_id, plugin_name) | UNIQUE INDEX |
| ps_static_resource | (cluster_id, route_id) | UNIQUE INDEX |
| ps_config_version | (cluster_id, resource_type, resource_id) | INDEX |
| ps_import_log | cluster_id | INDEX |

## 级联与软删除

- **级联删除**: 集群删除时级联删除其下的所有关联数据（上游、目标节点、路由、插件等）
- **置空删除**: 路由删除时关联的上游置空（SET NULL）
- **无软删除**: 所有删除为物理删除
- **配置版本**: 发布时创建 ConfigVersion 快照，回滚时恢复配置，删除资源时级联删除版本历史
- **审计日志**: 记录用户操作历史，物理删除资源时审计日志保留
