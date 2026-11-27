# Design

## 裁决记录（2026-11-27，用户批准）

对比稿 `docs/ui/Live-Artifact-5/proposal-c/db-migration-hist-expand-variants.html`（同数据三变体并排 + 失败胶囊悬停演示）裁决：
- **采纳变体 2**：chevron 换装 + 整行可点 + 失败原因悬停——更方便（热区 15 倍）、更好看（全站 chevron 语言）、零解剖变化、实现三行级。
- **不采纳变体 3**（行内详情直达列）：1366 内容宽 1044 被 981 列宽 + 48 展开列吃满，加 ≥80px 列必出横向滚动；且备份路径（mono 约 50 字符）/失败原因放不进行内，仍需展开——双入口分散。对比稿退役删除，本节即留痕。

问题 1 同批裁决：历史表**维持静态列宽**、不接 `useColumnDragColumns`（无长内容列、低频视图、重开 r6 适配工程不值；连接表先例——设计稿 `resizable` 为语言标记非逐表需求），本变更对此零代码。

## 实现决策

- **D1 chevron 纯指示器**：自定义 `expandIcon` 渲染 `StrokeIcon chevronDown`（收起向下、展开 rotate 180° + accent 色），**不绑独立 click**。形态依据 `StrokeIcon` 既有 `chevronDown` 定义（ListPager 同族）。
- **D1a 展开切换走受控自管（实现裁决）**：展开/收起由受控 `:expanded-row-keys` + `customRow` 行点击自管——展开态单一来源（chevron 指示器与展开行同读一个 ref）、展开区（独立 `<tr>`、无 customRow）天然免疫行点击冒泡。排查记录（诚实留痕）：最初以「`.ant-table-expanded-row` 元素数」作探针，曾误判原生 `expandRowByClick`「首次切换后失效」；antd `ExpandedRow` 源码确认其**首次展开后常驻 DOM、收起态以内联 `display:none` 隐藏**（性能设计，非缺陷）——探针改用计算样式后四项行为（行点击展开/区内点击不收/再点收起/失败悬停）全部通过。受控自管仍优于原生路径（单一状态源 + 冒泡免疫），非缺陷规避。
- **D2 展开区点击隔离**：受控自管下展开区为独立行、无行点击监听，「复制/查看迁移详情」点击不影响展开态——由真机复核取证（Playwright：展开区内点击复制后展开态保持）。
- **D3 失败胶囊 title 复用转译**：`title` = `translateMigrationError(record.error_message)`（与展开区同一函数、同一结果），仅失败行渲染；成功行无 title。胶囊已有全站 title 惯例（连接表三态胶囊同形）。
- **D4 设计页修订**：正式稿历史表加 chevron 触发列（52px，antd 展开列位置在最左，colgroup 45+52+…，min-width 981+52=1033 ≤ 1366 内容宽 1044，零溢出保持）；失败胶囊补 `title` 注记；chevron 形态与 `.v-chevron` 交互（hover accent / 展开旋转）入样张。
- **D5 测试面**：源码红线（mockupParity mig 段）：`expand-row-by-click` 存在、自定义 `expandIcon` 存在、无 +/- 图标回流（`ant-table-row-expand-icon` 默认形态不可去除但换装后以 expandIcon 覆盖——红线钉 `expandIcon` prop 与 `expand-row-by-click`）；行为用例：失败胶囊 title 含转译原因、成功行无；展开区按钮点击后展开态保持（rc-table 冒泡探测）。

## 风险

- 受控展开键与 chevron 指示器同源于 `expandedKeys` ref——真机复核展开态与旋转联动（tasks 3.2）。
- aTableStub 不模拟行点击展开——行为测试改从「胶囊 title + 源码红线」取证，展开切换逻辑仍由 stub 图标按钮承载（既有用例不破坏）。
