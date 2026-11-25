# Design

## Context

`EdgeClient.vue`（2446 行）：PageHeader → `a-alert` 调试横幅（closable）→ `.edge-filter-bar` 连接条（form-input 控件、antd 图标按钮、右侧「已连接: x」文本 + `data-test="ip-hint"` 提示）→ `a-tabs` 8 Tab（每 tab = `.table-toolbar` 添加按钮 + SearchInput 240 + `.table-container` a-table，操作列 JSON/编辑/删除 ghost 无图标）→ 资源弹窗（modal 壳 + `.debug-note`）+ JSON 查看。列定义集中在 `utils/edgeColumns.ts`（8 组，不动——宽度仅是 antd 提示值，grid-table 下由表格自身布局）。既有契约：`data-test="ip-hint"`、`activeTab` 状态、`ec-empty-guide` 空态、`debug-note`。设计基准 `proposal-c/edge-client.html` 已批准。

## Goals / Non-Goals

**Goals:**

- 页面渲染与设计页 1600×1000 逐元素一致（#82 五步法）。
- 查询/CRUD/JSON/IP 反查状态机与既有 `data-test`/`activeTab` 契约零破坏。

**Non-Goals:**

- 不改 8 类资源的增删改查行为、`utils/edgeColumns.ts` 列定义、后端零改动。
- 不动设计页。

## Decisions

1. **a-tabs → 自绘 tab 条 + v-show**：tab 条为卡头行内按钮（活动 accent 底线 + 条目计数角标——计数取各资源 `rows.length`，实时反映已加载数据集）；每个 `a-tab-pane` 改 `<div v-show="activeTab === key">`，`activeTab` 状态与切换语义不变。备选「保留 a-tabs 只调样式」被否：antd tabs 结构带多余包装且无法承载计数角标与卡头行形态。
2. **调试横幅自绘**：`dismissed` ref 控制可关闭；警示 token（warning 色底/描边）。弹窗内 `.debug-note` 样式 token 对齐（虚线描边变体），文案不动。
3. **连接条迁移**：`.edge-filter-bar` → `l5-card` + `l5-toolbar`；form-input → `l5-select`（130/120/220 口径）；antd 图标（SearchOutlined/CloseCircleOutlined）→ 内联 svg（tools 轮同款路线）；「已连接」文本 → `pill-run` 胶囊 + mono 地址；ip-hint 加虚线下划线弱化类（`data-test` 保留）。
4. **表格**：8 张 a-table 加 `grid-table` 类 + `:table-layout="'fixed'"`（无 scroll.x——各表列宽和 ≤ 容器，r6 口径允许；无 fixed 列）；ID 列 cell 加 `c-mono c-dim` + title 全文；操作列 ghost → `op-btn` 图标（代码括号/sliders/trash 红）；插件列表 Tab 无操作列（现状即如此）。
5. **tab 工具条**：`.table-toolbar` → `ec-tabbar`（padding 10px 16px）；添加按钮去 `PlusOutlined`（#90 区块 CTA 去加号）；SearchInput 240 → 150（#85⑥）。
6. **守卫接线**：PAGES 加 `['EdgeClient.vue', 'edge-client.html']`；mockupParity edge-client 段三条红线——资源表必须挂 `grid-table`、必须含 `ec-tabs` tab 条（禁 `a-tabs` 回流）、必须含 `ec-warn` 调试横幅（禁 a-alert 调试横幅回流）+ `PageStatBadges`。

## Risks / Trade-offs

- [8 个 a-tab-pane 手工改 v-show 漏配] → 用键名一一对应的机械替换（8 处 `v-show="activeTab === '<原 key>'"`），测试断言各 tab 内容可达性（既有用例若依赖 a-tabs 渲染需反转）。
- [PAGES 加对后页头动作断言] → 设计页页头无动作、实现亦无——通过；徽标先红后绿。
- [tab 计数在未查询时为 0] → 角标显示 0 属实态（设计页展示已连接态计数），符合「实时反映已加载数据集」契约。

## Migration Plan

单页面前端改动，一次提交，无迁移；回滚 = revert。

## Open Questions

（无）
