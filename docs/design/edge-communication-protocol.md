# 后端 → Edge 节点通信协议

> 本文档描述磐石 Admin 后端（FastAPI）作为客户端访问 Edge 网关节点的通信协议。
> **注意：** 这不是前端访问后端的 API 文档，而是后端管理端访问 Edge 服务器的协议说明。

---

## 目录

1. [协议概述](#1-协议概述)
2. [传输层](#2-传输层)
3. [认证机制](#3-认证机制)
4. [加密机制（SM4）](#4-加密机制sm4)
5. [请求格式](#5-请求格式)
6. [响应格式](#6-响应格式)
7. [资源 API 路径](#7-资源-api-路径)
8. [数据格式与字段映射](#8-数据格式与字段映射)
9. [特殊操作](#9-特殊操作)
10. [Ansible 运维通道](#10-ansible-运维通道)
11. [错误处理](#11-错误处理)
12. [日志](#12-日志)
13. [配置项](#13-配置项)

---

## 1. 协议概述

后端与 Edge 节点之间的通信采用 **HTTP + SM4 加密** 的请求-响应模式。

```
+-------------------+          HTTP + SM4 加密           +-----------------+
|   磐石 Admin 后端   | ────  POST/PUT/PATCH 请求体加密 ──→ |   Edge 网关节点  |
|   (FastAPI)        | ←───  GET/DELETE 响应体解密  ──── |   (PANSHI)      |
|   EdgeClient       |                                   |   :management_port|
+-------------------+                                   +-----------------+
```

核心实现类：`backend/app/services/edge_client.py` — `EdgeClient`

---

## 2. 传输层

| 属性 | 值 |
|------|-----|
| **协议** | HTTP（明文，不支持 HTTPS） |
| **基础 URL** | `http://{node_ip}:{management_port}` |
| **默认管理端口** | `9180` |
| **HTTP 库** | `httpx`（同步请求，通过 `asyncio.to_thread` 异步调用） |
| **超时** | 普通请求 5s，二进制传输 30s，Edge 直连代理 10s |

### 节点地址解析

`EdgeClient` 初始化时需要提供 `node_ip` 和 `node_port`，有两种方式：

1. **直接指定**：`EdgeClient(cluster_id, node_ip="10.0.0.1", node_port=9180)`
2. **自动查询**：`EdgeClient(cluster_id, db=session)` — 从数据库查询集群下状态为 1 的第一个节点

---

## 3. 认证机制

每个 HTTP 请求通过 `X-API-KEY` 请求头传递认证信息：

```
X-API-KEY: f9357106bff442f89d4de7169c37c61e
```

### API Key 优先级

1. **环境变量** `EDGE_ADMIN_KEY`（全局覆盖）
2. **内置默认值**：`f9357106bff442f89d4de7169c37c61e`

> 导入场景中（EdgeImportService），优先使用集群配置中的 `admin_key`，
> 如果集群没有配置 `admin_key`，则回退到环境变量或默认值。

---

## 4. 加密机制（SM4）

### 4.1 算法参数

| 参数 | 值 |
|------|-----|
| **加密算法** | SM4（国密对称加密） |
| **工作模式** | ECB（电码本模式） |
| **填充方式** | PKCS7（块大小 16 字节） |
| **密钥长度** | 16 字节（128 位） |
| **密钥来源** | 环境变量 `EDGE_SM4_KEY` |
| **默认密钥** | `a16bc20453da220f`（16 字节 ASCII） |

### 4.2 加密流程（请求体）

```
原始数据 (dict)
    ↓ json.dumps()
JSON 字符串 (str)
    ↓ .encode()
字节数据 (bytes)
    ↓ PKCS7 pad
填充后字节 (16 字节对齐)
    ↓ SM4 ECB 加密
密文 (bytes)
    ↓ base64.b64encode()
Base64 字符串 (str)  →  作为 HTTP Body 发送
```

代码示例：

```python
def _encrypt(self, data: bytes) -> str:
    padded_data = self._pkcs7_pad(data)
    cipher = Cipher(algorithms.SM4(self.SM4_KEY), modes.ECB())
    encryptor = cipher.encryptor()
    encrypted = encryptor.update(padded_data) + encryptor.finalize()
    return base64.b64encode(encrypted).decode()
```

### 4.3 解密流程（响应体）

```
Base64 字符串 (str)
    ↓ base64.urlsafe_b64decode()
密文 (bytes)
    ↓ SM4 ECB 解密
填充后字节 (16 字节对齐)
    ↓ PKCS7 unpad
原始字节 (bytes)
    ↓ .decode('utf-8')
JSON 字符串
    ↓ json.loads()
响应数据 (dict)
```

代码示例：

```python
def _decrypt(self, data: str) -> bytes:
    padded = data + '=' * ((4 - len(data) % 4) % 4)
    encrypted = base64.urlsafe_b64decode(padded)
    cipher = Cipher(algorithms.SM4(self.SM4_KEY), modes.ECB())
    decryptor = cipher.decryptor()
    decrypted = decryptor.update(encrypted) + decryptor.finalize()
    return self._pkcs7_unpad(decrypted)
```

### 4.4 加解密范围

| 操作 | 请求体加密 | 响应体解密 |
|------|-----------|-----------|
| GET | 不加密（无请求体） | ✅ 解密响应体 |
| POST | ✅ 加密 | ✅ 解密响应体 |
| PUT | ✅ 加密 | ✅ 解密响应体 |
| PATCH | ✅ 加密 | ✅ 解密响应体 |
| DELETE | 不加密（无请求体） | ✅ 解密响应体 |
| 二进制 PUT (`raw_put`) | ❌ 不加密（`application/octet-stream`） | ✅ 解密响应体 |
| 裸 DELETE (`raw_delete`) | 不加密 | ❌ 不解密（解析为 JSON） |

> **降级策略**：如果响应体解密失败（如 Edge 返回明文错误），自动尝试 `json.loads()` 直接解析。

---

## 5. 请求格式

### 5.1 通用请求头

```http
X-API-KEY: <api_key>
Content-Type: application/json   # 加密请求
```

### 5.2 请求体格式（POST/PUT/PATCH）

请求体为 **加密后的 Base64 字符串**，直接作为 HTTP Body 发送。原始数据结构如下：

```json
{
  "name": "backend-api",
  "type": "roundrobin",
  "nodes": {
    "10.0.0.1:8080": 100
  },
  "checks": {...},
  "timeout": {...}
}
```

原始数据 → JSON 序列化 → SM4 加密 → Base64 编码 → HTTP Body

### 5.3 二进制请求（`raw_put`）

```http
X-API-KEY: <api_key>
Content-Type: application/octet-stream
```

Body 为原始二进制数据（ZIP 文件），**不加密**。

---

## 6. 响应格式

### 6.1 成功响应

HTTP 状态码：`200`、`201`、`204`

响应体为 **Base64 编码的 SM4 密文**，解密后为 JSON：

```json
{
  "node": {
    "key": "/edge/admin/upstreams/uuid-xxx",
    "value": { ... }
  }
}
```

`204 No Content` 或空响应体返回空字典 `{}`。

### 6.2 列表响应格式

Edge 统一资源列表采用 PANSHI 风格的 `{key, value}` 格式：

```json
{
  "node": {
    "dir": true,
    "key": "/edge/admin/upstreams",
    "nodes": [
      {
        "key": "/edge/admin/upstreams/uuid-xxx",
        "value": { ... }
      }
    ]
  }
}
```

`EdgeClient._parse_node_list()` 负责解析这种嵌套结构，提取资源列表。

### 6.3 错误响应

HTTP 状态码非 `200/201/204` 时视为错误。先尝试解密响应体解析错误信息，失败则尝试明文解析。

错误响应格式（Edge 返回）：

```json
{
  "error_msg": "Resource not found"
}
```

---

## 7. 资源 API 路径

所有资源 API 挂载在 Edge 节点的管理端口上，基础路径规则：

```
http://{node_ip}:{management_port}/edge/admin/{resource_type}[/{resource_id}][/{sub_path}]
```

### 7.1 资源路径表

| 资源 | 基础路径 | 支持操作 |
|------|---------|---------|
| **Upstream**（上游） | `/edge/admin/upstreams` | GET 列表、GET /{id}、POST、PUT /{id}、PATCH /{id}、DELETE /{id} |
| **Route**（路由） | `/edge/admin/routes` | GET 列表、GET /{id}、POST、PUT /{id}、PATCH /{id}、DELETE /{id} |
| **Plugin Config**（插件组） | `/edge/admin/plugin_configs` | GET 列表、GET /{id}、PUT /{id}、PATCH /{id}、DELETE /{id} |
| **Global Rule**（全局规则） | `/edge/admin/global_rules` | GET 列表、GET /{id}、PUT /{id}、PATCH /{id}、DELETE /{id} |
| **Plugin Metadata**（插件元数据） | `/edge/admin/plugin_metadata` | GET 列表、GET /{name}、PUT /{name}、PATCH /{name}、DELETE /{name} |
| **Plugins**（插件管理） | `/edge/admin/plugins` | GET 列表、PUT /reload |
| **Server Info**（服务信息） | `/edge/server_info` | GET |

### 7.2 HTTP 方法映射

| 操作 | HTTP 方法 | 说明 |
|------|-----------|------|
| `list` | GET | 获取资源列表 |
| `get` | GET | 获取单个资源 |
| `create` | POST | 创建资源 |
| `update` | PUT | 全量更新资源 |
| `patch` | PATCH | 部分更新资源 |
| `delete` | DELETE | 删除资源 |

### 7.3 通用 API 方法

`EdgeClient` 提供通用方法 `api()` 封装所有资源操作：

```python
def api(self, resource: str, action: str, resource_id=None, data=None, sub_path=None):
    base = self.RESOURCE_PATHS[resource]    # e.g. "/edge/admin/upstreams"
    method = self.ACTION_METHOD[action]      # e.g. "PUT"
    path = base
    if resource_id:
        path += f"/{resource_id}"
    if sub_path:
        path += f"/{sub_path}"
    return self._request(method, path, data)
```

---

## 8. 数据格式与字段映射

### 8.1 Upstream（上游服务）

**Edge 接收格式：**

```json
{
  "type": "roundrobin",
  "name": "backend-api",
  "nodes": {
    "10.0.0.1:8080": 100,
    "10.0.0.2:8080": 80
  },
  "hash_on": "vars",
  "key": "",
  "checks": { "active": { "timeout": 5, "http_path": "/health" } },
  "retries": 3,
  "retry_timeout": 10,
  "timeout": { "connect": 5, "send": 10, "read": 10 },
  "pass_host": "pass",
  "scheme": "http",
  "keepalive_pool": { "size": 32, "idle_timeout": 60, "requests": 100 }
}
```

**字段映射（DB 名 → Edge 名）：**

| DB 字段 | Edge 字段 | 说明 |
|---------|-----------|------|
| `load_balance` | `type` | 负载均衡算法 |
| `targets`（子表） | `nodes`（内联字典） | 目标地址 |
| `name` | `name` | 名称 |
| `hash_on` | `hash_on` | 哈希位置 |
| `key` | `key` | 哈希键 |
| `checks` | `checks` | 健康检查配置 |
| `retries` | `retries` | 重试次数 |
| `retry_timeout` | `retry_timeout` | 重试超时 |
| `timeout` | `timeout` | 连接/发送/读取超时 |
| `pass_host` | `pass_host` | Host 传递策略 |
| `upstream_host` | `upstream_host` | 重写 Host |
| `scheme` | `scheme` | 协议 |
| `keepalive_pool` | `keepalive_pool` | 连接池 |

**负载均衡算法映射：**

| DB 值 | Edge 值 |
|-------|---------|
| `weighted_roundrobin` | `roundrobin` |
| `chash` | `chash` |
| `ewma` | `ewma` |
| `least_conn` | `least_conn` |

**targets → nodes 转换：**

```python
# DB 格式：子表记录
[{"target": "10.0.0.1:8080", "weight": 100}]

# Edge 格式：内联字典
{"10.0.0.1:8080": 100, "10.0.0.2:8080": 80}
```

### 8.2 Route（路由）

**Edge 接收格式：**

```json
{
  "name": "api-route",
  "uri": "/api/*",
  "methods": ["GET", "POST"],
  "hosts": ["api.example.com"],
  "upstream_id": "edge-upstream-uuid",
  "priority": 0,
  "status": 1,
  "vars": [["arg_name", "==", "value"]],
  "plugin_config_ids": ["uuid-xxx"],
  "plugins": {
    "limit-req": { "rate": 100, "burst": 200 }
  }
}
```

**字段转换说明：**

| DB 字段 | Edge 字段 | 转换规则 |
|---------|-----------|---------|
| `methods` (逗号字符串) | `methods` (数组) | `"GET,POST"` → `["GET","POST"]` |
| `hosts` (逗号字符串) | `hosts` (数组) | `"api.example.com"` → `["api.example.com"]` |
| `vars` (JSON 字符串) | `vars` (数组) | `'[["arg","==","val"]]'` → `[["arg","==","val"]]` |
| `upstream_id` (int PK) | `upstream_id` (Edge UUID) | 查询 Upstream 的 `edge_uuid` |
| `plugins` (子表 RoutePlugin) | `plugins` (内联字典) | 按 plugin_name 聚合为字典 |

### 8.3 Plugin Config（插件组）

**Edge 接收格式：**

```json
{
  "desc": "rate-limit-config",
  "plugins": {
    "limit-req": { "rate": 100, "burst": 200 }
  }
}
```

### 8.4 Global Rule（全局规则）

**Edge 接收格式：**

```json
{
  "desc": "global-cors",
  "plugins": {
    "cors": { "allow_origins": "*" }
  }
}
```

### 8.5 Plugin Metadata（插件元数据）

**Edge 接收格式：**

```
PUT /edge/admin/plugin_metadata/{plugin_name}
```

Body 为任意 JSON 对象，作为插件的配置参数 schema 直接存储：

```json
{
  "endpoint": "http://auth-service:8080",
  "timeout": 5
}
```

---

## 9. 特殊操作

### 9.1 静态资源上传（二进制）

通过 `EdgeClient.raw_put()` 发送 ZIP 二进制文件到 Edge：

```http
PUT /edge/panshi/admin_static_resources?edge_uuid={edge_uuid}
X-API-KEY: <api_key>
Content-Type: application/octet-stream

<binary zip data>
```

- 不经过 SM4 加密
- Content-Type 为 `application/octet-stream`
- 超时 30 秒
- 响应体可加密也可明文

### 9.2 裸 DELETE（静态资源）

```http
DELETE /edge/panshi/admin_static_resources?edge_uuid={edge_uuid}
X-API-KEY: <api_key>
```

- 不加密请求
- 响应体按普通 JSON 解析

### 9.3 Plugin Reload

```
PUT /edge/admin/plugins/reload
```

Body 为空 JSON `{}`，触发 Edge 节点重载插件。

### 9.4 Plugin List

```
GET /edge/admin/plugins/list
```

返回 Edge 节点上可用的插件名称列表。

### 9.5 Server Info

```
GET /edge/server_info
```

返回 Edge 节点版本信息，用于导入前的连接测试：

```json
{
  "version": "3.0.0"
}
```

---

## 10. Ansible 运维通道

除 REST API 外，后端还通过 **Ansible** 对 Edge 节点进行运维操作。

### 10.1 协议栈

```
后端 → Ansible Runner → SSH → Edge 节点
```

### 10.2 实现类

`backend/app/services/ansible_service.py` — `AnsibleRunnerService`

### 10.3 配置

| 参数 | 值 |
|------|-----|
| **私密数据目录** | `backend/ansible/`（可被 `PANSHI_ANSIBLE_DIR` 环境变量覆盖） |
| **Playbook** | `edge.yml` |
| **Inventory** | `inventory/hosts`（由运维团队维护 SSH 凭据） |
| **目标主机** | Ansible extravar `ips` 指定 |
| **超时** | 60s（`DEFAULT_JOB_TIMEOUT`） |
| **并发限制** | 最多 5 个 playbook 同时运行 |

### 10.4 支持的 Tags

| Tag | 说明 |
|-----|------|
| `nginx_cmd_run` | Nginx 启停查：start / stop / reload / check |
| `edge_statistic` | 收集 CPU/内存/磁盘/版本统计 |
| `edge_tail_log` | 查看 Edge 日志 |
| `edge_master_copy_to_slaves` | 主节点同步到从节点 |
| `edge_init_env` | 初始化 Edge 环境 |
| `script_cmd_run` | 执行自定义脚本 |
| `nginx_stream` | Nginx 流式配置 |
| `edge_plugins_md5` | 检查插件 MD5 |

### 10.5 节点操作 REST API

后端将 Ansible 操作包装为 REST API（在 `cluster_nodes.py` 中）：

| 接口 | Ansible 操作 |
|------|-------------|
| `POST /clusters/{id}/nodes/{node_id}/start` | 执行 `nginx_start` |
| `POST /clusters/{id}/nodes/{node_id}/stop` | 执行 `nginx_stop` |
| `POST /clusters/{id}/nodes/{node_id}/restart` | 执行 `nginx_reload` |
| `POST /clusters/{id}/nodes/{node_id}/check` | 执行 `nginx_check` |
| `POST /clusters/{id}/nodes/{node_id}/statistic` | 执行 `edge_statistic` |
| `POST /clusters/{id}/nodes/action` | 批量操作（start/stop/restart/check/statistic） |
| `POST /clusters/{id}/nodes/{node_id}/ansible-run` | 执行任意允许的 tag |

---

## 11. 错误处理

### 11.1 异常类型

| 异常 | 触发条件 |
|------|---------|
| `EdgeConnectionError` | 连接失败（DNS 解析失败、连接被拒绝、超时） |
| `EdgeAPIError` | Edge 返回非 200/201/204 状态码 |
| `EdgeEncryptionError` | SM4 加解密失败或 PKCS7 填充校验失败 |

### 11.2 错误响应解析

Edge 返回非成功状态码时，响应体可能为：

1. **明文 JSON 错误**：直接解析
   ```json
   { "error_msg": "Resource not found" }
   ```
2. **加密 JSON 错误**：先解密再解析
   ```json
   // 解密后：
   { "error_msg": "Invalid request body" }
   ```
3. **纯文本错误**：无法解析时直接使用响应文本

### 11.3 HTTP 状态码

| 后端状态码 | 说明 |
|-----------|------|
| 502 Bad Gateway | Edge 连接失败（`EdgeConnectionError`） |
| 504 Gateway Timeout | Ansible 操作超时 |

---

## 12. 日志

每次 Edge API 操作通过 `EdgeLogger` 记录到本地日志文件。

### 12.1 日志文件

| 资源类型 | 日志路径 |
|---------|---------|
| Upstream（上游） | `logs/edge/upstream.log` |
| Route（路由） | `logs/edge/route.log` |
| Plugin Config（插件组） | `logs/edge/plugin_config.log` |
| Global Rule（全局规则） | `logs/edge/global_rule.log` |
| Plugin Metadata（插件元数据） | `logs/edge/plugin_metadata.log` |

### 12.2 日志条目格式

```
[2026-06-02 14:30:00]
Cluster:prod-cluster (ID:1)
Upstream:backend-api (ID:42)
Request: PUT /edge/admin/upstreams/uuid-xxx
Request Body: {...}
Encrypted: <base64 encrypted body>
Response: 201
Response Body: {...}
Status: SUCCESS
---
```

日志同时记录加密前的明文和加密后的 Base64 字符串，便于排查。

---

## 13. 配置项

### 13.1 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `EDGE_ADMIN_KEY` | `f9357106bff442f89d4de7169c37c61e` | Edge API 认证密钥 |
| `EDGE_SM4_KEY` | `a16bc20453da220f` | SM4 加密密钥（16 字节） |
| `PANSHI_ANSIBLE_DIR` | `backend/ansible/` | Ansible 项目目录 |

### 13.2 集群配置

集群的 `admin_key` 字段用于 Edge 认证，优先级高于环境变量。

### 13.3 节点配置

每个节点定义在 `Node` 表中：

| 字段 | 说明 |
|------|------|
| `ip` | Edge 节点 IP |
| `management_port` | 管理端口（默认 9180） |
| `edge_path` | Edge 安装路径 |
| `status` | 节点状态（1=活跃） |

---

## 附录：通信时序图

### 发布上游到 Edge

```
后端 (EdgeClient)                    Edge 节点
      │                                 │
      │  PUT /edge/admin/upstreams/{id}  │
      │  Headers:                        │
      │    X-API-KEY: ***                │
      │    Content-Type: application/json│
      │  Body: [SM4 encrypted JSON]      │
      │─────────────────────────────────→│
      │                                 │  解密请求体
      │                                 │  处理业务逻辑
      │                                 │  加密响应体
      │  Response: 201                   │
      │  Body: [SM4 encrypted JSON]      │
      │←─────────────────────────────────│
      │                                 │
      │  解密响应体                       │
      │  返回结果                         │
      │                                 │
```

### 导入 Edge 数据

```
后端 (EdgeImportService)               Edge 节点
      │                                 │
      │  GET /edge/server_info           │
      │─────────────────────────────────→│
      │←─────────────────────────────────│ 版本信息
      │                                 │
      │  GET /edge/admin/upstreams       │
      │─────────────────────────────────→│
      │←─────────────────────────────────│ 上游列表 (加密)
      │                                 │
      │  GET /edge/admin/routes          │
      │─────────────────────────────────→│
      │←─────────────────────────────────│ 路由列表 (加密)
      │                                 │
      │  ...其他资源...                   │
      │                                 │
      │  解密 → 格式转换 → 写入本地 DB    │
```
