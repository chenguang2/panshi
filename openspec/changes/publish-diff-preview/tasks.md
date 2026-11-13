# Tasks

## 1. 候选载荷构造单点抽取（发布主链路，先行回归）

- [ ] 1.1 RED：写源码守卫测试 `backend/tests/test_publish_candidate_single_source.py`（断言 cluster_upstreams/cluster_routes 的 publish 端点经注册表 build_candidate 构造载荷、无内联 convert_* 构造；模式同 test_publish_response.py），运行验证失败
- [ ] 1.2 GREEN：新建 `backend/app/services/publish_preview.py` 类型注册表（label/edge_attr/edge_key/mask/normalize 引用 DRIFT_TYPE_REGISTRY 单一事实源 + upstream/route 的 build_candidate(db, row)，含子表查询：上游 targets、路由 RoutePlugin/upstream_edge_uuid 反查）；两个 publish 端点改调共享构造，行为零变化
- [ ] 1.3 回归：`uv run pytest -k "publish or upstream or route"` 全绿（含 partial/版本快照/响应守卫既有断言）

## 2. 预览服务与只读端点（TDD）

- [ ] 2.1 RED：`backend/tests/test_publish_preview.py`——400 未接入类型 / 404 集群与资源不存在；patch `_collect_edge_lists_for_node` 注入 `_parse_entries()` 形态桩（`_entry(id, value)` value 位置参数，#69）覆盖：全节点同差（正常待发布）、部分节点落后（behind_nodes 点名）、节点资源整体缺失、单节点不可达隔离、has_baseline=false 平台侧变更段降级、platform_change 三类（changed/added/removed）、脱敏与自管理字段剔除
- [ ] 2.2 GREEN：`_collect_edge_lists_for_node` 加 only_edge_keys 可选参数（默认全量，漂移检测零变化）；`publish_preview.py` 编排：候选载荷 → 逐活跃节点 to_thread 采集（事件循环纯度 #190）→ 以候选为基线 `diff_edge_payload`（removed 转译 added）→ behind 聚合（部分节点一致路径上的差异节点 + 资源缺失节点；全节点同差不计落后）→ 平台侧变更段（候选 vs 最新快照 edge_payload，纯本地）
- [ ] 2.3 新建 `backend/app/api/v1/cluster_publish_preview.py`（`GET /clusters/{cluster_id}/publish-preview/{resource_type}/{resource_id}`，router 级 Depends(get_current_user) 同 cluster_drift 先例）+ `api/__init__.py` 挂载；`tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补新端点采样（#19）
- [ ] 2.4 全量 pytest 收口（conftest 隔离库，`uv run pytest`）

## 3. 前端组件与四入口接线（TDD）

- [ ] 3.1 RED：`PublishDiffButton.test.ts`（pending/partial 显示、未发布/已发布不显示）；`PublishPreviewModal.test.ts`（loading/error、矩阵渲染、显示一致字段开关过滤、结论条 behind 文案、去发布 emit、复检刷新）
- [ ] 3.2 GREEN：`api/clusters.ts` 补 `PublishPreviewResult` 类型与 `getPublishPreview`；新建 `components/PublishDiffButton.vue`（显隐自判 pending||partial）与 `components/PublishPreviewModal.vue`（AppModal 900、chips 计数、结论条、平台侧变更段、逐节点矩阵、一致字段开关、重新检测、去发布 emit）
- [ ] 3.3 四入口接线：`UpstreamList.vue` / `views/clusters/ClusterUpstreams.vue` / `RouteList.vue` / `views/clusters/ClusterRoutes.vue` 的 publish_status cell 加按钮 + 弹窗挂载；「去发布」emit 接页面既有 openPublishModal/executePublish 共享流程（#7），不复制发布编排
- [ ] 3.4 前端验证：`npx vue-tsc -b` 0 error；相关组件测试 `npx vitest run --maxWorkers=4` 全绿（波动按 #58 定性）

## 4. 真实页面验收（#51：多渲染路径必须真实页面核对）

- [ ] 4.1 复用常驻服务（12344/12345，勿自行启停），构造上游+路由的待发布与 partial 数据，四入口逐一点开预览弹窗核对：矩阵差异格、一致字段开关、结论条点名落后节点、去发布进入既有发布确认弹窗闭环；截图留档
- [ ] 4.2 对照设计示例页 `docs/refactoring/publish-preview-mockup.html` 逐段核对呈现一致性（用户已确认的 UI 形态）；直连与经中继各验一次采集通道

## 5. 收口

- [ ] 5.1 AGENTS.md 关键约定补一条：预览候选与发布载荷同源单点（publish_preview 注册表）+ 预览不做均匀性过滤、落后判定语义（防未来会话拿漂移检测的过滤逻辑套预览）
- [ ] 5.2 `openspec validate --all` 0 error；tasks 逐项打勾；git commit
