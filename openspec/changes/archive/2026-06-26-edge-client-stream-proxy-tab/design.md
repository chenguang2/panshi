## Context

Edge 直连页面（`EdgeClient.vue`）目前支持 6 个 Tab：上游、路由、全局规则、插件组、插件元数据、插件列表。每个 Tab 通过后端 `edge_client.py` 的代理接口直接操作 Edge 节点的管理 API。

四层代理（Stream Route）的 Edge 管理 API 路径为 `/stream/edge/admin/routes`，与 HTTP 路由的区别在于 URL 前缀为 `/stream`。EdgeClient 中已有 `stream_route` 资源映射。

## Goals / Non-Goals

**Goals:**
- Edge 直连页面新增「四层代理」Tab，与现有 Tab 风格一致
- 支持查看 Stream Route 列表、JSON 详情、删除
- 只读为主的 Tab（查看和删除），不提供创建/编辑表单（四层代理由业务页面管理）

**Non-Goals:**
- 不添加创建/编辑 Stream Route 的表单（由四层代理管理页面完成）
- 不做分组筛选或发布操作

## Decisions

### 1. 后端接口 — EdgeClient 封装方法 + run_edge_sync
**选择**：EdgeClient 类新增 `list_stream_routes`、`get_stream_route`、`create_stream_route`、`update_stream_route`、`delete_stream_route` 五个封装方法，每个内部调用 `self.api("stream_route", ...)`。API 端点通过 `run_edge_sync(call)` 调用以避免阻塞事件循环。
**理由**：与现有 route/upstream 的调用模式一致。`stream_route` 映射到 `/stream/edge/admin/routes`，是 Edge 网关的标准 Stream Route 管理接口。

```
# EdgeClient 新增方法
list_stream_routes()    → self.api("stream_route", "list")
get_stream_route(id)    → self.api("stream_route", "get", id)
create_stream_route(data) → self.api("stream_route", "create", data)
update_stream_route(id, data) → self.api("stream_route", "update", id, data)
delete_stream_route(id) → self.api("stream_route", "delete", id)

# API 端点调用方式
result = await run_edge_sync(client.list_stream_routes)
```

### 2. 前端 Tab 只读（查看 + 删除）
**选择**：与插件元数据 Tab 类似，只提供列表展示、JSON 查看和删除按钮
**理由**：四层代理的创建/编辑已有专门的业务页面（StreamProxyList），Edge 直连主要用于调试和查看已发布的数据

### 3. 前端 Tab 位置
**选择**：四层代理 Tab 放在所有 Tab 的最后（插件列表之后）
**理由**：四层代理使用频率较低，放在最后不干扰现有操作习惯

### 4. Tab 列定义
**选择**：列定义包含：序号、ID、名称、server_port、协议、server_addr、remote_addr、SNI、上游节点数、操作
**理由**：Stream Route 的核心字段，与 Edge 管理 API 返回的数据结构对应

### 5. 数据加载时机
**选择**：与现有 Tab 一致——点击「查询」时在 `loadAllData()` 的 `Promise.all` 中并行加载，切换 Tab 时通过 `loadData()` 的 `switch` 按需加载
**理由**：保持与现有行为一致，用户无学习成本

## Risks / Trade-offs

- **[接口同步]** Edge 节点上的 Stream Route 可能来自本系统发布，也可能来自手动操作或其他系统。Tab 中展示的是 Edge 节点上的实时数据，与本地数据库记录可能不一致。这是 Edge 直连的定位——查看真实运行数据。
