# Design

## Context

`EdgeImport.vue`（1097 行）：PageHeader → `a-steps` 3 步 → Step 0（a-card 选择源节点 + a-form 垂直布局：ClusterSelect 400 / a-select 节点 400 / a-input-password Admin Key 300 + 测试连接；a-alert 成功一句话密排 8 类计数 + a-alert 失败；step-actions）→ Step 1（config-types 可选卡 ×7，antd 5 图标）→ Step 2（3 种 a-alert 警告 + 冲突详情 a-card + section-toolbar 全选/全不选 + section-card ×7 + loading overlay + step-actions）。确认导入 = showOverlayModal 摘要句；结果 = showImportResult h() 硬编码 `#f6ffed/#52c41a` 绿框 + 链接。既有测试 12 例基线全绿（选择器：`.testing-hint`、文本按钮查找、`.a-select`/`.a-input-password`）。设计基准 `proposal-c/edge-import.html` 已批准。

## Goals / Non-Goals

**Goals:**

- 页面渲染与设计页 1600×1000 逐元素一致（#82 五步法）。
- 三步流转、连接测试、预览、勾选、导入执行与结果语义零破坏；`.testing-hint` 类契约保留。

**Non-Goals:**

- 不改连接/预览/导入行为与校验；不动 `sectionDefs` 列定义；后端零改动；不动设计页。

## Decisions

1. **a-steps → 自绘 `ei-steps`**：`currentStep` 驱动三态（done/active/pending）；步条非交互（spec 契约：步进仅经动作按钮）。备选「保留 a-steps 调样式」被否：antd steps 结构无法承载 token 圆点三态与贯穿线形态。
2. **Step 0 原生控件切换**：目标节点 a-select → 原生 `<select class="ei-input">`（v-model + :value option 绑定，`selectedNodeId` number 语义不变，占位 option value="" ↔ null #204）；Admin Key a-input-password → 原生 password input（放弃显隐切换——向导一次性凭据，设计页即此形态）。测试反转 `.a-select`→`.ei-input` 定位、`.a-input-password`→`input[type="password"]`。
3. **连接反馈**：成功 → `ei-ok` 绿横幅 + `ei-counts` 8 枚 mono chips（connectionResult 各 *_count 字段直取，route 经 `routeLabel` 不变）；失败 → `ei-fail` danger 横幅；`testing-hint` 保留。
4. **Step 1 可选卡**：`configTypes` 的 antd icon 组件 → 内联 svg path 字段（server/swap/blocks/shieldCheck/braces/columns/lock 近义映射），模板 `<svg viewBox="0 0 24 24" v-html="ct.svg">`。
5. **Step 2 统一 warn 横幅**：三种 a-alert → `ei-warn`（warn svg + 粗体标题 + 描述行）；冲突详情 a-card → `l5-card` 卡头（展开/收起 link-btn）+ grid-table；section-card → `ei-sec`（checkbox/计数标题/预览详情 btn/空数据单行；展开 a-table 加 grid-table）；`.section-toolbar` → `ei-toolbar`（全选/全不选保留 btn-link）。
6. **结果弹窗 token 化**：`showImportResult` 的 h() 样式 → oklch token（绿框计数明细 + 跳过分项 + 两链接），结构与语义逐行保留；确认导入摘要 overlay 不动（平台 overlay 语言）。
7. **守卫接线**：PAGES 加 `['EdgeImport.vue', 'edge-import.html']`（设计页无动作无徽标，两侧一致）；mockupParity edge-import 段红线——禁 `a-steps` 回流 + 必含 `ei-steps`、禁 `a-alert` 回流 + 必含 `ei-ok`/`ei-counts`/`ei-warn`/`ei-types`。

## Risks / Trade-offs

- [原生 select 的占位语义] → #204：占位 option `value=""` ↔ `selectedNodeId=null`；切换经 :value option 绑定保持 number。
- [a-input-password 失去显隐切换] → 向导一次性凭据可接受（设计页即此形态），登记为有意取舍。
- [v-html 渲染 svg 的信任边界] → 图标 path 为页面内静态常量（非用户输入），安全。

## Migration Plan

单页面前端改动，一次提交，无迁移；回滚 = revert。

## Open Questions

（无）
