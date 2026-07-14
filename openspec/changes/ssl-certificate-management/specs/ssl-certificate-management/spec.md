# ssl-certificate-management

## ADDED Requirements

### Requirement: SSL 证书列表展示

系统 SHALL 提供一个独立 SSL 证书管理页面（`/ssl`），以卡片网格形式展示所有集群的 SSL 证书。

#### Scenario: 页面入口
- **WHEN** 用户点击侧边栏"SSL 证书"菜单项
- **THEN** 导航到 `/ssl` 路由
- **AND** 页面显示 `PageHeader`，标题为"SSL 证书"

#### Scenario: 卡片网格展示
- **WHEN** 页面加载完成
- **THEN** 以多列卡片网格展示所有 SSL 证书
- **AND** 每张卡片显示：证书名称、SNI 域名、证书状态（已发布/未发布/已过期）、所属集群、SSL 协议版本
- **AND** 卡片支持按集群筛选和搜索

### Requirement: 上传 SSL 证书

系统 SHALL 支持上传新的 SSL 证书，数据存到 DB。

#### Scenario: 打开上传表单
- **WHEN** 用户点击"添加证书"按钮
- **THEN** 弹出表单，包含以下字段：
  - 证书名称（必填，用户可读名称）
  - 所属集群（必填）
  - 证书类型（server/client）
  - SNI 域名（必填，支持单个或多个，逗号分隔）
  - 证书文件（PEM，支持上传文件或粘贴文本，二选一）
  - 私钥文件（PEM，支持上传文件或粘贴文本，二选一）
  - SSL 协议版本（多选，默认 TLSv1.2、TLSv1.3）
  - 描述（可选）

#### Scenario: 保存证书
- **WHEN** 用户填写表单并点击"保存"
- **THEN** 系统 SHALL 自动生成 `edge_uuid`（UUID）作为 Edge 标识
- **AND** 写入 DB（`ps_ssl_certificate` 表）
- **AND** 成功后关闭表单并刷新列表

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
