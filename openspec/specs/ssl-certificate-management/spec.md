## Purpose

SSL 证书的独立管理功能，包括证书的上传、列表展示、编辑、删除、发布到 Edge 节点、版本历史管理。

## Requirements

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
- **AND** 卡片顶部 SHALL 显示算法分类标签（🇨🇳 国密 / 🌐 国际）
- **AND** 算法 badge SHALL 包含图标和分类前缀（`🇨🇳 国密 SM2 单证书` / `🌐 国际 RSA 2048`）
- **AND** 国密与使用红色系配色，国际算法使用蓝色系配色
- **AND** 卡片支持按集群筛选和搜索

#### Scenario: 国密生成标记
- **WHEN** 证书的 `create_method` 为 `local_generate` 或 `remote_generate`
- **THEN** 证书卡片 SHALL 显示"国密生成"标记
- **AND** 标记与国密（GM）标识可叠加显示

#### Scenario: 查看界面增加下载
- **WHEN** 用户打开 SSL 证书查看弹窗
- **THEN** 每个 PEM 展示区域旁 SHALL 显示"下载"按钮
- **AND** 点击后下载对应的 `.pem` 文件

#### Scenario: 生成成功快捷下载
- **WHEN** 国密证书生成成功
- **THEN** 成功提示中 SHALL 提供"下载证书"操作入口
- **AND** 点击后打开该证书的查看弹窗（用户可在查看界面下载文件）

#### Scenario: 卡片下载按钮
- **WHEN** 用户查看 SSL 证书列表页
- **THEN** 每张证书卡片操作栏 SHALL 显示"下载"按钮
- **AND** 点击后弹出文件选择对话框

#### Scenario: 列表加载成功（含空值容错）
- **WHEN** 数据库中存在 SSL 证书记录（含 cert 或 private_key 或 name 或 sni 为空值的记录）
- **THEN** 系统 SHALL 正常返回所有证书列表
- **AND** 前端 SHALL 正常展示证书卡片

### Requirement: 上传 SSL 证书（增加生成入口）

系统 SHALL 支持上传新的 SSL 证书或通过生成方式创建证书，数据存到 DB。

#### Scenario: 打开上传表单
- **WHEN** 用户点击"添加已有证书"按钮
- **THEN** 弹出表单，包含以下字段：
  - 证书名称（必填，用户可读名称）
  - 所属集群（必填）
  - 证书类型（server/client）
  - SNI 域名（必填，Tag 输入模式，Enter/Space 添加每个域名，每个 Tag 可单独删除）
  - 证书文件（PEM，支持上传文件或粘贴文本，二选一）
  - 私钥文件（PEM，支持上传文件或粘贴文本，二选一）
  - SSL 协议版本（多选，默认 TLSv1.2、TLSv1.3）
  - 描述（可选）

#### Scenario: 保存证书
- **WHEN** 用户填写表单并点击"保存"
- **THEN** 系统 SHALL 自动生成 `edge_uuid`（UUID）作为 Edge 标识
- **AND** 写入 DB（`ps_ssl_certificate` 表）
- **AND** 成功后关闭表单并刷新列表

#### Scenario: 创建校验
- **WHEN** 用户提交创建 SSL 证书表单且 `cert` 或 `private_key` 为空
- **THEN** 系统 SHALL 返回 422 校验错误
- **AND** 前端 SHALL 提示相应字段必填

#### Scenario: 操作入口
- **WHEN** 用户查看 SSL 证书列表页
- **THEN** 页面顶部操作栏 SHALL 显示以下按钮：
  - "添加已有证书"按钮：打开现有上传表单（SslFormDrawer）
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

### Requirement: SSL 证书列表页搜索框

SSL 证书列表页搜索框样式 SHALL 与其他页面（如四层代理）一致。

#### Scenario: 搜索框样式
- **WHEN** 用户查看 SSL 证书列表页
- **THEN** 搜索框 SHALL 使用固定宽度（200px），不拉伸占据整行
- **AND** 搜索框 SHALL 与其他页面风格一致

### Requirement: 发布 SSL 证书到 Edge

系统 SHALL 支持将 SSL 证书发布到集群的 Edge 节点，并记录版本历史。

#### Scenario: 发布流程
- **WHEN** 用户点击证书卡片的"发布"按钮
- **THEN** 弹出节点选择对话框，默认选择集群下所有活跃节点
- **AND** 确认后系统 SHALL 调用 `EdgeClient.api("ssl", "update", edge_uuid, data)` 将证书推送到 Edge 节点
- **AND** 显示发布进度和结果
- **AND** 发布成功后 `current_version` 递增，创建 `ConfigVersion`（`resource_type="ssl"`）记录

#### Scenario: Edge 通过 SNI 匹配
- **WHEN** 证书已发布到 Edge 节点
- **THEN** 客户端发起 HTTPS 请求时，Edge 根据 TLS SNI 自动匹配对应证书
- **AND** 无需在路由上配置任何 SSL 关联

### Requirement: 删除 SSL 证书

系统 SHALL 支持删除 SSL 证书，包含已发布保护提示。

#### Scenario: 删除流程
- **WHEN** 用户点击证书卡片的"删除"按钮
- **THEN** 如果证书已发布（`current_version > 0`），弹出警告：`该证书已发布到 N 个节点，确定要删除吗？`
- **AND** 弹出确认对话框，可选：从数据库删除、从 Edge 节点删除、选择目标节点
- **AND** 确认后执行相应删除操作

### Requirement: SSL 证书版本历史

系统 SHALL 支持查看 SSL 证书的发布版本历史。

