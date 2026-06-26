## Context

当前磐石 Admin 支持 HTTP 模式的完整 API 管理（上游、路由、插件组、全局规则等），但对 Edge 网关的 Stream（L4 TCP/UDP）模式缺乏管理界面。用户需手动登录 Edge 节点配置 Stream 路由。

Edge 网关的 Stream 管理 API 路径为 `/stream/edge/admin/routes`，支持与 HTTP 类似的 CRUD 操作，但参数更简洁（主要匹配条件为 `server_port`、`server_addr`、`remote_addr`、`sni`）。

本设计在现有架构上增量新增四层代理管理，所有代码与 HTTP 模块完全隔离。

## Goals / Non-Goals

**Goals:**
- 提供独立页面管理四层（Stream）代理，支持 CRUD + 发布 + 版本管理
- 从远程节点的 `edge.env` 自动检测可用 Stream 端口（`deploy.stream.edge.listen`）
- 两步向导简化创建流程：选端口 → 配上游
- 复用现有发布流程（`PublishConfirmModal`、`executePublish`）和版本管理（`ConfigVersion`）
- 通过 feature flag 控制功能开关

**Non-Goals:**
- 不为 Stream 模式引入插件系统（插件组、全局规则、插件元数据等）
- 不为 Stream 模式提供独立的"上游管理"页面（上游配置内嵌在 Stream 代理中）
- 不修改现有的 HTTP 路由、上游、插件组代码
- 不做 Edge 节点端的 nginx stream 配置变更

## Decisions

### 1. 独立表 vs 复用 Route 表
**选择**：新建表 `ps_stream_proxy`
**理由**：Stream 代理与 HTTP 路由的数据结构差异大（Stream 无 uri/hosts/methods/vars/plugins 等字段，但有 listen_port/sni 等特有字段）。独立表避免 `route` 表字段膨胀和大量 null 列，查询和序列化也更简单。

### 2. 上游配置内嵌 vs 引用独立 Upstream
**选择**：上游配置内嵌在 `ps_stream_proxy` 表中（targets 为 JSON 字段，负载均衡等为独立列）
**理由**：Stream 代理配置简单，不需要像 HTTP 那样先创建上游再创建路由。内嵌方式使创建流程更简洁（两步向导），减少用户操作步骤。也避免了引用关系带来的删除级联问题。

### 3. 端口检测复用 EdgeEnv 的 SSE 流模式
**选择**：复用 `edgeEnv.readEdgeEnvStream` 的 SSE 流读取方式 + 新增轻量后端 API 解析端口
**理由**：EdgeEnv 已实现了 Ansible SSH 远程读取 edge.env 并 SSE 流式返回的功能。复用该能力，新增一个后端 API 解析 edge.env 中的 `deploy.stream.edge.listen` 并对比已用端口，前端直接展示可用/占用状态。

### 4. 发布调用 Edge Stream Route API
**选择**：通过 EdgeClient 通用 `api()` 方法加 `prefix='/stream'` 参数调用 Stream 路由接口
**理由**：Edge 网关的 Stream 管理 API 路径为 `/stream/edge/admin/routes`，与 HTTP 不同（有 `/stream` 前缀），但接口格式完全相同。遵循 AGENTS.md 约定"所有资源方法已合并为 api(resource, action, ...) 通用方法"，给 `api()` 增加可选 `prefix` 参数，调用 `api("routes", "update", id=uuid, data={...}, prefix="/stream")`。不新增独立方法，避免代码重复。

### 5. 卡片式列表 UI + 查看弹窗
**选择**：采用与插件组（PluginConfigList.vue）相同的卡片网格布局，查看详情使用自定义 modal 而非 Ant Design drawer
**理由**：用户已熟悉卡片式管理界面；Stream 代理比 HTTP 路由简单，卡片可以直接展示端口号、上游目标等关键信息，比表格更直观。查看详情最初设计为 Ant Design `a-drawer`，实际实现时改为自定义 modal 以保持与插件组查看弹窗（PluginConfigViewDrawer）风格完全一致。

