# 磐石Admin 数据库结构设计

## ER图

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    sys_user      │     │  sys_user_cluster│     │   ps_cluster    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │◄────│ user_id (FK)    │     │ id (PK)         │
│ username        │     │ cluster_id (FK) │◄────│ cluster_id (FK) │
│ password_hash   │     └─────────────────┘     │ name            │
│ role            │                           │ display_name    │
│ status          │                           │ admin_url       │
│ created_at      │                           │ admin_key       │
└─────────────────┘                           │ description     │
                                               │ status          │
                                               │ creator_id      │
                                               │ created_at      │
                                               └─────────────────┘
                                                      │
                                                      │
                    ┌─────────────────────────────────┼─────────────────────────────────┐
                    │                                 │                                 │
                    ▼                                 ▼                                 ▼
           ┌─────────────────┐              ┌─────────────────┐              ┌─────────────────┐
           │   ps_upstream   │              │    ps_route     │              │     ps_node     │
           ├─────────────────┤              ├─────────────────┤              ├─────────────────┤
           │ id (PK)         │              │ id (PK)         │              │ id (PK)         │
           │ cluster_id (FK) │              │ cluster_id (FK) │              │ cluster_id (FK) │
           │ name            │              │ upstream_id(FK) │◄─────────────│ ip              │
           │ load_balance    │              │ name            │              │ service_port    │
           │ description     │              │ uri             │              │ management_port │
           │ created_at      │              │ methods         │              │ status          │
           └─────────────────┘              │ priority        │              │ created_at      │
                    │                        │ status          │              └─────────────────┘
                    │                        │ description     │
                    │                        │ created_at      │
                    │                        └─────────────────┘
                    │                              │
                    │                              │
                    ▼                              ▼
           ┌─────────────────┐              ┌─────────────────┐
           │ ps_upstream_    │              │  ps_route_plugin│
           │ target          │              ├─────────────────┤
           ├─────────────────┤              │ id (PK)         │
           │ id (PK)         │              │ route_id (FK)   │
           │ upstream_id (FK) │              │ plugin_name     │
           │ target          │              │ config          │
           │ weight          │              │ created_at      │
           │ created_at      │              └─────────────────┘
           └─────────────────┘
