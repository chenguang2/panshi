# Proposal: relay-region-topology-view（中继区域管理拓扑视图）

## Why

用户诉求（2026-11-06）：中继区域管理比较复杂，希望加入一张图表示各方（平台/网关机/集群/节点/两腿）的关系，并能在图中添加、设置、编辑各字段的值，参考 MobaXterm 添加隧道界面。现状表格把链路压扁成两行文字，挂接集群、白名单同步态（未下发/待移除）、体检分段全靠文字与脑补。

完整蓝图与决策点：`docs/refactoring/relay-region-topology-blueprint.md`，配套静态示例页 `docs/refactoring/relay-region-topology-mockup.html`（待用户批准 D1–D5 决策点后再补 design.md / tasks.md / specs 并实施，约定 #240 文档先行）。

## What Changes

- **每区域一张「链路卡」**：`中控平台 →(HTTP 腿 / SSH 跳板)→ 网关机 →(8443 白名单 / sshd PermitOpen)→ 挂接集群 → 节点行`；节点行带白名单同步徽章（已同步 / 未下发 / 待移除 / 已停用）与体检明细；直连区域、悬空区域码（挂了 code 但无注册行）各有专属形态。
- **视图切换**：拓扑视图与现有表格视图并存切换（D1 待拍板：推荐拓扑为默认）。
- **图内编辑复用现有弹窗体系**（D3 推荐案）：点网关机=现有「编辑区域」弹窗；点两腿标签=同弹窗滚动聚焦「网关两腿连接」分组；点集群卡=挂接/解挂小弹窗（复用 `PUT /clusters/{id}` 的 `region_code`，空串=解挂）；点节点行=只读 popover + 跳节点管理。零新增写路径。
- **后端唯一新增（只读）**：`GET /api/v1/relay/topology` 聚合区域+挂接集群+节点明细+服务端单点派生的 `whitelist_state`（synced/pending_add/pending_remove/off，与 list_gateways 的 push_drift 同一快照语义）。无模型/列改动。
- **不触碰**：SSE 流程、_INFLIGHT、口令单查审计、清单缺组拦截、表格视图既有 DOM 与行为（现有测试零改动通过）。

## Capabilities

### New: relay-region-topology-view
中继区域关系的图形化呈现与图内编辑入口：链路卡渲染、白名单同步态可视化、视图切换、图元点击编辑（复用既有 API）。

## Impact

- 后端：`app/api/v1/relay.py` 新增只读 topology 端点（router 级权限/feature 闸零改动）+ 测试 `tests/test_relay_topology_api.py`。
- 前端：`RelayGateways.vue` 增拓扑视图与切换（既有表格区不动）+ 组件测试；`api/relay.ts` 增 topology 类型与请求函数。
- 决策点 D1–D5 见蓝图 §8，推荐案：拓扑默认+表格切换 / 自绘链式组件（零依赖）/ 复用弹窗+聚焦 / 批次1+2、节点启停暂缓 / 单端点全量。
