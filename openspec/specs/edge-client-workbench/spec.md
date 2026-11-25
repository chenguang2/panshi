# edge-client-workbench Specification

## Purpose

Edge 直连页调试工作台的页面解剖契约：连接条与查询动作形态、调试模式警示、资源卡 tab 条与表格解剖、JSON 查看弹窗。由 edge-client-page-restyle（2026-11-25 页面美化批次）确立，行为语义（连接/查询/CRUD/IP 反查）由 edge-direct-relay、edge-client-manual-query 等既有 capability 承载。

## Requirements

### Requirement: 连接条与查询动作

直连页 SHALL 提供连接条（全站 `l5-toolbar` 骨架，`l5-card` 内）：输入模式下拉（按集群选择 / 手动输入）→ 集群下拉（120px）→ 节点下拉（220px）或手动 ip:port 输入框 → 「查询」主按钮（btn-primary，内联 svg 图标）与「取消查询」按钮（无进行中查询时禁用）；右簇 SHALL 呈现「已连接」状态胶囊与所连节点 mono 地址，及 IP 归属提示（见 edge-direct-relay）。查询成功后资源卡 SHALL 加载该节点数据。

#### Scenario: 连接条骨架与控件形态
- **WHEN** 用户进入直连页
- **THEN** 连接条 SHALL 呈现为 `l5-toolbar` 骨架，模式下拉/集群/节点与查询动作按本契约排布
- **AND** 无进行中查询时「取消查询」SHALL 禁用

#### Scenario: 已连接状态呈现
- **WHEN** 查询成功连接某节点
- **THEN** 连接条右簇 SHALL 显示「已连接」状态胶囊与 mono 字体的 ip:管理端口

### Requirement: 调试模式警示

直连页 SHALL 在页头下方呈现「调试模式」警示横幅（自绘 token 化警示样式，可关闭），说明此处操作绕过正常同步流程、直接修改边缘节点数据；每张资源的新建/编辑弹窗 SHALL 自带「调试模式」警示条（虚线描边变体）。警示 MUST NOT 阻塞任何查询或编辑操作。

#### Scenario: 横幅与弹窗警示并存
- **WHEN** 用户进入直连页并打开任一资源的新建/编辑弹窗
- **THEN** 页面横幅与弹窗内警示条 SHALL 同时可见（横幅可关闭，弹窗内警示条随弹窗呈现）

### Requirement: 资源卡 tab 条与表格解剖

资源卡 SHALL 以自绘 tab 条切换 8 类资源（上游/路由/全局规则/插件组/插件元数据/插件列表/四层代理/SSL 证书）：活动 Tab 强调色底线，每 Tab SHALL 带该类资源的条目计数角标（当前已加载数据集）。每 Tab 内容 SHALL 为「tab 工具条（添加按钮去加号 + 搜索 150px）+ grid-table 表格」：表头非大写、`--bg` 底 9px 12px 密度、行悬停 accent 4%；ID 列 SHALL 呈现为等宽弱色并 title 承载全文；操作列 SHALL 为图标按钮层级（JSON=代码括号 / 编辑=sliders / 删除=trash 红），插件列表 Tab 无操作列。

#### Scenario: tab 条切换与计数
- **WHEN** 用户点击 tab 条上任一资源 Tab
- **THEN** SHALL 切换到该资源的表格（原 `activeTab` 状态语义不变）
- **AND** 每 Tab 角标 SHALL 反映该资源当前条目数

#### Scenario: 表格解剖与操作层级
- **WHEN** 用户查看任一资源表格
- **THEN** 表格 SHALL 挂 grid-table 解剖（非大写表头/密度/悬停），操作列按 JSON/编辑/删除图标层级呈现（删除为危险红）
- **AND** 插件列表 Tab SHALL NOT 渲染操作列

### Requirement: JSON 查看弹窗

资源行的「JSON」操作 SHALL 打开只读弹窗：mono 11.5px 呈现该资源原始对象、最大高度滚动、页脚关闭；弹窗 SHALL NOT 提供编辑能力（编辑走各资源编辑弹窗）。

#### Scenario: JSON 只读呈现
- **WHEN** 用户对某资源行点击「JSON」
- **THEN** 弹窗 SHALL 只读呈现该资源的原始 JSON 对象（等宽 11.5px、超高滚动），页脚仅「关闭」
