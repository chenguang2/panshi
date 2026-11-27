# DB Migration 页面控制台解剖 Delta

## ADDED Requirements

### Requirement: 迁移任务卡与历史记录卡卡头解剖

数据迁移页 SHALL 采用全站控制台卡片语言：迁移任务与历史记录各自为独立 `l5-card`，卡头统一为「标题 + 语义副注 + 头部动作」解剖。迁移任务卡卡头标题为「迁移任务」、副注为「单向快照替换：先备份源库，再清空目标库写入」，头部动作为刷新按钮；历史记录卡卡头标题为「历史迁移记录」、副注为「仅当前活动库的记录；切换数据库后从零开始记录」，头部动作为已加载条数徽标（含「仅显示最近 100 条」截断披露）与「清理历史」按钮。页面 SHALL NOT 在页头放置页面级动作按钮或统计徽标（发起入口在迁移任务卡内，与设计页一致）。

#### Scenario: 迁移任务卡卡头

- **WHEN** 用户打开数据迁移页
- **THEN** 迁移任务卡 SHALL 呈现标题「迁移任务」与副注「单向快照替换：先备份源库，再清空目标库写入」
- **AND** 刷新按钮 SHALL 位于卡头右侧动作区

#### Scenario: 历史记录独立成卡

- **WHEN** 用户打开数据迁移页
- **THEN** 历史迁移记录 SHALL 呈现为独立卡片（迁移任务卡之外），卡头含标题、副注、条数徽标与「清理历史」按钮
- **AND** 条数徽标 SHALL 反映已加载条数，达后端返回上限（100 条）时 SHALL 附截断披露

#### Scenario: 页头无动作与徽标

- **WHEN** 用户查看页面页头
- **THEN** 页头 SHALL NOT 渲染页面级动作按钮，也 SHALL NOT 渲染统计徽标

### Requirement: 状态带可用连接段与主题色

状态带 SHALL 在「当前活动库」段之后集中展示「可用连接 N」段（N 为连接注册表中连接数，迁移发起的最少连接数判据同源）；活动库类型标签 SHALL 使用技术标签样式（SQLite / PostgreSQL），MUST NOT 使用中性徽章样式；「切换待重启生效」警示段与「迁移进行中」锁段的颜色 SHALL 取主题 token（warning / accent 系），MUST NOT 使用硬编码 antd 色值。状态带数据源保持为既有 status / running-tasks / connections，MUST NOT 新增端点。

#### Scenario: 可用连接段

- **WHEN** 状态带数据加载完成
- **THEN** 状态带 SHALL 展示「可用连接」标签与连接数

#### Scenario: 主题色 token 化

- **WHEN** 存在待重启标记或迁移进行中
- **THEN** 对应段 SHALL 以主题 warning / accent token 着色
- **AND** 样式声明 SHALL NOT 出现硬编码 antd 色值

### Requirement: 统一进度面板解剖

迁移进行中（SSE 实时态与 API 恢复态）SHALL 使用同一进度面板解剖：mono 阶段徽标（备份阶段 `BACKUP`、迁移阶段 `MIGRATING`）+ 自绘进度条（迁移进度 accent 色、备份进度同 token 系）+ 元信息行（当前表名、已迁移行数区间、起始时间等宽呈现）+ 右下「断开实时进度」危险小按钮。SHALL NOT 使用 emoji 阶段标签、SHALL NOT 使用硬编码色值驱动进度条。API 恢复态进度数据缺失时 SHALL 呈现阶段徽标与提示文案的骨架行，MUST NOT 渲染无数据的进度条。迁移进行中状态 SHALL 由状态带锁段与进度面板共同承载，页面内 SHALL NOT 另立迁移锁警告横幅。

#### Scenario: SSE 实时进度解剖

- **WHEN** 迁移经 SSE 推进中
- **THEN** 进度面板 SHALL 展示 `MIGRATING`/`BACKUP` 阶段徽标、自绘进度条与元信息行（当前表 / 行数 / 起始时间）
- **AND** 「断开实时进度」为右下危险小按钮，点击仅断开实时流、不取消后台任务（既有语义不变）

#### Scenario: 恢复态同构

- **WHEN** 用户在迁移后台执行中重新打开页面（API 恢复态）
- **THEN** 进度面板 SHALL 与 SSE 实时态同构（阶段徽标 + 进度条 + 元信息），数据来自 running-tasks 返回的进度
- **WHEN** 恢复态进度数据缺失（如 interrupted 任务）
- **THEN** SHALL 呈现阶段徽标与提示文案的骨架行，MUST NOT 渲染无数据的进度条

#### Scenario: 锁态承载

- **WHEN** 迁移进行中
- **THEN** 锁定事实 SHALL 出现在状态带锁段（源 → 目标 · 写操作已锁定 · 起始时间）与进度面板
- **AND** 页面内 MUST NOT 出现独立的迁移锁警告横幅

### Requirement: 结果条与弹窗横幅主题化

迁移完成结果条 SHALL 以主题 success token 呈现（徽标 + 结论 + 表数/耗时/备份等宽元信息 + 「查看迁移详情」「去切换数据库」动作）。确认开始迁移弹窗中的清空覆盖警告 SHALL 使用主题 `.alert` 族（非空目标 `.alert-error`、可判定空库时 `.alert-info`），MUST NOT 使用 a-alert；既有「无法判定时保守恒显清空警告」契约不变。清理迁移历史弹窗 SHALL 保持「保留最近 N 条 + 服务端真实总数预览 + 无可删禁用提交」行为，影响范围说明（仅当前活动库历史、不影响业务数据/审计日志/备份文件，执行中记录不删）SHALL 以预览行附注小字呈现，SHALL NOT 使用 a-alert。切换后重启指引横幅 SHALL 使用主题 `.alert.alert-warning`（含图标与内容区），保留可手动关闭、刷新后消失的既有语义。

