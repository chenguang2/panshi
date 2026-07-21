## ADDED Requirements

### Requirement: 数据库支持 mTLS 配置字段

系统 SHALL 在 `ps_ssl_certificate` 表中新增三个字段以存储 mTLS 双向认证配置。

#### Scenario: 新增 client_ca 字段
- **WHEN** 系统执行数据库迁移
- **THEN** `ps_ssl_certificate` 表 SHALL 新增 `client_ca` 列，类型为 Text，可空
- **AND** `client_ca` SHALL 存储 CA 证书 PEM 内容，用于验证客户端证书

#### Scenario: 新增 client_depth 字段
- **WHEN** 系统执行数据库迁移
- **THEN** `ps_ssl_certificate` 表 SHALL 新增 `client_depth` 列，类型为 Integer，可空，默认值为 1
- **AND** `client_depth` SHALL 存储证书链校验深度

#### Scenario: 新增 skip_mtls_uri_regex 字段
- **WHEN** 系统执行数据库迁移
- **THEN** `ps_ssl_certificate` 表 SHALL 新增 `skip_mtls_uri_regex` 列，类型为 Text，可空
- **AND** `skip_mtls_uri_regex` SHALL 存储 JSON 数组，包含需要跳过 mTLS 校验的 URI 正则列表

### Requirement: 后端 Schema 支持 mTLS 字段

系统 SHALL 在 Pydantic Schema 中补充 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 字段。

#### Scenario: SslCertificateBase 新增 mTLS 字段
- **WHEN** 后端加载 `SslCertificateBase` Schema
- **THEN** `SslCertificateBase` SHALL 包含 `client_ca: Optional[str]`、`client_depth: Optional[int]`、`skip_mtls_uri_regex: Optional[str]` 字段
- **AND** 字段默认值均为 None

#### Scenario: SslCertificateGenerateRequest 新增 mTLS 字段
- **WHEN** 通过生成 API 创建证书
- **THEN** `SslCertificateGenerateRequest` SHALL 包含 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 可选字段

#### Scenario: SslCertificateCreate 新增 mTLS 字段
- **WHEN** 通过上传表单创建证书
- **THEN** `SslCertificateCreate` SHALL 包含 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 可选字段

#### Scenario: SslCertificateUpdate 新增 mTLS 字段
- **WHEN** 通过编辑表单更新证书
- **THEN** `SslCertificateUpdate` SHALL 包含 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 可选字段

### Requirement: 发布时拼装 client 对象

系统 SHALL 在发布 SSL 证书到 Edge 节点时，根据数据库中的 mTLS 字段拼装 `client` 对象。仅限国密（`gm=true`）服务端证书。

#### Scenario: 非国密证书不发送 client
- **WHEN** 用户发布 SSL 证书
- **AND** 证书为非国密（`gm=false` 或 `algorithm` 不为 `"sm2"`）
- **THEN** `config_data` SHALL 不包含 `client` 字段，即使 `client_ca` 有值

#### Scenario: 配置了 mTLS 时发送 client 字段
- **WHEN** 用户发布 SSL 证书
- **AND** 证书的 `client_ca` 不为空
- **THEN** `publish_ssl_certificate()` SHALL 在 `config_data` 中加入 `client` 对象
- **AND** `client.ca` SHALL 为 `client_ca` 字段值
- **AND** `client.depth` SHALL 为 `client_depth` 字段值（为 None 时不发送）
- **AND** `client.skip_mtls_uri_regex` SHALL 为 `skip_mtls_uri_regex` 的 JSON 解析值（为空时不发送）

#### Scenario: 客户端证书不支持 mTLS
- **WHEN** 证书的 `cert_type` 为 `"client"`
- **THEN** 系统 SHALL 不允许也不展示 mTLS 配置
- **AND** 发布时 SHALL 不包含 `client` 字段（客户端证书本身就不发布到 Edge 节点）

#### Scenario: 未配置 mTLS 时不影响
- **WHEN** 用户发布 SSL 证书
- **AND** 证书的 `client_ca` 为空
- **THEN** `config_data` SHALL 不包含 `client` 字段
- **AND** 发布行为与现有逻辑完全一致

### Requirement: 前端类型支持 mTLS 字段

系统 SHALL 在前端 TypeScript 类型定义中补充 mTLS 相关字段。

#### Scenario: SslCertificate 接口新增 mTLS 字段
- **WHEN** 前端加载 `types/ssl.ts`
- **THEN** `SslCertificate` 接口 SHALL 包含 `client_ca?: string`、`client_depth?: number`、`skip_mtls_uri_regex?: string`
- **AND** `SslCertificateGenerateRequest`、`SslCertificateCreate`、`SslCertificateUpdate` 接口 SHALL 包含对应可选字段

### Requirement: 上传表单支持 mTLS 配置

系统 SHALL 在 SSL 证书上传/编辑表单（SslFormDrawer）中增加 mTLS 配置区域。

#### Scenario: 可折叠的 mTLS 配置区域
- **WHEN** 用户打开 SSL 证书上传或编辑表单
- **AND** 证书类型为 `"server"`
- **THEN** 表单底部 SHALL 显示"双向认证 (mTLS)"可折叠面板
- **AND** 面板默认折叠，点击展开后显示以下字段：
  - `client_ca`：CA 证书内容，粘贴文本输入（Textarea，PEM 格式）
  - `client_depth`：证书链校验深度，数字输入，默认 1
  - `skip_mtls_uri_regex`：跳过 mTLS 的 URI 正则列表，每行一个输入框，通过"添加"按钮新增行，每行右侧有删除按钮

