# Design: relay-region-topology-view

设计全文以已批准蓝图为准：`docs/refactoring/relay-region-topology-blueprint.md`（D1=A / D2=A / D3=A / D4=批次1+2、D5 默认采用，2026-11-06 拍板）。**2026-11-09/10 三轮修订**（mockup 可点 demo 逐轮拍板，已获批准）：D3 修订为就地 popover 编辑、新增图内新建草稿卡、网关机阶段机与五步清单条、后端 Create.ssh_user 放宽 + 三端点执行守卫——视觉/交互基准 = `docs/refactoring/relay-region-topology-mockup.html`。本文件只记录实现级裁决。

## Decisions

### D1 拓扑为默认视图，表格视图 = 现页面逐字不动

`RelayGateways.vue` 在第 2 部分（动作对照块）与第 3 部分（内容卡）之间加「拓扑视图 / 表格视图」分段切换工具行（local ref，不持久化）——两视图共用页头/说明卡/动作对照且逐字不动；表格视图 = 现有页面原样（唯一切换工具行为新增共享小行），保证现有 `RelayGateways.test.ts` 全部用例零改动通过。拓扑视图渲染时隐藏表格卡，反之亦然（2026-11-06 用户确认：拓扑视图仅替换第 3 部分，第 1/2 部分沿用现状）。

### D2 拓扑卡独立组件 `RelayTopologyCard.vue`

新组件 `frontend/src/components/RelayTopologyCard.vue`：props = `gateway`（RelayGateway）+ `topo`（拓扑明细：clusters + 节点 + whitelist_state）+ `health`（组件态体检结果，可为空）；emits = `edit-gateway` / `edit-legs(kind)` / `attach-cluster(clusterId?)` / `node-click(node)` / 动作区透传（test/push/init/sshd/…）。连线用 CSS 伪元素（无 SVG 库、无新依赖）；oklch 令牌与站内一致。视觉基准 = mockup.html。

### D3 whitelist_state 服务端单点派生

`GET /relay/topology` 在服务端按 `last_pushed_nodes` 快照派生每节点 `whitelist_state`（synced/pending_add/pending_remove/off，规则见蓝图 §6），前端不重复推导（防 #51 式多实现漂移）。快照为 NULL（从未成功下发）时 enabled 节点按 `pending_add`、disabled 按 `off`，前端白名单条显示「尚无成功下发记录」。

### D4 端点响应形状

```
{ regions: [ { id, code, name, status, http_base_url, ssh_jump,
               ssh_user, ssh_port,            // 阶段机/连接摘要需要（口令永不回传）
               openresty_prefix,
               last_pushed_at,
               clusters: [ { id, name, display_name,
                             nodes: [ { ip, management_port, status, whitelist_state } ] } ] } ],
  detachable: [ { id, name, display_name, region_code } ],   // 全部集群（region_code 空或他区域），供「+挂接集群」下拉
  unregistered_bound_codes: [code] }                          // 集群挂了但无注册行的区域码
```

只读 select 聚合，无模型/列改动（不触发 #118 / #31 强制品）；router 级 `require_permission("relay_gateway")` + `_require_relay_feature` 零改动继承。

### D5 图内编辑 = 就地 popover 体系（2026-11-09 修订，替代原「弹窗+聚焦」案）

- **通用 popover 引擎**（组件内轻量实现，不引第三方库）：fixed 定位锚定图元（自动避让视口边缘）、Esc / 点击空白处关闭、同图元再点收起、输入即时校验（正则与错误文案与 `schemas/relay.py` 逐字一致：`HTTP_BASE_URL_PATTERN` / `SSH_JUMP_PATTERN` / 前缀与 code 文案）、**链式主按钮**（`chain` 回调：主按钮执行后接续动作，如「保存并初始化」→ 自动开始初始化）。
- **消费点 5 处**：两腿 chip（单字段；SSH 腿登记且区域无 `ssh_user` 时追加第二字段顺带收集——A 案：账号不在新建时要求）；网关机节点（SSH 账号/端口/前缀三字段，口令与高级参数指向「更多 ▸ 编辑」弹窗）；卡头名称；状态徽章（切换确认 popover，禁用提示「该局集群回退直连」）；集群挂接/解挂（区域下拉，「不挂接（直连）」= 解挂 + 打开集群链接）。
- **保存语义（防覆盖并发写）**：提交时先 GET 最新区域记录，把未在 popover 中编辑的字段用最新值回填，再走既有 `PUT /relay/gateways/{id}`（部分更新 schema 全 Optional）——与编辑弹窗同源，审计不变，零新增写路径。
- **校验分层与后端对齐**：直接点框编辑时前缀不强制（允许只改端口）；仅初始化链内前缀必填（对应后端 400 守卫语义）。
- 点节点行 → `showOverlayModal` 信息弹窗（状态/白名单态/体检明细/「打开节点管理」按钮，跳集群节点页）——维持原案。
- **删除原方案**：`openEdit(record)` + form-section `scrollIntoView` 聚焦不再实施（两腿/网关机/名称/状态全部就地化）。

### D6 图内新建区域 = 草稿卡（2026-11-09 拍板 A 案）

