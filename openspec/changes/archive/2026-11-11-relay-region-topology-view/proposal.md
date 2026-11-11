# Proposal: relay-region-topology-view（中继区域管理拓扑视图）

## Why

用户诉求（2026-11-06）：中继区域管理比较复杂，希望加入一张图表示各方（平台/网关机/集群/节点/两腿）的关系，并能在图中添加、设置、编辑各字段的值，参考 MobaXterm 添加隧道界面。现状表格把链路压扁成两行文字，挂接集群、白名单同步态（未下发/待移除）、体检分段全靠文字与脑补。

完整蓝图与决策点：`docs/refactoring/relay-region-topology-blueprint.md`，配套静态示例页 `docs/refactoring/relay-region-topology-mockup.html`（待用户批准 D1–D5 决策点后再补 design.md / tasks.md / specs 并实施，约定 #240 文档先行）。

## What Changes

- **每区域一张「链路卡」**：`中控平台 →(HTTP 腿 / SSH 跳板)→ 网关机 →(8443 白名单 / sshd PermitOpen)→ 挂接集群 → 节点行`；节点行带白名单同步徽章（已同步 / 未下发 / 待移除 / 已停用）与体检明细；直连区域、悬空区域码（挂了 code 但无注册行）各有专属形态。
- **视图切换**：拓扑视图与现有表格视图并存切换（D1 已拍板：拓扑为默认）。
- **图内编辑 = 就地 popover（D3 2026-11-09/10 修订，demo 三轮拍板）**：点两腿标签 = 单字段 popover（「保存并测试」+「仅保存」，校验正则/错误文案与后端 schemas/relay.py 逐字一致）；点网关机 = 三字段就地 popover（SSH 账号/端口/OpenResty 前缀），口令与高级参数仍走「更多 ▸ 编辑」弹窗；点卡头名称/状态徽章 = 就地改名/启停切换（含后果确认）；点集群卡/`+挂接集群` = 挂接/解挂 popover（复用 `PUT /clusters/{id}` 的 `region_code`，选「不挂接（直连）」= 解挂）；点节点行 = 只读 popover + 跳节点管理。区域码不可就地编辑（集群引用它，防悬空挂接）。
- **图内新建区域（2026-11-09 拍板 A 案）**：「+ 新建区域」原地展开草稿卡，必填仅区域码 + 名称；SSH 账号在登记 SSH 腿的 popover 中顺带收集（信息在手时刻）；保存后原地生成直连形态区域卡——旅程（登记区域 → 登记两腿 → 初始化网关 → 挂接 → 下发）全程在图上完成，不进弹窗。
- **网关机阶段机（2026-11-10 拍板）**：网关机框三形态（未配置直连 → 待初始化〔+「初始化网关」按钮，整框可点完善连接信息；缺 SSH 账号变体〕→ 实体卡）；初始化走轻确认 popover，缺 OpenResty 前缀时链式「保存并初始化」；未完成区域卡头副条显示五步迷你清单（区域/两腿/初始化/挂接/下发 + 下一步指引），完成后切换为白名单统计条；「下发配置」按钮按阶段禁用。
- **后端：唯一新增只读端点 + 一处放宽三处守卫（2026-11-09 拍板 A 案）**：`GET /api/v1/relay/topology` 聚合端点同原案；`RelayGatewayCreate.ssh_user` 放宽为可选（DB 列本就 nullable=True，零迁移；清单渲染空 `ansible_user` 行已容忍）；初始化网关 / 下发配置 / 配置跳板转发三端点执行前补 `ssh_jump`/`ssh_user` 缺失 400 守卫（与既有 `openresty_prefix` 守卫同模式，relay.py:280/325/411）。
- **不触碰**：SSE 流程、_INFLIGHT、口令单查审计、清单缺组拦截、表格视图既有 DOM 与行为（现有测试零改动通过）。

## Capabilities

### New: relay-region-topology-view
中继区域关系的图形化呈现与图内编辑入口：链路卡渲染、白名单同步态可视化、视图切换、图元点击编辑（复用既有 API）。

## Impact

- 后端：`app/api/v1/relay.py` 新增只读 topology 端点（router 级权限/feature 闸零改动）+ `schemas/relay.py` Create.ssh_user 放宽 + init/push/sshd-setup 三端点前置守卫 + 测试（`tests/test_relay_topology_api.py` + 既有 relay 域测试扩充）。
- 前端：`RelayGateways.vue` 增拓扑视图与切换（既有表格区不动）+ 新组件 `RelayTopologyCard.vue`（含阶段机形态与五步清单条）+ 通用就地 popover 引擎 + 新建草稿卡 + `api/relay.ts` 增 topology 类型与请求函数。
- 决策点 D1–D5 见蓝图 §8（2026-11-06 拍板）；2026-11-09/10 三轮修订（D3→就地 popover + 图内新建 + 阶段机 + 后端放宽/守卫）见蓝图 §8 修订记录，视觉/交互基准 = `docs/refactoring/relay-region-topology-mockup.html`（可点 demo，已获用户批准）。
