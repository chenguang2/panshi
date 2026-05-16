## Context

当前磐石 Admin 管理 Edge 节点的方式是"由磐石发起所有配置变更"——用户在磐石 Admin 中创建/修改上游、路由，然后通过 EdgeClient 发布到 Edge 节点。但存在一批已经通过其他系统（APISIX Admin API 直调、Ansible、手工等）配置好的 Edge 节点，磐石 Admin 完全不掌握这些节点的配置数据。

本设计解决的是：如何将"已在运行的 Edge 节点数据"导入到磐石 Admin 的数据库中，使其变为可管理状态。

### 当前状态

- `ps_upstream` / `ps_upstream_target` — 磐石侧"期望的"上游配置
- `ps_route` / `ps_route_plugin` — 磐石侧"期望的"路由配置
- `ps_node` — 已注册的 Edge 节点，关联到集群
- EdgeClient — 提供对 Edge 节点 Admin API 的加密封装（SM4 加密）
- Edge 节点数据格式（APISIX）与磐石格式之间已有映射关系（见 `config_diff.py` / `equivalence_rules.yaml`）

### 约束

- 不可修改现有业务表结构（`ps_upstream` 等表保持原样）
- 导入后节点应可正常走现有发布流程
- 导入过程可重入（重复导入同一节点需正确处理冲突）

## Goals / Non-Goals

**Goals:**

- 从 Edge 节点 Admin API 拉取 routes、upstreams、plugin_configs、global_rules
- 将 APISIX 格式转换为磐石数据库格式并写入现有业务表
- 提供连接测试、数据预览（含冲突检测）、确认导入的三步流程
- 导入后该节点纳入磐石管理，可通过现有 UI 查看和配置
- 记录每次导入的来源节点、导入内容、冲突和处理结果

**Non-Goals:**

- 不支持增量同步（仅一次性导入，后续变更走现有发布流程）
- 不支持自动漂移检测或定时同步（这是独立功能，不属于本变更）
- 不支持反向导出（磐石数据 → Edge 节点已有其他发布通道）
- 不修改现有的发布、配置对比、版本管理等已有功能

## Decisions

### 1. 数据拉取方式：同步拉取 vs 异步任务

| 选项 | 描述 | 结论 |
|---|---|---|
| 同步拉取 | 用户在页面上点击导入，后端同步调 Edge 节点 API 拉取所有数据 | ✅ **选择**：数据量不大（单个节点一般几十到几百条路由），30s 内可完成 |
| 异步任务 | 后台 Celery/APScheduler 任务，轮询拉取 | ❌ 过度设计，增加部署复杂度 |

### 2. 导入策略：覆盖 vs 冲突报告

- 导入时**不覆盖**已有数据。如果有名称冲突：上游自动加 `-imported` 后缀；路由路径重复则跳过
- 导入成功后，用户可手动在磐石 Admin 中调整配置，然后通过发布覆盖 Edge 节点
- **不自动推送**到 Edge 节点（导入只是"读取"，不是"写入"）

### 3. 数据转换：独立转换层 vs 复用现有发布逻辑

- 现有 `EdgeClient.convert_upstream_to_edge_format()` 是"磐石→Edge"方向的转换
- 需要实现反向转换器 `EdgeImportConverter`，将"Edge→磐石"方向的数据映射
- 转换逻辑放在新文件 `app/services/edge_import_service.py`，不污染现有 EdgeClient

### 4. 导入日志：新表 vs 复用审计日志

| 选项 | 结论 |
|---|---|
| 复用 `sys_audit_log` | ❌ 字段不匹配，审计日志是通用操作日志 |
| 新建 `ps_import_log` | ✅ **选择**：专表记录导入的节点、资源列表、冲突详情、导入结果 |

### 5. 边缘数据（APISIX 响应）的处理

- 选择"导入到现有数据库表"（之前已讨论决定）
- APISIX 返回的完整原始 JSON **不保存**在数据库中（避免膨胀）
- 仅在 `ps_import_log.detail` 中记录摘要：导入了多少条路由/上游、跳过了多少条、冲突详情

### 6. 上游 UUID 关联重建

- 磐石 `ps_upstream.edge_uuid` 用于关联 Edge 端的 upstream ID
- 导入时：将 Edge 上游的 `id`（UUID）写入 `ps_upstream.edge_uuid`
- 路由导入时：根据 Edge 路由的 `upstream_id`（UUID），从刚导入的 `ps_upstream` 中找到对应的磐石 ID，建立外键关联

### 7. 节点选择方式：手动录入 vs 从已有节点选择

