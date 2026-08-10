## Why

`route-advanced-full-operators` 变更完成后，经真实使用发现两类问题：

1. **路由「启用 WebSocket」开关与数据库不同步**：勾选后保存，再次编辑时 checkbox 未被选中（独立路由管理页与统一管理页均受影响）。根因是后端 `route_to_response` 及三处 `RouteResponse` 手动构造遗漏 `enable_websocket` 字段，导致 API 返回 `null`，前端 `!!(null)` 回填为 false；同时前端保存逻辑为单向赋值（`if (form.enableWebsocket) data.enable_websocket = true`），取消勾选时请求体不含该字段，后端 `exclude_unset=True` 跳过更新，DB 旧值残留。
2. **高级匹配行内提示标签固定**：提示文案中的示例值（如「等于匹配：arg_name == user」的 `user`）写死，不随当前条件 key/value 变化，误导用户。

## What Changes

- **Bug 1 修复——WebSocket 开关同步**：
  - 后端 `route_to_response`（cluster_routes.py）补 `enable_websocket` 字段（列表与单条 API 共用函数，一次性修复）
  - 后端三处 `RouteResponse(...)` 手动构造（create/get/update）补 `enable_websocket`
  - 前端 `RouteFormModal.vue` 保存逻辑改为始终发送 `data.enable_websocket = form.enableWebsocket`（true/false 都传）
  - 前端 `useClusterRoutes.ts`（统一管理页 ClusterRoutes 组件）保存逻辑同样改为 `payload.enable_websocket = routeForm.enableWebsocket`
- **Bug 2 修复——提示标签动态化**：
  - `OPERATOR_GROUPS` 的 desc 改为 `{var}`/`{val}` 占位符模板
  - 新增 `deriveVarName(rule)`（按 type 生成变量前缀）与 `formatRuleValue(value)`（数组格式化为 `[v1, v2]`）
  - `getRuleHint(rule)` 用 `replaceAll('{var}')`/`replaceAll('{val}')` 替换为实际 key/value，随条件实时更新
- **AGENTS.md 第 8 条**：测试时复用已运行服务（`develop/linux/start.sh` 启动的 12344/12345），不重复启停系统
- **测试对齐**：`RouteFormModal.test.ts` 的 `buildRouteSubmitData` 模拟逻辑与实现同步（始终发送），新增 `useClusterRoutes` WebSocket 提交测试、后端往返测试

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `route-management`: 路由编辑 WebSocket 开关同步修复（后端字段补齐 + 前端双向赋值）、高级匹配行内提示动态化。

## Impact

- `backend/app/api/v1/cluster_routes.py`：`route_to_response` 与三处 `RouteResponse` 构造补 `enable_websocket`
- `backend/tests/test_route_api.py`、`test_route_list_api.py`：新增 WebSocket 往返与转换函数测试
- `frontend/src/components/RouteFormModal.vue`、`frontend/src/composables/useClusterRoutes.ts`：保存逻辑改为始终发送 enable_websocket
- `frontend/src/components/RouteAdvancedMatch.vue`：desc 占位符模板 + `getRuleHint` 动态替换 key/value
- `frontend/src/components/__tests__/RouteAdvancedMatch.test.ts`：新增值替换测试、对照常量更新
- `AGENTS.md`：测试运行时服务复用约定
- DB 无迁移；API 响应新增字段对既有前端兼容（额外返回 enable_websocket 不破坏解析）