#### Scenario: 版本历史
- **WHEN** 用户点击证书卡片的"版本管理"按钮
- **THEN** 打开 `VersionManagementModal`（`resource_type="ssl"`），显示版本列表和配置 diff
- **AND** 用户可回滚到指定版本
- **AND** 用户可删除非当前版本的历史记录

### Requirement: Edge 直连 SSL 证书操作弹窗

Edge 直连页面 SSL 证书 Tab 中的查看和删除弹窗 SHALL 与其他 Tab 风格一致。

#### Scenario: 查看弹窗
- **WHEN** 用户点击 SSL 证书行的「JSON」按钮
- **THEN** 系统 SHALL 打开页面的统一 JSON 弹窗（jsonModal），展示证书完整 JSON 数据
- **AND** 该弹窗与四层代理、上游等其他 Tab 的 JSON 查看弹窗风格一致

#### Scenario: 删除确认
- **WHEN** 用户点击 SSL 证书行的「删除」按钮
- **THEN** 系统 SHALL 弹出 `Modal.confirm` 确认对话框
- **AND** 确认后调用 DELETE API 删除证书
- **AND** 该确认弹窗与四层代理、上游等其他 Tab 的删除确认弹窗风格一致

### Requirement: Edge API 日志

系统 SHALL 将 SSL 证书的 Edge API 调用记录到独立日志文件。

#### Scenario: 日志记录
- **WHEN** SSL 证书发布到 Edge 节点
- **THEN** 调用日志 SHALL 写入 `logs/edge/ssl.log`
- **AND** 日志格式与其他资源类型（路由、上游等）一致

### Requirement: 国密双证书录入
系统 SHALL 支持在 SSL 证书表单中录入国密双证书（NTLS/TLCP）。表单中新增"国密双证书"开关，开启后显示签名证书（sign_cert）和签名私钥（sign_key）两个上传/粘贴字段。`gm=true` 时签名证书和签名私钥为必填。

#### Scenario: 创建国密证书
- **WHEN** 用户打开 SSL 证书创建表单
- **AND** 勾选"国密双证书"开关
- **THEN** 表单 SHALL 显示签名证书和签名私钥字段
- **WHEN** 用户填写加密证书、加密私钥、签名证书、签名私钥并提交
- **THEN** 系统 SHALL 在数据库中创建记录，`gm=true`、`sign_cert` 和 `sign_key` 保存对应值
- **AND** 响应状态码 SHALL 为 200

#### Scenario: 国密模式下签名证书为必填
- **WHEN** 用户勾选"国密双证书"但未填写签名证书
- **THEN** 前端 SHALL 提示"请上传签名证书"
- **AND** 表单 SHALL 不提交

#### Scenario: 编辑时取消国密模式
- **WHEN** 用户编辑一个 `gm=true` 的证书，取消勾选"国密双证书"并保存
- **THEN** 后端 SHALL 将 `gm` 设为 false，`sign_cert` 和 `sign_key` 清空为 null

#### Scenario: 非国密模式不受影响
- **WHEN** 用户未勾选"国密双证书"
- **THEN** 表单 SHALL 不显示签名证书字段
- **AND** 提交时 `gm` 默认为 false，`sign_cert` 和 `sign_key` 为 null

### Requirement: 国密双证书发布到 Edge
系统 SHALL 在发布 SSL 证书到 Edge 节点时，根据 `gm` 字段决定发送格式。`gm=true` 时发送国密双证书格式（`cert`/`key` 加密 + `certs[]`/`keys[]` 签名 + `gm: true`），否则发送原有单证书格式。

#### Scenario: 发布国密证书
- **WHEN** 用户点击发布按钮，证书 `gm=true`
- **THEN** 后端 SHALL 组装 `config_data` 包含 `cert`、`key`、`certs`、`keys`、`gm: true`
- **AND** Edge API SHALL 收到正确的双证书格式
- **AND** 响应 SHALL 包含发布结果

#### Scenario: 发布普通证书不受影响
- **WHEN** 用户点击发布按钮，证书 `gm=false` 或 `gm` 为空
- **THEN** 后端 SHALL 发送原有单证书格式（仅 `cert` + `key`）

### Requirement: 从 Edge 导入国密双证书
系统 SHALL 在从 Edge 节点导入 SSL 证书时，识别 `gm: true` 标记，并将 `certs`/`keys` 数组中的签名证书和签名私钥存入数据库。

#### Scenario: 导入国密证书
- **WHEN** 用户从 Edge 节点导入数据
- **AND** Edge 返回的 SSL 证书包含 `gm: true`、`certs: ["sign_cert_pem"]`、`keys: ["sign_key_pem"]`
- **THEN** `convert_ssl_certificate` SHALL 将 `gm`、`sign_cert`、`sign_key` 存入返回的 dict
- **AND** 导入到数据库后 `gm=true`、`sign_cert`、`sign_key` 值正确

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

### Requirement: 国密双证书数据库对比
系统 SHALL 在数据库与 Edge 节点配置对比（SSL 证书部分）时，对比 `gm`、签名证书（`sign_cert` ↔ `certs`）、签名私钥（`sign_key` ↔ `keys`）字段。

#### Scenario: 对比国密证书
- **WHEN** 用户执行数据库对比
- **AND** DB 中的证书 `gm=true`、`sign_cert="sign_pem"`，Edge 端 `certs=["sign_pem"]`
- **THEN** `_compare_ssl_certificate` SHALL 检测 `sign_cert`/`certs` 一致
- **AND** 对比结果 SHALL 包含 `gm`、`sign_cert`、`sign_key` 字段的对比信息
