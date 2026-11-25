# Proposal

## Why

Edge 直连是「页面美化（proposal-c 控制台语言）」批次中尚未改版的调试工作台页：调试横幅用 antd `a-alert`、连接条为页面自制 `.edge-filter-bar`（form-input 控件、按钮无统一语言）、8 个资源 Tab 用 antd `a-tabs`（无条目计数、无控制台 tab 条形态）、表格无 `grid-table` 解剖、操作列为无图标 ghost 按钮。设计页 `docs/ui/Live-Artifact-5/proposal-c/edge-client.html` 已完成并经用户批准（2026-11-25），本轮按设计页实施。

## What Changes

- **页头统计徽标**：`PageStatBadges` 单枚「8 类资源」（accent，静态事实，与工具箱页同款）。
- **调试横幅**：antd `a-alert` → 自绘警示横幅（token 化：警示色底/描边 + 图标 + 粗体「调试模式」+ 可关闭 ×）；每张资源弹窗内的「调试模式」警示条保留（虚线描边变体，样式 token 对齐）。
- **连接条**：`.edge-filter-bar` → `l5-toolbar` 骨架（l5-card 内）：模式下拉 130（按集群选择/手动输入，交互保留）→ 集群 120 → 节点 220 → 查询（btn-primary，内联 svg 放大镜替换 antd 图标）/ 取消查询（tool-btn，禁用态保留）；右簇「已连接」绿点胶囊 + mono 地址 + IP 归属提示改虚线下划线弱化提示（`data-test="ip-hint"`、title 语义保留）。
- **资源卡 tab 条**：antd `a-tabs` → 自绘 tab 条（卡头行内 8 Tab，活动项 accent + 2px 底线，**每 Tab 带条目计数角标**——数据集实时计数）；tab 内容区改 `v-show` 切换（状态 `activeTab` 语义不变）。
- **表格 grid-table 解剖**：8 张资源表挂 `grid-table`；ID 列 mono 弱色 + title 全文；操作列改图标 op 族——JSON（代码括号图标）/ 编辑（sliders）/ 删除（trash 红）；tab 内工具条对齐（添加按钮去加号 #90 区块 CTA、搜索 240→150）。
- **弹窗**：结构不变（平台统一 modal 壳 #25）；JSON 查看 mono 11.5px + 最大高滚动对齐。
- **守卫接线**：`pageHeaderActions.source.test.ts` PAGES 加 `EdgeClient.vue ↔ edge-client.html` 对；`mockupParity.source.test.ts` 增 edge-client 段红线。
- **零行为变更**：连接/查询/取消状态机、8 类资源 CRUD、JSON 查看、IP 归属反查端点与歧义消解语义全部不动；后端零改动。

## Capabilities

### New Capabilities

- `edge-client-workbench`：Edge 直连页调试工作台的页面解剖契约——连接条与查询动作、调试模式警示、资源卡 tab 条与表格解剖、弹窗与 JSON 查看。

### Modified Capabilities

- `edge-direct-relay`：MODIFIED「IP 归属反查提示」——提示条视觉形态升级（虚线下划线弱化提示 + title 承载明细），端点/语义/不阻塞等既有契约原文保留。

## Impact

- `frontend/src/views/EdgeClient.vue`：模板（横幅/连接条/tab 条/8 张表格列与操作列）+ scoped 样式；`<script>` 仅新增 tab 计数与横幅关闭 ref，查询/CRUD 逻辑零改动。
- `frontend/src/views/__tests__/pageHeaderActions.source.test.ts`、`mockupParity.source.test.ts`：守卫接线。
- EdgeClient 相关既有测试：选择器随 tab 条/操作列改版按断言反转清单更新。
- 后端零改动；设计页 `proposal-c/edge-client.html` 为验收基准（#82 五步法），本轮零修改。
