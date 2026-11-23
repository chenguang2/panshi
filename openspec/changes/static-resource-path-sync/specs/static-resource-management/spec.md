# Spec Delta

## ADDED Requirements

### Requirement: 静态资源 URL 路径随路由 URI 变更同步

系统 SHALL 在路由更新提交前，按该路由绑定的静态资源**幂等回写** `url_path` 为路由当前 `uri`（含 `NULL` 旧值），使卡片「路径」行、发布确认摘要、上传日志与集群导出中的路径与路由实时 URI 一致。回写 SHALL NOT 推进静态资源的 `updated_at`（该列驱动「待发布」态，路径变更不要求重发 zip）。该回写 SHALL 对未改 URI 的路由保存同样生效（用于自愈存量不一致数据），且在该路由无静态资源时为空操作。

#### Scenario: 路由 URI 变更后路径跟随

- **WHEN** 用户把某路由的 `uri` 从 `/old/*` 改为 `/webTrade/*` 并保存，且该路由绑定了一个静态资源
- **THEN** 该静态资源的 `url_path` SHALL 变为 `/webTrade/*`
- **AND** 静态资源列表/详情响应中的 `url_path` SHALL 与之一致
- **AND** 该静态资源的 `updated_at` SHALL 保持不变（不因此进入待发布态）

#### Scenario: 存量不一致自愈

- **WHEN** 静态资源的 `url_path` 与所属路由当前 `uri` 不一致（历史脏数据），而用户保存该路由（未修改 URI）
- **THEN** 系统 SHALL 仍把 `url_path` 回写为路由当前 `uri`

#### Scenario: 路径为空的旧记录

- **WHEN** 静态资源的 `url_path` 为 `NULL`
- **THEN** 路由保存后 SHALL 回写为路由当前 `uri`

#### Scenario: 无绑定静态资源

- **WHEN** 路由没有绑定静态资源
- **THEN** 路由更新 SHALL 正常成功，不产生任何静态资源写入
