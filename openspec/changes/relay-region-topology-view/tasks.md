# Tasks: relay-region-topology-view

## 1. 批次一：拓扑端点 + 只读拓扑视图

- [ ] 1.1 后端 `GET /relay/topology`（TDD：先写 `tests/test_relay_topology_api.py` 失败用例——权限 401/403、feature 关闸 404、whitelist_state 四态、快照 NULL、直连区域、detachable、悬空码，再最小实现）
- [ ] 1.2 前端 `api/relay.ts` 增拓扑类型与 `fetchRelayTopology()`
- [ ] 1.3 新组件 `RelayTopologyCard.vue`：链路卡渲染（平台/两腿/网关机/分发边/集群卡/节点行/白名单徽章/体检徽章/直连形态/虚线挂接节点），文案逐字采用蓝图 §4
- [ ] 1.4 `RelayGateways.vue` 视图切换（拓扑默认 + 表格保留）+ 白名单同步条 + 直连/悬空提示卡 + 新建虚线卡 + 卡头动作区复用现有 handlers
- [ ] 1.5 组件测试：拓扑卡图元渲染、徽章派生、切换共存、动作区回调

## 2. 批次二：图内编辑

- [ ] 2.1 点网关机 → 现有「编辑区域」弹窗（复用 openEdit）
- [ ] 2.2 点两腿标签 → 同弹窗滚动聚焦「网关两腿连接」分组（form-section ref + scrollIntoView）
- [ ] 2.3 集群挂接/解挂内联弹窗（区域下拉 / 解挂 / 打开集群链接；`PUT /clusters/{id}` region_code，空串=解挂）+ `+挂接集群` 入口 + 组件测试
- [ ] 2.4 节点行只读详情（showOverlayModal：状态/白名单态/体检明细/打开节点管理）
- [ ] 2.5 挂接/解挂成功后刷新拓扑与列表（复用 load()）

## 3. 收口

- [ ] 3.1 后端域回归：`uv run pytest -k "relay"`；安全守卫回归
- [ ] 3.2 前端串行全量（#208 `npx vitest run --no-file-parallelism`）+ `npx vue-tsc -b`
- [ ] 3.3 真链路验收（dev 页面实测拓扑渲染/编辑/挂接，#51② 用户实际操作页面）
- [ ] 3.4 openspec validate --all 收口（#53）