```

## 表结构详情

### 1. sys_user (用户表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 用户ID |
| username | VARCHAR(50) | UNIQUE, NOT NULL, INDEX | 用户名 |
| password_hash | VARCHAR(255) | NOT NULL | 密码哈希 |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'user' | 角色: admin/user |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=正常, 0=禁用 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 2. sys_user_cluster (用户集群关联表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 主键ID |
| user_id | INTEGER | FOREIGN KEY → sys_user.id, ON DELETE CASCADE | 用户ID |
| cluster_id | INTEGER | FOREIGN KEY → ps_cluster.id, ON DELETE CASCADE | 集群ID |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

### 3. ps_cluster (集群表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 集群ID |
| name | VARCHAR(100) | NOT NULL | 集群名称(系统标识) |
| display_name | VARCHAR(200) | NULL | 显示名称(用户友好) |
| admin_url | VARCHAR(500) | NULL | APISIX管理地址 |
| admin_key | VARCHAR(255) | NULL | APISIX管理密钥 |
| description | TEXT | NULL | 描述 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=正常, 0=禁用 |
| creator_id | INTEGER | NULL | 创建者用户ID |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 4. ps_upstream (上游服务表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 上游ID |
| cluster_id | INTEGER | FOREIGN KEY → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| name | VARCHAR(100) | NOT NULL | 上游名称 |
| load_balance | VARCHAR(20) | NOT NULL, DEFAULT 'roundrobin' | 负载均衡算法 |
| description | TEXT | NULL | 描述 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**负载均衡算法**: roundrobin, weighted_roundrobin, ip_hash, least_conn

### 5. ps_upstream_target (上游目标节点表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 目标ID |
| upstream_id | INTEGER | FOREIGN KEY → ps_upstream.id, ON DELETE CASCADE | 所属上游 |
| target | VARCHAR(255) | NOT NULL | 目标地址 (如 192.168.1.10:8080) |
| weight | INTEGER | NOT NULL, DEFAULT 100, CHECK(1-1000) | 权重 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

### 6. ps_route (路由表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 路由ID |
| cluster_id | INTEGER | FOREIGN KEY → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| upstream_id | INTEGER | FOREIGN KEY → ps_upstream.id, ON DELETE SET NULL, NULL | 关联上游 |
| name | VARCHAR(100) | NOT NULL | 路由名称 |
| uri | VARCHAR(500) | NOT NULL | URI路径 |
| methods | VARCHAR(100) | NULL | 支持的HTTP方法 |
| priority | INTEGER | NOT NULL, DEFAULT 0 | 优先级 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=发布, 0=未发布 |
| description | TEXT | NULL | 描述 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 7. ps_route_plugin (路由插件表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 插件ID |
| route_id | INTEGER | FOREIGN KEY → ps_route.id, ON DELETE CASCADE | 所属路由 |
| plugin_name | VARCHAR(50) | NOT NULL | 插件名称 |
| config | TEXT | NULL | 插件配置(JSON) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 8. ps_node (集群节点表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 节点ID |
| cluster_id | INTEGER | FOREIGN KEY → ps_cluster.id, ON DELETE CASCADE | 所属集群 |
| ip | VARCHAR(50) | NOT NULL | 节点IP地址 |
| service_port | INTEGER | NOT NULL, DEFAULT 80 | 服务端口 |
| management_port | INTEGER | NOT NULL, DEFAULT 9180 | 管理端口 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=正常, 0=离线 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 9. sys_dict_type (字典类型表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 类型ID |
| code | VARCHAR(50) | UNIQUE, NOT NULL, INDEX | 类型编码 |
| name | VARCHAR(100) | NOT NULL | 类型名称 |
| description | VARCHAR(255) | NULL | 描述 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=正常, 0=禁用 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 10. sys_dict_data (字典数据表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 数据ID |
| type_id | INTEGER | NOT NULL | 所属类型ID |
| label | VARCHAR(100) | NOT NULL | 标签 |
| value | VARCHAR(100) | NOT NULL | 值 |
| sort | INTEGER | NOT NULL, DEFAULT 0 | 排序 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态: 1=正常, 0=禁用 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 11. sys_audit_log (审计日志表)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTO INCREMENT | 日志ID |
| user_id | INTEGER | NULL | 操作用户ID |
| username | VARCHAR(50) | NULL | 操作用户名 |
| action | VARCHAR(50) | NOT NULL | 操作类型 |
| resource | VARCHAR(100) | NULL | 资源类型 |
| resource_id | INTEGER | NULL | 资源ID |
| detail | TEXT | NULL | 详情 |
| ip_address | VARCHAR(50) | NULL | IP地址 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 操作时间 |

## 表前缀说明

| 前缀 | 含义 |
|------|------|
| sys_ | 系统表 (用户、权限、审计) |
| ps_ | 业务表 (集群、网关配置) |

## 索引设计

| 表名 | 索引字段 | 类型 |
|------|----------|------|
| sys_user | username | UNIQUE INDEX |
| sys_dict_type | code | UNIQUE INDEX |
| ps_cluster | name | INDEX |
| ps_upstream | cluster_id | INDEX |
| ps_route | cluster_id, upstream_id | INDEX |
| ps_upstream_target | upstream_id | INDEX |
| ps_route_plugin | route_id | INDEX |
| ps_node | cluster_id | INDEX |

## 软删除与级联

- **级联删除**: 集群删除时级联删除其上游、路由、节点
- **置空删除**: 路由删除时关联的上游置空 (SET NULL)
- **审计日志**: 记录用户操作历史，不删除

## 外键关系汇总

```
sys_user ─────┬───── sys_user_cluster ─────┬───── ps_cluster
              │                            │
              │                            ├───── ps_upstream ───── ps_upstream_target
              │                            │
              │                            ├───── ps_route ───── ps_route_plugin
              │                            │
              │                            └───── ps_node
              │
              └────────────────────────────── (creator_id → sys_user.id)
```
