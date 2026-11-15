# standalone-list-column-config · 设计

## 背景

`useColumnConfig` 已提供 popoverVisible / columnsSelected / searchVisible / columnWidths / columnOrder 全套状态与 localStorage 持久化，节点管理独立页与统一管理三张 Tab 都是它的消费方。上游、路由独立页只用了其中的宽度与顺序部分，弹窗那半边从来没接。

## 决策

### D1 复用节点管理的弹窗形态，不发明新交互

弹窗内容按节点管理的既有顺序排布（显示字段 → 搜索 → 拖宽提示 → 重置列宽），标题「选择显示列」、分区标题「显示字段」、按钮 `btn btn-primary btn-sm` 全部沿用，保证三处视觉与文案同源。上游/路由没有「行动作按钮集」这一节，因为这两页的操作列没有未勾选动作要收进「更多」菜单——发布与「⋯」菜单都是恒驻。

### D2 重置列宽只保留弹窗内一个入口

节点管理只有弹窗内一处；上游/路由原本工具条上的独立按钮在弹窗出现后成为重复入口，直接移除。测试随之改为从弹窗内容区取按钮。

### D3 序号列不进弹窗、恒展示

`upstream-list-page` 规格已写明序号列不进入列配置弹窗；同时实测发现 antd CheckboxGroup 在任一勾选变化时会把不在选项列表里的值从 `value` 中剔除，若只把 `#` 从选项里拿掉而不兜底渲染，序号列会在第一次勾选操作后静默消失（真实浏览器复现：取消「方法」后整列「#」消失）。故 `visibleColumns` 的过滤谓词显式保留 `index`，三张独立列表页同一处理。节点管理同步对齐（原先弹窗含 `#` 勾选项）。

### D4 重排/宽度走共享纯函数

两页原先各有一份 20 余行的「存储序重排 + 未知键补位」实现，改为 `resolveOrderedColumns(columns, columnOrder)`；显隐与宽度合并走 `applyColumnWidths`。这样后续任何顺序语义调整（如 route-column-reorder-fix 的槽位回填）对所有消费方一次性生效。

## 风险

- 工具条少一个「重置列宽」按钮：可发现性略降，但节点管理早已是这个形态，且弹窗是微调列的主路径。
- 老用户的 `*_standalone_cfg_*` 存储里可能缺 `index`（被 D3 的清理剔除）：兜底渲染使其无影响，无需迁移。

## 验证

- 单测：`RouteList.test.ts` / `UpstreamList.test.ts` 新增弹窗用例（显示字段勾选隐藏列并持久化、搜索开关、弹窗内重置列宽、序号列不在勾选项里）；`NodeList.test.ts` 的列选择用例改为断言序号列恒在。
- 真机：Playwright 1600×900 分别打开节点/上游/路由三页比对弹窗结构与颜色，并验证取消勾选「方法」→ 列消失 → 刷新仍隐藏 → 恢复勾选、关闭搜索框后输入框消失、重置列宽恢复默认档。
- 全量 `vitest run --maxWorkers=4` + `vue-tsc -b`。
