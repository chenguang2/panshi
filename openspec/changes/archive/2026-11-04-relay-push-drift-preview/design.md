# Design: relay-push-drift-preview

## D1 快照来源：持久化平台侧，不回读网关机

「本次将移除谁」需要两个集合：当前启用节点（平台侧即得）与**网关机现行白名单**。后者无回读端点，实时读取意味着确认弹窗内做一次 ansible/SSH cat（秒级到数十秒真实 IO），不可接受。改为**持久化快照**：`relay_gateways` 加 `last_pushed_nodes`（TEXT，JSON 数组，元素 `ip:management_port`）与 `last_pushed_at`（DateTime 可空）。快照语义 = **平台最后一次成功下发的白名单内容**，不等于网关实况——人工手改网关文件的窗口不覆盖；该局限在弹窗与文档中如实标注（advisory 定位）。

写入时机（D2）覆盖三个入口：push-config 成功、init 成功（init 同样写白名单脚手架）、`allow_empty=true` 的 push 成功（如实写 `[]`）。**sshd-setup 不写**（不触 map）。

## D2 写入链路：终态回调 + 生成器体内写入（#33 合规）

- `ansible_service._stream_ansible_events` 已在 `_run()` 内拿到终态 `{"rc","status"}`——增加可选参数 `on_result: Callable[[dict], Awaitable[None]] | None = None`，在生成器**体**内、终态事件 yield 之后调用（默认 None：init/push/sshd/节点安装全部既有消费方零影响，调用点普查后逐个核对）。
- `stream_push_region` / `stream_init_region` 增加 `on_success` 参数，内部经 `_forward` 仅在终态成功（`rc==0 且 status!="failed"`，天然继承空匹配假成功守卫 #187）时回调。
- **实现细化（与初案差异）**：快照写入不做后台任务——由端点闭包（持有请求 `db` 会话与 gateway 对象）在生成器体内、终态之后执行 `setattr + commit`。依据：`get_db` 依赖会话在响应（含流式体）完成后才 teardown，终态时刻会话仍存活；流前已 commit（#29），事务仅在终态后短暂开启，不违背「长 IO 期间不持写锁」；写库不进 `finally`（#33），且避免 TestClient 下 request 级事件循环关闭杀掉 pending 后台任务的不确定性（测试完全确定性）。客户端断连 → 生成器被取消 → 回调不执行 → 快照停留旧值（advisory 定位，见下）。sshd 流不传 `on_success`，结构上不可能写快照。
- 断连窗口（明示接受）：客户端中途断开 → 快照停留旧值；下次弹窗可能显示陈旧 diff，advisory 定位下可接受，再次成功下发即自愈。
- 并发安全：同一区域并发已被 `_INFLIGHT` 409 挡住（既有）；写入复用请求会话，不新增并发面。

## D3 漂移计算：列表端点一次查询派生

`_region_node_counts` 改造为同时返回**启用节点行分组**（`dict[code, list["ip:port"]]`），计数从行派生（同一查询，不多打一次库）；每个 gateway 行：快照为 NULL → `push_drift=None`；否则与快照集合做差 → `push_drift={"added": [...], "removed": [...]}`（按 ip 排序，稳定输出）。`RelayGatewayOut` 增加可选字段 `push_drift`、`last_pushed_at`（模式同 `inventory_group_missing`/`*_node_count` 端点计算注入，非库列）。无新增路由 → security_guard 采样不变。

## D4 弹窗文案（精确终稿，全部内联中文）

正常路径（N>0）确认弹窗，在计数行「本次将下发 N 个启用节点（共 T 个节点；全量替换，未启用的节点将从白名单移除）。」之下：

1. **removed > 0**（琥珀警示行）：「与上次成功下发（{formatDateTime(last_pushed_at)}）相比，本次将移除 {r} 个节点：{removed 列表，≤10 个全列、逗号+空格分隔；>10 个列前 10 个 + 「等共 N 个」}。」
   okText 变体：「开始下发（将移除 {r} 个节点）」。
2. **removed == 0 且 added > 0**（muted 灰字）：「较上次成功下发将新增 {a} 个节点：{列表规则同上}。」okText 不变（「开始下发」）。
3. **无快照**（muted）：「该区域尚无成功下发记录，本次为首次写入白名单。」
4. **一致**（added=removed=0）：不加行，维持现状。

0 启用节点危险确认路径**不变**（`relay-push-empty-whitelist-guard` 已立）；其 muted 修复指引行保持原样。样式沿用弹窗既有 muted/警示文字层级（视图级内联弹窗手写样式，约定 #25），不引入新组件。

## D5 schema 演进与方言

- `COLUMN_MIGRATIONS` 补两条（`("relay_gateways","last_pushed_nodes","TEXT")`、`("relay_gateways","last_pushed_at","DATETIME")`）——**漏条目即 lifespan 触及该列时 `no such column` 启动崩溃循环（#118）**。
- 写入显式 `json.dumps`（TEXT-JSON，#48）；读取 `json.loads` 包 try/except，坏值回退 None（诚实「无快照」态）。
- `datetime.utcnow` naive 存储（#26）；`last_pushed_at` 前端经 `formatDateTime` 展示。
- **PG 冒烟必跑**（#103：schema/写库路径变更）。

## D6 范围裁剪

- 「查看配置」预览不显示 diff（文件态无时间轴）；init 确认弹窗不加漂移行（装机态快照自然随成功更新）。
- 不做逐节点下发历史/审计时间线（快照只保最后一帧）。
- 不做网关机实况核对（如需真值，走既有「查看配置」+链路体检兜底）。

## 测试策略（TDD，#16）

1. 后端 RED：`test_relay_gateway_api` 新增——push 成功写快照（两列值断言）/ 失败不写 / init 成功写 / `allow_empty` 写 `[]` / 列表回填 `push_drift`（added/removed/null 三态）/ `_stream_ansible_events` on_result 仅终态触发一次。patch `_run_ansible_stream` 注入假流（#248）。mock 数据形状取自真实响应（#43）。
2. 前端 RED：`RelayGateways.test.ts` 新增——四形态文案断言（vnodeText 提取）+ okText 变体 + >10 截断「等共 N 个」+ 无快照行；既有 push 用例夹具补 `push_drift` 字段形状（#217 断言反转清单先行）。
3. 收口：`pytest -k relay` 域回归 + PG 冒烟 + 前端全量串行（#208）+ `vue-tsc -b` + ESLint；真机验收（bj 现有活数据：4 节点 3 启用，快照为空 → 首次下发记录后即可看 diff 形态）。
