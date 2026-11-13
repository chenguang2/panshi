# Design

## Context

既有机器（全部复用不改）：漂移检测 `drift_detection.py` 提供 `diff_edge_payload`（基线驱动字段级递归 diff）、`_parse_entries`（Edge 列表抓形解析）、`BASE_WHITELIST`（自管理字段剔除）、`DRIFT_TYPE_REGISTRY`（7 类型的 edge_key/mask/normalize）、`_collect_edge_lists_for_node`（单节点全类型采集，to_thread 内执行，事件循环纯度 #190）；`EdgeClient.convert_upstream_to_edge_format` / `convert_route_to_edge_format` 是发布载荷转换器。publish 端点的载荷构造目前内联在 `cluster_upstreams.py:294-314` 与 `cluster_routes.py:391-427`（路由需要 RoutePlugin 子表查询 + upstream_edge_uuid 反查）。前端 `ClusterDriftDrawer.vue`（AppModal 760px、chips + 分组 + 展开差异表）是同族 UI 先例；`PublishStatusTag` 是 15 处消费的纯展示组件（#217：不动其本体）。

关键差异（相对漂移检测）：漂移的「全节点同路径同值差异 → 判 Edge 确定性展开、过滤不报」**不适用于预览**——正常待发布状态下所有节点都呈相同差异（都是旧值），按漂移的均匀性过滤会把真实待发布差异全部滤掉。预览不做均匀性过滤，逐节点如实上报；「落后节点」判定改为：某路径上其余节点与候选一致、而该节点不同 → 该节点落后。

## Goals / Non-Goals

**Goals:**
- 预览与发布同源：一套候选载荷构造，publish 端点与预览共用，源码守卫钉住
- 单资源预览开销最小化：每节点仅采集目标类型 1 次 Edge 列表请求（复用采集函数加类型过滤参数，不复制第二套采集）
- 四入口一致接入（共享按钮组件 + 共享预览弹窗组件）

**Non-Goals:**
- 不改漂移检测、数据库对比、PublishStatusTag 的任何对外行为
- 不做集群级批量预检（方案 C，后续独立立项）
- 首批不接插件组/全局规则/SSL/流代理/DNS（注册表已留位，后续注册即接入）
- 不新增权限键（GET 只读，clusters 容器权限 + router 级鉴权同 cluster_drift 先例）

## Decisions

**D1 候选载荷构造单点放 `services/publish_preview.py` 注册表，不放 EdgeClient。**
注册表条目：`{label, model, edge_attr, edge_key, mask, normalize, build_candidate(db, row) -> (config_data, edge_data)}`。build_candidate 内含子表查询（上游 targets、路由 plugins/upstream 反查），签名收 `db` 会话。前四项直接引用 `DRIFT_TYPE_REGISTRY` 对应条目（单一事实源，不复制）；仅 build_candidate 是本变更新增。发布端点改为：`config_data, edge_data = await PUBLISH_PREVIEW_REGISTRY["upstream"].build_candidate(db, upstream)`——注意上游 publish 端点构造 config_data 与 edge_data 正是两段内联代码的全部内容，行为零变化（既有 publish 响应测试回归兜底）。

**D2 预览端点 `GET /clusters/{cluster_id}/publish-preview/{resource_type}/{resource_id}`，单文件 `cluster_publish_preview.py`。**
router 级 `Depends(get_current_user)` 同 cluster_drift；404 语义：集群/资源不存在；400：resource_type 不在注册表（明示「尚未接入」）。响应形状：
```json
{
  "cluster_id": 1, "resource_type": "upstream", "resource_id": 5, "name": "user-service",
  "checked_at": "...", "has_baseline": true,
  "platform_change": {"added": [...], "changed": [...], "removed": [...], "baseline_missing_reason": null},
  "nodes": [
    {"label": "192.168.0.13", "status": "ok|diff|missing|unreachable",
     "reason": null, "diff": {"changed": [{"path","baseline","edge"}], "added": {path: value}, "missing_paths": [...]}}
  ],
  "summary": {"diff_count": 3, "same_count": 6, "behind_nodes": ["192.168.0.15"]}
}
```

