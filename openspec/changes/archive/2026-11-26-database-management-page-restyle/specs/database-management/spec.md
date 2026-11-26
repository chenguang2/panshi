# Database Management 页面解剖 Delta

## ADDED Requirements

### Requirement: 页头统计徽标与优先级

数据库管理页页头 SHALL 渲染至多两枚统计徽标：首枚恒为「N 条连接」（accent）；第二枚按严重度取「待重启生效」（warn，`pending_restart` 为真时）或「K 条验证失败」（bad，页面内测试失败计数），两者皆无时 SHALL 只渲染首枚。数值 MUST 取当前已加载数据集，SHALL NOT 编造。

#### Scenario: 徽标与优先级

- **WHEN** 管理员进入数据库管理页
- **THEN** 页头 SHALL 渲染「N 条连接」（accent 首枚）
- **AND** 若 `pending_restart` 为真，第二枚 SHALL 为「待重启生效」（warn）
- **AND** 若 `pending_restart` 为假且存在页面内测试失败的连接，第二枚 SHALL 为「K 条验证失败」（bad）
- **AND** 两者皆无时 MUST NOT 渲染第二枚

### Requirement: 当前数据库 hero 与待重启三处提示

「当前数据库」SHALL 采用 `l5-card` hero 解剖：卡头（标题 + 语义副注「切换写入配置后需重启后端服务才生效；期间页面数据仍来自旧库」）、24px 判定胶囊（运行中 `pill-run` / 待重启 `pill-warn`）、当前类型 `lp-tag`（accent）、连接名 15px/600、等宽地址、元信息行（连接注册表条数 · 配置版本 · 切换后会话后果）。未配置活动连接时 SHALL 呈现空态且 MUST NOT 渲染判定胶囊。

`pending_restart` 为真时，「待重启生效」SHALL 同时出现在三处：页头统计徽标、hero 名称行徽标（`ph-lite lite-warn`）、hero 警示条（含具体重启命令），MUST NOT 只出现其一。

#### Scenario: hero 解剖与空态

- **WHEN** 存在活动连接
- **THEN** hero SHALL 展示判定胶囊 + 类型标签 + 连接名 + 等宽地址 + 元信息行
- **WHEN** 未配置活动连接
- **THEN** SHALL 呈现空态，MUST NOT 渲染判定胶囊

#### Scenario: 待重启三处同时可见

- **WHEN** `pending_restart` 为真
- **THEN** 「待重启生效」SHALL 同时出现在页头徽标、hero 名称行徽标与 hero 警示条
- **AND** 警示条 SHALL 说明当前页面数据仍来自旧库并给出具体重启命令

### Requirement: 连接列表解剖与操作层级

连接列表 SHALL 采用全站 `grid-table` 表格解剖（`l5-card` + 卡头，禁页内 accent 大写表头），列依次为 `#` / 状态 / 名称 / 类型 / 地址 / 用户名 / 当前 / 操作。状态列 SHALL 为三态胶囊（已连通 `pill-run` / 验证失败 `pill-stop` / 未验证 `pill-unknown`），tooltip MUST 保留「测试结果仅保留到页面刷新」的时效披露（或「尚未测试」语义）。类型列 SHALL 使用 `lp-tag`，当前连接取 accent。当前连接行 SHALL 以左缘 accent 条与淡底标识，MUST NOT 复用多选选中高亮语义。操作列 SHALL 建立层级：测试与编辑为次要图标按钮、设为当前为行内主操作（accent 描边胶囊，当前连接禁用）、删除为危险红图标按钮（当前连接禁用并以 tooltip 说明保护理由）。

#### Scenario: 列序与状态胶囊

- **WHEN** 管理员查看连接列表
- **THEN** 表格 SHALL 依次呈现 `#` 序号、状态胶囊、名称、类型标签、地址、用户名、当前、操作
- **AND** 状态胶囊 SHALL 提供「测试结果仅保留到页面刷新」的时效 tooltip

#### Scenario: 当前行标识

- **WHEN** 存在活动连接
- **THEN** 该行 SHALL 以左缘 accent 条与淡底标识
- **AND** 该行类型标签 SHALL 取 accent，其余连接为中性标签
- **AND** 标识 MUST NOT 使用多选选中高亮语义

#### Scenario: 操作层级与保护

- **WHEN** 用户查看非当前连接行的操作列
- **THEN** SHALL 依次呈现 测试（次要图标按钮）、设为当前（行内主操作胶囊）、编辑（次要图标按钮）、删除（危险红图标按钮）
- **WHEN** 用户查看当前连接行的操作列
- **THEN** 设为当前与删除 SHALL 禁用，删除 SHALL 以 tooltip 说明「当前连接不可删除，请先切换到其他连接」

### Requirement: 摘要双卡并排

备份与迁移两张摘要卡 SHALL 并排为两列（`.dbm-two`），窄于 1100px 时回落单列；卡内四格统计 SHALL 改为 2 列 × 2 行，卡头与正文 SHALL 采用与 hero 同一套解剖。两卡 MUST 保持纯导航入口，不在卡内触发备份或迁移。

#### Scenario: 并排与 2×2 统计

- **WHEN** 管理员同时具备 `db_backup` 与 `db_migration` 权限与功能开关
- **THEN** 两张摘要卡 SHALL 并排两列，卡内统计为 2×2 四格
- **AND** 视口窄于 1100px 时 SHALL 回落单列堆叠
- **AND** 两卡 MUST NOT 在卡内触发备份或迁移
