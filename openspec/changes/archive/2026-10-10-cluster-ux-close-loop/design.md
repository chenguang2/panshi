# Design: cluster-ux-close-loop

## Context

评审基线 7cef5df8（上游 UX 变更合入后）。关键代码事实（已核实）：

- `ClusterList.vue` 删除编排的两个 `.catch` 降级分支 `onOk` 只调 `loadClusters()`，无删除调用；`CentralList.vue` 同流程失败不降级——两页各持一份编排实现，ClusterList 版带假成功缺陷。
- `POST /clusters/{id}/test` 为 EdgeClient `list_available_plugins()` 管理面探测（中继感知，白名单 403 透出「请执行配置下发」类文案），并按结果写 `node.status` 与 `status_detail`。
- `Cluster.current_version` 由 **edge.env 配置发布**推进（`cluster_edge_env.py` 经 `create_config_version(db, "edge_env", cluster_id, cluster_id, config_data, cluster)`，entity 即集群）；子资源发布（`publish_resource` 的 entity 是资源自身）不推进它。
- `/relay-gateways` 路由现成；CentralList 已支持 `editClusterId` query 深链（L1386）。
- UI 术语现状：空分组 = 未分组×3（筛选/组头/卡片 topbar）+ 未分类×1（表单）；启用态 = 运行中（卡片/详情）+ 正常（表单）。
- `useClusterUtils.ts` 已有 scope 风险提示（上轮新增），集群端点走通用兜底文案；`resourceLabels` 缺 `static_resources`。

## Decisions

- **D1 删除编排收敛共享单实现（P0 根治）**：新增 `deleteClusterWithConfirm(cluster)` 收敛进 `useClusterUtils.ts`（约定 #7：删除/发布弹窗单一实现地；#11 不拆文件），拉节点 + 拉统计 + 弹确认 + 执行删除全链单点；两页删除各自编排副本删除。**接口失败 MUST NOT 降级 onOk 语义**：确认弹窗照常弹出、清单区显示「资源统计加载失败，不影响删除」、确认后照常 `executeDeleteWithProgress`。统计失败时节点明细不可用：节点选择区显示「节点明细不可用，Edge 删除将由后端遍历全部活跃节点」，`nodeIds` 传空数组（已核实后端 `DELETE /clusters/{id}` 本就全量遍历，前端明细仅影响逐节点进度日志粒度）；CentralList 收敛后失败场景从「空清单确认」微变为「提示行确认」，无功能影响。集群场景在弹窗内追加专属警示行与集群专属 scope 文案（D3），`resourceLabels` 补 `static_resources` 中文标签。
- **D2 集群发布状态微标语义 = `Cluster.current_version`（集群级配置版本）**：显示「未发布」（灰，空）、「配置 vN」（绿，非空），tooltip 说明「集群配置（edge.env）版本；子资源发布不推进此版本」——语义以代码事实为界，不冒充子资源聚合状态；「子资源聚合待发布提示」列 Non-Goal。卡片 meta 与详情弹窗同一口径。实现上为**独立迷你徽章（两态），MUST NOT 复用 `PublishStatusTag`**（其四态 pending/partial 逻辑与集群语义不同，复用会互相牵连）。边缘口径已确认：子资源全部已发布但 edge.env 从未发布的集群显示「未发布」——与「导入新建集群即未发布」直觉吻合，tooltip 注明。
- **D3 术语规范两条**：空分组全站唯一「未分组」（表单选项与 `group_name=''` 语义不变，仅展示词）；集群启用态统一「已启用/已禁用」（`status` 是启用开关；节点健康才是运行态），CentralList 状态筛选项同步改「已启用/已禁用」并如实按 `cluster.status` 过滤。
- **D4 连接测试交互对齐真实机制**：引导文案「将对下列节点执行管理面连通性测试（集群挂接区域时自动经区域网关）」；总结行按失败数着色 + 失败提示行（含白名单 403 指引）；结果区明示「测试结果将更新节点的在线状态标记」（仅结果区静态提示，不额外 toast）；403 失败行提供「去下发网关配置」跳 `/relay-gateways`——识别按失败原因文本含「白名单」判定（后端零改动，结构化字段留待后续），且快捷动作**仅对具备 `relay_gateway` 权限的用户渲染**（与侧边栏菜单权限 keys 同源）；异常总结两页统一为「测试异常终止，耗时 Xs」。
- **D5 详情弹窗抽共享 `ClusterDetailModal.vue`**：两页消费同一组件（标题带集群名、基本信息含所属区域——无区域显示「直连」——与发布状态行、7 项统计、节点列表），消灭两份内联实现；与 #52 同治理逻辑，落地补机械化 source 守卫测试。字段若列表/详情响应未透传 `current_version`/`region_code` 则后端补透传（无模型变更）。
- **D6 routeBadge 抽 `useClusterRouteBadge()`**：两页逐字拷贝的计算逻辑收敛为 composable。渲染条件**精确为「中继可用 且 该集群已绑定区域」**才渲染徽章（经中继/直连二态）；中继关闭、区域数据不可用或集群未绑定区域时返回 null 不渲染（ClusterCard 已支持 null）——现行代码对未绑区域集群也显示「直连」（已核实 `!relayUsable || !c.region_code → 直连`），属噪音，一并移除。
- **D7 导入闭环**：`ClusterBackupDialog` 增 `imported` 事件（携新 `cluster_id`），CentralList 监听后刷新集群列表；结果区提供「前往新集群」按钮，跳 `/central-management?editClusterId=N`（CentralList 实际路由，深链参数现成）。
- **D8 健康节点格分级着色**：健康数 0 红、少于总数橙、全部健康默认色；tooltip「健康节点 / 节点总数」保留。
- **D9 打磨三项**：表单 dirty 保护（× / 取消经 `useOverlayModal` 确认「更改尚未保存，确定放弃？」，同上游表单既有模式）；名称禁用 hint「集群名称是固定标识，创建后不可修改；如需调整对外名称请修改『显示名称』」；区域下拉加载失败显示「区域列表加载失败，当前仅可直连」（不静默）。空状态两分支 CTA（从未创建→新建按钮；筛选空→清除筛选）；卡片 actions 两页统一「详情 / 连接测试 / 编辑 / 删除（危险色，最右）」，样式基准以 ClusterList 现状为准（「详情」btn-secondary 主按钮、其余 ghost），统一 CentralList；ClusterList PageHeader 补「备份下载」入口（`ClusterBackupDialog` 已共享，仅加入口）。

## 约定符合性

- 卡片网格全量页不引入分页（#54 合法例外白名单）。
- 所有新增确认/引导走 `useOverlayModal`/AppModal 体系，不新增 `Modal.confirm`（#25）。
- `deleteClusterWithConfirm`/`ClusterDetailModal`/`useClusterRouteBadge` 均为**消灭两页复制**（#7/#52 同向），不触犯 #11「会话读取原子单位」判据；`ClusterDetailModal` 与 `useClusterRouteBadge` 落地时补 `ClusterCard.source.test.ts` 同款机械化 source 守卫。
- 不复制卡片解剖样式（#52）；中文内联文案；时间沿用 `utils/format.ts`；不开模板层 any 清理专项（#27）。
- TDD（#16）；批次落地后删除/测试/导入链路验收必须在两页实机截图（#51②）；改动触及同域行为时回归 `pytest -k "cluster"` 与相关前端用例（#51④）。
