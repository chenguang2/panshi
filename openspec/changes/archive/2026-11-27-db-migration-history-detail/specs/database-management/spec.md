# Database Management 历史明细持久化 Delta

## MODIFIED Requirements

### Requirement: 迁移历史记录

系统 SHALL 记录每次迁移/导出/导入操作的来源、目标、模式、时间、结果，供管理员追溯。迁移历史表（`ps_db_migration_log`）为操作元数据，不参与数据迁移——目标库的迁移历史从零开始记录。

成功完成的迁移 SHALL 额外把完成事件的逐表明细（表名、列数、行数、业务表/日志表分组标记）持久化到该条历史记录（JSON 文本列）；失败与中断的记录不写明细（空值）。明细读取 SHALL 走独立的单条端点（`GET /database/history/{log_id}`，权限与功能门控与历史列表端点同源，记录不存在返回 404），历史列表端点响应体 SHALL 携带 `has_detail` 标记且 MUST NOT 内联明细数组（列表载荷不随明细膨胀）。存量旧记录（无明细）`has_detail` 为假，行为与现状一致，MUST NOT 做回填。

#### Scenario: 查看迁移历史

- **WHEN** 管理员打开数据库管理页的历史区域
- **THEN** 系统 SHALL 展示历史操作记录（时间、方向、模式、结果）

#### Scenario: 迁移历史不随数据迁移

- **WHEN** 执行数据库迁移
- **THEN** 系统 SHALL 不将源库的 `ps_db_migration_log` 记录复制到目标库，目标库迁移历史从零开始

#### Scenario: 成功迁移持久化逐表明细

- **WHEN** 一次迁移成功完成（SSE complete 事件携带 tables 明细）
- **THEN** 该次迁移的历史记录 SHALL 持久化逐表明细（表名/列数/行数/分组），且 `has_detail` 为真
- **AND** 明细在历史列表端点 MUST NOT 内联展开，仅经单条明细端点返回

#### Scenario: 失败与旧记录无明细

- **WHEN** 查看失败迁移或本功能上线前的旧记录
- **THEN** 该记录 SHALL 无明细（`has_detail` 为假），系统 SHALL NOT为其伪造或回填明细

#### Scenario: 单条明细端点

- **WHEN** 管理端以合法记录 id 调用明细端点
- **THEN** SHALL 返回该条完整记录（含解析后的逐表明细数组）
- **WHEN** 记录 id 不存在
- **THEN** SHALL 返回 404
