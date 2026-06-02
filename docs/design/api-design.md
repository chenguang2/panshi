# 磐石 Admin API 设计文档

> 版本：1.0.0  
> 基础路径：`/api/v1`  
> 认证方式：JWT Bearer Token（`Authorization: Bearer <token>`）  
> 默认端口：9000（开发）/ 8000（Docker）

---

## 目录

1. [认证 Auth](#1-认证-auth)
2. [用户管理 Users](#2-用户管理-users)
3. [集群管理 Clusters](#3-集群管理-clusters)
4. [上游管理 Upstreams](#4-上游管理-upstreams)
5. [路由管理 Routes](#5-路由管理-routes)
6. [插件组 Plugin Configs](#6-插件组-plugin-configs)
7. [全局规则 Global Rules](#7-全局规则-global-rules)
8. [节点管理 Nodes](#8-节点管理-nodes)
9. [插件元数据 Plugin Metadata](#9-插件元数据-plugin-metadata)
10. [静态资源 Static Resources](#10-静态资源-static-resources)
11. [内置插件 Plugins](#11-内置插件-plugins)
12. [插件开关 Plugin Switches](#12-插件开关-plugin-switches)
13. [仪表盘 Dashboard](#13-仪表盘-dashboard)
14. [Edge 客户端直连 Edge Client](#14-edge-客户端直连-edge-client)
15. [Edge 数据导入 Edge Import](#15-edge-数据导入-edge-import)
16. [健康检查 Health](#16-健康检查-health)

---

## 1. 认证 Auth

**前缀：** `/api/v1/auth`

### POST /login
用户登录

**请求体：**
```json
{
  "username": "admin",
  "password": "panshi123"
}
```

**响应 (200)：**
```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "status": 1
  },
  "permissions": []
}
```

**错误：**
- 401：用户名或密码错误 / 用户已禁用

> 管理员（role=admin）返回空权限列表；非管理员返回其资源权限列表。

### POST /logout
登出（服务器端无状态，仅占位）

**响应 (200)：**
```json
{ "message": "Logout successful" }
```

### GET /me/permissions
获取当前用户的权限列表

**请求头：** `Authorization: Bearer <token>`

**响应 (200)：**
```json
{
  "permissions": ["route", "upstream"]
}
```

> 管理员始终返回空列表 `[]`。

---

## 2. 用户管理 Users

**前缀：** `/api/v1/admin/users`  
**权限：** 除 `/me` 外均需管理员角色

### GET /me
获取当前用户信息

**响应 (200)：**
```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "status": 1,
  "created_at": "2024-01-01T00:00:00Z"
}
```

### GET
用户列表

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 否 | 用户名模糊搜索 |
| role | string | 否 | 角色过滤（admin/user） |
| page | int | 否 | 页码，默认 1 |
| page_size | int | 否 | 每页数量，默认 20 |

**响应 (200)：**
```json
{
  "total": 10,
  "items": [
    {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "status": 1,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST
创建用户

**请求体：**
```json
{
  "username": "newuser",
  "password": "abc123",
  "role": "user",
  "status": 1
}
```

**校验规则：** 密码必须 6~50 字符，至少包含一个字母和一个数字。

**响应 (201)：** 用户对象

**错误：**
- 409：用户名已存在

### GET /{user_id}
获取指定用户

**响应 (200)：** 用户对象
**错误：** 404 用户不存在

### PUT /{user_id}
更新用户（仅 role 和 status）

**请求体：**
```json
{
  "role": "admin",
  "status": 1
}
```

**响应 (200)：** 更新后的用户对象

### DELETE /{user_id}
删除用户

**响应 (200)：** `{ "message": "用户已删除" }`
**错误：** 403 不能删除管理员用户

### PUT /{user_id}/password
重置用户密码

**请求体：**
```json
{
  "new_password": "newpass123"
}
```

**响应 (200)：** `{ "message": "密码重置成功" }`

### GET /{user_id}/clusters
获取用户可访问的集群列表

**响应 (200)：**
```json
{
  "cluster_ids": [1, 2, 3]
}
```

### PUT /{user_id}/clusters
分配用户集群权限

**请求体：**
```json
{
  "cluster_ids": [1, 2]
}
```

**响应 (200)：** `{ "message": "Clusters assigned" }`

### GET /{user_id}/permissions
获取用户资源权限

**响应 (200)：**
```json
{
  "user_id": 1,
  "permissions": ["route", "upstream"]
}
```

### PUT /{user_id}/permissions
更新用户资源权限

**请求体：**
```json
{
  "permissions": ["route", "upstream", "plugin"]
}
```

**响应 (200)：**
```json
{
  "message": "Permissions updated",
  "permissions": ["route", "upstream", "plugin"]
}
```

---

## 3. 集群管理 Clusters

**前缀：** `/api/v1/clusters`

### GET
获取所有集群列表（无需认证）

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 否 | 名称或显示名搜索 |
| page | int | 否 | 页码，默认 1 |
| page_size | int | 否 | 每页数量，默认 20 |

**响应 (200)：**
```json
{
  "total": 5,
  "items": [
    {
      "id": 1,
      "name": "prod-cluster",
      "display_name": "生产集群",
      "description": "生产环境 Edge 网关集群",
      "admin_key": "****",
      "status": 1,
      "group_name": "production",
      "created_at": "2024-01-01T00:00:00Z",
      "node_count": 3,
      "healthy_node_count": 3,
      "upstream_count": 10,
      "route_count": 20,
      "plugin_config_count": 5,
      "global_rule_count": 2,
      "static_resource_count": 1
    }
  ]
}
```

### POST
创建集群（需认证）

**请求体：**
```json
{
  "name": "prod-cluster",
  "display_name": "生产集群",
  "description": "生产环境",
  "group_name": "production",
  "status": 1,
  "admin_key": "edge-admin-key"
}
```

> `name` 只能包含小写字母、数字和中划线，不能以中划线开头或结尾。

**响应 (201)：** 集群对象

**错误：**
- 400：集群名称已存在 / 名称格式无效

### GET /{cluster_id}
获取集群详情

**响应 (200)：** 集群对象 (包含各资源数量统计)

### PUT /{cluster_id}
更新集群

**响应 (200)：** 更新后的集群对象

### DELETE /{cluster_id}
删除集群（级联删除关联资源）

**请求体：**
```json
{
  "delete_db": true,
  "delete_edge": false,
  "node_ids": [1, 2]
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| delete_db | bool | 是 | 是否删除数据库记录 |
| delete_edge | bool | 是 | 是否删除 Edge 节点数据 |
| node_ids | int[] | 否 | 指定要操作的节点 |

**响应 (200)：** 删除结果详情

### POST /{cluster_id}/test
测试集群连接

**响应 (200)：** `{ "status": "ok", "message": "连接测试成功" }`

### POST /{cluster_id}/sync
同步集群

**响应 (200)：** `{ "status": "ok", "message": "同步成功" }`

### GET /my
获取当前用户创建的集群列表

**查询参数：** page, page_size

**响应 (200)：** 同 GET `/clusters`

### GET /{cluster_id}/stats
获取集群统计信息

**响应 (200)：**
```json
{
  "nodes": 3,
  "upstreams": 10,
  "routes": 20,
  "plugin_configs": 5,
  "global_rules": 2,
  "plugin_metadata": 8,
  "config_versions": 45
}
```

---

## 4. 上游管理 Upstreams

**前缀：** `/api/v1/clusters/{cluster_id}/upstreams`

### GET
上游列表

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 默认 1 |
| page_size | int | 否 | 默认 20 |
| sort_by | string | 否 | name/load_balance/description/created_at |
| sort_order | string | 否 | asc/desc |
| search | string | 否 | 搜索关键词 |
| search_field | string | 否 | name/description |

**响应 (200)：**
```json
{
  "total": 10,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 1,
      "edge_uuid": "uuid-xxx",
      "cluster_id": 1,
      "name": "backend-api",
      "load_balance": "weighted_roundrobin",
      "description": "后端 API 服务",
      "hash_on": null,
      "key": null,
      "targets": [
        { "target": "10.0.0.1:8080", "weight": 100 },
        { "target": "10.0.0.2:8080", "weight": 80 }
      ],
      "checks": null,
      "retries": null,
      "retry_timeout": null,
      "timeout": null,
      "pass_host": "pass",
      "upstream_host": null,
      "scheme": "http",
      "keepalive_pool": null,
      "current_version": 3,
      "published_at": "2024-01-01T00:00:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST
创建上游

**请求体：**
```json
{
  "name": "backend-api",
  "load_balance": "weighted_roundrobin",
  "description": "后端 API 服务",
  "targets": [
    { "target": "10.0.0.1:8080", "weight": 100 }
  ],
  "checks": { "active": { "timeout": 5, "http_path": "/health" } },
  "timeout": { "connect": 5, "send": 10, "read": 10 },
  "retries": 3,
  "retry_timeout": 10,
  "pass_host": "pass",
  "scheme": "http",
  "hash_on": null,
  "key": null,
  "keepalive_pool": { "size": 32, "idle_timeout": 60, "requests": 100 }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 名称，1-100 字符 |
| load_balance | string | 否 | 负载均衡算法：weighted_roundrobin / chash / ewma / least_conn |
| hash_on | string | 否 | 哈希位置：vars / header / cookie / vars_combinations |
| pass_host | string | 否 | host 策略：pass / node / rewrite |
| scheme | string | 否 | 协议：http / https / tcp / udp |

**响应 (201)：** 上游对象（含 targets）

### GET /{upstream_id}
获取上游详情

**响应 (200)：** 上游对象（含 targets）

### PUT /{upstream_id}
更新上游

**响应 (200)：** 更新后的上游对象

### DELETE /{upstream_id}
删除上游

**请求体：**
```json
{
  "delete_db": true,
  "delete_edge": false,
  "node_ids": null
}
```

**响应 (200)：** 删除结果

### POST /{upstream_id}/publish
发布上游到 Edge 节点

**请求体（可选）：**
```json
{
  "node_ids": [1, 2]
}
```

**响应 (200)：**
```json
{
  "status": "ok",
  "message": "上游 backend-api 发布成功，已同步到 3 个节点",
  "version": 4,
  "results": [
    { "node": "10.0.0.1:9180", "status": "success", "response": {...} }
  ]
}
```

### GET /{upstream_id}/history
获取发布历史

**响应 (200)：**
```json
{
  "total": 3,
  "items": [
    {
      "id": 1,
      "cluster_id": 1,
      "resource_type": "upstream",
      "resource_id": 1,
      "version": 3,
      "config": "{...}",
      "created_at": "2024-01-01T00:00:00Z",
      "created_by": "system"
    }
  ],
  "current_version": 3
}
```

### POST /{upstream_id}/rollback/{version}
回滚到指定版本

**响应 (200)：** `{ "status": "ok", "message": "上游已切换到版本 v2", "version": 2 }`

### DELETE /{upstream_id}/history/{history_id}
删除指定历史版本

**响应 (200)：** `{ "status": "ok", "message": "历史版本已删除" }`

---

## 5. 路由管理 Routes

**前缀：** `/api/v1/clusters/{cluster_id}/routes`

### GET
路由列表

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 默认 1，最小 1 |
| page_size | int | 否 | 默认 20，最大 100 |
| sort_by | string | 否 | name/uri/priority/status/created_at |
| sort_order | string | 否 | asc/desc |
| search | string | 否 | 关键词 |
| search_field | string | 否 | name/uri/description/hosts |

**响应 (200)：**
```json
{
  "total": 20,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 1,
      "edge_uuid": "uuid-xxx",
      "cluster_id": 1,
      "name": "api-route",
      "uri": "/api/*",
      "methods": "GET,POST",
      "priority": 0,
      "status": 1,
      "description": "API 路由",
      "upstream_id": 1,
      "hosts": "api.example.com",
      "remote_addrs": null,
      "vars": [["arg_name", "==", "value"]],
      "advanced_match_enabled": false,
      "plugin_config_ids": ["uuid-xxx"],
      "current_version": 2,
      "published_at": "2024-01-01T00:00:00Z",
      "created_at": "2024-01-01T00:00:00Z",
      "plugins": [{ "plugin_name": "limit-req" }]
    }
  ]
}
```

### POST
创建路由

**请求体：**
```json
{
  "name": "api-route",
  "uri": "/api/*",
  "methods": "GET,POST",
  "priority": 0,
  "status": 1,
  "description": "API 路由",
  "upstream_id": 1,
  "hosts": "api.example.com",
  "remote_addrs": null,
  "vars": [["arg_name", "==", "value"]],
  "advanced_match_enabled": false,
  "plugin_config_ids": ["uuid-xxx"]
}
```

**响应 (201)：** 路由对象

### GET /{route_id}
获取路由详情

**响应 (200)：** 路由对象

### PUT /{route_id}
更新路由

**响应 (200)：** 更新后的路由对象

### DELETE /{route_id}
删除路由

**请求体：**
```json
{
  "delete_db": true,
  "delete_edge": false,
  "node_ids": null
}
```

**响应 (200)：** 删除结果

### POST /{route_id}/publish
发布路由到 Edge 节点

**响应 (200)：**
```json
{
  "status": "ok",
  "message": "路由 api-route 发布成功，已同步到 3 个节点",
  "version": 3,
  "results": [...]
}
```

### POST /publish
发布集群下所有路由

**响应 (200)：** `{ "status": "ok", "message": "20 条路由发布成功" }`

### GET /{route_id}/plugins
获取路由级插件

**响应 (200)：**
```json
{
  "plugins": [
    { "plugin_name": "limit-req", "config": "{...}" }
  ]
}
```

### PUT /{route_id}/plugins
更新路由级插件

**请求体：**
```json
{
  "plugins": [
    { "plugin_name": "limit-req", "config": "{\"rate\": 100}" }
  ]
}
```

**响应 (200)：** `{ "message": "插件配置已更新" }`

### GET /{route_id}/history
获取发布历史

**响应 (200)：** 同上游历史格式

### POST /{route_id}/rollback/{version}
回滚路由

**响应 (200)：** 回滚结果（含 Edge 节点同步状态）

### DELETE /{route_id}/history/{history_id}
删除历史版本

**响应 (200)：** `{ "status": "ok", "message": "历史版本已删除" }`

---

## 6. 插件组 Plugin Configs

**前缀：** `/api/v1/clusters/{cluster_id}/plugin_configs`

### GET
插件组列表

**响应 (200)：**
```json
{
  "total": 5,
  "items": [
    {
      "id": 1,
      "edge_uuid": "uuid-xxx",
      "cluster_id": 1,
      "name": "rate-limit-config",
      "description": "限流配置",
      "plugins": { "limit-req": { "rate": 100, "burst": 200 } },
      "current_version": 2,
      "published_at": "2024-01-01T00:00:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST
创建插件组

**请求体：**
```json
{
  "name": "rate-limit-config",
  "description": "限流配置",
  "plugins": { "limit-req": { "rate": 100, "burst": 200 } }
}
```

**响应 (201)：** 插件组对象

### GET /{config_id}
获取插件组

### PUT /{config_id}
更新插件组

### DELETE /{config_id}
删除插件组

### POST /{config_id}/publish
发布插件组

### GET /{config_id}/history
发布历史

### POST /{config_id}/rollback/{version}
回滚

### DELETE /{config_id}/history/{history_id}
删除历史版本

---

## 7. 全局规则 Global Rules

**前缀：** `/api/v1/clusters/{cluster_id}/global_rules`

CRUD + 发布/回滚/历史操作模式与插件组完全一致。

**请求体示例（创建）：**
```json
{
  "name": "global-cors",
  "description": "全局 CORS 规则",
  "plugins": { "cors": { "allow_origins": "*" } }
}
```

**响应格式：**
```json
{
  "id": 1,
  "edge_uuid": "uuid-xxx",
  "cluster_id": 1,
  "name": "global-cors",
  "description": "全局 CORS 规则",
  "plugins": { "cors": { "allow_origins": "*" } },
  "current_version": 1,
  "published_at": null,
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

## 8. 节点管理 Nodes

**前缀：** `/api/v1/clusters/{cluster_id}/nodes`

### GET
节点列表

**查询参数：** page, page_size, sort_by(name/ip/status/created_at), sort_order, search, search_field(name/ip)

**响应 (200)：**
```json
{
  "total": 3,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 1,
      "cluster_id": 1,
      "ip": "10.0.0.1",
      "service_port": 80,
      "management_port": 9180,
      "edge_path": "/usr/local/edge",
      "status": 1,
      "status_detail": {
        "last_execution": "2024-01-01T00:00:00",
        "last_status": "success",
        "nginx": { "running": true }
      },
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST
创建节点

**请求体：**
```json
{
  "ip": "10.0.0.1",
  "service_port": 80,
  "management_port": 9180,
  "edge_path": "/usr/local/edge",
  "status": 1
}
```

> `edge_path` 必须以 `/` 开头。

**响应 (201)：** 节点对象

### PUT /{node_id}
更新节点

### DELETE /{node_id}
删除节点

### POST /{node_id}/start
启动 Edge 节点（通过 Ansible 执行 nginx_start）

**响应 (200)：**
```json
{
  "status": "ok",
  "message": "节点已启动",
  "rc": 0,
  "stdout": "...",
  "stderr": "",
  "command": "nginx_start"
}
```

### POST /{node_id}/stop
停止节点（nginx_stop）

### POST /{node_id}/restart
重启节点（nginx_reload）

### POST /{node_id}/check
检查节点配置（nginx_check）

### POST /{node_id}/statistic
获取节点统计信息

**查询参数：** ports（可选，默认管理端口）

**响应 (200)：**
```json
{
  "status": "ok",
  "rc": 0,
  "statistic": { "routes": 20, "upstreams": 10 },
  "stdout": "...",
  "stderr": ""
}
```

### GET /{node_id}/status
获取节点运行状态

**响应 (200)：**
```json
{
  "status": "ok",
  "node_status": 1,
  "status_detail": { "nginx": { "running": true } },
  "last_heartbeat": "2024-01-01T00:00:00"
}
```

### POST /{node_id}/ansible-run
在节点上执行自定义 Ansible 操作

**请求体：**
```json
{
  "tag": "edge_statistic",
  "extravars": { "ports": "9180" }
}
```

**响应 (200)：**
```json
{
  "status": "ok",
  "tag": "edge_statistic",
  "rc": 0,
  "stdout": "..."
}
```

### POST /{cluster_id}/nodes/action
批量节点操作

**请求体：**
```json
{
  "action": "restart",
  "node_ids": [1, 2]
}
```

| action | 说明 |
|--------|------|
| start | nginx_start |
| stop | nginx_stop |
| restart | nginx_reload |
| check | nginx_check |
| statistic | edge_statistic |

**响应 (200)：**
```json
{
  "action": "restart",
  "results": [
    { "node_id": 1, "ip": "10.0.0.1", "status": "success", "rc": 0 },
    { "node_id": 2, "ip": "10.0.0.2", "status": "error", "detail": "连接超时" }
  ]
}
```

### GET /{node_id}/diff
对比数据库配置与 Edge 节点运行配置

**响应 (200)：**
```json
{
  "node": "10.0.0.1:9180",
  "summary": { "total": 15, "match": 12, "mismatch": 2, "only_in_db": 1, "only_in_edge": 0 },
  "groups": [
    {
      "type": "upstreams",
      "label": "上游服务",
      "items": [
        {
          "name": "backend-api",
          "id": "uuid-xxx",
          "status": "mismatch",
          "fields": [
            { "name": "targets", "db": "...", "edge": "...", "status": "diff" }
          ]
        }
      ]
    }
  ]
}
```

---

## 9. 插件元数据 Plugin Metadata

**前缀：** `/api/v1/clusters/{cluster_id}/plugin-metadata`

### GET
获取所有插件元数据

**响应 (200)：**
```json
{
  "total": 5,
  "items": [
    {
      "id": 1,
      "cluster_id": 1,
      "plugin_name": "custom-auth",
      "metadata": { "endpoint": "http://auth-service:8080" },
      "current_version": 2,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST
创建插件元数据

**请求参数：** `plugin_name` (query string)  
**请求体：** `{ "endpoint": "http://auth-service:8080" }` (JSON object)

**响应 (200)：** 创建的元数据对象

### GET /{plugin_name}
获取指定插件元数据

### PUT /{plugin_name}
更新插件元数据

**请求体：** JSON object

### DELETE /{plugin_name}
删除插件元数据

### POST /{plugin_name}/publish
发布插件元数据到 Edge 节点

### GET /{plugin_name}/versions
获取版本历史

### POST /{plugin_name}/rollback/{version}
回滚

### DELETE /{plugin_name}/versions/{version_id}
删除历史版本

---

## 10. 静态资源 Static Resources

**前缀：** `/api/v1/clusters/{cluster_id}/static-resources`

### GET
静态资源列表

**查询参数：** page, page_size, sort_by(name/created_at), sort_order, search, search_field

**响应 (200)：**
```json
{
  "total": 3,
  "items": [
    {
      "id": 1,
      "cluster_id": 1,
      "route_id": 1,
      "edge_uuid": "uuid-xxx",
      "name": "static-assets",
      "url_path": "/static/*",
      "description": "前端静态资源",
      "file_size": 1048576,
      "storage_path": "data/static/uuid-xxx/1.zip",
      "current_version": 3,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST
创建静态资源记录

**请求体：**
```json
{
  "route_id": 1,
  "description": "前端静态资源"
}
```

> 目标路由必须：URI 以 `/*` 结尾、已有 `static_resource` 插件、且已发布到 Edge。

**响应 (201)：** 静态资源对象
**错误：** 409 该路由已关联静态资源

### GET /{resource_id}
获取静态资源详情

### PUT /{resource_id}
更新描述

### DELETE /{resource_id}
删除静态资源

**注意：** 删除时同时清理本地 ZIP 文件和 ConfigVersion 记录。

### POST /{resource_id}/upload
上传 ZIP 文件

**请求体：** `multipart/form-data`，字段 `file`（.zip 文件）

**响应 (200)：** 更新后的资源对象（含新的版本号）

### POST /{resource_id}/publish
发布静态资源到 Edge 节点

> 读取本地 ZIP 文件，通过 `raw_put` 推送到 Edge 节点。

**响应 (200)：**
```json
{
  "success": true,
  "current_version": 4,
  "results": [
    { "node": "10.0.0.1:9180", "status": "success" }
  ]
}
```

### GET /{resource_id}/history
版本历史

### DELETE /{resource_id}/history/{version_id}
删除历史版本

### POST /{resource_id}/rollback/{version}
回滚到指定版本

---

## 11. 内置插件 Plugins

**前缀：** `/api/v1/plugins`

### GET /builtin
获取内置插件列表

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| all | bool | 否 | 为 true 时返回全部插件；否则只返回已启用的 |

**响应 (200)：**
```json
{
  "plugins": [
    {
      "name": "limit-req",
      "display_name": "限流",
      "description": "请求速率限制",
      "category": "security",
      "schema": { ... }
    }
  ]
}
```

---

## 12. 插件开关 Plugin Switches

**前缀：** `/api/v1/plugin-switches`

### GET
获取所有插件开关状态

**响应 (200)：**
```json
{
  "items": [
    { "id": 1, "plugin_name": "limit-req", "enabled": true },
    { "id": 2, "plugin_name": "cors", "enabled": false }
  ]
}
```

### PUT
批量更新插件开关

**请求体：**
```json
[
  { "plugin_name": "limit-req", "enabled": true },
  { "plugin_name": "cors", "enabled": false }
]
```

**响应 (200)：** `{ "message": "插件开关已更新" }`

---

## 13. 仪表盘 Dashboard

**前缀：** `/api/v1/dashboard`

### GET /stats
获取全局统计概览

**响应 (200)：**
```json
{
  "clusters": 5,
  "upstreams": 30,
  "routes": 50,
  "users": 10,
  "plugin_configs": 15,
  "global_rules": 5,
  "static_resources": 3
}
```

### GET /recent-routes
获取最近创建的路由

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | int | 否 | 返回条数，默认 10 |

**响应 (200)：**
```json
{
  "items": [
    {
      "id": 1,
      "name": "api-route",
      "uri": "/api/*",
      "status": 1,
      "cluster_name": "生产集群"
    }
  ]
}
```

---

## 14. Edge 客户端直连 Edge Client

**前缀：** `/api/v1/edge-client`  
**用途：** 直接与 Edge 节点通信（绕过数据库），用于调试和手动操作。

### GET /nodes
获取所有活跃节点

### GET /nodes/{ip}/{port}/upstreams
获取节点上的上游列表

### GET /nodes/{ip}/{port}/upstreams/{upstream_id}
获取上游详情

### POST /nodes/{ip}/{port}/upstreams
创建上游

### PUT /nodes/{ip}/{port}/upstreams/{upstream_id}
更新上游

### PATCH /nodes/{ip}/{port}/upstreams/{upstream_id}
部分更新上游

### DELETE /nodes/{ip}/{port}/upstreams/{upstream_id}
删除上游

### GET /nodes/{ip}/{port}/routes
获取路由列表

### GET /nodes/{ip}/{port}/routes/{route_id}
获取路由

### POST /nodes/{ip}/{port}/routes
创建路由

### PUT /nodes/{ip}/{port}/routes/{route_id}
更新路由

### PATCH /nodes/{ip}/{port}/routes/{route_id}
部分更新路由

### DELETE /nodes/{ip}/{port}/routes/{route_id}
删除路由

### GET /nodes/{ip}/{port}/plugins
获取节点插件列表

### GET /nodes/{ip}/{port}/global_rules
获取全局规则列表

### GET /nodes/{ip}/{port}/global_rules/{rule_id}
获取全局规则

### PUT /nodes/{ip}/{port}/global_rules/{rule_id}
创建/更新全局规则

### PATCH /nodes/{ip}/{port}/global_rules/{rule_id}
部分更新全局规则

### DELETE /nodes/{ip}/{port}/global_rules/{rule_id}
删除全局规则

### GET /nodes/{ip}/{port}/plugin_configs
获取插件组列表

### GET /nodes/{ip}/{port}/plugin_configs/{config_id}
获取插件组

### PUT /nodes/{ip}/{port}/plugin_configs/{config_id}
创建/更新插件组

### PATCH /nodes/{ip}/{port}/plugin_configs/{config_id}
部分更新插件组

### DELETE /nodes/{ip}/{port}/plugin_configs/{config_id}
删除插件组

### GET /nodes/{ip}/{port}/plugin_metadata
获取插件元数据列表

### GET /nodes/{ip}/{port}/plugin_metadata/{plugin_name}
获取插件元数据

### PUT /nodes/{ip}/{port}/plugin_metadata/{plugin_name}
创建/更新插件元数据

### PATCH /nodes/{ip}/{port}/plugin_metadata/{plugin_name}
部分更新插件元数据

### DELETE /nodes/{ip}/{port}/plugin_metadata/{plugin_name}
删除插件元数据

### GET /nodes/{ip}/{port}/plugins/list
获取节点可用插件列表

### PUT /nodes/{ip}/{port}/plugins/reload
重载节点插件

---

## 15. Edge 数据导入 Edge Import

**前缀：** `/api/v1/edge-import`

### POST /test-connection
测试与 Edge 节点的连接

**请求体：**
```json
{
  "cluster_id": 1,
  "node_id": 1
}
```

**响应 (200)：**
```json
{
  "success": true,
  "version": "3.0",
  "plugin_count": 10,
  "route_count": 20,
  "upstream_count": 5,
  "message": "Connection successful"
}
```

### GET /preview
预览导入数据

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cluster_id | int | 是 | 集群 ID |
| node_id | int | 是 | 节点 ID |

**响应 (200)：**
```json
{
  "upstreams": [...],
  "routes": [...],
  "plugin_configs": [...],
  "global_rules": [...],
  "plugin_metadata": [...],
  "conflicts": [
    {
      "type": "name_conflict",
      "resource_type": "upstream",
      "resource_name": "backend-api",
      "reason": "数据库中已存在同名上游",
      "resolution": "跳过或覆盖"
    }
  ],
  "plugin_summary": {
    "known_count": 8,
    "unknown_count": 2,
    "unknown_plugin_names": ["custom-plugin-1"]
  }
}
```

### POST /execute
执行导入

**请求体：**
```json
{
  "cluster_id": 1,
  "node_id": 1,
  "selections": {
    "upstreams": true,
    "routes": true,
    "plugin_configs": true,
    "global_rules": true
  }
}
```

**响应 (200)：**
```json
{
  "success": true,
  "import_log_id": 1,
  "imported_counts": {
    "upstreams": 5,
    "routes": 10,
    "plugin_configs": 3,
    "global_rules": 2,
    "plugin_metadata": 0,
    "skipped": 0
  },
  "skipped_counts": { ... },
  "plugin_summary": { ... },
  "message": "导入完成"
}
```

---

## 16. 健康检查 Health

**路径：** `/health`

### GET
健康检查

**响应 (200)：**
```json
{
  "status": "ok"
}
```

---

## 通用错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证（缺少或无效 Token） |
| 403 | 无权限（非管理员操作管理员接口） |
| 404 | 资源不存在 |
| 409 | 资源冲突（如用户名/集群名重复） |
| 500 | 服务器内部错误 |
| 502 | Edge 节点连接失败（Bad Gateway） |
| 504 | 节点操作超时（Gateway Timeout） |

## 通用请求结构

### 认证方式

所有需要认证的接口通过 `Authorization` 请求头发送 JWT Token：

```
Authorization: Bearer <access_token>
```

### 分页参数

列表接口统一支持：
- `page`：页码（默认 1）
- `page_size`：每页数量（默认 20）

### 搜索结果

列表接口统一支持：
- `search`：关键词
- `search_field`：指定搜索字段（留空则搜索所有可用字段）

### 排序参数

列表接口统一支持：
- `sort_by`：排序字段
- `sort_order`：`asc`（默认）或 `desc`

### 删除请求体

涉及数据库 + Edge 双删除的接口统一使用 `DeleteClusterRequest`：
```json
{
  "delete_db": true,
  "delete_edge": false,
  "node_ids": null
}
```

### 发布请求体

```json
{
  "node_ids": [1, 2]
}
```

> `node_ids` 为空时发布到集群下所有活跃节点。

## 公共 Schema 速查

### ConfigVersion (版本记录)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 主键 |
| cluster_id | int | 所属集群 |
| resource_type | string | 资源类型：upstream / route / plugin_config / global_rule / plugin_metadata / static_resource |
| resource_id | int | 资源 ID |
| version | int | 版本号 |
| config | string (JSON) | 配置快照 |
| created_at | string | 创建时间 |
| created_by | string | 操作人 |

### PublishRequest
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| node_ids | int[] | 否 | 指定节点列表，为空则发布到所有活跃节点 |

### DeleteClusterRequest
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| delete_db | bool | 是 | 是否删除数据库记录 |
| delete_edge | bool | 是 | 是否删除 Edge 节点数据 |
| node_ids | int[] | 否 | 指定节点（仅 delete_edge 时生效） |
