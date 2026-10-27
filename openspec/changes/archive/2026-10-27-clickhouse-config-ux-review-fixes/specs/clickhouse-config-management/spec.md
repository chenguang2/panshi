# clickhouse-config-ux-review-fixes 变更规格 — clickhouse-config-management 域增量

## MODIFIED Requirements

### Requirement: 命名连接管理 API

系统 SHALL 提供 `backend/clickhouse.yaml`（与 `db_config.json` 平级）中 ClickHouse 命名连接列表的 CRUD API（`/api/v1/clickhouse/connections*`），全部端点 MUST 经登录鉴权与 `clickhouse_config` 资源权限门控；其中恰有一条为激活连接（`active`），指标查询 SHALL 使用激活连接的参数。连接名称 SHALL 唯一（trim 后精确比对）。

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

#### Scenario: 连接名称唯一
- **WHEN** 创建或更新连接时，名称（trim 后）与既有其他连接重名（更新不含自身）
- **THEN** 系统 SHALL 返回 400 并提示「连接名称「{name}」已存在」，且不修改配置文件

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

### Requirement: 连接测试

系统 SHALL 提供按已存连接测试（`POST /connections/{id}/test`）与未保存表单测试（`POST /connections/test`）两种方式；测试 MUST NOT 修改连接参数、MUST NOT 触发缓存失效（`invalidate()`）；请求密码留空且指定已存连接时 SHALL 用其已存密码。按已存连接测试完成后，系统 SHALL 将本次结果作为操作元数据（`last_test_ok` / `last_test_at` / `last_test_error`）记录到该连接条目并落盘，该记录 MUST NOT 触发缓存失效。测试失败原因 SHALL 转译为中文主文案与排查建议（`error`），并保留驱动原始输出（`error_detail`）。

#### Scenario: 测试成功与失败均如实返回
- **WHEN** 调用测试端点（目标不可达或密码错误）
- **THEN** 返回 `{ok: false, error: <中文主文案+排查建议>, error_detail: <原始错误>}`，HTTP 不视为服务端错误
- **AND** 密码不可解密时 error SHALL 明确提示"重新录入密码"

#### Scenario: 测试不落盘
- **WHEN** 任意测试请求完成
- **THEN** 连接参数字段（name/host/port/database/user/password_enc/connect_timeout）与缓存版本 MUST NOT 变化
- **AND** 测试结果元数据（`last_test_*`）的留痕写入不受此限（见「测试结果留痕」场景）

#### Scenario: 测试结果留痕
- **WHEN** 按已存连接测试完成（成功或失败）
- **THEN** 该连接条目 SHALL 记录 `last_test_ok`、`last_test_at`（naive UTC）与 `last_test_error`（失败主文案，截断 200 字），供列表「上次测试」列与激活确认弹窗使用
- **AND** 未保存表单试连（无可解析的已存 id）MUST NOT 产生留痕

## ADDED Requirements

### Requirement: 数据源连通性状态展示

配置页 SHALL 提供「当前数据源」健康卡：进入页面时 SHALL 自动对激活连接发起一次连通性检测（不落盘），并提供手动「重新检测」；状态卡 SHALL 呈现 未配置 / 检测中 / 可达 / 不可达 四态，颜色与文案 MUST 仅绑定该实测状态——存在激活连接但未经检测验证时，MUST NOT 展示任何「在线/正常」暗示。不可达时 SHALL 展示失败原因摘要（中文主文案）并可展开原始错误；页面 SHALL 提供「去指标总览」入口。

#### Scenario: 进页自动检测
- **GIVEN** 存在激活连接
- **WHEN** 用户进入配置页
- **THEN** 系统 SHALL 自动检测该连接连通性，检测期间状态卡显示「检测中」，MUST NOT 阻塞连接列表加载

#### Scenario: 不可达状态如实呈现
- **WHEN** 激活连接检测失败
- **THEN** 状态卡 SHALL 显示红色「不可达」态与失败主文案摘要，并提供原始错误展开
- **AND** 此时页面任何位置 MUST NOT 展示绿色「在线」状态点

#### Scenario: 重新检测与验证闭环
- **WHEN** 用户点击「重新检测」或修复数据源后再次进页
- **THEN** 状态卡 SHALL 按最新检测结果更新四态
- **AND** 「去指标总览」入口在可达与不可达态均可用

### Requirement: 激活切换风险提示

切换激活连接的确认弹窗 SHALL 展示目标连接的上次测试状态（`上次测试：✓ {时间}` / `✗ {时间}（{失败摘要}）` / 「未测试」）；目标连接未测试或上次失败时，弹窗 SHALL 展示黄色警示（切换后指标查询可能不可用，建议先测试）。系统 SHALL NOT 以测试状态硬性阻断切换（软提示语义）。

#### Scenario: 上次失败目标的警示
- **GIVEN** 目标连接上次测试失败或从未测试
- **WHEN** 用户点击「设为当前」
- **THEN** 确认弹窗 SHALL 展示目标测试状态与黄色警示，同时保留「确认切换」能力

#### Scenario: 正常目标无附加警示
- **GIVEN** 目标连接上次测试成功
- **WHEN** 用户点击「设为当前」
- **THEN** 确认弹窗 SHALL 展示目标测试状态，MUST NOT 出现风险警示

### Requirement: 连接表单校验与启用流程

新建/编辑连接弹窗 SHALL 提供行内校验并定位到字段：名称必填且重名即时提示（失焦/提交时，编辑排除自身）、主机必填且符合 IP/主机名格式、端口 1–65535 与超时 1–60 越界行内拦截；非法取值 MUST NOT 被静默改写为默认值。端口字段 SHALL 附 native TCP 端口语义提示（HTTP 8123 不适用）。弹窗 SHALL 提供「保存后设为当前连接」勾选项（新建模式恒显示；编辑模式仅非当前连接显示；无激活连接时勾选并禁用并标注「保存后自动成为当前连接」）；保存成功但激活失败时 SHALL 如实分步提示，MUST NOT 静默。

#### Scenario: 行内校验定位字段
- **WHEN** 用户提交主机格式非法（如 `192.168. `）或端口越界（如 0、70000）的表单
- **THEN** 对应字段 SHALL 行内标红并显示原因，焦点 SHALL 落在首个错误字段，MUST NOT 发起保存请求

#### Scenario: 端口语义提示
- **WHEN** 用户查看端口字段
- **THEN** SHALL 可见「native TCP 端口，默认 9000；HTTP 8123 不适用」提示

#### Scenario: 保存后设为当前
- **GIVEN** 用户新建连接并勾选「保存后设为当前连接」
- **WHEN** 保存成功
- **THEN** 系统 SHALL 自动将该连接设为激活连接
- **AND** 激活步骤失败时 SHALL 提示「连接已保存，但切换激活失败：{原因}」，已保存状态保留
