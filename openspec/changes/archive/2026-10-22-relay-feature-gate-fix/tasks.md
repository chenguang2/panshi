# relay-feature-gate-fix Tasks

## 1. RED 测试

- [x] 1.1 后端 `backend/tests/test_relay_feature_gate.py`：关闸（patch _FEATURES_PATH 至 relay_gateway: false 临时 yaml）后 `GET/POST /relay/gateways`、`GET /relay/gateways/1/config-preview` 均 404「中继网关功能未启用」；无权限用户 403（先于 404）；仓库真实 yaml（开）对照 200 —— 3 RED + 2 对照绿
- [x] 1.2 前端 `router/__tests__/index.test.ts`：`featureRouteMap.relay_gateway` 存在（RelayGateways/relay-gateways/permission）且不再静态注册 —— RED
- [x] 1.3 前端 `AppSidebar.test.ts`：featuresStore 无 relay_gateway（显式 false）时「中继区域管理」隐藏（即使持权限）；有且持权限时可见 —— 隐藏用例 RED

## 2. GREEN 实现

- [x] 2.1 后端 `relay.py`：`_require_relay_feature()`（404「中继网关功能未启用」）挂 router dependencies，权限依赖在前
- [x] 2.2 前端 `router/index.ts`：`/relay-gateways` 移入 `featureRouteMap.relay_gateway`，移除静态注册
- [x] 2.3 前端 `AppSidebar.vue`：「中继区域管理」补 `feature: 'relay_gateway'` 键

## 3. 回归与验收

- [x] 3.1 relay 域回归：`test_relay_feature_gate + test_relay_sshd/init/push/gateway_api/routing + test_security_guard` 187 passed
- [x] 3.2 前端全量串行 `npx vitest run --no-file-parallelism`：1828/1828（首轮 2 失败为 #208 CPU 争抢漂移，复跑未复现）
- [x] 3.3 `npx vue-tsc -b`：0 错误
- [x] 3.4 实页双向验收（Playwright，yaml 改动不重启）：开→侧边栏链接在、页面渲染、API 200；关→菜单 DOM 0、直达 /relay-gateways 不可达（全应用 feature 关统一行为）、API 即时 404、`/system/features` 下发 false；还原→200
- [x] 3.5 经验沉淀：AGENTS.md 规则 #61「新功能总开关必须四层接线」

## 4. 归档

- [x] 4.1 delta 合入 `openspec/specs/relay-region-registry/spec.md`（MODIFIED 全局总开关，替换块取自现文，#53）
- [x] 4.2 变更目录迁入 `openspec/changes/archive/2026-10-22-relay-feature-gate-fix/`