#### Scenario: 客户端证书类型隐藏 mTLS 区域
- **WHEN** 用户打开 SSL 证书上传或编辑表单
- **AND** 证书类型选择为 `"client"`
- **THEN** 表单 SHALL 隐藏 mTLS 配置区域
- **AND** 切换回 `"server"` 时 SHALL 重新显示

#### Scenario: 非国密证书隐藏 mTLS 区域
- **WHEN** 用户打开 SSL 证书上传或编辑表单
- **AND** 证书算法为非国密（`gm=false` 或 `algorithm` 不为 `"sm2"`）
- **THEN** 表单 SHALL 隐藏 mTLS 配置区域

#### Scenario: 取消国密时清空 mTLS 数据
- **WHEN** 用户编辑一个 `gm=true` 的证书，取消勾选"国密双证书"并保存
- **THEN** 后端 SHALL 将 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 清空为 null

#### Scenario: 编辑时回填 mTLS 数据
- **WHEN** 用户编辑已有 SSL 证书
- **AND** 该证书存在 mTLS 配置
- **THEN** 展开 mTLS 面板后 SHALL 回填 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 的值

### Requirement: 生成对话框支持 mTLS 配置

系统 SHALL 在 SSL 证书生成对话框（SslGenerateDialog）中增加 mTLS 配置选项。mTLS 区域与"同时生成客户端证书"复选框解耦，仅由算法（SM2）和证书类型（server）决定是否显示。

#### Scenario: 国密服务端证书默认显示 mTLS 区域
- **WHEN** 用户打开生成对话框
- **AND** 算法为 SM2，类型为 server
- **THEN** 对话框 SHALL 显示可折叠的"双向认证 (mTLS)"配置区域
- **AND** 面板默认折叠

#### Scenario: 勾选客户端证书时自动填充 CA
- **WHEN** 用户勾选"同时生成客户端证书"
- **AND** mTLS 区域的 `client_ca` 当前为空
- **THEN** 对话框 SHALL 自动将当前选择的 CA 证书内容填入 `client_ca`
- **AND** 如果用户已手动填写过 `client_ca`，则不覆盖

#### Scenario: 未勾选客户端证书也可配置 mTLS
- **WHEN** 用户未勾选"同时生成客户端证书"
- **THEN** mTLS 配置区域仍然可见
- **AND** 用户 SHALL 可自行填写 `client_ca`、`client_depth`、`skip_mtls_uri_regex`（列表输入，每行一条正则）

#### Scenario: 手动编辑 mTLS 配置
- **WHEN** 用户展开 mTLS 配置区域
- **THEN** 用户 SHALL 可自由修改 `client_ca`（粘贴替换）、`client_depth`、`skip_mtls_uri_regex`（通过"添加"和"删除"按钮管理列表）
- **AND** 手动修改的值 SHALL 优先于自动填充

### Requirement: 查看界面展示 mTLS 配置

系统 SHALL 在 SSL 证书查看弹窗（SslViewDrawer）中展示 mTLS 配置信息。

#### Scenario: 展示 mTLS 状态
- **WHEN** 用户打开 SSL 证书查看弹窗
- **AND** 证书配置了 mTLS（`client_ca` 不为空）
- **THEN** 弹窗 SHALL 在基本信息中显示"双向认证：已启用"标记
- **AND** 展开后展示 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 的值

#### Scenario: 未配置 mTLS 时不展示
- **WHEN** 用户打开 SSL 证书查看弹窗
- **AND** 证书未配置 mTLS（`client_ca` 为空）
- **THEN** 弹窗 SHALL 不显示 mTLS 相关信息

### Requirement: Edge 导入识别 client 字段

系统 SHALL 在从 Edge 节点导入 SSL 证书时，识别 `client` 字段并写入数据库。

#### Scenario: 导入含 client 的证书
- **WHEN** 用户从 Edge 节点导入 SSL 证书
- **AND** Edge 返回的 SSL 证书包含 `client` 对象（含 `ca`、`depth`、`skip_mtls_uri_regex`）
- **THEN** `convert_ssl_certificate()` SHALL 将 `client.ca` 写入 `client_ca`、`client.depth` 写入 `client_depth`、`client.skip_mtls_uri_regex` 写入 `skip_mtls_uri_regex`

#### Scenario: 导入不含 client 的证书不受影响
- **WHEN** 用户从 Edge 节点导入 SSL 证书
- **AND** Edge 返回的证书不含 `client` 字段
- **THEN** `convert_ssl_certificate()` SHALL 正常导入，`client_ca`、`client_depth`、`skip_mtls_uri_regex` 为 None

### Requirement: 配置对比支持 client 字段

系统 SHALL 在数据库与 Edge 节点配置对比时，比较 `client` 子字段。

#### Scenario: 对比 client.ca
- **WHEN** 用户执行配置对比
- **AND** DB 中证书的 `client_ca` 与 Edge 端 `client.ca` 不同
- **THEN** 对比结果 SHALL 显示 `client_ca` 字段差异

#### Scenario: 对比 client.depth
- **WHEN** 用户执行配置对比
- **AND** DB 中证书的 `client_depth` 与 Edge 端 `client.depth` 不同
- **THEN** 对比结果 SHALL 显示 `client_depth` 字段差异

#### Scenario: 对比 client.skip_mtls_uri_regex
- **WHEN** 用户执行配置对比
- **AND** DB 中证书的 `skip_mtls_uri_regex` 与 Edge 端 `client.skip_mtls_uri_regex` 不同
- **THEN** 对比结果 SHALL 显示 `skip_mtls_uri_regex` 字段差异

#### Scenario: Edge 端无 client 字段
- **WHEN** 用户执行配置对比
- **AND** DB 中证书配置了 mTLS 但 Edge 端无 `client` 字段
- **THEN** 对比结果 SHALL 标记 `client` 为仅在 DB 中存在
