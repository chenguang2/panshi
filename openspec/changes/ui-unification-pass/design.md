## Context

前一轮改造（redesign-frontend-ui）已建立完整的组件体系（PageHeader、StatCard、TableCard、BadgeStatus、MethodTag、FilterChip）和设计 token 体系。遗留的 EdgeClient、ClusterList、ConfigDiff、Tools 等大文件尚未应用这些组件和样式，导致视觉风格不统一。

## Goals / Non-Goals

**Goals:**
- EdgeClient、ClusterList、ConfigDiff、Tools、cluster 子页面、EdgeImport 的视觉风格对齐已建立的 design system
- 全局 style.css 清理冗余的 Ant Design 覆盖

**Non-Goals:**
- 不改动任何业务逻辑、API 调用、路由、状态管理
- 不改动 ClusterList 的分组/展开/最大化交互
- 不改动 EdgeClient 的 Tab 结构和查询逻辑

## Decisions

### Decision 1：分层改造大文件

**选择**：EdgeClient（1617 行）和 ClusterList（1557 行）采用分层改造：
1. 先替换 header 和小组件（PageHeader、BadgeStatus）
2. 再改造卡片/网格容器样式
3. 最后清理冗余 CSS

### Decision 2：ClusterList 保留全部交互

**选择**：不对 ClusterList 的分组逻辑、展开/折叠、最大化视图做任何功能修改，只更新配色/字体/间距。

### Decision 3：style.css 渐进式清理

**选择**：只移除与新设计冲突或不再使用的 `!important` 覆盖，保留仍被使用的部分。如果某个覆盖不确定是否还在用，保留不动。

### Decision 4：ConfigDiff 保持 Drawer 结构

**选择**：不改为独立页面，不引入 PageHeader。只升级内部统计卡片和 diff 行样式。

## Risks / Trade-offs

- **[大文件风险]** EdgeClient（1617 行）修改可能引入回归 → 分层改造 + 每层测试验证
- **[style.css 清理]** 移除某些覆盖可能导致未注意到的组件样式改变 → 可疑覆盖优先保留
