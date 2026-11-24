# Spec Delta

## ADDED Requirements

### Requirement: 网关 8443 server 块按平台上限写入请求体上限

中继网关的 8443 server 块渲染 SHALL 写入 `client_max_body_size {N}m`，其中 N 取平台上限（`features.yaml` 的 `limits.static_zip_max_mb`，缺省 32），使「经中继发布」腿的上限与平台配置同源、无需人工记住在网关机上手调 nginx。`GET /relay/gateways/{id}/config-preview` SHALL 以同一渲染函数产出该行，预览与实际下发逐字一致；网关机上该指令可被区域运维覆盖（人工调大后再次「初始化网关」会以平台值为准重写）。

#### Scenario: 渲染含请求体上限

- **WHEN** 平台上限为 132 时渲染 8443 server 块
- **THEN** 输出 SHALL 含 `client_max_body_size 132m;`，位于 `server { … }` 块内

#### Scenario: 预览与下发同源

- **WHEN** 用户打开「查看配置」预览 `relay_8443.conf`
- **THEN** 预览内容 SHALL 与实际下发渲染结果逐字一致（含该上限行）
