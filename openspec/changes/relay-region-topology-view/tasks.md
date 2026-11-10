# Tasks: relay-region-topology-view

> 2026-11-09/10 修订：D3 改就地 popover、新增图内新建草稿卡 / 网关机阶段机 / 后端放宽与守卫（见 design.md D5–D8）。视觉/交互基准 = `docs/refactoring/relay-region-topology-mockup.html`（可点 demo，已批准）。

## 1. 批次一：后端（topology 端点 + Create 放宽 + 执行守卫）

- [x] 1.1 `GET /relay/topology`（TDD：先写 `tests/test_relay_topology_api.py` 失败用例——权限 401/403、feature 关闸 404、whitelist_state 四态、快照 NULL、直连区域、detachable、悬空码，再最小实现）
- [x] 1.2 `RelayGatewayCreate.ssh_user` 放宽为 Optional（TDD：仅 code+name 创建成功；`render_content` 空 `ansible_user` 行断言；既有「ssh_user 必填」用例反转——#217 先列清单）
- [x] 1.3 init / push-config 补 `ssh_jump`/`ssh_user` 缺失 400 守卫；sshd-setup 补 `ssh_jump` 缺失守卫（root 通道不消费 ssh_user）（TDD：各端点 × 缺失字段，断言文案与零副作用——流不启动）
- [x] 1.4 PG 方言冒烟（#103：创建/守卫触写路径，`TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`）

## 2. 批次二：只读拓扑视图 + 阶段机渲染

- [x] 2.1 `api/relay.ts` 增拓扑类型与 `fetchRelayTopology()`
- [x] 2.2 新组件 `RelayTopologyCard.vue`：链路卡渲染（平台/两腿/网关机框/分发边/集群卡/节点行/白名单徽章/体检徽章/直连形态/悬空提示/虚线挂接节点/卡头动作区），文案逐字采用蓝图 §4 + demo
- [x] 2.3 网关机阶段机（design D7 五态派生单点函数 + 四种框形态）+ 卡头副条（五步清单条 ↔ 白名单统计条切换）+ 「下发配置」按阶段禁用
- [x] 2.4 `RelayGateways.vue` 视图切换（拓扑默认 + 表格保留，既有表格 DOM 逐字不动）+ 新建虚线卡占位 + 直连/悬空提示卡
- [x] 2.5 组件测试：图元渲染、徽章派生、阶段形态派生、清单条切换、切换共存、动作区回调

## 3. 批次三：图内编辑与新建（就地 popover 体系）

- [x] 3.1 通用就地 popover 引擎（锚定定位避让视口 / Esc·点空白关闭 / 同点收起 / 即时校验（文案与后端逐字一致）/ 链式主按钮 chain / 保存前拉最新记录回填其余字段）
- [x] 3.2 两腿 chip popover：编辑态主按钮「保存并测试」+「仅保存」（走既有测试端点语义）；登记态「保存登记」；SSH 腿登记且区域无 ssh_user 时双字段顺带收集
- [x] 3.3 网关机节点 popover（SSH 账号/端口/前缀三字段；直接点框前缀不强制，初始化链内必填；口令与高级参数指向「更多 ▸ 编辑」弹窗）
- [x] 3.4 卡头名称 popover（就地改名）+ 状态徽章切换确认 popover（禁用提示回退直连）
- [x] 3.5 集群挂接/解挂 popover（区域下拉「不挂接（直连）」= 解挂 + 打开集群链接；`PUT /clusters/{id}` region_code）+ `+挂接集群` 入口（候选含当前区域归属）+ 跨卡同步
- [x] 3.6 节点行只读 popover（状态/白名单态/体检明细/打开节点管理）
- [x] 3.7 新建区域草稿卡（必填 code+name、即时校验含查重、POST 成功后原地生成直连形态区域卡并滚动到位；Esc/取消收起；视图切换保留开合态）
- [x] 3.8 初始化轻确认 popover + 链式「保存并初始化」（缺前缀时收集后自动开始，接既有 SSE 初始化流抽屉）
- [x] 3.9 保存/挂接/创建成功后两视图同源刷新（`load()` + `loadTopology()`；CentralList 无涉）+ 组件测试（各 popover 校验/提交/链式/刷新回调）
- [x] 3.10 B″ 分发边动作框（2026-11-10 第四轮拍板）：卡头收敛（移除下发配置按钮）+ 白名单待下发框（steady+漂移，emit push 接既有 handlePush 确认弹窗）+ 跳板转发框（体检证据 administratively prohibited 驱动，emit sshd 接既有 openSshdSetup）+ 完成即隐 + 组件测试

## 4. 收口

- [x] 4.1 后端域回归：`uv run pytest -k "relay"`（249 passed）；安全守卫回归（#19，topology GET 只读无需补采样，测试钉住 401/403）
- [x] 4.2 前端串行全量（#208 `npx vitest run --no-file-parallelism`，2614 passed）+ `npx vue-tsc -b`（0）
- [ ] 4.3 真链路验收（#51② 用户实际页面）：三旅程走查——①新建全旅程（草稿卡→登记两腿→初始化→挂接→下发）②武清直连登记 ③济南稳态就地编辑与「保存并测试」（orchestrator 已完成 Playwright 渲染冒烟：4 卡四形态/清单条/白名单条/禁用态/零 console 错误，2026-11-10 截图 /tmp/opencode/topology-smoke.png）
- [x] 4.4 openspec validate --all 收口（#53，203 passed / 0 failed）
