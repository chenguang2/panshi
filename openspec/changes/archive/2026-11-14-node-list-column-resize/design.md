# Design

## Context

节点管理列表（`NodeList.vue`）10 列中仅 2 列有固定宽，表格无横向滚动；列个性化已有单点 `useColumnConfig`（storage key `node_standalone`，承载列显隐/搜索/动作勾选，`ColumnConfigPopover` 为其 UI）。a-table 4.x 无内置列宽拖拽。方案经用户裁决（2026-11-14）：B 横向滚动兜底 + A 拖拽调宽组合，行为契约见 specs/table-column-resize/spec.md。

## Goals / Non-Goals

**Goals:**

- 任意分辨率内容可看全（滚动兜底）；用户可逐列调宽且跨会话保持。
- 复用现有个性化单点，不新增第二套存储。

**Non-Goals:**

- 不做密度预设、行展开；不改集群 Tab 侧节点子表（复用另行立项）；不加表头排序（约定 #260 已裁决不做）。

## Decisions

**D1 兜底先行（B）**：`:scroll="{ x: 'max-content' }"` + `#`/IP `fixed: 'left'`、操作 `fixed: 'right'`。固定列需要列有确定宽——与 D3 默认宽度档天然配合。此步独立可交付，小屏立即改善。

**D2 拖拽实现 = 表头右缘手柄 + 文档级 mousemove（A）**：`#headerCell` 插槽渲染手柄（常显 2px 握把线——用户评审裁决方案 1 克制版：默认融入边框色保证可发现性，悬停加深为 accent），mousedown 记录起点与当前宽，document mousemove 实时写 `columns[i].width`（响应式），mouseup 结束并持久化；`tableLayout: 'fixed'` 保证列宽严格生效。备选「整表 colgroup 直改」被否：antd 内部渲染 colgroup，直改会被重渲染吞掉；备选第三方库（vue-resizable 等）被否：为单点交互加依赖不值。最小宽度 80px clamp（`#` 45 不参与）。

**D3 全列默认宽度档**：`#` 45（anatomy 标准）、IP 140、所属集群 140、服务端口/管理端口 100、Edge/OpenResty 安装路径 220、状态 120、Edge 版本 110、操作 320。≥1366px 视口下核心列无需横向滚动即可见。

**D4 持久化并入 useColumnConfig 单点**：扩展该 composable 增加 `columnWidths`（Record<key, px>）+ `setColumnWidth` + `resetWidths`，与列显隐同 storage key 存储——列宽是列个性化的同类维度，不建第二套存储；后续路由/上游页零成本接入。「重置列宽」入口放 `ColumnConfigPopover`（列个性化的既有 UI 家）。

**D5 交付切分**：B 与 A 同变更内分两步任务交付（B 先行可独立验收）。

**D6 全表内部竖线分隔（用户评审追加，方案 1 轻量版）**：常显握把线在「无竖线」的表格里是孤立特写——表头与表体的 `.ant-table-cell` 统一加 1px 内部竖线（`var(--border)`，无外框，末列不加），握把线随之成为列分隔线在表头的自然延伸。不用 antd `bordered`（连外框带圆角视觉过重）。节点页先行试点，其它列表推广另行立项。

**D7 表头拖拽移动列（用户评审追加，方案 A + 方案 1 实时预览）**：手势分区——右缘 8px 手柄 = 调宽（既有），标题区 mousedown = 移动列；可拖列悬停光标 grab（按住 grabbing），固定列（`#`/IP/操作）不参与且无光标，中间 7 列只在中间序列内互移（不跨固定边界）。换位判定基于**拖拽起始冻结的列位置**（th 按表头文字映射，标题唯一，桩/真机通吃），指针跨过目标边界即**实时应用**新顺序（方案 1：无松手跳变；对冻结几何单调，无边界震荡），持久化由 watch 随行。源列表头拖拽中高亮；**Esc 取消**恢复拖前顺序。初版「松手提交 + 边界指示线」因缺动画反馈被用户否决，实时预览为替代实现。用户二轮反馈（拖拽中光标消失、边界换位瞬跳）追加：**拖拽全程 body 挂 `col-move-dragging` 类强制 grabbing 光标**（非 scoped 样式块，`!important` 压过单元格默认 cursor）；**换位 FLIP 滑动动画**——换位前记录表头/表体全部单元格位置，DOM 更新后按位移差做 150ms transform 补间回正（固定列位移差 0 自动不参与；≤20 行约 230 元素，纯 transform 无重排）。顺序持久化并入 useColumnConfig（`columnOrder`：清洗未知 key、新列按默认序补位）；`visibleNodeColumns` 管线变为 order 排序 → 显隐过滤 → 宽度合并。

## Risks / Trade-offs

- [固定列 + 滚动在 a-table 需所有列有宽] → D3 默认档先行，缺宽列在 B 步即补齐。
- [拖拽把手与表头文字选中冲突] → mousedown 时 `preventDefault` + user-select 控制。
- [px 宽在大屏浪费小屏溢出] → scroll.x max-content 兜底溢出；大屏列宽只会更充裕，不处理自动收缩（保持用户意志优先）。

## Migration Plan

纯前端增量，无迁移。回滚 = 还原三个文件的 diff（useColumnConfig 扩展向下兼容，旧存储缺 widths 字段按默认档处理）。

## Open Questions

（无。）
