# database-management Delta

## MODIFIED Requirements

### Requirement: 权限控制
数据库管理连接注册表、状态与切换接口 SHALL 仅对拥有 `database_management` 权限的管理员开放；数据迁移域端点（运行中任务、流式迁移、归档导出、归档导入、迁移历史）SHALL 改挂独立的 `db_migration` 权限。迁移与切换操作需二次确认。

#### Scenario: 无权限访问
- **WHEN** 非管理员或无对应权限（`database_management` / `db_migration`）的用户访问数据库管理或迁移域接口
- **THEN** 系统 SHALL 拒绝访问并返回 403

#### Scenario: 仅持 database_management 无法访问迁移域
- **WHEN** 拥有 `database_management` 权限但无 `db_migration` 权限的用户调用迁移域端点（如流式迁移、迁移历史）
- **THEN** 系统 SHALL 返回 403
- **AND** 连接注册表、状态与切换接口对该用户 SHALL 保持可用

#### Scenario: db_migration 功能关闭时迁移域 404
- **WHEN** `features.yaml` 中 `db_migration` 为 `false` 且持 `db_migration` 权限的用户调用迁移域端点
- **THEN** 系统 SHALL 返回 404「数据迁移模块未启用」（权限检查先于 404，不向无权限者泄露模块存在性）
- **AND** 连接注册表/状态/切换 SHALL NOT 受该开关影响

#### Scenario: db_backup 注册键独立、总闸互不牵连
- **WHEN** `database_management` 功能关闭而 `db_backup` 功能开启
- **THEN** 备份与容灾 API SHALL 经独立注册键继续可用，SHALL NOT 被数据库管理总闸一并 404
