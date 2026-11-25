# Tasks

## 1. 守卫先行（RED）

- [x] 1.1 `pageHeaderActions.source.test.ts` PAGES 清单加 `['EdgeImport.vue', 'edge-import.html']`，运行确认：动作/徽标断言两侧一致通过（设计页无动作无徽标）
- [x] 1.2 `mockupParity.source.test.ts` 增 edge-import 段红线（禁 `a-steps` 回流 + 必含 `ei-steps`；禁 `a-alert` 回流 + 必含 `ei-ok`/`ei-counts`/`ei-warn`/`ei-types`），确认对现状 RED

## 2. 步条与 Step 0（GREEN-1）

- [x] 2.1 `a-steps` → 自绘 `ei-steps`（currentStep 驱动三态，非交互）；验证 1.2 steps 红线转绿
- [x] 2.2 Step 0：a-card → `l5-card` + 卡头；a-form → 行式字段（标签 110px 右对齐）；目标节点 a-select → 原生 select（ei-input 400，占位语义 #204）；Admin Key → 原生 password（300）；测试连接按钮保留
- [x] 2.3 连接反馈：成功 a-alert → `ei-ok` 绿横幅 + `ei-counts` 8 chips；失败 a-alert → `ei-fail`；`testing-hint` 保留；验证 1.2 a-alert 红线转绿

## 3. Step 1 / Step 2（GREEN-2）

- [x] 3.1 Step 1：`config-types` → `ei-types` 可选卡网格；antd 5 图标 → 内联 svg path 映射（server/swap/blocks/shieldCheck/braces/columns/lock）；icons import 清理
- [x] 3.2 Step 2：三种 a-alert → `ei-warn` 统一横幅；冲突详情 a-card → `l5-card` 卡头 + link-btn 展开收起 + grid-table；section-card → `ei-sec`（计数标题/空数据单行/展开 grid-table）；`.section-toolbar` → `ei-toolbar`
- [x] 3.3 `showImportResult` h() 硬编码色 → token 绿框 + 跳过分项 + 链接（语义逐行保留）

## 4. 回归收口

- [x] 4.1 `npx vue-tsc -b` 通过 + EdgeImport 两测试文件全绿（选择器反转：`.a-select`→ei-input 定位、`.a-input-password`→`input[type="password"]`）+ 全量 `npx vitest run --maxWorkers=4`（漂移按 #58 隔离定性）
- [x] 4.2 parity 五步法收口：双侧截图 + 步条/横幅/可选卡/section 逐元素量测（九维度），差异清单复核全 ✓，脚本与截图存档至本变更 verification/ 目录