**D3 diff 方向与新增「added」类别。**
候选为基线调 `diff_edge_payload(candidate, edge_entry)`：`changed`（两侧都有不等）、`removed`（候选字段节点缺失 → 语义为「发布将新增」，响应层转译为 `added`）；Edge 独有字段沿用「不报」。矩阵行集 = 各节点 changed ∪ added 路径的并集；某路径该节点与候选一致时该格显示节点当前值（弱色）。

**D4 「落后节点」判定在响应层聚合。**
`behind_nodes` = 在任一「部分节点一致」路径上呈差异的节点 + 资源整体缺失节点；全节点同差的路径（正常待发布态）不计落后。结论条文案模板：全节点同差 →「所有节点均未包含本次变更（正常待发布）」；有 behind → 追加「节点 X 落后于上次发布（…），直接发布即可覆盖」。

**D5 平台侧变更段 = 候选 vs 最新快照 edge_payload。**
读最新 ConfigVersion.edge_payload（同漂移的 snaps 遍历法），调 `diff_edge_payload(baseline, candidate)`。快照缺失/无载荷 → `has_baseline=false` + 中文降级原因（对齐漂移「旧版本」降级），矩阵不受影响。此段零网络请求。

**D6 采集复用 `_collect_edge_lists_for_node` 加 `only_edge_keys` 可选参数。**
单类型只发 1 次 Edge 请求/节点（原函数逐类型循环保留默认全量行为，漂移检测零变化）。节点循环沿用逐节点 to_thread 串行（集群 ≤3 节点，秒级；不引入并发复杂度）。

**D7 前端：`PublishDiffButton.vue` + `PublishPreviewModal.vue` 两个新共享组件。**
按钮不进 PublishStatusTag 本体（#217 避免 15 消费方全量反转）：list 的 publish_status cell 内、Tag 右侧渲染 `PublishDiffButton`，内部按 `pending===true || lastPublishStatus==='partial'` 自判显隐。弹窗自持拉取（props: open/clusterId/resourceType/resourceId/name；同 ClusterDriftDrawer 模式），AppModal 宽 900（矩阵 4 列+路径列需比漂移的 760 宽）；`show-consistent` 开关前端本地过滤（响应含全量，避免复检）。footer「去发布」emit 给页面，由页面走既有 `openPublishModal`/`executePublish` 共享流程（#7），预览弹窗不碰发布编排。
四个入口（UpstreamList/ClusterUpstreams/RouteList/ClusterRoutes）的 publish_status cell 各加一行按钮 + 弹窗挂载；验收必须在真实页面逐一核对（#51：多渲染路径，组件断言不能替代）。

**D8 测试与守卫。**
- 后端：候选构造器单测（上游含 targets、路由含 plugins/vars 边界）；端点测试 patch `_collect_edge_lists_for_node` 注入 `_parse_entries()` 形态桩（#69：`_entry(id, value)` value 必填位置参数）；400/404/降级/behind 判定用例；源码守卫 `test_publish_candidate_single_source.py`（正则断言 publish 端点函数体调 build_candidate、无内联 convert_* 调用，模式同 test_publish_response.py）；security guard UNAUTHENTICATED_SAMPLES 补新端点采样（#19）。
- 前端：PublishDiffButton 显隐用例、PublishPreviewModal（loading/error/矩阵渲染/开关过滤/behind 结论条）组件测试。
- 无模型/列变更 → 不触 PG 方言冒烟触发条件（#31）；发布编排共享层未动（仅调用侧换构造来源）→ 发布/回滚既有测试全量回归。

## Risks / Trade-offs

- **候选构造抽取碰发布主链路**：最大的回归面。缓解：publish 端点行为零变化由既有发布测试（含 partial/版本快照断言）兜底 + 源码守卫防回退；实施时先抽取+跑发布域测试（`pytest -k "publish or upstream or route"`），预览端点后行。
- **旧快照无 edge_payload 时「落后判定」缺基线**：仅影响平台侧变更段降级，矩阵与 behind 判定（候选 vs 节点）不受影响——预览的主价值不依赖基线。
- **预览与发布之间有时窗**：预览结果仅是快照，用户看完后他人再改平台数据则预览过期；弹窗提供「重新检测」且发布确认流程独立存在，不做并发控制（与列表页既有语义一致）。
