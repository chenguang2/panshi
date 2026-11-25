# Proposal

## Why

Edge 数据导入是「页面美化（proposal-c 控制台语言）」批次中尚未改版的向导页：步骤条用 antd `a-steps`、连接成功/失败与预览警告用 antd `a-alert`（连接成功的 8 类计数是一句话密排）、配置类型可选卡为页内旧样式（antd 图标）、导入结果弹窗硬编码 `#f6ffed/#52c41a` 等颜色。设计页 `docs/ui/Live-Artifact-5/proposal-c/edge-import.html` 已完成并经用户批准（2026-11-25），本轮按设计页实施。

## What Changes

- **向导步条**：antd `a-steps` → 自绘 token 步条（24px 数字圆点：完成 = accent 实心勾 / 活动 = accent 线框 / 待办 = muted；accent 贯穿线；`currentStep` 状态语义不变、步条不交互）。
- **Step 0 表单**：a-card → `l5-card` + 卡头；a-form 垂直布局 → 行式字段（右对齐标签 110px）；目标节点 a-select → 原生 select（ei-input 400）；Admin Key a-input-password → 原生 password 输入（300）；`testing-hint` 类保留。
- **连接反馈 token 化**：成功 a-alert → 绿横幅 + **8 类计数 mono chips 行**（原一句话密排升级）；失败 a-alert → danger 横幅；「（经中继）」路由标注不变。
- **Step 1 配置类型可选卡**：`.config-type-card` → `ei-types` 网格可选卡（✓ 角标 + 图标 + 名称；选中 accent 描边淡底）；antd 5 图标 → 内联 svg（近义映射 server/swap/blocks/shieldCheck/braces/columns/lock）。
- **Step 2 预览**：三种警告 a-alert → 统一 warn 横幅（获取失败/插件识别/冲突提示）；冲突详情卡 → l5-card + grid-table；导入项 section 卡 → `ei-sec`（checkbox + 计数标题 + 预览详情按钮 + 空数据单行降噪 + 展开 grid-table）。
- **导入结果弹窗 token 化**：`showImportResult` 硬编码色 → token 绿框计数明细 + 跳过分项 + 「继续导入/查看集群详情」链接（语义不变）；确认导入摘要 overlay 语义不变。
- **守卫接线**：`pageHeaderActions.source.test.ts` PAGES 加 `EdgeImport.vue ↔ edge-import.html` 对；`mockupParity.source.test.ts` 增 edge-import 段红线（禁 `a-steps`/`a-alert` 回流、必含 `ei-steps`/`ei-counts`/`ei-types`）。
- **零行为变更**：三步流转/连接测试/预览/勾选/导入执行/结果语义全部不动；后端零改动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `edge-data-import`：MODIFIED「连接测试」——连接反馈视觉契约（成功横幅 + 计数 chips / 失败横幅；探测并行/过程反馈/阻塞卸载等既有契约原文保留）；ADDED「向导页解剖」——步条/可选类型卡/section 卡/结果弹窗的页面解剖契约。

## Impact

- `frontend/src/views/EdgeImport.vue`：模板（步条/Step0 表单/Step1 可选卡/Step2 横幅与 section 卡）+ scoped 样式重写；`<script>` 仅图标映射与横幅关闭 ref，向导/导入逻辑零改动。
- `frontend/src/views/__tests__/pageHeaderActions.source.test.ts`、`mockupParity.source.test.ts`：守卫接线。
- `EdgeImport.test.ts` / `EdgeImportRouteLabel.test.ts`：选择器随原生控件切换按断言反转清单更新（`.a-select`/`.a-input-password`）。
- 后端零改动；设计页 `proposal-c/edge-import.html` 为验收基准，本轮零修改。