**问题**：原来设计 Step 2 让用户手动输入 IP、端口、API Key、Edge 路径，但这与 Step 1 选择集群的体验割裂，且 API Key 等参数分散在多个地方。

**方案**：**先注册，再导入**。用户先在集群管理中注册集群和节点（ClusterList.vue），导入页面只做选择。

| 选项 | 描述 | 结论 |
|---|---|---|
| 选择已有节点 | Step 2 从 `ps_node` 选择节点，连接信息自动填充 | ✅ **选择** — 无歧义，信息一致 |
| 手动输入 | Step 2 填表单 | ❌ 与集群管理重复，容易输错 |

**连接信息来源**：
- `ps_node.ip` → 节点地址
- `ps_node.management_port` → Admin 端口
- `ps_node.edge_path` → Edge 路径（用户在集群管理添加节点时已填）
- `ps_cluster.admin_key` → API Key（集群管理新增 `admin_key` 字段）
- 后端读取以上信息，前端只需传 `cluster_id + node_id`

**变更**：
- 集群管理创建/编辑表单增加 `admin_key` 输入框
- 导入 Step 2 改为节点下拉选择，无手动输入
- 导入服务从 `ps_cluster.admin_key` 或 `EDGE_ADMIN_KEY` 环境变量读取 API Key

### 8. 未知插件处理（Edge 插件超集）

**问题**：Edge 节点可能安装了磐石 Admin 内置插件列表（`BUILTIN_PLUGINS`）之外的插件，例如自定义插件或社区插件。导入后这些插件的配置如何处理。

**关键发现**：
- `ps_route_plugin.plugin_name` 是 VARCHAR(50)，**没有外键约束** —— 任何插件名都可以存储
- `ps_plugin_config.plugins` 是 Text/JSON 字段 —— 可存储任意插件配置
- `ps_global_rule.plugins` 同上是 Text/JSON —— 无限制
- 磐石的"已知插件"定义在 `backend/app/api/v1/plugins.py` 的 `BUILTIN_PLUGINS` 硬编码列表中

**策略**：全量导入 + 分级展示

| 插件类型 | 存储方式 | 展示方式 | 可编辑性 |
|---|---|---|---|
| 已知插件（在 BUILTIN_PLUGINS 中） | `ps_route_plugin` 正常拆分写入 | 表单编辑器 + JSON 编辑器 | ✅ 表单编辑 + JSON 编辑 |
| 未知插件（不在 BUILTIN_PLUGINS 中） | `ps_route_plugin` 正常拆分写入 | ⚠️ 仅 JSON 编辑器，带"未识别"标签 | ⚠️ 仅 JSON 编辑 |
| Plugin Configs（独立插件组） | `ps_plugin_config` 写入 | 插件组列表展示 | ⚠️ 部分仅 JSON 编辑 |
| Global Rules | `ps_global_rule` 写入 | 全局规则列表展示 | ⚠️ 部分仅 JSON 编辑 |

**导入预览中的展示**：
```
将导入 15 个已知插件 + 3 个新插件（custom-auth、my-ratelimit、internal-monitor）
新插件配置会存入数据库，在路由编辑器中可通过"JSON 编辑"模式查看和修改。
```

**UI 处理**（在路由编辑器中）：
- 表单编辑器：只显示已知插件的表单字段
- 新增"未识别插件"折叠面板：列出所有不在 BUILTIN_PLUGINS 中的插件，每项显示为 JSON 编辑框
- JSON 编辑器（已有功能）：展示全部插件（已知+未知）的完整 JSON

**长远考虑**：
- 未来可通过导入 Edge 的插件元数据来自动扩展已知插件列表（本版本不实现）
- 或者管理员在磐石后台手动注册新插件的 schema（本版本不实现）

## API 设计

### 新增 REST API

```
POST /api/v1/edge-import/test-connection
  请求: { cluster_id, node_id }
  说明: 后端从 ps_cluster 读取 admin_key，从 ps_node 读取 ip/port/edge_path
  响应: { success, version, plugin_count, route_count, upstream_count }

GET  /api/v1/edge-import/preview
  Query: { cluster_id, node_id }
  响应: {
    upstreams: [{ name, type, nodes, ... }],
    routes: [{ name, uri, methods, upstream_name, plugins: { known: [...], unknown: [...] }, ... }],
    plugin_configs: [{ name, plugins: { known: [...], unknown: [...] } }],
    global_rules: [{ name, plugins: { known: [...], unknown: [...] } }],
    conflicts: [{ type, reason, detail }],
    plugin_summary: { known_count: N, unknown_count: M, unknown_plugin_names: [...] }
  }

POST /api/v1/edge-import/execute
  请求: { cluster_id, node_id, selections: { upstreams, routes, plugin_configs, global_rules } }
  说明: 节点信息从数据库读取，不在请求体中传递
  响应: { success, import_log_id, imported_counts, skipped_counts, plugin_summary }
```

