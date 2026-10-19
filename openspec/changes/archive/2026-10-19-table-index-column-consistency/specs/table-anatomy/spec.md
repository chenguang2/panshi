# 表格序号列解剖（table-anatomy）

## ADDED Requirements

### Requirement: 序号列统一解剖

全站表格列表页的 `#` 序号列 SHALL 遵循统一解剖：位于列定义首位、`title: '#'`、`key: 'index'`、`width: 45`。

#### Scenario: 审计日志页序号列宽度对齐

- **WHEN** 审计日志页（AuditLog）渲染表格
- **THEN** 首列为 `{ title: '#', key: 'index', width: 45 }`，与其他表格页（用户/节点/路由/上游）解剖一致

#### Scenario: 全仓序号列宽度一致

- **WHEN** 检查任意带序号列的表格页（NodeList/RouteList/UpstreamList/UserList/AuditLog/edgeColumns.ts 全部 8 张 EdgeClient 表）
- **THEN** 序号列 width 均为 45，不存在第二种列宽
- **AND** 45px 对 4 位序号实测无裁切；≥5 位序号（1 万+条目表格的深翻页，如审计日志）可能视觉溢出，为已接受的残余限制，不为此偏离统一宽度

### Requirement: 序号计数公式按分页形态二分

序号列渲染公式 SHALL 按表格分页形态二选一：

- 后端分页表格（a-table pagination + page/page_size）：跨页连续计数 `(page - 1) * pageSize + index + 1`；
- `:pagination="false"` 表格（渲染全量数据）：页内编号 `index + 1`（无分页时页内序号即全量序号）。

后端分页表格 SHALL NOT 使用 `index + 1`（翻页后序号重置，产生重复序号）；`:pagination="false"` 表格 SHALL NOT 使用跨页公式（page/pageSize 无意义）。

#### Scenario: 后端分页跨页连续

- **WHEN** 用户在后端分页表格翻到第 2 页（pageSize=20）
- **THEN** 首行序号显示 21，跨页连续不重复

#### Scenario: 筛选后序号重排

- **WHEN** 用户切换筛选条件使行集变化
- **THEN** 序号按当前筛选视图从 1 起重排，页偏移按筛选后总数计算

#### Scenario: 无分页表格页内编号

- **WHEN** 表格声明 `:pagination="false"`（如 EdgeClient 八张资源表）
- **THEN** 序号使用 `index + 1`，与全量数据行号一致

### Requirement: 分页绑定统一内联工厂

后端分页表格的分页配置在无附加逻辑时 SHALL 在模板内联调用 `usePagination.paginationProps({ page, pageSize, total… }, '单位')` 工厂；确需附加逻辑（如条件化禁用快速跳页）时可用 computed 承载，SHALL NOT 为该工厂建立本地别名（如 `buildTablePagination` 类重命名导入）。

#### Scenario: 用户管理页分页绑定对齐

- **WHEN** 检查 UserList 的 a-table 分页绑定
- **THEN** 与 RouteList/NodeList/AuditLog/UpstreamList 同款内联形态，无 `buildTablePagination` 类本地别名、无纯包装 computed
