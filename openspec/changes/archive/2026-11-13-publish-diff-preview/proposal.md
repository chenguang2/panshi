# Proposal

## Why

资源发布后修改存盘，列表显示「待发布」，但用户无法知道待发布版本与 Edge 节点实况差在哪：唯一途径是到节点管理逐节点跑「数据库对比」，在全部节点的全量数据里人工找到该资源，还要逐节点核对（部分节点可能发布失败/落后）。已核实现有「漂移检测」回答不了此问题——它对比的是「上次发布快照 vs Edge」，待发布时基线还是旧内容，结论只会是「一致」。需要把这次对比收敛为待发布状态旁的一次点击。

## What Changes

- 新增只读端点 `GET /clusters/{cluster_id}/publish-preview/{resource_type}/{resource_id}`：以待发布候选载荷（当前平台数据经发布同源构造器转成 Edge 格式）为基线，逐活跃节点采集该资源实况并做字段级对比，返回逐节点差异矩阵数据；不写库、不改 Edge。
- 发布候选载荷构造从 publish 端点抽取为共享单点（上游/路由先行），publish 端点与预览端点同源调用，杜绝两套口径；并以源码守卫测试钉住。
- 上游与路由的「待发布」「发布未完全生效（partial）」两种状态旁新增小三角按钮（共享按钮组件），点击打开「发布差异预览」弹窗：头部结论条（能否直接发布 / 哪些节点落后于上次发布）+ 平台侧本次变更段（vs 上次发布版本，纯平台侧 diff）+ 逐节点差异矩阵（字段路径 × 待发布值 × 各节点当前值，差异格标红、缺失标「缺失」）+「显示一致字段」开关（默认只显差异）+ 重新检测 + 「去发布」捷径。
- 首批范围：上游、路由两类（独立页 + 统一管理 Tab 共 4 个入口）；机制按漂移检测同款类型注册表设计，其余 5 类资源后续分批接入。
- 集群级「发布预检」批量总览（演示页方案 C）不在本变更范围，留作后续独立立项。

## Capabilities

### New Capabilities

- `publish-diff-preview`: 发布差异预览域——待发布/部分失败资源与各 Edge 节点实况的逐节点字段级对比：候选载荷同源构造、逐节点采集与矩阵 diff、预览弹窗呈现（结论条/平台侧变更/差异矩阵/一致字段开关）、入口按钮状态范围与降级边界（节点不可达/基线缺失）。

### Modified Capabilities

<!-- 无：漂移检测（config-drift-detection）、数据库对比（config-diff）、发布徽标（publish-badges）的需求均不变；
本变更为新增对比方向（候选 vs 节点实况），复用其底层机器但不改其对外行为。 -->

## Impact

- 后端：`app/api/v1/cluster_publish_preview.py`（新，只读端点，router 级鉴权同 cluster_drift 先例）；`app/services/publish_preview.py`（新，候选载荷注册表 + 编排）；`app/api/v1/cluster_upstreams.py`、`cluster_routes.py`（发布载荷构造改调共享单点，行为零变化）；`app/api/v1/__init__.py`（挂新 router）。
- 复用不改：`drift_detection.py` 的 `diff_edge_payload`/`_parse_entries`/白名单/脱敏（对比语义单点）；`EdgeClient` HTTP 腿（中继感知自动继承）。
- 前端：`components/PublishDiffButton.vue`、`components/PublishPreviewModal.vue`（新）；`views/UpstreamList.vue`、`views/RouteList.vue`、`views/clusters/ClusterUpstreams.vue`、`views/clusters/ClusterRoutes.vue`（发布状态列接按钮）；`api/clusters.ts`（预览接口与类型）。
- 测试：后端预览端点/候选构造器单测 + publish 端点同源守卫（test_publish_response.py 同款源码模式）+ security guard 采样；前端组件测试。无模型/列变更，无 COLUMN_MIGRATIONS。
- 设计示例页（已确认的 UI 形态）：`docs/refactoring/publish-preview-mockup.html`。
