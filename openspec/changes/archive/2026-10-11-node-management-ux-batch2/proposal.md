# Proposal: node-management-ux-batch2

## Why

节点管理 UX 评审（2026-10-11，18 项发现）批 1 已收口删除流/搜索口径/快修，本批处理 **M 级状态体系**问题：状态徽章语义混淆（未检测节点假绿「运行中」、已禁用误用危险红）、状态时效不可见（无刷新按钮、last_execution 从未展示）、两套假进度模型、确认弹窗三份手写违反弹窗三层制、详情弹窗统计归属不明、当前页假排序误导。

## What Changes

1. **P1-2 运行态三态互斥**：`nginxRunning()` 二值兜底（无 status_detail 回退 `status===1` 假绿）改三元 `nginxState()`（运行中/已停止/未检测），列表+详情徽章接入共享 `BadgeStatus` 三色；「已禁用」配置徽章中性灰化（不再危险红），与运行态徽章并排保留（spec 两维度承诺不变）；Tab 表单/批量导入「正常/禁用」→「启用/禁用」（措辞需求本已 mandate，代码回归合规）
2. **P1-3 状态时效可见**：`utils/format.ts` 新增 `formatRelativeTime` 单点（负差值钳为「刚刚」）；运行态徽章下方弱化文字展示「N 分钟前检测」（`status_detail.last_execution`）；**独立页与统一管理 Tab 均加「刷新」按钮**（Tab 走面板局部刷新，不经父级全量刷新；顺带删 Tab `onRefresh` 死代码）
3. **状态筛选三态化**：选项增「未检测」，过滤逻辑按运行态三元判定；顺带修正 spec 漂移（原文「status=1/0」与实现（nginxRunning 客户端过滤）不符）
4. **P2-7 移除假排序**：删除全部列的客户端 `sorter`（后端已全量数值 IP 排序；当前页 `localeCompare` 字符串序是错的）
5. **P2-9 确认弹窗收敛**：NodeList 动作确认（启动/停止/reload/取消安装）从手写 `confirmState` overlay 换 `showOverlayModal`（#25 三层制归位）；**`useOverlayModal` 新增 `okLoading`**（onOk 为 Promise 期间禁用确定钮 +「处理中…」，修复确认执行期无反馈/双击风险）
6. **P2-10 进度不确定态统一**：`NodeExecutionResultDrawer` 增加 indeterminate 形态（动画条+已耗时，无百分比；**收到首个服务端 percent 事件自动切换真实百分比**）；删除 NodeList elapsed/200s 钉 99% 与 Tab 每 2s +5 脉冲两套假模型；安装流真实百分比保持
7. **P2-6 详情归属标注**：集群统计卡片区块标注「集群级」归属；详情弹窗补管理开关（启用/禁用）展示，与列表双徽章对齐

## Impact

- **Specs**: `node-management`（MODIFIED 状态筛选、节点详情查看；ADDED 运行态三态展示与检测时效）、`node-action-progress-dialog`（MODIFIED 进度条语义）
- **Code**: NodeList.vue、ClusterNodes.vue、useClusterNodes.ts、NodeExecutionResultDrawer.vue、useOverlayModal.ts、utils/format.ts；零后端改动
- **Out of scope**: 「停止成功 → status=0」的后端语义修正（另立项；本批 design 已明示「已禁用+已停止」组合语义）、Tab onLine 结构化事件过滤（批 1 deviation，独立处理）、「✓ 状态」「ⓘ 详情」emoji 二批、状态筛选后端化（≤100 节点决策=已知边界）、删除真清理（方案 B 独立立项）
