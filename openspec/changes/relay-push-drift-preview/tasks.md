# Tasks: relay-push-drift-preview

## 1. 后端快照列与写入链路（D1/D2/D5，TDD）
- [x] 1.1 RED：`tests/test_relay_gateway_api.py` 新增——push 成功写快照（`last_pushed_nodes` JSON 与 `last_pushed_at` 断言）/ 终态失败不写 / init 成功写 / `allow_empty` 成功写 `[]` / sshd-setup 不写；patch `_run_ansible_stream` 注入假流（#248）；GREEN（模型两列 + `COLUMN_MIGRATIONS` 两条 #118 + `_stream_ansible_events` 可选 `on_result`（默认 None，普查既有调用点零影响 #217）+ 快照写入经端点闭包在生成器体内终态后执行（比 design 原案的后台任务更简：请求会话在依赖生命周期内存活、事务仅在终态后开启，#33 合规；sshd 不传 on_success 自然不写，"不写"由流构造保证）
- [x] 1.2 域回归：`pytest -k relay` 全绿（既有 SSE 用例随 on_result 语义核对）

## 2. 漂移计算与列表回填（D3，TDD）
- [x] 2.1 RED：列表回填断言——`push_drift` added/removed 差集（含排序稳定性）/ 无快照 null / 快照坏 JSON 回退 null / `last_pushed_at` 透出；GREEN（`_region_node_counts` 改造为行分组派生 + `RelayGatewayOut` 增 `push_drift`/`last_pushed_at`）
- [x] 2.2 PG 方言冒烟（#103）：`TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（11 passed，docker PG 15432）

## 3. 前端弹窗漂移提示（D4，TDD）
- [x] 3.1 断言反转清单先行（#217）：既有 2 个 push 弹窗用例（正常计数 `toContain` 断言 + 零启用危险确认）逐一核对——新增行均为增量、`toContain` 断言不受影响、请求体断言 `toEqual({})`/`{allow_empty:true}` 不变 → 零反转；`RelayGateway` 接口新增可选字段向后兼容
- [x] 3.2 RED：四形态文案断言（vnodeText）——removed>0 琥珀行 + 清单 ≤10 全列 / >10 截断「等」+ okText「开始下发（将移除 r 个节点）」/ 仅新增灰字 / 无快照「首次写入」/ 一致不加行；GREEN（`RelayGateways.vue` pushDriftLine/driftOkText + `api/relay.ts` 类型；时区断言按 #26 修正为 Asia/Shanghai 展示值）
- [x] 3.3 前端全量：`npx vitest run --no-file-parallelism`（#208）2544/2544 全绿 + `npx vue-tsc -b`（#27）0 + ESLint 0

## 4. 收口与实机验收
- [x] 4.1 后端域回归 `pytest -k relay` + 全量 `uv run pytest -q`
- [x] 4.2 实机验收（真实 UI）：①bj 首次弹「尚无成功下发记录」截图（relay-drift-first.png）→ 真实下发成功（快照=3 启用节点，白名单刷新为正确态）→ 二次弹窗一致；②禁用 192.168.0.14 → 琥珀警示「本次将移除 1 个节点：192.168.0.14:16620」+ okText「开始下发（将移除 1 个节点）」截图（relay-drift-warning.png → 手册 32-06）+ 取消后快照未变/drift 保留（后置断言）；③恢复节点 → 回到一致；全程零 console 错误（验收 harness 事故：取消误触确认一次真实下发——结果即白名单刷新为预期态，无副作用）
- [x] 4.3 手册第 32 章「网关操作」节补漂移提示说明（注意三点之三）+ 新增 32-06-relay-push-drift.png 截图
- [ ] 4.4 `openspec validate --all` 0 error 后 commit
