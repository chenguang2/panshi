# clickhouse-config-management Delta

## MODIFIED Requirements

### Requirement: 命名连接管理 API

系统 SHALL 提供 `backend/clickhouse.yaml`（与 `db_config.json` 平级）中 ClickHouse 命名连接列表的 CRUD API（`/api/v1/clickhouse/connections*`），全部端点 MUST 经登录鉴权与 `clickhouse_config` 资源权限门控；其中恰有一条为激活连接（`active`），指标查询 SHALL 使用激活连接的参数。

配置文件 SHALL 按候选链回落：`backend/clickhouse.yaml`（配置页维护的运行态文件）→ 随包模板 `backend/app/config/clickhouse.yaml`（占位 127.0.0.1、无任何口令、含使用说明）→ 缺省。运行态配置文件（`backend/clickhouse.yaml` 与 `backend/db_config.json`）为启动自生成/配置页维护产物，SHALL NOT 被 git 跟踪。

#### Scenario: 列表不回显密码
- **WHEN** 有权限用户 `GET /clickhouse/connections`
- **THEN** 返回各连接的 id/name/host/port/database/user/connect_timeout、`password_set` 布尔与 `is_active` 标记
- **AND** 响应 MUST NOT 含任何密码值（明文或密文）

#### Scenario: 新建与首条自动激活
- **WHEN** 连接列表为空时创建首个连接
- **THEN** 该连接 SHALL 成为激活连接

#### Scenario: 非法参数拒绝写入
- **WHEN** 创建/更新请求 name 或 host 为空、port 或 connect_timeout 非正整数
- **THEN** 系统 SHALL 返回 422/400 且不修改配置文件

#### Scenario: 编辑留空密码表示保留
- **WHEN** `PUT /clickhouse/connections/{id}` 请求体 password 为空且该连接已有密码
- **THEN** 原密码 SHALL 保留，其余字段更新落盘

#### Scenario: 删除激活连接被拒绝
- **WHEN** `DELETE /clickhouse/connections/{id}` 目标是当前激活连接
- **THEN** 系统 SHALL 返回 400 并提示先切换到其他连接

#### Scenario: 无权限用户不可见不可用
- **WHEN** 普通用户无 `clickhouse_config` 权限
- **THEN** 所有配置端点返回 403
- **AND** 左侧菜单"系统管理"与用户管理权限组不出现"ClickHouse 配置"

#### Scenario: 配置候选链回落随包模板
- **WHEN** `backend/clickhouse.yaml` 不存在（配置页尚未首次保存）且后端启动或读取 ClickHouse 配置
- **THEN** 系统 SHALL 按随包模板 `backend/app/config/clickhouse.yaml` 的初始连接参数生效
- **AND** 配置页首次保存生成运行态文件后，运行态文件 SHALL 优先于模板

#### Scenario: 随包模板形状与无口令守卫
- **WHEN** 检查随包模板 `backend/app/config/clickhouse.yaml`
- **THEN** 模板 SHALL 存在且可被 YAML 解析，`active` SHALL 指向存在的连接，连接字段（name/host/port/database/user/connect_timeout）齐全
- **AND** 模板 host SHALL 为占位地址 `127.0.0.1`，MUST NOT 携带真实内网主机
- **AND** 模板 MUST NOT 含任何口令字段（`password` 或 `password_enc`）