### 新增数据库表

```sql
CREATE TABLE ps_import_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id  INTEGER NOT NULL REFERENCES ps_cluster(id),
    node_ip     VARCHAR(50) NOT NULL,
    node_port   INTEGER NOT NULL,
    edge_path   VARCHAR(255),
    status      VARCHAR(20) NOT NULL DEFAULT 'success',  -- success / partial / failed
    upstream_count        INTEGER DEFAULT 0,
    route_count           INTEGER DEFAULT 0,
    plugin_config_count   INTEGER DEFAULT 0,
    global_rule_count     INTEGER DEFAULT 0,
    known_plugin_count    INTEGER DEFAULT 0,    -- 新增：已知插件数
    unknown_plugin_count  INTEGER DEFAULT 0,    -- 新增：未知插件数
    unknown_plugin_names  TEXT,                  -- 新增：未知插件名列表 (JSON array)
    conflict_details      TEXT,                  -- JSON array
    error_message         TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 数据流

```
前置条件: 集群已创建(含 admin_key)，节点已注册(含 ip/port/edge_path)

用户操作                    后端                           Edge 节点
─────────                  ──────                        ──────────
1. 选择集群+节点
   │
   ├──► POST /test-connection
   │    请求: { cluster_id, node_id }
   │    后端从DB读取: ps_node.ip/port, ps_cluster.admin_key
   │    ─────────► GET /apisix/admin/routes
   │    ◄── 成功/失败                    ◄── 节点信息+版本号
   │
2. 预览数据
   │
   ├──► GET /preview ──────────────────► GET /apisix/admin/* (全部数据)
   │    │  拉取 routes, upstreams, plugin_configs, global_rules
   │    │  数据转换（APISIX → 磐石格式）
   │    │  插件分类：已知插件(BUILTIN_PLUGINS) vs 未知插件
   │    │  冲突检测（名称/路径/UUID）
   │    ◄── 预览结果 + 冲突列表 + 插件摘要
   │
3. 确认导入
   │
   ├──► POST /execute
   │    │  再次拉取数据（保证实时性）
   │    │  写入 ps_upstream + ps_upstream_target
   │    │  写入 ps_route + ps_route_plugin（含未知插件）
   │    │  写入 ps_plugin_config
   │    │  写入 ps_global_rule
   │    │  写入 ps_import_log
   │    │  (ps_node 不创建/更新 — 已在集群管理中注册)
   │    ◄── 导入结果 + 插件摘要
```

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 导入时 Edge 节点不可达 | 操作失败 | 连接测试步骤提前验证；失败时回滚已写入的数据 |
| 数据量大（1000+ 路由） | 预览和导入耗时较长 | 使用 HTTP 长超时（60s）；前端显示加载进度 |
| 导入后用户手动发布了新版配置覆盖 Edge | 导入数据过时 | 导入是一次性操作，后续管理走正常发布流程，这是预期行为 |
| Edge 节点 upstreams 中有磐石不识别的自定义字段 | 数据丢失 | 转换时忽略未知字段，记录到 import_log.detail |
| 同一节点重复导入 | 数据重复或冲突 | 按 edge_uuid 去重：已存在的记录不变，新增记录追加 |
| **未知插件的配置被误修改** | 用户在 JSON 编辑器中修改了未知插件配置导致语法错误 | JSON 编辑时做基本 JSON 校验；允许重置为导入时的原始值 |
| **未知插件无法通过表单编辑** | 用户必须用 JSON 编辑器操作，体验较差 | 在预览和导入结果中明确告知用户哪些插件不受表单编辑支持 |

## Open Questions

- 集群管理页面的 `admin_key` 字段是否需要加密存储？（当前方案：明文存储，与 `ps_cluster` 模型一致）
- 是否需要支持"全选/反选"导入的数据类型？（当前方案：支持，用户可在预览页勾选要导入的类别）
- 未知插件是否需要保留 Edge 返回的原始 JSON 用于回退？（当前方案：不保留，仅在 import_log 中记录插件名列表）
- 未来是否需要"插件元数据导入"功能来自动注册未知插件 schema？（当前方案：不实现，本版本未知插件仅支持 JSON 编辑）