#### Scenario: 结果条 token 化

- **WHEN** 迁移完成
- **THEN** 结果条 SHALL 以 success token 呈现结论、等宽元信息与两个动作按钮
- **AND** 样式 SHALL NOT 含硬编码 antd 绿色色值

#### Scenario: 确认弹窗警告形态

- **WHEN** 用户在确认开始迁移弹窗中查看警示
- **THEN** 清空覆盖警告 SHALL 为主题 `.alert` 条（当前保守恒显 `.alert-error`）
- **AND** 弹窗其余要素（源/目标连接行、执行说明、危险确认按钮）保持既有契约

#### Scenario: 清理弹窗附注化

- **WHEN** 用户打开清理迁移历史弹窗
- **THEN** 影响范围说明 SHALL 为预览行附注小字，SHALL NOT 出现 a-alert 块
- **AND** 预览数字仍来自服务端真实总数、无可删记录时提交仍禁用

#### Scenario: 重启指引横幅形态

- **WHEN** 就地切换成功后
- **THEN** 页面 SHALL 展示主题 warning 横幅（含重启命令），可手动关闭且刷新后消失

### Requirement: 历史表 grid-table 解剖与外置分页

历史迁移记录表 SHALL 采用全站 `grid-table` 表格解剖：`#` 序号列（45px，单页序号 `index + 1`）+ 列依次为 迁移方向 / 模式 / 状态 / 表数量 / 时长 / 开始时间 / 完成时间，滚动宽度取各列宽之和（数值，SHALL NOT 使用 `max-content`）。迁移方向列 SHALL 为「源标签 → 目标标签」形态（标签用 `lp-tag`，箭头等宽字体）；模式列 SHALL 弱化呈现（「替换」）；状态列 SHALL 为语义胶囊（成功 `pill-run` / 失败 `pill-stop`），MUST NOT 使用 a-tag；表数量、时长、时间列 SHALL 等宽字体呈现。分页 SHALL 使用外置 `ListPager`（左簇共 N 条与每页条数、右簇页码与跳页），表格本体 MUST NOT 使用内置分页。行展开（失败原因中文转译 + 备份路径等宽展示与复制）原样保留；本表 SHALL NOT 接列宽拖拽（同连接表先例，静态列宽）。

#### Scenario: 表格解剖与列形态

- **WHEN** 用户查看历史迁移记录表
- **THEN** 表格 SHALL 呈现 `#` 序号列与设计列序，滚动宽度为数值型列宽之和
- **AND** 迁移方向 / 模式 / 状态 / 数值与时间列分别呈现 lp-tag 组合、弱化文本、语义胶囊与等宽文本
- **AND** 状态 MUST NOT 以 a-tag 呈现

#### Scenario: 外置分页

- **WHEN** 历史记录超过单页容量
- **THEN** 分页 SHALL 由表格外置 ListPager 承担（翻页、每页条数、跳页）
- **AND** 表格本体无内置分页控件

#### Scenario: 行展开保留

- **WHEN** 用户展开一条历史记录
- **THEN** 失败行 SHALL 展示中文转译的失败原因，展开区 SHALL 展示备份路径并提供复制
- **AND** 成功行展开区无失败原因段落（既有契约不变）

### Requirement: 连接不足禁用面

可用连接不足以同时提供源与目标时，除发起按钮禁用与既有「去新建连接」深链提示外，「单阶段超时」下拉与「包含日志数据」勾选 SHALL 一并禁用（表单整体呈不可用态）；连接恢复充足后 SHALL 恢复可用。既有「发起需要 2 个连接」判据与提示文案契约不变。

#### Scenario: 连接不足时表单整体禁用

- **WHEN** 可用连接少于 2 个
- **THEN** 发起按钮、单阶段超时下拉、包含日志数据勾选 SHALL 全部禁用
- **AND** 提示行 SHALL 说明所需连接数并附「去新建连接」深链入口

#### Scenario: 连接充足恢复

- **WHEN** 连接注册表恢复至 2 个及以上（刷新后）
- **THEN** 表单控件 SHALL 恢复可用（活动库约束前置与源预选契约不变）

### Requirement: 迁移详情抽屉解剖

迁移详情抽屉（右侧，宽 760）SHALL 采用设计解剖：概要四格（源数据库 / 目标数据库 / 迁移表数 / 耗时）+ 备份路径通栏等宽呈现；表明细按「业务表 / 审计与导入日志 / 任务日志」分组，每组表格采用 grid-table 解剖（表名 / 列数 / 行数，组内定高滚动）；未包含日志表时 SHALL 保留勾选提示；抽屉底部 SHALL 保留「迁移成功，按以下步骤启用新数据库」后续步骤。抽屉内 SHALL NOT 使用 a-descriptions 呈现概要信息。

#### Scenario: 概要四格与备份路径

- **WHEN** 用户打开迁移详情抽屉
- **THEN** 概要 SHALL 为四格键值解剖 + 备份路径通栏等宽文本
- **AND** 概要 MUST NOT 以 a-descriptions 呈现

#### Scenario: 表明细分组

- **WHEN** 迁移包含表明细
- **THEN** 三组明细 SHALL 各以 grid-table 解剖呈现（表名/列数/行数）并组内滚动
- **WHEN** 本次迁移未包含日志表
- **THEN** SHALL 呈现「未包含日志表」提示与重新执行指引

#### Scenario: 后续步骤保留

- **WHEN** 迁移成功后打开详情抽屉
- **THEN** 抽屉 SHALL 展示后续启用步骤（连接列表设为当前 → 确认切换并重启 → 刷新确认）