「+ 新建区域」卡与页头按钮 → 草稿卡**原地展开**（该卡本就独占一行，无布局位移）：必填仅 `code` + `name` 两项（对照 `RelayGatewayCreate`：两腿/前缀/口令/高级参数全 Optional，端口默认 22）；`ssh_user` **不在新建时收集**——移到登记 SSH 腿的 popover（信息在手时刻）。创建成功（`POST /relay/gateways`）后草稿卡原地变身直连形态区域卡（ghost + 灰腿 chip + 引导文案），并滚动到位、toast 指引下一步。区域码查重与格式错误就地展示后端同款文案。Esc/取消收起；视图切换往返保留开合状态。

### D7 网关机阶段机与五步清单条（2026-11-10 拍板，用户提案）

- **阶段派生**（单点函数，前端）：`steady`（`last_pushed_at != null`——init/push 成功均写该字段，relay.py `_record_snapshot`）/ `ready-init`（有 `ssh_jump` + 有 `ssh_user` 且未 steady）/ `init-blocked`（有腿缺账号）/ `legs-partial`（仅 HTTP 腿）/ `fresh`（两腿均空）；有 `ssh_jump` 即视为已过腿阶段（SSH-only 区域同样可走初始化）。
- **网关机框形态**：steady=实体卡（名称/连接摘要/前缀行，点开三字段 popover）；ready-init=虚线「待初始化」框（整框可点完善连接信息，前缀未填红字「点此填写」并聚焦；**[初始化网关] 按钮**）；init-blocked=缺账号变体（[补 SSH 账号] 按钮）；legs-partial/fresh=未配置直连形态。初始化成功后按钮消失，重新初始化走「更多 ▾」（写生产机的重操作，不在常驻面裸露）。
- **初始化轻确认**：幂等提示 + 前置清单（SSH 腿 ✓ / SSH 账号 ✓ / 前缀 ✓/缺）；缺前缀 → 链式「保存并初始化」（D5 chain 机制）一气呵成；真实实现走既有 SSE 初始化端点（`POST /gateways/{id}/init` 流式）。
- **五步清单条**：未完成区域的卡头副条显示「区域 ✓ · 两腿 ○ · 初始化 ○ · 挂接 ○ · 下发 ○ · 下一步：{指引}」；`steady` 且已下发后切换为白名单统计条（原案 #10 文案）。`下一步` 由阶段派生函数单点给出。
- **「下发配置」按钮**：无初始化实体（未 steady）时禁用 + title 提示「未配置网关机，无下发对象」；steady 后启用（空名单危险确认由既有下发流程承担）。

### D8 后端：Create.ssh_user 放宽 + 三端点执行前置守卫（2026-11-09 拍板 A 案）

- `RelayGatewayCreate.ssh_user`：`Field(..., min_length=1)` → `Optional[str]`（DB 列 `nullable=True` 零迁移；`RelayGatewayUpdate.ssh_user` 本就无 min_length）。渲染层 `_host_block` 空账号渲染空 `ansible_user` 行已容忍（gateways_inventory_service.py:46）；`_gateway_ip` 空 ssh_jump 时以 code 占位（docstring 明写「装机前占位」）。
- init（`/gateways/{id}/init`）与 push（`/gateways/{id}/push-config`）在既有 `openresty_prefix` 400 守卫（relay.py:280/326 同模式）旁增加 `ssh_jump` / `ssh_user` 缺失校验；sshd-setup（`/gateways/{id}/sshd-setup`）仅校验 `ssh_jump`（root 直连凭据由请求传入，不消费 `ssh_user`，清单组守卫已有）。400 文案引导回拓扑就地编辑。副作用零：守卫在流开始前抛出。
- 「清单缺组」判定（`gateway_hosts`）与 push_drift 快照语义不变。

### D9 测试影响面（已核）

- 既有 `RelayGateways.test.ts`：表格视图 DOM 不动 → 断言继承；新增拓扑视图用例放新文件 `RelayTopologyCard.test.ts` + RelayGateways 切换用例。
- 后端新文件 `tests/test_relay_topology_api.py`：权限 401/403、feature 关闸 404、直连区域、悬空码、whitelist_state 四态、快照 NULL。
- D8 守卫测试：扩进既有 relay 域测试文件（空账号创建成功、三端点前置缺失 400、引导文案断言）；`render_content` 空账号行断言。
- 安全采样：topology 为 GET 只读，仍按 #19 核对 UNAUTHENTICATED_SAMPLES 是否需补（router 级已有依赖，无需补采样，测试里钉住 401/403 即可）。
- 挂接/解挂走既有 `PUT /clusters/{id}`：改共享行为语义前按 #217 先 grep 消费方断言清单（ClusterFormModal 侧区域保存已有用例），再全量收口。

## Risks / Trade-offs

- 单页两套视图并存（表格 + 拓扑），数据源一致（同一 load() 结果 + topology 端点），刷新函数统一走 `load()` + `loadTopology()`。
- 拓扑卡在区域很多时纵向变长——可接受（运维页区域个位数）；表格视图兜底信息密度。
- 就地 popover 保存采用「拉最新记录回填其余字段」弱化并发覆盖风险，但不做乐观锁——与编辑弹窗同等语义（区域为运维低频配置，可接受）。
- Create.ssh_user 放宽后存在「SSH 腿登记前无法执行 SSH 类操作」的中间态——由 D8 三端点 400 守卫 + 阶段机引导承接（前端不可能走漏，API 直调有守卫兜底）。
- 节点 popover 若未来升级为启停开关（批次3）， API 复用节点启停端点，本变更不做。
