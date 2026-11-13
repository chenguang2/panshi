# Tasks

## 批 1：后端参数透传 + ip-info 端点（无 UI 变化，API 可独立验收）

- [x] 1.1 TDD RED：`test_edge_client_relay_route.py` 新增 3 用例——① 歧义 IP + `cluster_id=1`（挂 active 区域）→ route=relay；② 歧义 IP + 不传 cluster_id → direct（既有回归钉，断言行为零变化）；③ `ip-info` 响应形状（clusters/relay_state/conflict_detail/nodes）与歧义明细断言
- [x] 1.2 `/edge-client` 全部按 ip:port 寻址端点签名加 `cluster_id: int = 0`，`EdgeClient(0, ...)` → `EdgeClient(cluster_id, ...)` 逐点透传（grep `EdgeClient(0` 列全清单，勿漏）
- [x] 1.3 新增 `GET /edge-client/ip-info?ip=`：直查 `ps_node`/`ps_cluster` 反查归属 + `relay_registry.route_for_ip`/`route_conflict_for_ip` 状态与冲突明细
- [x] 1.4 `tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补 `/edge-client/ip-info` 采样（#19）
- [x] 1.5 GREEN + 同域回归：`pytest -k "edge_client or relay" -q`（含既有用例零修改全绿 = 缺省行为零变化的实证）
- [x] 1.6 批 1 收口：后端全量 pytest 绿（本变更无 schema/迁移，PG 冒烟不触发）

## 批 2：前端接线与归属提示

- [x] 2.1 断言清单核对（#217）：EdgeClient 系列测试（EdgeClientUx/EdgeClientRouteLabel/EdgeClientSslPagination/manual-query 交互）中「选节点自动查询」的请求参数断言核对，新增 `cluster_id` 参数断言（无反转预期）
- [x] 2.2 TDD RED：选择集群+节点 → 查询请求携带 `cluster_id`；手动 ip:port 查询 → 调 `ip-info` 渲染提示条（归属/歧义文案）
- [x] 2.3 `EdgeClient.vue`：请求层透传 `selectedClusterId`（仅选择器模式）；手动模式查询前调 `ip-info` 渲染中性提示条（歧义文案「默认直连，可从集群下拉选择以经中继」；未登记 IP 静默）；路由标注复用既有 `routeLabel(route, r)`
- [x] 2.4 GREEN：批 2 用例全绿
- [x] 2.5 收口：前端全量 `npx vitest run --no-file-parallelism`（按 #58 协议处理漂移）+ `npx vue-tsc -b`
- [x] 2.6 用户验收路径：① 选集群+节点（歧义 IP，如 192.168.0.14）→ 查询显示「经中继」（当前恒直连）；② 手动输入同 IP → 提示条显示歧义明细；③ 未挂区域集群或未登记 IP → 行为与现状一致
