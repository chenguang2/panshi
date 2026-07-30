## Context

路由目前不支持 WebSocket 代理配置。Edge 网关的 Route API 接受 `enable_websocket` 布尔字段（缺省 false），平台在创建/编辑/发布路由时均未传递此字段。需要从数据库模型到前端界面完整支持。

## Goals / Non-Goals

**Goals:**

- Route 数据库模型新增 `enable_websocket` 列（Boolean, default False）
- Route Schema（Create/Update/Response）新增可选字段
- 前端 RouteFormModal 基础配置页增加「启用 WebSocket」复选框
- 发布时在 `edge_data` 中包含 `enable_websocket`
- Edge 导入时识别并存储该字段
- 配置对比时比较该字段

**Non-Goals:**

- 不涉及 Edge 网关本身的 WebSocket 实现
- 不修改现有路由的其他字段或行为

## Decisions

### Decision 1: 使用 Boolean 字段，默认 False

- 与 Edge API 协议一致（`enable_websocket: true/false`）
- 数据库层面使用 Boolean 类型，默认 False
- Schema 层面 `Optional[bool]`，不传时不覆盖

### Decision 2: 前端默认不选中

- 与 Edge 缺省行为一致（false）
- 避免对现有路由造成意外影响
- 用户在需要 WebSocket 时手动开启

### Decision 3: 发布时两处代码路径均需处理

- `config_data`（版本历史记录）中需包含 `enable_websocket`，使回滚能正确恢复
- `convert_route_to_edge_format()` 新增 `enable_websocket` 参数，使 Edge 发布请求体包含该字段
- `rollback_route()` 的字段恢复列表中新增 `enable_websocket`

### Decision 4: 配置对比与 Edge 导入

- `_compare_route()` 中新增 `enable_websocket` 字段的 DB ↔ Edge 比较
- `convert_route()` 中新增解析 Edge 返回的 `enable_websocket` 字段

## Risks / Trade-offs

- 已有路由的 `enable_websocket` 为 NULL/False，发布时不发送此字段 → Edge 按缺省 false 处理，行为不变
- 数据库迁移需要为新列加 ALTER TABLE，已有数据不受影响