### 6. Feature Flag 控制
**选择**：新增 `stream_proxy` feature flag
**理由**：Edge 网关的 Stream 模式默认禁用（`NOstream`），仅部分集群启用。Feature flag 让管理员按需开启，不产生多余菜单项。

### 7. 端口检测范围：查 DB + Edge 节点
**选择**：端口检测时同时查询 `ps_stream_proxy` 表 和 Edge 节点上的实际 Stream 路由
**理由**：Edge 节点上可能存在通过其他方式（手动、其他系统）创建的 Stream 路由，仅查 DB 无法发现这些端口占用。端口检测时通过 EdgeClient 调用 `GET /stream/edge/admin/routes` 获取参考节点上的实际路由列表，与 DB 中的记录合并判断，避免发布时端口冲突。

### 8.  UI 风格：全部自定义 CSS，零 Ant Design
**选择**：四层代理所有组件（卡片列表、新建向导、查看详情）全部使用自定义 CSS，不使用 Ant Design 组件
**理由**：插件组（PluginConfigList）使用自定义 CSS 实现，四层代理作为对标功能应保持一致。具体地：
- 卡片使用 `.sp-grid` / `.sp-card` 自定义类（对应插件组的 `.pc-grid` / `.pc-card`）
- 查看详情使用自定义 `.modal-overlay > .modal`（非 `a-drawer`）
- 表单元素使用全局 `.form-group` / `.form-input` / `.btn` 等样式
- 仅在发布弹窗和版本管理弹窗复用现有的 Ant Design 组件（PublishConfirmModal、VersionManagementModal）

### 9. 负载均衡算法：保留全部 4 种
**选择**：保留加权轮询、一致性哈希、EWMA、最少连接全部 4 种算法
**理由**：与 HTTP 保持一致，给用户更多选择。chash 在 Stream 场景下按 `vars`（如 `$remote_addr`）哈希，前端不暴露 `hash_on`/`key` 字段（这些是 HTTP 专有概念）。

### 10. 简化字段：不加 server_addr
**选择**：不加 `server_addr` 匹配字段
**理由**：四层代理定位为简化配置场景，`server_addr`（服务器 IP 匹配）在 Stream 代理中很少用到。模型保留 `server_port` + `remote_addr` + `sni` 即可。如有高级需求以后可扩展。

## Data Model

```sql
CREATE TABLE ps_stream_proxy (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    edge_uuid       TEXT NOT NULL DEFAULT (uuid4()),
    cluster_id      INTEGER NOT NULL REFERENCES ps_cluster(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    listen_port     INTEGER NOT NULL,          -- 监听端口号（来自 edge.env stream.listen）
    load_balance    TEXT NOT NULL DEFAULT 'weighted_roundrobin',  -- 负载均衡算法
    scheme          TEXT NOT NULL DEFAULT 'tcp',  -- tcp / udp
    -- 上游目标（JSON: [{"target":"ip:port", "weight":100}, ...]）
    targets         TEXT,
    -- 超时配置（JSON: {"connect": 3, "send": 3, "read": 3}）
    timeout         TEXT,
    -- Keepalive 连接池（JSON: {"size": 320, "idle_timeout": 60, "requests": 1000}）
    keepalive_pool  TEXT,
    -- 可选匹配条件
    remote_addr     TEXT,                       -- 来源 IP 限制（CIDR）
    sni             TEXT,                       -- SNI 匹配（TLS）
    -- 状态
    status          INTEGER NOT NULL DEFAULT 1,  -- 1=启用 0=禁用
    current_version INTEGER,
    created_at      DATETIME DEFAULT (datetime('now')),
    updated_at      DATETIME DEFAULT (datetime('now')),
    UNIQUE(cluster_id, listen_port)
);
```

## API 设计

