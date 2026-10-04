# deployment-feature-config Delta

## ADDED Requirements

### Requirement: Configuration items — db_migration, db_backup

The deployment feature configuration SHALL support two new feature names `db_migration` and `db_backup` in the `features.features` mapping (both registered in `KNOWN_FEATURES` and `features.yaml`).

| Feature name | Default | Controls |
|---|---|---|
| `db_migration` | `true` | 数据迁移域 API（running-tasks / migrate-stream / export / import / history）与数据库管理页迁移区块；独立 `db_migration` 权限键 |
| `db_backup` | `true` | 「备份与容灾」独立页面与全部备份 API（`feature_routers["db_backup"]` 独立注册键）；独立 `db_backup` 权限键与用户管理权限组选项 |

#### Scenario: db_migration disabled

- **WHEN** `features.yaml` 中 `db_migration` 为 `false`
- **THEN** 数据迁移域 API SHALL 返回 404「数据迁移模块未启用」
- **AND** 数据库管理页迁移区块 SHALL 隐藏，连接注册表/状态/切换 SHALL 不受影响

#### Scenario: db_backup disabled

- **WHEN** `features.yaml` 中 `db_backup` 为 `false`
- **THEN** 备份与容灾 API SHALL 返回 404，侧边栏「备份与容灾」入口 SHALL 隐藏
- **AND** 数据库管理页备份摘要卡 SHALL 不渲染、不发起备份接口请求
- **AND** `database_management` 功能 SHALL NOT 牵连 `db_backup`（反之亦然），二者总闸互不影响

#### Scenario: 用户管理权限组同步

- **WHEN** 管理员在用户管理中编辑权限
- **THEN** 权限组 SHALL 出现 `db_migration` 与 `db_backup` 两个独立权限选项，可差异化授权
