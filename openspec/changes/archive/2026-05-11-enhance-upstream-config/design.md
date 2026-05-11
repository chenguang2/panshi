## Context

上游表单当前是扁平模态框（`ClusterList.vue` L375-424），仅含基础字段（名称、负载均衡、哈希位置、Key、描述、节点列表）。健康检查（checks）作为隐藏的硬编码 JSON 在 `showAddUpstreamModal` 中初始化但无 UI 可编辑。参照同文件中路由创建弹窗（L426-492）已使用的 `a-tabs` + `advancedMatchEnabled` 开关模式。

## Goals / Non-Goals

**Goals:**
- 上游表单拆分为"基础配置"和"高级配置"两个 Tab，使用 `a-tabs`
- 高级配置 Tab 默认隐藏（通过开关启用），加载 `upstreams.log` 文档中定义的基础表单之外的字段
- 负载均衡新增 `ewma`、`least_conn`，哈希位置新增 `vars_combinations`
- 健康检查从隐藏默认值变为可编辑的 UI 表单项

**Non-Goals:**
- 不新增后端 API 端点
- 不修改上游列表的展示逻辑
- 不修改 Edge 发布逻辑（`edge_client.py` 已有完整的 payload 构建）

## Decisions

### Decision 1: Tab 模式 vs Accordion 折叠模式

**选择: Tab 模式（a-tabs）**

- 理由: 与路由创建弹窗保持一致的模式，同一文件内复用相同的 UX 范式
- 备选: PluginEditorDrawer 的 Accordion 模式更紧凑，但与路由弹窗风格不统一

### Decision 2: 高级配置启用方式

**选择: `a-switch` 开关 + Tab 可见性控制**

- 路由弹窗中使用 `advancedMatchEnabled` ref 控制开关，在"基础配置" Tab 底部放置开关
- 开关关闭时，高级配置 Tab 不可点击（或显示提示）
- 健康检查默认勾选（`upstreamForm.advancedEnabled = true`）

### Decision 3: 高级配置字段的 UI 形式

| 字段 | UI 控件 | 说明 |
|---|---|---|
| `checks` | `<a-textarea>` + JSON 编辑 | 沿用现有默认值，用户可编辑 JSON |
| `retries` | `<a-input-number>` | min=0，默认值为节点数量 |
| `retry_timeout` | `<a-input-number>` | min=0，默认 0 |
| `timeout.connect` | `<a-input-number>` | 秒 |
| `timeout.send` | `<a-input-number>` | 秒 |
| `timeout.read` | `<a-input-number>` | 秒 |
| `pass_host` | `<a-select>` | pass / node / rewrite |
| `upstream_host` | `<a-input>` | 仅 pass_host=rewrite 时显示 |
| `scheme` | `<a-select>` | http / https / tcp / udp |
| `keepalive_pool.size` | `<a-input-number>` | — |
| `keepalive_pool.idle_timeout` | `<a-input-number>` | 秒 |
| `keepalive_pool.requests` | `<a-input-number>` | — |

### Decision 4: 负载均衡值映射

保持前后端一致的命名规范：

| 前端显示 | 前端值 | Edge API type |
|---|---|---|
| 加权轮询 | `weighted_roundrobin` | `roundrobin` |
| 一致性哈希 | `chash` | `chash` |
| 延迟最小 | `ewma` | `ewma` |
| 最少连接 | `least_conn` | `least_conn` |

### Decision 5: 后端 schema 兼容

后端 `cluster.py` 的 `UpstreamBase.load_balance` 字段当前只接受 `weighted_roundrobin` 和 `chash`。需扩展为接受 `ewma` 和 `least_conn`。新增高级配置字段（retries、timeout 等）作为 optional 字段透传存储。

## Risks / Trade-offs

- **[风险] 健康检查 JSON 编辑体验差** → 提供格式化默认值，后续可考虑结构化表单编辑
- **[风险] 后端 schema 不兼容新负载均衡值** → 需同步更新 `UpstreamBase` 的 Literal 类型