所有路由在 `/clusters/{cluster_id}/stream-proxies` 下：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/clusters/{id}/stream-proxies` | 列表（分页+搜索） |
| POST | `/clusters/{id}/stream-proxies` | 创建 |
| GET | `/clusters/{id}/stream-proxies/{pid}` | 详情 |
| PUT | `/clusters/{id}/stream-proxies/{pid}` | 更新 |
| DELETE | `/clusters/{id}/stream-proxies/{pid}` | 删除 |
| POST | `/clusters/{id}/stream-proxies/{pid}/publish` | 发布 |
| GET | `/clusters/{id}/stream-proxies/{pid}/history` | 版本历史 |
| POST | `/clusters/{id}/stream-proxies/{pid}/rollback/{version}` | 回滚 |
| POST | `/clusters/{id}/stream-proxies/{pid}/detect-ports` | 检测可用端口 |

**路由注册顺序**：`detect-ports` 是静态路径，`{proxy_id}` 是动态路径。FastAPI 中静态路由必须注册在动态路由之前，否则 `detect-ports` 会被误匹配为 `{proxy_id}`。在 `include_router` 时需先注册 `detect-ports` 相关路由，再注册 CRUD 路由。

**端口检测接口**：
- 请求：`{node_id: int}`
- 处理流程：
  1. 通过 Ansible SSH 从指定节点读取 edge.env 文件（SSE 流式，复用现有 `edge_read_env` playbook）
  2. 解析 YAML 中的 `deploy.stream.edge.listen` 提取端口号
  3. 如果 stream 模块为 `NOstream`（禁用），返回空列表 + 警告
  4. 查询 `ps_stream_proxy` 表中同一集群的已用端口
  5. 通过 EdgeClient 调参考节点的 `GET /stream/edge/admin/routes` 获取实际路由列表，提取所有 `server_port`
  6. 合并 DB + Edge 节点两方面的占用信息，标记每个端口状态
- 响应：`{ports: [{port: 9970, status: "available"|"in_use"|"not_in_config", used_by: "name"|null, source: "db"|"edge"}]}`

**发布数据格式转换**：
创建/发布时，需将 DB 中的 JSON 字段格式转换为 Edge Stream Route API 格式：
- DB targets `[{"target":"ip:port", "weight":100}]` → Edge `upstream.nodes: {"ip:port": 100}`
- DB `load_balance` → Edge `upstream.type`（`weighted_roundrobin` → `roundrobin`，其余不变）

Stream Route PUT body 遵循使用手册格式：
```json
{
    "server_port": 9970,
    "sni": "ssl.example.com",
    "remote_addr": "10.0.0.0/8",
    "upstream": {
        "nodes": {"192.168.1.10:8080": 100},
        "type": "roundrobin",
        "timeout": {"connect": 3, "send": 3, "read": 3}
    }
}
```

## 前端路由

```typescript
// 静态注册在 featureRouteMap
stream_proxy: {
  path: 'stream-proxies',
  name: 'StreamProxyList',
  component: () => import('@/views/StreamProxyList.vue'),
}
```

## Risks / Trade-offs

- **[数据结构冗余]** targets 嵌入 JSON 字段而非关联表 → 无法单独查询或统计上游目标。权衡：Stream 代理数量少、上游目标简单，JSON 字段足够。
- **[端口冲突：跨集群共享节点]** 多个集群可能共享 Edge 节点 → 端口检测时只能检测当前集群的 DB 占用，无法检测跨集群的 DB 冲突。缓解：端口检测会查 Edge 节点上的实际路由，跨集群冲突会通过 Edge 侧暴露。发布时也有 Edge API 验证。
- **[node.env 差异化配置]** 同一集群下不同节点可能通过 `node.env` 差异化覆盖 `deploy.stream.edge.listen` 配置，导致从参考节点读取的端口列表不完整。缓解：`node.env` 很少用于 Stream 端口差异化，且四层代理假设集群内配置一致。在文档中注明此限制。
- **[custom include 端口不可见]** `deploy.stream.custom.include` 中引用的自定义 nginx 配置可能包含额外监听端口，这些端口不在 `deploy.stream.edge.listen` 中，无法通过 YAML 解析发现。缓解：四层代理只管控 `edge.listen` 中的端口，custom include 中的端口不在管理范围内。
- **[edge.env 读取失败]** 节点 SSH 连接失败时端口检测不可用 → 允许用户手动输入端口号作为 fallback。
