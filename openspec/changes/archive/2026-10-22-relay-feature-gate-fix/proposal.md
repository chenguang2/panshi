# Proposal: relay-feature-gate-fix

## Why

用户实测报告：在 `features.yaml` 中关闭 `relay_gateway` 后「不生效」。排查（2026-10-22）确认：总开关在四层门控链中**只接了执行路径一层**——

1. ④ 执行路径（HTTP `X-Edge-Target` / SSH `-J` 走向）：`relay_registry.relay_enabled()` mtime 热加载 ✅ 唯一生效的门（关闸流量回直连正常）
2. ③ 侧边栏菜单：条目仅带 `permission: 'relay_gateway'`，缺 `feature` 键 → 关闸后菜单仍显示
3. ② 前端路由：`/relay-gateways` 静态注册，不受 features.yaml 控制 → 关闸后页面照常可达
4. ① 后端 API：`relay.router` 无条件挂 `api_router` → 关闸后全部端点照常响应

对应 spec 缺口：`relay-region-registry` 的「全局总开关」需求只约束了执行路径层（「关闭时所有区域一律按直连路径执行」），对管理面（菜单/路由/API）零约束——实现与 spec 一致地漏掉三层。

## What Changes

补齐 ①②③ 三层接线（④ 不动），全部热生效：

1. **后端端点级门控**：`relay.py` 新增 `_require_relay_feature()` 挂 router dependencies（对齐 `database.py::_require_migration_feature` 先例）——请求期实时读 features.yaml，关闸即 404「中继网关功能未启用」；权限依赖在前解析（无权限者先 403，不泄露模块存在性）；新端点自动免疫。**选端点级而非挂载级（feature_routers）的理由**：挂载级在 import 期生效、改 yaml 需重启，违背总开关「改完即时生效免重启」承诺（该承诺正是 relay_gateway 从环境变量迁入 features.yaml 的初衷，#29）；db_migration 先例已确立端点级模式。
2. **前端路由动态注册**：`/relay-gateways` 移入 `featureRouteMap.relay_gateway`，移除静态注册。
3. **侧边栏 feature 键**：菜单项补 `feature: 'relay_gateway'`（与 `permission` 并列）。

## Impact

- **Specs**: `relay-region-registry`（MODIFIED 全局总开关：管理面三层不可用语义 + 403/404 次序 + 四层热生效）
- **Code**: 后端 `relay.py`（+14 行：helper + dependencies）；前端 `router/index.ts`（静态块→featureRouteMap 条目）、`AppSidebar.vue`（+1 行 feature 键）
- **Tests**: 新增 `backend/tests/test_relay_feature_gate.py`（5 用例：3 端点关闸 404 / 权限先于总闸 403 / 开闸对照 200）、`AppSidebar.test.ts` relay 门控 2 用例、`router/__tests__/index.test.ts` 动态注册 1 用例
- **验证**: relay 域回归 187 passed；前端全量 1828/1828（串行）；vue-tsc 0 错误；实页双向验收（改 yaml 不重启：菜单 DOM 0/直达不可达/API 即时 404 `/system/features` 下发 false；还原即恢复）
- **经验沉淀**: AGENTS.md 规则 #61（新功能总开关必须四层接线 + 排查口诀）
