## DELTA: SSL 证书管理 — 增加生成能力入口

此 Delta Spec 修改 `ssl-certificate-management` 现有要求以支持国密证书生成功能。

## MODIFIED Requirements

### Requirement: SSL 证书列表展示

系统 SHALL 提供一个独立 SSL 证书管理页面（`/ssl`），以卡片网格形式展示所有集群的 SSL 证书。

#### Scenario: 页面入口
- **WHEN** 用户点击侧边栏"SSL 证书"菜单项
- **THEN** 导航到 `/ssl` 路由
- **AND** 页面显示 `PageHeader`，标题为"SSL 证书"

#### Scenario: 卡片网格展示
- **WHEN** 页面加载完成
- **THEN** 以多列卡片网格展示所有 SSL 证书
- **AND** 每张卡片显示：证书名称、SNI 域名、证书状态（已发布/未发布/已过期）、所属集群、SSL 协议版本、来源标识（上传不显示，生成的证书显示"国密生成"）
- **AND** 卡片支持按集群筛选和搜索

#### Scenario: 国密生成标记
- **WHEN** 证书的 `create_method` 为 `local_generate` 或 `remote_generate`
- **THEN** 证书卡片 SHALL 显示"国密生成"标记
- **AND** 标记与国密（GM）标识可叠加显示

### Requirement: 上传 SSL 证书（增加生成入口）

系统 SHALL 支持上传新的 SSL 证书或通过生成方式创建证书，数据存到 DB。

#### Scenario: 操作入口
- **WHEN** 用户查看 SSL 证书列表页
- **THEN** 页面顶部操作栏 SHALL 显示以下按钮：
  - "新建证书"按钮：打开现有上传表单（SslFormDrawer）
  - "生成国密证书"按钮：打开国密证书生成对话框（SslGenerateDialog）
- **AND** 两个按钮风格一致，主次分明

#### Scenario: 生成国密证书对话框
- **WHEN** 用户点击"生成国密证书"按钮
- **THEN** 弹出 `SslGenerateDialog` 模态对话框
- **AND** 对话框包含以下区域：
  - **生成方式选择**：本地生成 / 远程生成（Radio）
  - **集群/节点选择**：所属集群下拉框；远程时额外显示执行节点下拉框
  - **证书参数**：证书名称（必填）、通用名称 CN（必填）
  - **SAN 输入**：域名 SAN（Tag 输入，支持多个） + IP SAN（Tag 输入，支持多个）
  - **其他**：有效期（默认 365 天）、双证书模式开关（默认开启）、证书类型（server/client）
- **AND** 包含"取消"和"生成并保存"按钮

#### Scenario: 生成中状态
- **WHEN** 用户确认生成
- **THEN** 对话框切换为进度提示状态
- **AND** 显示步骤进度：检测环境 → 生成密钥对 → 生成 CSR → 签发证书 → 保存记录
- **AND** 按钮禁用，防止重复提交

#### Scenario: 生成成功
- **WHEN** 证书生成并保存成功
- **THEN** 对话框自动关闭
- **AND** SSL 证书列表自动刷新
- **AND** 新证书卡片出现在列表中，带有"国密生成"标记

#### Scenario: 生成失败
- **WHEN** 证书生成过程中发生错误（本地 openssl 不可用、SSH 连接失败、节点不支持 SM2 等）
- **THEN** 对话框显示具体错误信息
- **AND** 提供"关闭"按钮，不自动关闭
- **AND** 不创建任何 SSL 证书记录

## ADDED Requirements

### Requirement: 证书创建方式字段

系统 SHALL 在 `ps_ssl_certificate` 表中新增 `create_method` 字段，记录证书创建方式。

#### Scenario: 数据库迁移
- **WHEN** 系统执行数据库迁移
- **THEN** `ps_ssl_certificate` 表 SHALL 新增 `create_method` 列，String(32)，默认值 `"upload"`

#### Scenario: 创建方式写入
- **WHEN** 通过手动上传表单创建证书
- **THEN** `create_method` SHALL 为 `"upload"`
- **WHEN** 通过生成本地 API 创建证书
- **THEN** `create_method` SHALL 为 `"local_generate"`
- **WHEN** 通过生成远程 API 创建证书
- **THEN** `create_method` SHALL 为 `"remote_generate"`
