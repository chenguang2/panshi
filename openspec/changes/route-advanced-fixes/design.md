## Context

`route-advanced-full-operators` 完成后，实际使用发现两个 bug：

1. WebSocket checkbox 不同步——独立路由管理页（`RouteFormModal`）与统一管理页（`ClusterRoutes` → `useClusterRoutes`）**两套表单实现**都受影响。根因跨前后端：后端响应缺字段 + 前端单向赋值。
2. 高级匹配行内提示固定——desc 文案示例值写死。

## Goals / Non-Goals

**Goals:**
- WebSocket 开关保存后再次编辑正确回填（两套表单入口一致修复）
- 取消勾选能真正清除 DB 旧值
- 行内提示随条件 key/value 实时更新
- 测试覆盖修复，防止回归

**Non-Goals:**
- 合并两套路由表单实现（RouteFormModal vs ClusterRoutes 自建表单）——改动面过大，非本次范围
- 修改 WebSocket 的 Edge 发布语义
- 后端 schema 结构调整

## Decisions

### Decision 1: 后端 `route_to_response` 为修复锚点（一处修复全链路）

`route_to_response`（cluster_routes.py:25）是所有路由 API 的共用转换函数——`/api/v1/routes` 列表（routes.py）与 `/clusters/{id}/routes` 列表、单条、编辑后的响应都经它序列化。在此补 `enable_websocket: bool(...)` 一处修复，前端所有入口（RouteFormModal + ClusterRoutes）的回填数据源一次性修正。

**另补**：三处 `RouteResponse(...)` 手动构造（create/get/update）——它们不走 `route_to_response`，是独立序列化路径，需单独补齐。

**备选**：仅修前端 `!!(r.enable_websocket)` 容错——否决，治标不治本，后端本就应返回完整字段。

### Decision 2: 前端保存改为始终发送（双向赋值）

`RouteFormModal.vue` 与 `useClusterRoutes.ts` 的保存逻辑从：
```ts
if (form.enableWebsocket) data.enable_websocket = true
```
改为：
```ts
data.enable_websocket = form.enableWebsocket
```
原因：后端 `RouteUpdate.model_dump(exclude_unset=True)` 只更新请求中显式提供的字段。单向赋值下取消勾选时字段缺席 → DB 旧值残留 → 再编辑 checkbox 仍选中。始终发送 true/false 确保清除语义。

### Decision 3: 行内提示用 `{var}`/`{val}` 占位符模板

`OPERATOR_GROUPS` 的 desc 从写死示例（`等于匹配：arg_name == user`）改为模板（`等于匹配：{var} == {val}`），`getRuleHint` 用 `replaceAll` 无歧义替换：

```ts
const formatRuleValue = (value) => Array.isArray(value) ? `[${value.join(', ')}]` : String(value)
const getRuleHint = (rule) => desc.replaceAll('{var}', deriveVarName(rule)).replaceAll('{val}', formatRuleValue(rule.value))
```

**备选**：正则替换示例值（`/user/g` 等）——否决，替换链脆弱（`user1`/`USER1` 相互干扰、数字误伤版本号），占位符模板零歧义。

**注**：`not_ip~` 的 desc「按 IP 段反向匹配：{var} 不在列表内」不含 `{val}`——反向匹配语义下值已在标签输入可见。

### Decision 4: 测试对齐与新增

- `RouteFormModal.test.ts` 的 `buildRouteSubmitData` 模拟逻辑原为旧单向赋值（断言"unchecked 排除字段"），与实现不同步——更新为始终发送语义
- 新增 `useClusterRoutes` WebSocket 提交测试（取消勾选 → payload 含 `enable_websocket: false`）
- 新增后端往返测试（创建→GET→更新→GET 的 enable_websocket 一致性）+ `route_to_response` 字段测试
- `RouteAdvancedMatch.test.ts` 新增值替换测试（单值/版本号/数组/IN）

## Risks / Trade-offs

- [两套表单入口] RouteFormModal 与 ClusterRoutes 独立实现——分别修复，测试各自覆盖，未来可考虑合并
- [API 新增字段] 响应额外返回 `enable_websocket` 对既有前端兼容（多余字段不破坏解析）
- [占位符模板] desc 中 `{var}`/`{val}` 需所有运算符一致声明——测试断言每个 desc 非空且含占位符可防遗漏

## Migration Plan

无 DB 迁移。API 响应新增字段随后端部署生效；前端保存逻辑改动随前端发布。

## Open Questions

无。
