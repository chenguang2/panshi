## Purpose

支持在 SSL 证书卡片上直接下载证书文件，可选择需要的文件后打包为 ZIP。

## Requirements

### Requirement: 卡片下载按钮

系统 SHALL 在 SSL 证书卡片操作栏提供"下载"按钮。

#### Scenario: 按钮位置
- **WHEN** 用户查看 SSL 证书列表
- **THEN** 每张证书卡片的操作栏 SHALL 显示"下载"按钮
- **AND** "下载"按钮位于"查看"按钮旁边

### Requirement: 文件选择对话框

系统 SHALL 提供文件选择对话框，让用户勾选需要下载的文件。文件选项命名 SHALL 区分国密双证与单证体系，并 SHALL 提示 ZIP 内容的敏感性。

#### Scenario: 打开对话框
- **WHEN** 用户点击卡片上的"下载"按钮
- **THEN** 弹出 SslCertDownloadDialog 模态对话框
- **AND** 对话框列出可下载的文件选项

#### Scenario: 文件选项按内容动态显示
- **WHEN** 证书有 cert 内容
- **THEN** 对话框 SHALL 显示"证书 (cert.pem)"选项
- **WHEN** 响应 `has_private_key` 为 true
- **THEN** 对话框 SHALL 显示"私钥 (key.pem)"选项
- **WHEN** 证书有 sign_cert 内容
- **THEN** 对话框 SHALL 额外显示"签名证书 (sign_cert.pem)"选项
- **WHEN** 响应 `has_sign_key` 为 true
- **THEN** 对话框 SHALL 额外显示"签名私钥 (sign_key.pem)"选项
- **AND** 所有有内容的选项默认全部勾选
- **AND** 私钥选项的有无判定 MUST NOT 依赖掩码后恒空的 `private_key`/`sign_key` 字段内容

#### Scenario: 国密双证书选项命名
- **WHEN** 证书为国密双证书（`gm=true` 且含签名/加密对）
- **THEN** cert/key 选项 SHALL 保留"加密证书/加密私钥"前缀（与签名证书对区分）
- **WHEN** 证书为单证体系（RSA/ECC 非国密）
- **THEN** 选项 SHALL 命名为"证书/私钥"，SHALL NOT 使用"加密"前缀造成困惑

#### Scenario: 敏感数据提示
- **WHEN** 下载对话框打开且勾选项包含私钥
- **THEN** 对话框底部 SHALL 显示提示「ZIP 内含私钥，属敏感数据，请妥善保管」

### Requirement: ZIP 打包下载

系统 SHALL 将用户选择的文件打包为 ZIP 并下载。

#### Scenario: 下载 ZIP
- **WHEN** 用户勾选文件并点击"下载 ZIP"
- **THEN** 系统 SHALL 使用 jszip 将选中文件打包为 ZIP
- **AND** ZIP 文件名为 `{证书名称}_certs.zip`
- **AND** 内部文件名为 `{证书名称}_cert.pem`、`{证书名称}_key.pem` 等
- **AND** 浏览器下载该 ZIP 文件
