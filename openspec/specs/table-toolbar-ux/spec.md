# table-toolbar-ux

## Purpose

优化集群管理 Tab 的工具栏布局和列配置持久化。

## Requirements

### Requirement: Search bar in toolbar

The search bar for routes, nodes, and upstreams SHALL be placed in the toolbar row, right-aligned.

#### Scenario: Search in toolbar
- **WHEN** viewing routes/nodes/upstreams tab
- **THEN** the search input SHALL be inside the `.node-actions` toolbar, in a `.toolbar-right` container

### Requirement: Column config persistence

The column selection, search visibility, and action button selection SHALL be saved to localStorage and restored on page load.

#### Scenario: Config persists
- **WHEN** a user changes column settings
- **THEN** after page refresh, the same settings SHALL be restored

### Requirement: Remove PluginMetadata search

The PluginMetadata component SHALL NOT have a search bar.

#### Scenario: No search in plugin metadata
- **WHEN** viewing the plugin metadata tab
- **THEN** there SHALL be no search input visible

### Requirement: 独立列表页列配置弹窗统一

左侧菜单的节点管理、上游管理、路由管理三个独立列表页 SHALL 提供同一形态的「列配置」弹窗：标题「选择显示列」，内容依次为「显示字段」勾选组（本页表格列）、「搜索」区的「显示搜索框」开关、「拖动表头右缘可调整列宽」提示、「重置列宽」按钮。三处弹窗 SHALL 复用同一 `useColumnConfig` 机制与同一视觉（`btn btn-primary btn-sm` 按钮、`text-muted` 12px 提示）。

工具条 SHALL NOT 另设独立的「重置列宽」按钮（重置入口唯一存在于弹窗内）。

「列配置」触发按钮、刷新按钮与「分组 | 平铺」切换器、计数 SHALL 组成工具条右端统一簇，顺序与位置按本规格「独立列表页工具条右端统一」需求执行；SHALL NOT 再要求「列配置」靠左排布（2026-11-16 `list-pages-console-restyle` 评审裁决反转原「靠左」规则）。

列配置 SHALL 持久化到按页分立的 localStorage 键（`node_standalone` / `upstream_standalone` / `route_standalone`），刷新后保持，且与统一管理页三张 Tab 的列配置互不影响。

序号列（`#`）SHALL NOT 出现在弹窗勾选项中，且 SHALL 恒展示——即使用户改动其它字段的显隐（antd CheckboxGroup 会剔除不在选项列表中的已选值）。

#### Scenario: 上游管理页打开列配置

- **WHEN** 用户在上游管理页点击工具条「列配置」
- **THEN** 弹窗显示「选择显示列」标题、「显示字段」勾选组（含名称/负载均衡/目标节点/协议/发布状态/操作，不含 `#`，不含「集群」——集群列已由分组呈现替代）、「显示搜索框」开关、拖宽提示与「重置列宽」按钮

#### Scenario: 路由管理页取消字段勾选

- **WHEN** 用户在路由管理页的列配置中取消勾选「方法」
- **THEN** 「方法」列从表格中消失（「请求匹配」合并列不再渲染方法 chips，仅呈现 URI 部分）、「#」列仍在
- **AND** 刷新页面后「方法」列仍隐藏

#### Scenario: 搜索框显隐开关

- **WHEN** 用户取消勾选「显示搜索框」
- **THEN** 该页工具条中的搜索输入框隐藏；重新勾选后恢复显示

#### Scenario: 弹窗内重置列宽

- **WHEN** 用户拖宽某列后在列配置弹窗内点击「重置列宽」
- **THEN** 全部列恢复默认宽度档，持久化的宽度记录清空，弹窗自动关闭

#### Scenario: 列配置按钮靠左

<!-- 2026-11-16 list-pages-console-restyle 裁决反转：原「紧邻筛选控件靠左排布」改为右端统一簇；场景标题为稳定标识符故保留原名，正文按新行为改写 -->

- **WHEN** 用户在任一独立列表中查看工具条
- **THEN** 「列配置」按钮位于工具条右端统一簇内（顺序见「独立列表页工具条右端统一」），不再紧邻筛选控件

#### Scenario: 三页配置互不影响

- **WHEN** 用户在路由管理页隐藏「方法」列
- **THEN** 节点管理页与统一管理页三张 Tab 的列集合保持不变

### Requirement: 独立列表页工具条右端统一

三个独立列表页的工具条右端 SHALL 采用统一簇顺序：`…筛选控件 → 计数 → 刷新 → 「列配置」 → 「分组 | 平铺」切换器（最右）`。上游管理页与路由管理页 SHALL 新增工具条「刷新」按钮，语义与节点页一致——重新加载当前数据集的列表（复用各页既有加载函数），SHALL NOT 附加其他动作（不触发状态检测、不重置筛选与排序键）。路由管理页此前规格已承诺「计数与刷新按钮右置同组」，本需求为该承诺的落地。

路由管理页的计数文案（「共 N 条路由」）SHALL 位于方法 chips 附属行的右端（V2 双行结构，工具条右端簇不含计数）；节点页与上游页计数位于工具条右端簇首位。

#### Scenario: 上游管理页刷新

- **WHEN** 用户在上游管理页点击「刷新」
- **THEN** 列表重新加载（当前筛选与数据集范围不变），发布状态等展示反映最新数据
- **THEN** 筛选条件、排序键、视图模式（分组/平铺）均不变

#### Scenario: 路由管理页刷新

- **WHEN** 用户在路由管理页点击「刷新」
- **THEN** 列表重新加载（当前筛选与数据集范围不变）
- **THEN** 筛选条件、排序键、视图模式均不变

#### Scenario: 右端顺序一致

- **WHEN** 用户分别在节点、上游、路由三个独立列表页查看工具条右端
- **THEN** 三页均为「刷新 → 列配置 → 分组|平铺切换器」从左到右排列，切换器位于工具条最右端

#### Scenario: 路由页计数位置

- **WHEN** 用户查看路由管理页
- **THEN** 「共 N 条路由」位于方法 chips 附属行右端，工具条右端簇不含计数
