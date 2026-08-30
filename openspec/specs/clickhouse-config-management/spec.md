# clickhouse-config-management

## Purpose

提供 ClickHouse 多命名连接的 CRUD、激活切换、密码加密存储与连接测试功能，支持通过配置页面管理多个 ClickHouse 数据源。

## Requirements

### Requirement: 命名连接管理 API

系统 SHALL 提供 `backend/clickhouse.yaml`（与 `db_config.json` 平级）中 ClickHouse 命名连接列表的 CRUD API（`/api/v1/clickhouse/connections*`），全部端点 MUST 经登录鉴权与 `clickhouse_config` 资源权限门控；其中恰有一条为激活连接（`active`），指标查询 SHALL 使用激活连接的参数。

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

### Requirement: 激活切换与保存即生效

激活连接变更或连接配置增删改成功后，系统 SHALL 使 ClickHouse 配置的内存缓存跨线程失效（全局版本号 + 线程局部连接按版本惰性重建），后续指标查询 MUST 使用新激活/修改后的配置，无需重启后端。

#### Scenario: 切换激活后查询走新连接
- **WHEN** `POST /clickhouse/activate` 切换到另一 host 的连接
- **THEN** 之后的 metrics 查询 SHALL 使用新激活连接参数建立（各工作线程在下一次取连接时检测版本变化并重建）

#### Scenario: 增删改同样触发失效
- **WHEN** 创建/更新/删除任一连接成功
- **THEN** 配置缓存版本 SHALL 自增，查询侧下次取连接即重建

### Requirement: 连接测试

系统 SHALL 提供按已存连接测试（`POST /connections/{id}/test`）与未保存表单测试（`POST /connections/test`）两种方式；测试 MUST NOT 修改配置文件、MUST NOT 触发缓存失效；请求密码留空且指定已存连接时 SHALL 用其已存密码。

#### Scenario: 测试成功与失败均如实返回
- **WHEN** 调用测试端点（目标不可达或密码错误）
- **THEN** 返回 `{ok: false, error: <失败原因>}`，HTTP 不视为服务端错误
- **AND** 密码不可解密时 error SHALL 明确提示"重新录入密码"

#### Scenario: 测试不落盘
- **WHEN** 任意测试请求完成
- **THEN** 配置文件内容与缓存版本 MUST NOT 变化

### Requirement: 密码加密存储

连接密码 SHALL 以 Fernet 加密存于 `backend/clickhouse.yaml` 各连接的 `password_enc` 键（密钥派生与 `db_config.py` 同源），MUST NOT 明文入库/入文件；旧单连接明文格式与旧路径文件 SHALL 兼容读取（归一化为一条"默认"连接，首次保存转新格式）。

#### Scenario: 保存后文件仅存密文
- **WHEN** 创建/更新提交新密码
- **THEN** 文件写入 `password_enc`，无明文 password 键

#### Scenario: 旧格式自动迁移
- **WHEN** 读取到旧单连接格式（顶层 host/password）配置
- **THEN** 系统按等效参数继续工作，并在下一次保存时落为多连接新格式

### Requirement: 操作审计

连接的创建/更新/删除/激活变更成功后 MUST 写 `log_audit`（`action='update_clickhouse_config'`，`resource='clickhouse_config'`），detail 记录动作与目标连接标识（含 host，**不含密码**）。

#### Scenario: 变更操作留审计
- **WHEN** 管理员保存或切换激活连接
- **THEN** sys_audit_log 新增对应记录，操作者可追溯
