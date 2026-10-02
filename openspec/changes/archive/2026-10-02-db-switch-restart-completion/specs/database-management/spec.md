# database-management Delta

## MODIFIED Requirements

### Requirement: 当前数据库状态展示

系统 SHALL 提供当前数据库状态查询接口与页面展示，包括类型、连接地址、表数量、数据量、上次迁移时间。状态接口 SHALL 返回 `pending_restart` 标记切换待重启生效状态；当存在切换待重启标记时，页面与侧栏徽标 SHALL 明确区分「待生效配置」与「运行中连接」，不得把待生效连接当作已生效连接展示。

#### Scenario: 查看当前数据库状态

- **WHEN** 管理员打开数据库管理页
- **THEN** 页面 SHALL 展示当前激活数据库的类型、地址、表数量、数据量、上次迁移时间

#### Scenario: 切换待重启时状态接口返回待生效标记

- **WHEN** 数据库切换已完成写入配置且 `.restart.flag` 存在（后端尚未重启）
- **THEN** `GET /database/status` SHALL 返回 `pending_restart: true`
- **AND** 后端重启完成、切换标记清除后，接口 SHALL 返回 `pending_restart: false`

#### Scenario: 切换待重启时页面展示待生效标记

- **WHEN** `pending_restart` 为 true 且管理员查看数据库管理页
- **THEN** 当前连接展示区 SHALL 显示「待重启生效」警示标记
- **AND** 警示标记 SHALL 与既有重启指引提示联动，指引管理员完成重启

#### Scenario: 切换待重启时侧栏徽标显示待生效状态

- **WHEN** `pending_restart` 为 true 且管理员查看侧栏数据库徽标
- **THEN** 徽标文案 SHALL 追加「（待重启）」标记
- **AND** 悬停提示 SHALL 说明「切换待重启生效，数据仍来自旧库」
