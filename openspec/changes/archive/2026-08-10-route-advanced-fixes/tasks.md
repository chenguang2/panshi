## 1. WebSocket 开关同步修复（TDD）

- [x] 1.1 后端：`route_to_response` 补 `enable_websocket` 字段（列表与单条 API 共用）
- [x] 1.2 后端：三处 `RouteResponse(...)` 手动构造（create/get/update）补 `enable_websocket`
- [x] 1.3 后端测试：新增往返测试（创建 enable_websocket=true → GET 返回 true → PUT false → GET 返回 false）+ `route_to_response` 字段测试（RED→GREEN）
- [x] 1.4 前端：`RouteFormModal.vue` 保存改为 `data.enable_websocket = form.enableWebsocket`（始终发送）
- [x] 1.5 前端：`useClusterRoutes.ts`（统一管理页）保存改为 `payload.enable_websocket = routeForm.enableWebsocket`
- [x] 1.6 前端测试：`useClusterRoutes` 新增 WebSocket 提交测试（取消勾选 → payload 含 false）；`RouteFormModal.test.ts` 模拟逻辑对齐（始终发送）

## 2. 高级匹配行内提示动态化（TDD）

- [x] 2.1 `OPERATOR_GROUPS` desc 改为 `{var}`/`{val}` 占位符模板
- [x] 2.2 新增 `deriveVarName(rule)`、`formatRuleValue(value)`、`getRuleHint(rule)`（replaceAll 无歧义替换）
- [x] 2.3 测试：新增值替换测试（单值/版本号/数组/IN）+ 更新 desc 对照常量（RED→GREEN）

## 3. 回归验证

- [x] 3.1 前端：`RouteAdvancedMatch.test.ts` 78 通过、`useClusterRoutes.test.ts` 16 通过、`RouteFormModal.test.ts` 2 通过、vue-tsc 干净、build 通过
- [x] 3.2 后端：WebSocket 往返 + 转换函数测试通过（test_route.py 的 8 个失败经 git stash 验证为预存数据污染，与本次无关）
- [x] 3.3 手动链路（Playwright）：取消勾选保存 → PUT false → DB 清空 → 再编辑 checkbox 未选中；header+Host+example.com 提示「等于匹配：http_host == example.com」

## 4. 文档与约定

- [x] 4.1 AGENTS.md 第 8 条：测试复用已运行服务，不重复启停系统
