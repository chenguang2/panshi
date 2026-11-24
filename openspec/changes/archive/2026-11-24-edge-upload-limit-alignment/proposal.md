# Proposal

## Why

静态资源 zip 的「实际能用多大」目前分散在三条互相不知道的链路上：平台 `limits.static_zip_max_mb`（上传腿）、中继网关 nginx `client_max_body_size`（经中继的发布腿）、以及 Edge 节点自身 openresty（直连发布腿）。2026-11-23 实测暴露最隐蔽的一环：**Edge pack 的 `conf/nginx_server_monitor.conf` 在 server 级自带 `client_max_body_size 32m`**，server 级覆盖 http 级，因此即使在 edge.env 写了 `http.client_max_body_size: 132m`、平台也调到 132，直连发布 >32MB 仍 413（openresty `Powered by EDGE` 错误页）；唯一有效写法是 `deploy.http.admin.client_max_body_size`，而 `bin/edge init` 会用它回写该生成文件——手改生成文件必被下一次 init/部署覆盖。

结论：这个阈值必须由平台统一管理，而不是靠运维记住「Edge pack 有个 server 级默认值」。

## What Changes

- **单一事实源**：以 `features.yaml` 的 `limits.static_zip_max_mb` 为唯一上限来源（已有，mtime 热加载）。
- **Edge 侧对齐与告警（核心，2026-11-24 用户裁决 B 修订）**：`POST /clusters/{id}/edge-env/deploy` 下发前对提交内容做文本级处理——`deploy.http.admin.client_max_body_size` **缺失 → 补写平台上限**；**显式写下的值一律保留不覆盖（含低于平台值的刻意收紧）**，该落差在部署流 SSE、读取诊断、前端编辑提示三处告警「发布 {admin}–{平台}MB 的 zip 会 413」并给出修复动作（抬高该行或调低平台上限）。**不改动用户其余内容与注释**。
- **Edge 侧生效上限诊断**：`GET /clusters/{id}/edge-env` 响应新增 `limits` 段（平台上限 / admin 段值 / 按 pack 默认推算的生效值 / 是否够用 / 中文说明），明确指出「未在 admin 段配置时 Edge 实际按 32MB 生效，写 http 段无效」。
- **前端一致性**：edge.env 页面状态条/警示条展示「Edge 生效上限 vs 平台上限」，编辑内容未对齐时在部署前提示「将自动补齐」；类型定义与 API 同步。
- **中继网关腿收口**：`render_relay_server_conf` 在 8443 server 块写入 `client_max_body_size {平台上限}m`，`GET /relay/gateways/{id}/config-preview` 同源展示，使「经中继」与「直连」两腿的上限都可从平台配置推导，无需人工记 nginx 指令。
- 文档：`AGENTS.md` 约定 #50 补「平台自动对齐」指针；Edge pack 的 server 级 32m 陷阱作为设计依据保留在 design。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `edge-env-remote-editing`: 新增「部署前按平台上限对齐 Edge 生效上限」与「读取响应的生效上限诊断」两项要求（含 SSE/响应回报与前端警示）。
- `relay-config-push`: 新增「网关 8443 server 块按平台上限写入 `client_max_body_size`」要求（config-preview 同源）。

## Impact

- 后端：新增 `app/services/edge_env_limits.py`（解析/判定/文本级注入，纯函数可测）；`app/api/v1/cluster_edge_env.py`（读取响应 `limits` 字段、部署前注入 + SSE 说明）；`app/services/relay_init.py`（渲染 server 块）；`app/schemas/edge_env.py`（响应模型）。
- 前端：`views/EdgeEnv.vue`（警示条/状态条文案）、`api/edgeEnv.ts` + `types`（`limits` 字段）。
- 测试：新增 `tests/test_edge_env_limits.py`（含真实 edge.env 文本夹具：保留注释、只改一行）；`test_edge_env_diagnostics*.py`、`test_relay_init.py`（渲染断言更新）。
- 行为边界：不逐节点读取 edge.env 做发布前实时探测（代价高）；不动 Edge pack 本体；不落库 edge.env。
