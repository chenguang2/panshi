# Design: relay-region-topology-view

设计全文以已批准蓝图为准：`docs/refactoring/relay-region-topology-blueprint.md`（含静态示例页 `relay-region-topology-mockup.html`，用户 2026-11-06 逐项拍板 D1=A / D2=A / D3=A / D4=批次1+2、D5 默认采用）。本文件只记录实现级裁决。

## Decisions

### D1 拓扑为默认视图，表格视图 = 现页面逐字不动

`RelayGateways.vue` 在第 2 部分（动作对照块）与第 3 部分（内容卡）之间加「拓扑视图 / 表格视图」分段切换工具行（local ref，不持久化）——两视图共用页头/说明卡/动作对照且逐字不动；表格视图 = 现有页面原样（唯一切换工具行为新增共享小行），保证现有 `RelayGateways.test.ts` 全部用例零改动通过。拓扑视图渲染时隐藏表格卡，反之亦然（2026-11-06 用户确认：拓扑视图仅替换第 3 部分，第 1/2 部分沿用现状）。

### D2 拓扑卡独立组件 `RelayTopologyCard.vue`

新组件 `frontend/src/components/RelayTopologyCard.vue`：props = `gateway`（RelayGateway）+ `topo`（拓扑明细：clusters + 节点 + whitelist_state）+ `health`（组件态体检结果，可为空）；emits = `edit-gateway` / `edit-legs(kind)` / `attach-cluster(clusterId?)` / `node-click(node)` / 动作区透传（test/push/init/sshd/…）。连线用 CSS 伪元素（无 SVG 库、无新依赖）；oklch 令牌与站内一致。视觉基准 = mockup.html。

### D3 whitelist_state 服务端单点派生

`GET /relay/topology` 在服务端按 `last_pushed_nodes` 快照派生每节点 `whitelist_state`（synced/pending_add/pending_remove/off，规则见蓝图 §6），前端不重复推导（防 #51 式多实现漂移）。快照为 NULL（从未成功下发）时 enabled 节点按 `pending_add`、disabled 按 `off`，前端白名单条显示「尚无成功下发记录」。

### D4 端点响应形状

```
{ regions: [ { id, code, name, status, http_base_url, ssh_jump, openresty_prefix,
               last_pushed_at,
               clusters: [ { id, name, display_name,
                             nodes: [ { ip, management_port, status, whitelist_state } ] } ] } ],
  detachable: [ { id, name, display_name, region_code } ],   // 全部集群（region_code 空或他区域），供「+挂接集群」下拉
  unregistered_bound_codes: [code] }                          // 集群挂了但无注册行的区域码
```

只读 select 聚合，无模型/列改动（不触发 #118 / #31 强制品）；router 级 `require_permission("relay_gateway")` + `_require_relay_feature` 零改动继承。

### D5 图内编辑复用现有弹窗体系

- 点网关机 → 现有 `openEdit(record)`（凭据按需加载/审计不变）。
- 点两腿标签 → `openEdit(record)` 后滚动聚焦「网关两腿连接」分组（`scrollIntoView` + 短暂高亮；给 form-section 加 ref）。
- 点集群卡 / `+挂接集群` → 新增视图级内联小弹窗（手写 modal-overlay，与既有新建/编辑弹窗同层；约定 #25）：区域下拉（detachable + 当前区域）/ 解挂按钮 / 「打开集群」链接；提交走 `PUT /clusters/{id}` `region_code`（空串=解挂），成功后刷新拓扑与路由快照（后端已有语义：cluster 更新即 `_refresh_routing`，前端只需重新拉列表+拓扑）。
- 点节点行 → `showOverlayModal` 信息弹窗（状态/白名单态/体检明细/「打开节点管理」按钮，跳 `/clusters/{id}/nodes`? 按现有路由跳集群节点页）。

### D6 测试影响面（已核）

- 既有 `RelayGateways.test.ts`：表格视图 DOM 不动 → 断言继承；新增拓扑视图用例放新文件 `RelayTopologyCard.test.ts` + RelayGateways 切换用例。
- 后端新文件 `tests/test_relay_topology_api.py`：权限 401/403、feature 关闸 404、直连区域、悬空码、whitelist_state 四态、快照 NULL。
- 安全采样：topology 为 GET 只读，仍按 #19 核对 UNAUTHENTICATED_SAMPLES 是否需补（router 级已有依赖，无需补采样，测试里钉住 401/403 即可）。

## Risks / Trade-offs

- 单页两套视图并存（表格 + 拓扑），数据源一致（同一 load() 结果 + topology 端点），刷新函数统一走 `load()` + `loadTopology()`。
- 拓扑卡在区域很多时纵向变长——可接受（运维页区域个位数）；表格视图兜底信息密度。
- 节点 popover 若未来升级为启停开关（批次3）， API 复用节点启停端点，本变更不做。
