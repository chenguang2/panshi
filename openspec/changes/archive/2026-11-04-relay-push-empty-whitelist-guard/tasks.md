# Tasks

## 1. 后端（TDD：先写失败测试再实现）

- [x] 1.1 断言反转清单：grep 既有 push-config / init 相关用例与 `RelayGateways.test.ts` 弹窗断言，列出受 D6 文案与 body 参数影响的断言点（产出清单贴入本任务备注）

  清单结论：受影响并已反转——后端 `test_push_streams_events`（补 1 启用节点夹具）、前端「下发配置经确认后启动 push SSE 流」（REGIONS 补计数 + 新增弹窗文案断言）；不受影响——`test_busy_region_returns_409`（走 init）、`test_init_requires_openresty_prefix`（prefix 400 先于守卫）、`test_init_streams_events`/`test_init_trigger_is_audited`（init 无闸）、`test_security_guard.py:99`（匿名 401 先于业务守卫）。
- [x] 1.2 RED：新增/扩展后端用例——0 启用节点区域 push 未带 `allow_empty` → 409（detail 含「请先将节点状态改为「启用」」与挂接集群名及禁用节点数），带 `{"allow_empty": true}` → SSE 流启动；≥1 启用节点 → 不带也放行；init 对 0 节点区域不拦；`list_gateways` 回填 `enabled_node_count`/`total_node_count`（验证：`uv run pytest tests/test_relay_gateway_api.py -q` 新用例红，实测 3 红均为守卫缺失）
- [x] 1.3 GREEN：`RelayPushConfigRequest(allow_empty: bool = False)` schema；push-config 端点 `payload: RelayPushConfigRequest | None = None`，渲染后统计 `_region_nodes` 为 0 且未 allow_empty → `HTTPException(409, detail)`（detail 按 design.md D3 格式构造：点名挂接集群与禁用数 + 「请先将节点状态改为「启用」后重试，或确认空名单下发」）；`RelayGatewayOut` 加 `enabled_node_count:int`/`total_node_count:int`，`list_gateways` 单条 grouped 聚合回填（验证：新用例绿）
- [x] 1.4 既有用例回归：`uv run pytest -k "relay" -q` 全绿（实测 221 passed，含既有 push/init/sshd 用例，body 兼容零破坏）

## 2. 前端（TDD）

- [x] 2.1 RED：`RelayGateways.test.ts` 新用例——mock 列表 `enabled_node_count=0` → 点「下发配置」出现危险确认（文案含「清空」「403」与「将节点状态改为「启用」」）→ 确认后 SSE 请求体含 `{allow_empty: true}`；`enabled_node_count>0` → 弹窗显示「本次将下发 N 个启用节点（共 T 个节点；全量替换…）」且请求体不含 allow_empty（验证：实测 2 红，均为弹窗功能缺失）
- [x] 2.2 GREEN：`handlePush` 按 `record.enabled_node_count` 分支渲染确认弹窗（文案照抄 design.md D6：muted 行含「先到集群节点列表将节点状态改为「启用」，再重新下发」），N=0 分支 `okDanger: true`、`okText: '仍要下发（白名单为空）'`、`startExec(record, 'push', { allow_empty: true })`；api 模块 `RelayGateway` 类型补两个计数字段（验证：新用例绿）
- [x] 2.3 按 1.1 清单反转既有断言；`npx vitest run src/views/__tests__/RelayGateways.test.ts` 全绿（实测 26/26；另 `npx vue-tsc -b` 干净）

## 3. 收口验证

- [x] 3.1 后端全量：`cd backend && uv run pytest -q` 全绿（实测 2870 passed / 11 skipped / 0 failed；常驻开发服务未受影响）
- [x] 3.2 前端全量：`cd frontend && npx vitest run --no-file-parallelism` 全绿（首轮 UpstreamList 序号列用例单点红，隔离复跑 26/26 绿 + 全量串行复跑 184 文件/2539 用例全绿，定性为波动，与本次改动无依赖交集）
- [x] 3.3 手工链路验收（真实 UI）：真机 Playwright 实测——kjc（0 启用）弹危险确认（红「仍要下发（白名单为空）」+「将节点状态改为「启用」」两层提示，截图 /tmp/opencode/relay-push-danger-kjc.png）；bj（4 节点 3 启用）弹动态计数「本次将下发 3 个启用节点（共 4 个节点；全量替换…）」（截图 /tmp/opencode/relay-push-normal-bj.png）；另以真实后端 API 实测 kjc push-config → 409 detail 点名「「kjc」的 1 个节点均为禁用状态」
- [x] 3.4 `openspec validate --all` 0 error 后 commit（实测 validate 199 passed / 0 error，commit 83dbe617）
