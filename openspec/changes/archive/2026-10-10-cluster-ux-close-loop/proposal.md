# Proposal: cluster-ux-close-loop

## Why

集群管理模块 UX 评审（2026-10-09，基线 7cef5df8）发现一处 **P0 真实缺陷**与一组系统性体验问题：

1. **删除集群的降级弹窗「确认删除」后什么都没删（P0）**——`ClusterList.vue` 的 `deleteCluster` 在节点/统计接口失败时降级弹确认框，`onOk` 只刷新列表、无任何删除调用：用户走完「勾 scope → 确认 → 输名称」全程，集群原封不动，假成功。对照 `CentralList` 同流程失败时不降级照常删除——两页行为还不一致。最高危操作的假成功比无确认更危险。
2. **连接测试文案与真实探测机制脱节（两页同错）**——引导文案仍是「TCP 端口连接测试」，后端早已改为管理面探测（中继感知、白名单 403 提示）；测试还会回写节点在线状态（失败即标离线），UI 零告知。
3. **集群自身发布状态全链路不可见**——`Cluster.current_version` 字段存在（由 edge.env 配置发布推进），但卡片/详情/列表零表达；备份导入的「未发布集群」与已发布集群无法区分。
4. **术语与筛选语义漂移**——「未分类（表单）/未分组（筛选与卡片）」一值两名；「运行中（卡片）/正常（表单）」实为启用开关；CentralList 状态筛选「健康/离线」实际筛的是 `status===1`（启用），语义错误。
5. **删除确认在集群场景语义失真**——通用 scope 提示「Edge 节点将继续运行该资源」未传达真实后果：平台内该集群及全部资源记录被删，Edge 节点继续跑但**脱离平台管理**（孤儿节点）；资源清单「静态资源」还显示英文 key。
6. **备份导入最后一公里断了**——导入成功后列表不刷新、`cluster_id` 未利用（无「前往新集群」）。
7. 一致性问题：详情弹窗两页内容集不一致（7 项 vs 6 项统计、节点列表有无、都缺「所属区域」）；卡片 actions 顺序/样式两页不一致；routeBadge 计算逻辑两页逐字拷贝；健康节点数无分级着色；空状态无 CTA；备份入口只在统一管理页。

## What Changes

- **止血（P0）**：集群删除编排抽共享 `deleteClusterWithConfirm`（两页单实现），接口失败 MUST NOT 降级删除语义（清单区提示「资源统计加载失败，不影响删除」，确认后照常删除）；确认弹窗补集群专属警示行与集群专属 scope 风险文案；资源清单补「静态资源」中文标签。
- **连接测试**：引导文案对齐管理面探测语义（去「TCP」）；总结行按失败数着色并追加失败提示行；明示「测试结果将更新节点的在线状态标记」；白名单 403 失败行提供「去下发网关配置」快捷动作（跳 `/relay-gateways`）；异常总结文案两页统一。
- **状态可见**：卡片 meta 与详情补集群发布状态微标（`未发布`/`配置 vN`，语义 = `Cluster.current_version`，由 edge.env 配置发布推进）；健康节点统计格分级着色（0 红/不足橙/全健康默认）；路径徽章在中继关闭或数据缺失时不渲染（降噪）。
- **术语与筛选**：空分组全站统一「未分组」（消灭「未分类」）；集群启用状态统一「已启用/已禁用」（消灭「运行中/正常」）；CentralList 状态筛选改「已启用/已禁用」并如实筛 `status`。
- **流程闭环**：备份导入成功后父页刷新列表 + 结果区「前往新集群」深链（复用既有 `editClusterId` query）；区域绑定引导正文补「下发完成后回集群卡片执行连接测试」闭环句。
- **打磨**：详情弹窗抽共享 `ClusterDetailModal.vue`（两页统一：基本信息补「所属区域」「发布状态」行、7 项统计、节点列表、标题带集群名）；routeBadge 计算抽 `useClusterRouteBadge()` composable；表单误关保护 + 名称禁用 hint + 区域列表加载失败提示；空状态两分支 CTA；卡片 actions 四键两页统一；ClusterList 补「备份下载」入口。

## Capabilities

### Modified

- `cluster-list-page`：卡片信息（启用徽章/发布微标/健康分级/徽章降噪/actions 统一）、空状态两分支、未分组术语、详情弹窗统一（区域+发布状态+共享组件）、表单交互保护、删除流程失败不降级
- `cluster-delete-stats`：确认弹窗集群专属警示与 scope 文案、static_resources 中文标签、编排共享单实现与失败不降级
- `cluster-card-grid`：卡片状态与 actions 对齐、状态筛选语义修正（已启用/已禁用）、分组默认值改名「未分组」
- `cluster-json-backup`：ADDED 导入完成后的前端闭环（刷新 + 前往新集群）

### Added

- `cluster-test-connection`：连接测试交互语义（管理面文案、总结着色、状态回写告知、403 快捷动作、异常文案统一）

## Non-Goals（本轮不做）

- CentralList 加载时对每集群立即拉 nodes+upstreams 的请求放大（需实测评估懒加载与现有「展开即用」体验的权衡）
- 隐藏功能 affordance 提示（组头最大化点击、卡片拖拽排序）
- 「子资源聚合待发布」的集群级发布状态提示（涉及跨资源聚合查询；本轮微标语义钉死为集群级配置版本）
- 区域下发完成后跨页强闭环回跳（涉及跨页传参，本轮仅文案指引）
- >500 集群时列表静默截断的计数兜底（远期）

## Impact

- **前端（主体）**：`views/ClusterList.vue`、`views/CentralList.vue`、`components/ClusterCard.vue`、`components/ClusterFormModal.vue`、`components/ClusterBackupDialog.vue`；新增 `components/ClusterDetailModal.vue`、`composables/useClusterRouteBadge.ts`；`composables/useClusterUtils.ts` 增 `deleteClusterWithConfirm`
- **后端（仅当字段缺失时）**：核实集群列表/详情响应是否透传 `current_version` 与 `region_code`，缺则补透传（改动极小，无模型变更）
- **测试**：`ClusterListPage.test.ts`、`ClusterCard.source.test.ts`（新增 ClusterDetailModal 同款 source 守卫）、`ClusterFormModal.test.ts`、CentralList 相关用例、两页删除/测试/导入链路用例；`npx vue-tsc -b` + vitest 全量
- **验收纪律（约定 #51②）**：删除/测试/导入链路必须在用户实际操作的页面（ClusterList 与 CentralList 各自）实机截图核验——P0-1 正是「共享机制正确、页面接线出错」的典型
- **行为微变**：CentralList 删除编排收敛后，统计/节点接口失败场景从「空清单确认」变为「清单区提示行确认」，删除语义不变（已确认接受）
- **风险**：删除编排是最高危操作，共享抽取后两页回归必须完整；`ClusterDetailModal`/`useClusterRouteBadge` 抽取受 #52 同款守卫测试保护
